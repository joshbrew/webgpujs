import { parseExpressionAt } from "acorn";
import type {
  Param,
  ShaderBinding,
  ShaderResource,
  ShaderStage,
  TranspiledShader,
  WorkgroupSize,
} from "./types.js";
import { workgroupDimensions } from "./workgroups.js";

type Node = any;
const identifier = /^[A-Za-z_][A-Za-z_0-9]*$/;
const syntaxCache = new Map<string, Node>();
const typedArrays = {
  Float32Array: "f32",
  Int32Array: "i32",
  Uint32Array: "u32",
};
const functions = {
  abs: "abs",
  acos: "acos",
  acosh: "acosh",
  asin: "asin",
  asinh: "asinh",
  atan: "atan",
  atan2: "atan2",
  atanh: "atanh",
  ceil: "ceil",
  cos: "cos",
  cosh: "cosh",
  clz32: "countLeadingZeros",
  exp: "exp",
  floor: "floor",
  log: "log",
  log2: "log2",
  max: "max",
  min: "min",
  pow: "pow",
  round: "round",
  sin: "sin",
  sinh: "sinh",
  sqrt: "sqrt",
  tan: "tan",
  tanh: "tanh",
  trunc: "trunc",
};

export function parseFunction(source: string): Node {
  try {
    const text = source.trim();
    if (syntaxCache.has(text)) return syntaxCache.get(text);
    const node: any = parseExpressionAt(`(${text})`, 0, {
      ecmaVersion: "latest",
      locations: true,
    });
    const fn = node;
    if (
      !["FunctionExpression", "ArrowFunctionExpression"].includes(fn.type) ||
      fn.async ||
      fn.generator
    )
      throw new Error("Expected a synchronous function or arrow function");
    if (syntaxCache.size >= 256)
      syntaxCache.delete(syntaxCache.keys().next().value);
    syntaxCache.set(text, fn);
    return fn;
  } catch (error) {
    throw new Error(`Cannot parse shader: ${error.message}`);
  }
}

export function walk(
  node: Node,
  visit: (node: Node) => void,
  descendFunctions = true,
) {
  if (!node || typeof node !== "object") return;
  visit(node);
  if (!descendFunctions && /Function/.test(node.type)) return;
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end"].includes(key)) continue;
    if (Array.isArray(value))
      value.forEach((child) => walk(child, visit, descendFunctions));
    else if (value && typeof value === "object")
      walk(value, visit, descendFunctions);
  }
}

export function normalizeType(type: string) {
  return type
    .trim()
    .replace(/\s+/g, "")
    .replace(
      /\b(vec[234]|mat[234]x[234])([fhiu])\b/g,
      (_, base, suffix) =>
        `${base}<${{ f: "f32", h: "f16", i: "i32", u: "u32" }[suffix]}>`,
    );
}

export function inferType(
  node: Node,
  types: Map<string, string> = new Map(),
  seen = new Set<Node>(),
): string {
  if (!node || seen.has(node)) return "f32";
  seen.add(node);
  if (node.type === "Literal") {
    if (typeof node.value === "string") return normalizeType(node.value);
    if (typeof node.value === "boolean") return "bool";
    return /[.eE]/.test(node.raw || "") ? "f32" : "i32";
  }
  if (node.type === "Identifier") return types.get(node.name) || "f32";
  if (node.type === "ArrayExpression")
    return `array<${inferType(node.elements[0], types, seen)}>`;
  if (node.type === "NewExpression") {
    if (typedArrays[node.callee.name])
      return `array<${typedArrays[node.callee.name]}>`;
    if (node.callee.name === "Array") return "array<f32>";
    throw new Error(
      `Unsupported shader array ${node.callee.name}; use Float32Array, Int32Array or Uint32Array`,
    );
  }
  if (node.type === "CallExpression") {
    const name = node.callee.name;
    if (
      /^(vec[234][fhiu]|mat[234]x[234][fh]|[fiu]32|f16|bool)$/.test(name || "")
    )
      return normalizeType(name);
    if (/^vec[234]$/.test(name || "")) return `${name}<f32>`;
    if (/^mat[234]x[234]$/.test(name || "")) return `${name}<f32>`;
    if (name === "array")
      return `array<${inferType(node.arguments[0], types, seen)}>`;
    if (node.callee.property?.name === "fill")
      return `array<${inferType(node.arguments[0], types, seen)}>`;
    if (name === "arrayLength") return "u32";
    if (["dot", "length", "distance"].includes(name)) return "f32";
    if (name?.startsWith("texture"))
      return name === "textureDimensions" ? "vec2<u32>" : "vec4<f32>";
    return types.get(`fn:${name}`) || inferType(node.arguments[0], types, seen);
  }
  if (node.type === "MemberExpression") {
    const type = inferType(node.object, types, seen);
    if (node.computed && type.startsWith("array<"))
      return type.slice(6, -1).split(",")[0];
    if (node.property.name === "length") return "u32";
    if (type.startsWith("vec")) {
      const scalar = type.match(/<(.+)>/)?.[1] || "f32";
      return node.property.name.length === 1
        ? scalar
        : `vec${node.property.name.length}<${scalar}>`;
    }
    if (node.object.name === "Math") return "f32";
  }
  if (node.type === "BinaryExpression" || node.type === "LogicalExpression") {
    if (/^(===?|!==?|[<>]=?|&&|\|\|)$/.test(node.operator)) return "bool";
    const left = inferType(node.left, types, seen),
      right = inferType(node.right, types, seen);
    if (left.startsWith("vec") || left.startsWith("mat")) return left;
    if (right.startsWith("vec") || right.startsWith("mat")) return right;
    return left === "f32" || right === "f32" ? "f32" : left;
  }
  if (node.type === "UnaryExpression")
    return node.operator === "!"
      ? "bool"
      : inferType(node.argument, types, seen);
  if (node.type === "ConditionalExpression")
    return inferType(node.consequent, types, seen);
  return "f32";
}

function rootName(node: Node): string {
  while (node?.type === "MemberExpression") node = node.object;
  return node?.type === "Identifier" ? node.name : "";
}

/** Visit references with lexical bindings, excluding member names and declaration names. */
function references(
  node: Node,
  visit: (node: Node, bound: Set<string>) => void,
  bound = new Set<string>(),
) {
  if (!node || typeof node !== "object") return;
  if (node.type === "BlockStatement") {
    bound = new Set(bound);
    node.body.forEach((statement) => {
      if (statement.type === "VariableDeclaration")
        statement.declarations.forEach((d) => {
          if (d.id.type === "Identifier") bound.add(d.id.name);
        });
      if (statement.type === "FunctionDeclaration")
        bound.add(statement.id.name);
    });
  }
  if (/Function/.test(node.type)) {
    bound = new Set(bound);
    node.params.forEach((p) => {
      if ((p.left || p).type === "Identifier") bound.add((p.left || p).name);
    });
    references(node.body, visit, bound);
    return;
  }
  visit(node, bound);
  if (node.type === "MemberExpression") {
    references(node.object, visit, bound);
    if (node.computed) references(node.property, visit, bound);
    return;
  }
  if (node.type === "VariableDeclarator") {
    references(node.init, visit, bound);
    return;
  }
  if (node.type === "Property") {
    references(node.value, visit, bound);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (["loc", "start", "end", "id"].includes(key)) continue;
    if (Array.isArray(value))
      value.forEach((child) => references(child, visit, bound));
    else if (value && typeof value === "object")
      references(value, visit, bound);
  }
}

function returnNames(body: Node): string[] {
  const names = new Set<string>();
  walk(
    body,
    (node) => {
      if (node.type !== "ReturnStatement" || !node.argument) return;
      const arg = node.argument;
      const values =
        arg.type === "ArrayExpression"
          ? arg.elements
          : arg.type === "ObjectExpression"
            ? arg.properties.map((p) => p.value)
            : [arg];
      values.forEach((value) => {
        if (value?.type === "Identifier") names.add(value.name);
      });
    },
    false,
  );
  return [...names];
}

function fail(node: Node, message: string): never {
  throw new Error(
    `${message}${node.loc ? ` (line ${node.loc.start.line}, column ${node.loc.start.column})` : ""}`,
  );
}

/** Syntax-directed emission: identifiers are rewritten only when they resolve to a resource. */
class Emitter {
  locals = new Set<string>();
  types: Map<string, string>;
  helperCode: string[] = [];
  fragmentOutputs?: string[];
  constructor(
    public params: Param[],
    public resources: ShaderResource[],
    public stage: ShaderStage,
    public varyings: Record<string, string>,
    public builtins: string[],
    types: Map<string, string>,
  ) {
    this.types = new Map(types);
  }
  id(name: string) {
    if (this.locals.has(name)) return name;
    if (this.params.some((p) => p.name === name && p.isUniform))
      return `uniforms.${name}`;
    if (this.builtins.includes(name)) return `defaults.${name}`;
    if (
      this.stage !== "compute" &&
      (name === "position" || name in this.varyings)
    )
      return `pixel.${name}`;
    return name;
  }
  expr(node: Node): string {
    if (!node) return "";
    switch (node.type) {
      case "Identifier":
        return this.id(node.name);
      case "Literal":
        if (typeof node.value === "string") return node.value;
        if (node.value === null || typeof node.value === "bigint")
          return fail(node, "null and bigint are not supported in WGSL");
        return typeof node.value === "number"
          ? node.raw || String(node.value)
          : String(node.value);
      case "TemplateLiteral":
        if (node.expressions.length)
          return fail(node, "Interpolated shader strings are not supported");
        return node.quasis[0].value.cooked;
      case "MemberExpression": {
        const object = this.expr(node.object);
        const resource =
          node.object.type === "Identifier" &&
          !this.locals.has(node.object.name)
            ? this.resources.find(
                (r) => r.name === node.object.name && r.storageWrapper,
              )
            : undefined;
        if (node.computed)
          return `${object}${resource ? ".values" : ""}[${this.expr(node.property)}]`;
        if (node.property.name === "length") {
          if (resource) {
            const count = resource.type.match(/,\s*(\d+)>$/)?.[1];
            return count ? `${count}u` : `arrayLength(&${object}.values)`;
          }
          const type = this.types.get(node.object.name);
          const count = type?.match(/,\s*(\d+)>$/)?.[1];
          if (count) return `${count}u`;
          return fail(node, "Local .length needs a fixed-size array");
        }
        if (node.object.name === "Math") {
          if (typeof Math[node.property.name] === "number")
            return String(Math[node.property.name]);
          return (
            functions[node.property.name] ||
            fail(node, `Math.${node.property.name} has no WGSL equivalent`)
          );
        }
        return `${object}.${node.property.name}`;
      }
      case "CallExpression": {
        if (node.optional)
          return fail(node, "Optional calls are not supported");
        let callee = this.expr(node.callee);
        if (/^vec[234]$/.test(callee)) callee += "<f32>";
        if (/^mat[234]x[234]$/.test(callee)) callee += "<f32>";
        const args = node.arguments.map((arg) => this.expr(arg));
        if (
          /^atomic(Load|Store|Add|Sub|Max|Min|And|Or|Xor|Exchange|CompareExchangeWeak)$/.test(
            callee,
          ) ||
          callee === "workgroupUniformLoad"
        )
          args[0] = `&${args[0]}`;
        return `${callee}(${args.join(", ")})`;
      }
      case "ArrayExpression":
        return `array(${node.elements.map((arg) => this.expr(arg)).join(", ")})`;
      case "UnaryExpression":
        if (!["-", "+", "!", "~"].includes(node.operator))
          return fail(node, `Unsupported operator ${node.operator}`);
        return node.operator === "+"
          ? this.expr(node.argument)
          : `(${node.operator}${this.expr(node.argument)})`;
      case "BinaryExpression":
      case "LogicalExpression":
        if (node.operator === "**")
          return `pow(${this.expr(node.left)}, ${this.expr(node.right)})`;
        if (["in", "instanceof", ">>>", "??"].includes(node.operator))
          return fail(node, `Unsupported operator ${node.operator}`);
        return `(${this.expr(node.left)} ${node.operator.replace("===", "==").replace("!==", "!=")} ${this.expr(node.right)})`;
      case "AssignmentExpression":
        return `${this.expr(node.left)} ${node.operator} ${this.expr(node.right)}`;
      case "UpdateExpression":
        return `${this.expr(node.argument)}${node.operator}`;
      case "ConditionalExpression":
        return fail(
          node,
          "Conditional expressions may change evaluation order; use if/else or WGSL select()",
        );
      case "NewExpression":
        return fail(
          node,
          "Use array constructors in a local variable declaration",
        );
      case "ThisExpression":
        return "";
      default:
        return fail(node, `Unsupported shader expression ${node.type}`);
    }
  }
  block(node: Node, main = false): string {
    const previous = new Set(this.locals);
    const statements =
      node.type === "BlockStatement"
        ? node.body
        : [{ type: "ReturnStatement", argument: node }];
    // Lexical names are known before resource rewriting, including shadowing in a nested block.
    statements.forEach((s) => {
      if (s.type === "VariableDeclaration")
        s.declarations.forEach((d) => {
          if (d.id.type !== "Identifier")
            fail(d, "Destructuring is not supported in shaders");
          this.locals.add(d.id.name);
        });
      if (s.type === "FunctionDeclaration") this.locals.add(s.id.name);
    });
    const result = statements
      .map((s) => this.statement(s, main))
      .filter(Boolean)
      .join("\n");
    this.locals = previous;
    return result;
  }
  statement(node: Node, main = false): string {
    switch (node.type) {
      case "BlockStatement":
        return `{\n${this.block(node, main)}\n}`;
      case "EmptyStatement":
        return "";
      case "FunctionDeclaration":
        this.helper(node);
        return "";
      case "VariableDeclaration":
        return node.declarations
          .map((d) => {
            if (d.id.type !== "Identifier" || !d.init)
              return fail(d, "Local variables require a name and initializer");
            const name = d.id.name;
            let type = inferType(d.init, this.types);
            this.locals.add(name);
            if (
              d.init.type === "NewExpression" ||
              (d.init.type === "CallExpression" &&
                d.init.callee.property?.name === "fill")
            ) {
              const array =
                d.init.type === "NewExpression" ? d.init : d.init.callee.object;
              const count = array.arguments?.[0];
              if (
                count?.type !== "Literal" ||
                !Number.isInteger(count.value) ||
                count.value < 1
              )
                return fail(
                  d,
                  "Local arrays require a positive constant length",
                );
              const element = type.slice(6, -1);
              type = `array<${element}, ${count.value}>`;
              this.types.set(name, type);
              const fill =
                d.init.type === "CallExpression"
                  ? d.init.arguments[0]
                  : undefined;
              return `var ${name}: ${type};${fill ? `\nfor (var _fill_${name} = 0u; _fill_${name} < ${count.value}u; _fill_${name}++) { ${name}[_fill_${name}] = ${this.expr(fill)}; }` : ""}`;
            }
            if (d.init.type === "ArrayExpression")
              type = type.slice(0, -1) + `, ${d.init.elements.length}>`;
            this.types.set(name, type);
            // Mutable locals cover JS let/var and existing examples that reassign const vectors.
            return `var ${name}${d.init.type === "ArrayExpression" ? `: ${type}` : ""} = ${this.expr(d.init)};`;
          })
          .join("\n");
      case "ExpressionStatement": {
        if (node.expression.type === "SequenceExpression")
          return node.expression.expressions
            .map((e) => `${this.expr(e)};`)
            .join("\n");
        const code = this.expr(node.expression).trim();
        return code.endsWith(";") || code.endsWith("}") ? code : `${code};`;
      }
      case "ReturnStatement":
        if (main && this.stage === "compute")
          return node.argument ? "" : "return;";
        if (main && this.stage === "vertex") return "return pixel;";
        if (main && this.stage === "fragment" && this.fragmentOutputs) {
          if (node.argument?.type !== "ObjectExpression")
            return fail(
              node,
              "All fragment returns must use the same output object fields",
            );
          const fields = new Map(
            node.argument.properties.map((p) => [
              p.key?.name || p.key?.value,
              p.value,
            ]),
          );
          if (
            fields.size !== this.fragmentOutputs.length ||
            this.fragmentOutputs.some((name) => !fields.has(name))
          )
            return fail(
              node,
              "All fragment returns must use the same output object fields",
            );
          return `return FragmentOutput(${this.fragmentOutputs.map((name) => this.expr(fields.get(name))).join(", ")});`;
        }
        return `return${node.argument ? ` ${this.expr(node.argument)}` : ""};`;
      case "IfStatement":
        return `if (${this.expr(node.test)}) ${this.asBlock(node.consequent, main)}${node.alternate ? ` else ${this.asBlock(node.alternate, main)}` : ""}`;
      case "ForStatement": {
        const previous = new Set(this.locals);
        let init =
          node.init?.type === "VariableDeclaration"
            ? this.statement(node.init).replace(/;$/, "")
            : this.expr(node.init);
        const declaration = node.init?.declarations?.[0];
        if (
          declaration?.init?.type === "Literal" &&
          Number.isInteger(declaration.init.value) &&
          node.test?.type === "BinaryExpression" &&
          inferType(node.test.right, this.types) === "u32"
        ) {
          init = init.replace(
            `var ${declaration.id.name} =`,
            `var ${declaration.id.name}: u32 =`,
          );
          this.types.set(declaration.id.name, "u32");
        }
        const result = `for (${init}; ${this.expr(node.test)}; ${this.expr(node.update)}) ${this.asBlock(node.body, main)}`;
        this.locals = previous;
        return result;
      }
      case "WhileStatement":
        return `while (${this.expr(node.test)}) ${this.asBlock(node.body, main)}`;
      case "BreakStatement":
      case "ContinueStatement":
        if (node.label)
          return fail(node, "Labeled control flow is not supported");
        return node.type === "BreakStatement" ? "break;" : "continue;";
      default:
        return fail(node, `Unsupported shader statement ${node.type}`);
    }
  }
  asBlock(node: Node, main: boolean) {
    return node.type === "BlockStatement"
      ? this.statement(node, main)
      : `{\n${this.statement(node, main)}\n}`;
  }
  helper(fn: Node) {
    const oldLocals = this.locals,
      oldTypes = this.types;
    this.locals = new Set();
    this.types = new Map(oldTypes);
    const args = fn.params.map((p) => {
      const id = p.type === "AssignmentPattern" ? p.left : p;
      if (id.type !== "Identifier")
        fail(id, "Helper parameters must be identifiers");
      const type =
        p.type === "AssignmentPattern" ? inferType(p.right, this.types) : "f32";
      this.locals.add(id.name);
      this.types.set(id.name, type);
      return `${id.name}: ${type}`;
    });
    // Infer return types after local declarations and nested helpers have been visited.
    const body = this.block(fn.body);
    let ret: Node;
    walk(
      fn.body,
      (node) => {
        if (node.type === "ReturnStatement" && node.argument)
          ret ||= node.argument;
      },
      false,
    );
    const type = ret ? inferType(ret, this.types) : undefined;
    this.helperCode.push(
      `fn ${fn.id.name}(${args.join(", ")})${type ? ` -> ${type}` : ""} {\n${body}\n}`,
    );
    this.locals = oldLocals;
    this.types = oldTypes;
    if (type) this.types.set(`fn:${fn.id.name}`, type);
  }
}

export function resourceDeclaration(r: ShaderResource): string {
  let type = r.type;
  let struct = "";
  if (r.storageWrapper) {
    type = `${r.name}Struct`;
    struct = `struct ${type} { values: ${r.type}, };\n`;
  } else if (r.kind === "uniform") {
    type = r.name === "defaults" ? "DefaultUniforms" : "UniformsStruct";
    struct = `struct ${type} {\n${r.fields.map((f) => `    ${f.name}: ${f.type},`).join("\n")}\n};\n`;
  }
  const space =
    r.kind === "buffer"
      ? `<storage, ${r.access || "read"}>`
      : r.kind === "uniform"
        ? "<uniform>"
        : "";
  return `${struct}@group(${r.group}) @binding(${r.binding}) var${space} ${r.name}: ${type};\n`;
}

export function compileShader(
  source: string,
  stage: ShaderStage,
  group: number,
  workGroupSize: WorkgroupSize,
  vbos: any[],
  gpuFuncs: (Function | string)[],
  variableTypes: any,
  textureOptions: any,
  firstBinding: number,
  previousParams: Param[],
  bindingOptions: Record<string, ShaderBinding>,
  builtins: any,
  workgroupVariables: Record<string, string> = {},
): TranspiledShader {
  const fn = parseFunction(source);
  const params: Param[] = [],
    resources: ShaderResource[] = [];
  const types = new Map<string, string>([
    ["threadId", "vec3<u32>"],
    ["vertexIndex", "u32"],
    ["instanceIndex", "u32"],
  ]);
  const varyings: Record<string, string> = {};
  (vbos || []).forEach((vbo) =>
    Object.entries(vbo).forEach(([name, type]) => {
      if (
        !["stepMode", "vertices", "__COUNT"].includes(name) &&
        typeof type === "string"
      ) {
        varyings[name] = type;
        types.set(`${name}In`, normalizeType(type));
      }
    }),
  );
  const outputs = stage === "compute" ? returnNames(fn.body) : [];
  const modified = new Set<string>(),
    textureUses = new Map<string, string>(),
    builtinUses = new Set<string>();
  references(fn.body, (node, bound) => {
    if (node.type === "AssignmentExpression" && !bound.has(rootName(node.left)))
      modified.add(rootName(node.left));
    if (node.type === "UpdateExpression" && !bound.has(rootName(node.argument)))
      modified.add(rootName(node.argument));
    if (
      node.type === "CallExpression" &&
      /^atomic(?!Load)/.test(node.callee.name || "") &&
      !bound.has(rootName(node.arguments[0]))
    )
      modified.add(rootName(node.arguments[0]));
    if (
      node.type === "CallExpression" &&
      /^texture/.test(node.callee.name || "")
    ) {
      const args = node.arguments,
        name = node.callee.name;
      if (args[0]?.type === "Identifier" && !bound.has(args[0].name))
        textureUses.set(
          args[0].name,
          name === "textureStore"
            ? "storageTexture"
            : name.includes("Compare")
              ? "depthTexture"
              : textureUses.get(args[0].name) || "texture",
        );
      if (
        /^texture(Sample|Gather)/.test(name) &&
        args[1]?.type === "Identifier" &&
        !bound.has(args[1].name)
      )
        textureUses.set(
          args[1].name,
          name.includes("Compare") ? "sampler_comparison" : "sampler",
        );
    }
    if (
      node.type === "Identifier" &&
      builtins[node.name] &&
      !bound.has(node.name)
    )
      builtinUses.add(node.name);
  });
  const declarations = new Map<string, Node>();
  fn.params.forEach((p) => {
    const id = p.type === "AssignmentPattern" ? p.left : p;
    if (id.type !== "Identifier")
      fail(
        id,
        "Shader parameters must be identifiers; destructuring/rest parameters are not supported",
      );
    declarations.set(
      id.name,
      p.type === "AssignmentPattern" ? p.right : undefined,
    );
  });
  const workgroupCode: string[] = [];
  for (const [name, value] of Object.entries(workgroupVariables)) {
    if (stage !== "compute")
      throw new Error("Workgroup variables are only valid in compute shaders");
    if (
      !identifier.test(name) ||
      declarations.has(name) ||
      builtins[name] ||
      [
        "threadId",
        "localId",
        "localIndex",
        "workgroupId",
        "workgroups",
      ].includes(name)
    )
      throw new Error(`Invalid or conflicting workgroup variable "${name}"`);
    const type = normalizeType(value);
    if (type.startsWith("array<") && !/,[1-9]\d*>$/.test(type))
      throw new Error(
        `Workgroup array "${name}" needs a fixed positive length`,
      );
    types.set(name, type);
    workgroupCode.push(`var<workgroup> ${name}: ${type};`);
  }
  // Returned local arrays are promoted to storage, matching the original API.
  walk(
    fn.body,
    (node) => {
      if (
        node.type === "VariableDeclarator" &&
        outputs.includes(node.id.name) &&
        !declarations.has(node.id.name)
      )
        fail(
          node,
          "Returned storage arrays must be declared as shader parameters",
        );
    },
    false,
  );
  textureUses.forEach((_, name) => {
    if (!declarations.has(name)) declarations.set(name, undefined);
  });
  Object.keys(bindingOptions || {}).forEach((name) => {
    if (
      !declarations.has(name) &&
      !["uniforms", "defaults"].includes(name) &&
      bindingOptions[name].type
    )
      declarations.set(name, undefined);
  });
  let binding = firstBinding;
  const occupied = new Set<number>();
  Object.values(bindingOptions || {}).forEach((spec) => {
    if (spec.binding !== undefined && (spec.group ?? group) === group)
      occupied.add(spec.binding);
  });
  const next = () => {
    while (occupied.has(binding)) binding++;
    return binding++;
  };
  const uniformFields: ShaderResource["fields"] = [];
  declarations.forEach((value, name) => {
    if (!identifier.test(name))
      throw new Error(`Invalid resource name ${name}`);
    const spec = bindingOptions?.[name] || {};
    const override = variableTypes?.[name];
    const tex = textureOptions?.[name];
    const previous = previousParams?.find((p) => p.name === name);
    let type = normalizeType(
      spec.type ||
        (typeof override === "string" ? override : override?.type) ||
        (value ? inferType(value, types) : previous?.type || "f32"),
    );
    const usage = textureUses.get(name);
    if (usage === "storageTexture" || tex?.isStorage)
      type =
        spec.type ||
        tex?.type ||
        (type.startsWith("texture_storage")
          ? type
          : `texture_storage_2d<${tex?.format || "rgba8unorm"},write>`);
    else if (
      usage === "sampler" ||
      usage === "sampler_comparison" ||
      tex?.isSampler ||
      tex?.isComparisonSampler
    )
      type =
        spec.type ||
        (tex?.isComparisonSampler
          ? "sampler_comparison"
          : usage?.startsWith("sampler")
            ? usage
            : "sampler");
    else if (usage === "texture" || usage === "depthTexture" || tex)
      type =
        spec.type ||
        tex?.type ||
        (type.startsWith("texture_")
          ? type
          : tex?.isDepth || usage === "depthTexture"
            ? "texture_depth_2d"
            : "texture_2d<f32>");
    const kind: ShaderResource["kind"] = type.startsWith("texture_storage")
      ? "storageTexture"
      : type.startsWith("texture_")
        ? "texture"
        : type.startsWith("sampler")
          ? "sampler"
          : type.startsWith("array<") || override?.prefix?.includes("storage")
            ? "buffer"
            : "uniform";
    if (kind === "uniform" && type === "bool")
      throw new Error(`Uniform ${name}: use u32 or i32 instead of bool`);
    const atomicBuffer = kind === "buffer" && type.includes("atomic<");
    if (atomicBuffer && spec.access && spec.access !== "read_write")
      throw new Error(
        `Atomic buffer ${name} requires read_write storage access`,
      );
    const node: Param = {
      name,
      type: type as any,
      value: value ? source.slice(value.start - 1, value.end - 1) : "unknown",
      isInput: fn.params.some((p) => (p.left || p).name === name),
      isReturned: outputs.includes(name),
      isModified: modified.has(name),
      isUniform: kind === "uniform",
      isTexture: kind === "texture",
      isStorageTexture: kind === "storageTexture",
      isSampler: kind === "sampler",
    };
    params.push(node);
    types.set(name, type);
    if (kind === "uniform") {
      const defaultValue =
        value?.type === "Literal" && typeof value.value !== "string"
          ? value.value
          : undefined;
      uniformFields.push({ name, type, defaultValue });
      if (
        spec.binding !== undefined ||
        spec.group !== undefined ||
        spec.resource !== undefined
      )
        throw new Error(
          `Configure the packed uniform buffer with binding name "uniforms", rather than "${name}"`,
        );
    } else {
      resources.push({
        name,
        kind,
        type,
        group: spec.group ?? group,
        binding: spec.binding ?? next(),
        access:
          kind === "buffer"
            ? spec.access ||
              (atomicBuffer || node.isModified || node.isReturned
                ? "read_write"
                : "read")
            : undefined,
        resource: spec.resource,
        explicit: spec.binding !== undefined || spec.group !== undefined,
        storageWrapper: kind === "buffer" && type.startsWith("array<"),
      });
    }
  });
  if (uniformFields.length) {
    const spec = bindingOptions?.uniforms || {};
    resources.push({
      name: "uniforms",
      kind: "uniform",
      type: "UniformsStruct",
      fields: uniformFields,
      group: spec.group ?? group,
      binding: spec.binding ?? next(),
      resource: spec.resource,
      explicit: spec.binding !== undefined || spec.group !== undefined,
    });
  }
  const defaults = [...builtinUses].filter((name) => !declarations.has(name));
  if (defaults.length) {
    const spec = bindingOptions?.defaults || {};
    resources.push({
      name: "defaults",
      kind: "uniform",
      type: "DefaultUniforms",
      fields: defaults.map((name) => ({ name, type: builtins[name].type })),
      defaultUniforms: defaults,
      group: spec.group ?? group,
      binding: spec.binding ?? next(),
      resource: spec.resource,
      explicit: spec.binding !== undefined || spec.group !== undefined,
    });
  }
  params.forEach((p) => {
    const r = resources.find(
      (r) => r.name === p.name || (p.isUniform && r.name === "uniforms"),
    );
    if (r) {
      p.binding = r.binding;
      p.group = r.group;
    }
  });
  const emitter = new Emitter(
    params,
    resources,
    stage,
    varyings,
    defaults,
    types,
  );
  let fragmentReturn: Node;
  if (stage === "fragment")
    walk(
      fn.body,
      (node) => {
        if (
          node.type === "ReturnStatement" &&
          node.argument?.type === "ObjectExpression"
        )
          fragmentReturn ||= node.argument;
      },
      false,
    );
  if (fragmentReturn) {
    emitter.fragmentOutputs = fragmentReturn.properties.map((property) => {
      const name = property.key?.name || property.key?.value;
      if (
        property.type !== "Property" ||
        property.computed ||
        !identifier.test(name)
      )
        fail(
          property,
          "Fragment output fields need ordinary WGSL-compatible names",
        );
      return name;
    });
  }
  (gpuFuncs || []).forEach((f) => emitter.helper(parseFunction(f.toString())));
  let body = emitter.block(fn.body, true);
  let signature: string;
  let vertexStruct = "";
  if (stage !== "compute")
    vertexStruct = `struct Vertex {\n    @builtin(position) position: vec4<f32>,\n${Object.entries(
      varyings,
    )
      .map(
        ([name, type], i) =>
          `    @location(${i}) ${name}: ${normalizeType(type)},`,
      )
      .join("\n")}\n};\n`;
  if (stage === "compute")
    signature = `@compute @workgroup_size(${typeof workGroupSize === "number" ? workGroupSize : workgroupDimensions(workGroupSize).join(", ")})\nfn compute_main(@builtin(global_invocation_id) threadId: vec3<u32>, @builtin(local_invocation_id) localId: vec3<u32>, @builtin(local_invocation_index) localIndex: u32, @builtin(num_workgroups) workgroups: vec3<u32>, @builtin(workgroup_id) workgroupId: vec3<u32>)`;
  else if (stage === "vertex") {
    signature = `@vertex\nfn vtx_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32, ${Object.entries(
      varyings,
    )
      .map(
        ([name, type], i) =>
          `@location(${i}) ${name}In: ${normalizeType(type)}`,
      )
      .join(", ")}) -> Vertex`;
    body = `var pixel: Vertex;\n${body}\nreturn pixel;`;
  } else
    signature = `@fragment\nfn frag_main(pixel: Vertex, @builtin(front_facing) is_front: bool, @builtin(sample_index) sampleIndex: u32, @builtin(sample_mask) sampleMask: u32) -> ${fragmentReturn ? "FragmentOutput" : "@location(0) vec4<f32>"}`;
  const fragmentStruct = fragmentReturn
    ? `struct FragmentOutput {\n${fragmentReturn.properties.map((property, location) => `    @location(${location}) ${emitter.fragmentOutputs[location]}: ${inferType(property.value, emitter.types)},`).join("\n")}\n};\n`
    : "";
  const header = [...resources.map(resourceDeclaration), ...workgroupCode].join(
    "\n",
  );
  return {
    code: `${/\bf16\b/.test(header) ? "enable f16;\n" : ""}${header}\n${vertexStruct}\n${fragmentStruct}\n${emitter.helperCode.join("\n")}\n${signature} {\n${body}\n}\n`,
    header,
    resources,
    ast: params.map((p) => ({ ...p })),
    params,
    funcStr: source,
    defaultUniforms: defaults.length ? defaults : undefined,
    type: stage,
    workGroupSize: stage === "compute" ? workGroupSize : undefined,
    bindGroupNumber: group,
    lastBinding: binding,
    returnedVars: outputs,
  };
}
