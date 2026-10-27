import { Param, TranspiledShader, ShaderBinding } from "./types.js";
import { compileShader, parseFunction, inferType, walk } from "./parser.js";
import { linkBindings, rawShader, maskComments } from "./bindings.js";
import { resolution } from "./builtin-inputs.js";
import { workgroupDimensions } from "./workgroups.js";

/** JavaScript shader syntax is parsed before WGSL is generated. No JavaScript is evaluated. */
export class WGSLTranspiler {
  static builtInUniforms = {
    resX: {
      type: "f32",
      callback: (context) => resolution(context.canvas, "width"),
    },
    resY: {
      type: "f32",
      callback: (context) => resolution(context.canvas, "height"),
    },
    mouseX: {
      type: "f32",
      callback: (context) => context.getBuiltinInputs().mouseX,
    },
    mouseY: {
      type: "f32",
      callback: (context) => context.getBuiltinInputs().mouseY,
    },
    clicked: {
      type: "i32",
      callback: (context) => context.getBuiltinInputs().clicked,
    },
    //keyinputs
    frame: {
      type: "f32",
      callback: function (shaderContext) {
        if (!shaderContext.frame) shaderContext.frame = 0;
        let result = shaderContext.frame;
        shaderContext.frame++;
        return result;
      },
    }, //frame counter
    utcTime: {
      type: "f32",
      callback: (shaderContext) => {
        return Date.now();
      },
    }, //utc time
  }; //etc.. more we can add from shaderToy

  static convertToWebGPU(
    func: Function | string,
    shaderType: "compute" | "vertex" | "fragment" = "compute",
    bindGroupNumber = 0,
    workGroupSize: import("./types.js").WorkgroupSize = 64,
    vertexBufferOptions: any[] = [{ color: "vec4<f32>" }],
    gpuFuncs?: (Function | string)[],
    variableTypes?: {
      [key: string]: string | { prefix?: string; type: string };
    },
    textureOptions?: { [key: string]: any },
    lastBinding = 0,
    params?: Param[],
    resourceBindings: Record<string, ShaderBinding> = {},
    workgroupVariables: Record<string, string> = {},
  ): TranspiledShader {
    workgroupDimensions(workGroupSize);
    const shader = compileShader(
      func.toString(),
      shaderType,
      bindGroupNumber,
      workGroupSize,
      vertexBufferOptions,
      gpuFuncs,
      variableTypes,
      textureOptions,
      lastBinding,
      params,
      resourceBindings,
      this.builtInUniforms,
      workgroupVariables,
    );
    shader.code = this.indentCode(shader.code);
    shader.header = this.indentCode(shader.header);
    return shader;
  }

  static combineBindings(
    code1: string,
    code2: string,
    noOverlap = true,
    params?: Param[],
  ) {
    const first = rawShader(code1, "compute"),
      second = rawShader(code2, "compute");
    // This legacy utility keeps shader 1 stable and remaps shader 2 by resource name.
    first.resources.forEach((r) => (r.resource = `legacy:${r.name}`));
    second.resources.forEach((r) => {
      const existing = first.resources.find((k) => k.name === r.name);
      r.explicit = !!params?.find((p) => p.name === r.name && p.sharedBinding);
      if (existing) r.resource = existing.resource;
    });
    linkBindings([second], first.resources, true);
    const mapping = (shader) =>
      Object.fromEntries(
        shader.resources.map((r) => [
          r.name,
          { group: r.group, binding: r.binding },
        ]),
      );
    return {
      code1: first.code,
      code2: second.code,
      changes1: mapping(first),
      changes2: mapping(second),
    };
  }

  static combineShaderParams(
    first: TranspiledShader,
    second: TranspiledShader,
  ) {
    const params = [...first.params];
    second.params.forEach((p) => {
      if (!params.some((k) => k.name === p.name && k.resource === p.resource))
        params.push(p);
    });
    return params;
  }

  static getFunctionHead(source: string) {
    const fn = parseFunction(source);
    return source.slice(0, fn.body.start);
  }
  static splitIgnoringBrackets(source: string) {
    const result: string[] = [];
    let depth = 0,
      start = 0,
      quote = "",
      escape = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (escape) escape = false;
        else if (c === "\\") escape = true;
        else if (c === quote) quote = "";
        continue;
      }
      if ("\"'`".includes(c)) quote = c;
      else if ("([{<".includes(c)) depth++;
      else if (")]}>".includes(c)) depth--;
      else if (c === "," && depth === 0) {
        result.push(source.slice(start, i));
        start = i + 1;
      }
    }
    if (source.slice(start).trim()) result.push(source.slice(start));
    return result;
  }
  static tokenize(source: string) {
    const fn = parseFunction(source);
    return fn.params.map((p) => ({
      token: source.slice(p.start - 1, p.end - 1),
      isInput: true,
    }));
  }
  static parse(
    source: string,
    _tokens?: any,
    stage: any = "compute",
    vbos?: any,
  ) {
    return this.convertToWebGPU(source, stage, 0, 64, vbos).ast;
  }
  static inferTypeFromValue(
    value: string,
    _source?: string,
    _ast?: any,
    defaultValue = "f32",
  ) {
    try {
      return inferType(parseFunction(`() => (${value})`).body);
    } catch {
      return defaultValue;
    }
  }
  static flattenStrings(values: string[] = []) {
    return values
      .flatMap((s) =>
        this.splitIgnoringBrackets(s.trim().replace(/^[\[{]|[\]}]$/g, "")),
      )
      .map((s) => s.trim());
  }
  static variablePattern(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  static indentCode(code: string) {
    let depth = 0;
    const masked = maskComments(code).split("\n");
    return code
      .split("\n")
      .map((line, index) => {
        const text = line.trim(),
          syntax = masked[index].trim();
        const indentation = Math.max(
          0,
          depth - (syntax.startsWith("}") ? 1 : 0),
        );
        depth = Math.max(
          0,
          depth +
            (syntax.match(/\{/g) || []).length -
            (syntax.match(/\}/g) || []).length,
        );
        return text ? "    ".repeat(indentation) + text : "";
      })
      .join("\n");
  }
}
export const replacements = {
  "Math.PI": `${Math.PI}`,
  "Math.E": `${Math.E}`,
  "Math.LN10": `${Math.LN10}`,
  "Math.LN2": `${Math.LN2}`,
  "Math.LOG10E": `${Math.LOG10E}`,
  "Math.LOG2E": `${Math.LOG2E}`,
  "Math.SQRT1_2": `${Math.SQRT1_2}`,
  "Math.SQRT2": `${Math.SQRT2}`,
  "Math.abs": "abs",
  "Math.acos": "acos",
  "Math.acosh": "acosh",
  "Math.asin": "asin",
  "Math.asinh": "asinh",
  "Math.atan": "atan",
  "Math.atan2": "atan2",
  "Math.atanh": "atanh",
  // 'Math.cbrt': '', // No direct WGSL equivalent
  "Math.ceil": "ceil",
  "Math.cos": "cos",
  "Math.cosh": "cosh",
  "Math.clz32": "countLeadingZeros",
  // 'Math.imul': '', // No direct WGSL equivalent
  "Math.exp": "exp",
  // 'Math.expm1': '', // No direct WGSL equivalent
  "Math.floor": "floor",
  "Math.log": "log",
  "Math.log2": "log2",
  "Math.max": "max",
  "Math.min": "min",
  "Math.pow": "pow",
  // 'Math.random': '', // No direct WGSL equivalent
  "Math.round": "round",
  "Math.sin": "sin",
  "Math.sinh": "sinh",
  "Math.sqrt": "sqrt",
  "Math.tan": "tan",
  "Math.tanh": "tanh",
  "Math.trunc": "trunc",
  // ... add more replacements as needed
};

const wgslTypeSizes32 = {
  bool: { alignment: 1, size: 1, ct: 1 },
  u8: { alignment: 1, size: 1, ct: 1 },
  i8: { alignment: 1, size: 1, ct: 1 },
  i32: { alignment: 4, size: 4, vertexFormats: { sint32: true }, ct: 1 },
  u32: { alignment: 4, size: 4, vertexFormats: { uint32: true }, ct: 1 },
  f32: { alignment: 4, size: 4, vertexFormats: { float32: true }, ct: 1 },
  i64: { alignment: 8, size: 8, ct: 1 },
  u64: { alignment: 8, size: 8, ct: 1 },
  f64: { alignment: 8, size: 8, ct: 1 },

  "atomic<u32>": { alignment: 4, size: 4, ct: 1 },
  "atomic<i32>": { alignment: 4, size: 4, ct: 1 },

  "vec2<i32>": {
    alignment: 8,
    size: 8,
    vertexFormats: { sint8x2: true, sint16x2: true, sint32x2: true },
    ct: 2,
  },
  "vec2<u32>": {
    alignment: 8,
    size: 8,
    vertexFormats: { uint8x2: true, uint16x2: true, uint32x2: true },
    ct: 2,
  },
  "vec2<f32>": {
    alignment: 8,
    size: 8,
    vertexFormats: {
      unorm8x2: true,
      unorm16x2: true,
      float32x2: true,
      snorm8x2: true,
      snorm16x2: true,
    },
    ct: 2,
  },
  "vec3<i32>": {
    alignment: 16,
    size: 12,
    vertexFormats: { sint32x3: true },
    ct: 3,
  },
  "vec3<u32>": {
    alignment: 16,
    size: 12,
    vertexFormats: { uint32x3: true },
    ct: 3,
  },
  "vec3<f32>": {
    alignment: 16,
    size: 12,
    vertexFormats: { float32x3: true },
    ct: 3,
  },
  "vec4<i32>": {
    alignment: 16,
    size: 16,
    vertexFormats: { sint8x4: true, sint16x4: true, sint32x4: true },
    ct: 4,
  },
  "vec4<u32>": {
    alignment: 16,
    size: 16,
    vertexFormats: { uint8x4: true, uint16x4: true, uint32x4: true },
    ct: 4,
  },
  "vec4<f32>": {
    alignment: 16,
    size: 16,
    vertexFormats: {
      unorm8x4: true,
      unorm16x4: true,
      float32x4: true,
      snorm8x4: true,
      snorm16x4: true,
      float16x4: true,
    },
    ct: 4,
  },

  vec2i: {
    alignment: 8,
    size: 8,
    vertexFormats: { sint8x2: true, sint16x2: true, sint32x2: true },
    ct: 2,
  }, // shorthand for vec2<i32>
  vec2u: {
    alignment: 8,
    size: 8,
    vertexFormats: { uint8x2: true, uint16x2: true, uint32x2: true },
    ct: 2,
  }, // shorthand for vec2<u32>
  vec2f: {
    alignment: 8,
    size: 8,
    vertexFormats: {
      unorm8x2: true,
      unorm16x2: true,
      float32x2: true,
      snorm8x2: true,
      snorm16x2: true,
    },
    ct: 2,
  }, // shorthand for vec2<f32>
  vec3i: { alignment: 16, size: 12, vertexFormats: { sint32x3: true }, ct: 3 }, // shorthand for vec3<i32>
  vec3u: { alignment: 16, size: 12, vertexFormats: { uint32x3: true }, ct: 3 }, // shorthand for vec3<u32>
  vec3f: { alignment: 16, size: 12, vertexFormats: { float32x3: true }, ct: 3 }, // shorthand for vec3<f32>
  vec4i: {
    alignment: 16,
    size: 16,
    vertexFormats: { sint8x4: true, sint16x4: true, sint32x4: true },
    ct: 4,
  }, // shorthand for vec4<i32>
  vec4u: {
    alignment: 16,
    size: 16,
    vertexFormats: { uint8x4: true, uint16x4: true, uint32x4: true },
    ct: 4,
  }, // shorthand for vec4<u32>
  vec4f: {
    alignment: 16,
    size: 16,
    vertexFormats: {
      unorm8x4: true,
      unorm16x4: true,
      float32x4: true,
      snorm8x4: true,
      snorm16x4: true,
      float16x4: true,
    },
    ct: 4,
  }, // shorthand for vec4<f32>

  //FYI matrix u and i formats are not supported in wgsl (yet) afaik
  "mat2x2<f32>": { alignment: 8, size: 16, ct: 4 },
  "mat2x2<i32>": { alignment: 8, size: 16, ct: 4 },
  "mat2x2<u32>": { alignment: 8, size: 16, ct: 4 },
  "mat3x2<f32>": { alignment: 8, size: 24, ct: 6 },
  "mat3x2<i32>": { alignment: 8, size: 24, ct: 6 },
  "mat3x2<u32>": { alignment: 8, size: 24, ct: 6 },
  "mat4x2<f32>": { alignment: 8, size: 32, ct: 8 },
  "mat4x2<i32>": { alignment: 8, size: 32, ct: 8 },
  "mat4x2<u32>": { alignment: 8, size: 32, ct: 8 },
  "mat2x3<f32>": { alignment: 16, size: 24, ct: 6 },
  "mat2x3<i32>": { alignment: 16, size: 24, ct: 6 },
  "mat2x3<u32>": { alignment: 16, size: 24, ct: 6 },
  "mat3x3<f32>": { alignment: 16, size: 36, ct: 9 },
  "mat3x3<i32>": { alignment: 16, size: 36, ct: 9 },
  "mat3x3<u32>": { alignment: 16, size: 36, ct: 9 },
  "mat4x3<f32>": { alignment: 16, size: 48, ct: 12 },
  "mat4x3<i32>": { alignment: 16, size: 48, ct: 12 },
  "mat4x3<u32>": { alignment: 16, size: 48, ct: 12 },
  "mat2x4<f32>": { alignment: 16, size: 32, ct: 8 },
  "mat2x4<i32>": { alignment: 16, size: 32, ct: 8 },
  "mat2x4<u32>": { alignment: 16, size: 32, ct: 8 },
  "mat3x4<f32>": { alignment: 16, size: 48, ct: 12 },
  "mat3x4<i32>": { alignment: 16, size: 48, ct: 12 },
  "mat3x4<u32>": { alignment: 16, size: 48, ct: 12 },
  "mat4x4<f32>": { alignment: 16, size: 64, ct: 16 },
  "mat4x4<i32>": { alignment: 16, size: 64, ct: 16 },
  "mat4x4<u32>": { alignment: 16, size: 64, ct: 16 },

  mat2x2f: { alignment: 8, size: 16, ct: 4 }, // shorthand for mat2x2<f32>
  mat2x2i: { alignment: 8, size: 16, ct: 4 }, // shorthand for mat2x2<i32>
  mat2x2u: { alignment: 8, size: 16, ct: 4 }, // shorthand for mat2x2<u32>
  mat3x2f: { alignment: 8, size: 24, ct: 6 }, // shorthand for mat3x2<f32>
  mat3x2i: { alignment: 8, size: 24, ct: 6 }, // shorthand for mat3x2<i32>
  mat3x2u: { alignment: 8, size: 24, ct: 6 }, // shorthand for mat3x2<u32>
  mat4x2f: { alignment: 8, size: 32, ct: 8 }, // shorthand for mat4x2<f32>
  mat4x2i: { alignment: 8, size: 32, ct: 8 }, // shorthand for mat4x2<i32>
  mat4x2u: { alignment: 8, size: 32, ct: 8 }, // shorthand for mat4x2<u32>
  mat2x3f: { alignment: 16, size: 24, ct: 6 }, // shorthand for mat2x3<f32>
  mat2x3i: { alignment: 16, size: 24, ct: 6 }, // shorthand for mat2x3<i32>
  mat2x3u: { alignment: 16, size: 24, ct: 6 }, // shorthand for mat2x3<u32>
  mat3x3f: { alignment: 16, size: 36, ct: 9 }, // shorthand for mat3x3<f32>
  mat3x3i: { alignment: 16, size: 36, ct: 9 }, // shorthand for mat3x3<i32>
  mat3x3u: { alignment: 16, size: 36, ct: 9 }, // shorthand for mat3x3<u32>
  mat4x3f: { alignment: 16, size: 48, ct: 12 }, // shorthand for mat4x3<f32>
  mat4x3i: { alignment: 16, size: 48, ct: 12 }, // shorthand for mat4x3<i32>
  mat4x3u: { alignment: 16, size: 48, ct: 12 }, // shorthand for mat4x3<u32>
  mat2x4f: { alignment: 16, size: 32, ct: 8 }, // shorthand for mat2x4<f32>
  mat2x4i: { alignment: 16, size: 32, ct: 8 }, // shorthand for mat2x4<i32>
  mat2x4u: { alignment: 16, size: 32, ct: 8 }, // shorthand for mat2x4<u32>
  mat3x4f: { alignment: 16, size: 48, ct: 12 }, // shorthand for mat3x4<f32>
  mat3x4i: { alignment: 16, size: 48, ct: 12 }, // shorthand for mat3x4<i32>
  mat3x4u: { alignment: 16, size: 48, ct: 12 }, // shorthand for mat3x4<u32>
  mat4x4f: { alignment: 16, size: 64, ct: 16 }, // shorthand for mat4x4<f32>
  mat4x4i: { alignment: 16, size: 64, ct: 16 }, // shorthand for mat4x4<i32>
  mat4x4u: { alignment: 16, size: 64, ct: 16 }, // shorthand for mat4x4<u32>
};

const wgslTypeSizes16 = {
  i16: { alignment: 2, size: 2 },
  u16: { alignment: 2, size: 2 },
  f16: {
    alignment: 2,
    size: 2,
    vertexFormats: { float16x2: true, float16x4: true },
  },

  "vec2<f16>": { alignment: 4, size: 4, vertexFormats: { float16x2: true } },
  "vec2<i16>": { alignment: 4, size: 4 },
  "vec2<u16>": { alignment: 4, size: 4 },
  "vec3<f16>": { alignment: 8, size: 6 },
  "vec3<i16>": { alignment: 8, size: 6 },
  "vec3<u16>": { alignment: 8, size: 6 },
  "vec4<f16>": { alignment: 8, size: 8, vertexFormats: { float16x4: true } },
  "vec4<i16>": { alignment: 8, size: 8 },
  "vec4<u16>": { alignment: 8, size: 8 },

  //FYI matrix u and i formats are not supported in wgsl (yet) afaik
  "mat2x2<f16>": { alignment: 4, size: 8 },
  "mat2x2<i16>": { alignment: 4, size: 8 },
  "mat2x2<u16>": { alignment: 4, size: 8 },
  "mat3x2<f16>": { alignment: 4, size: 12 },
  "mat3x2<i16>": { alignment: 4, size: 12 },
  "mat3x2<u16>": { alignment: 4, size: 12 },
  "mat4x2<f16>": { alignment: 4, size: 16 },
  "mat4x2<i16>": { alignment: 4, size: 16 },
  "mat4x2<u16>": { alignment: 4, size: 16 },
  "mat2x3<f16>": { alignment: 8, size: 16 },
  "mat2x3<i16>": { alignment: 8, size: 16 },
  "mat2x3<u16>": { alignment: 8, size: 16 },
  "mat3x3<f16>": { alignment: 8, size: 24 },
  "mat3x3<i16>": { alignment: 8, size: 24 },
  "mat3x3<u16>": { alignment: 8, size: 24 },
  "mat4x3<f16>": { alignment: 8, size: 32 },
  "mat4x3<i16>": { alignment: 8, size: 32 },
  "mat4x3<u16>": { alignment: 8, size: 32 },
  "mat2x4<f16>": { alignment: 8, size: 16 },
  "mat2x4<i16>": { alignment: 8, size: 16 },
  "mat2x4<u16>": { alignment: 8, size: 16 },
  "mat3x4<f16>": { alignment: 8, size: 24 },
  "mat3x4<i16>": { alignment: 8, size: 24 },
  "mat3x4<u16>": { alignment: 8, size: 24 },
  "mat4x4<f16>": { alignment: 8, size: 32 },
  "mat4x4<i16>": { alignment: 8, size: 32 },
  "mat4x4<u16>": { alignment: 8, size: 32 },

  mat2x2h: { alignment: 4, size: 8 }, // shorthand for mat2x2<f16>
  mat3x2h: { alignment: 4, size: 12 }, // shorthand for mat3x2<f16>
  mat4x2h: { alignment: 4, size: 16 }, // shorthand for mat4x2<f16>
  mat2x3h: { alignment: 8, size: 16 }, // shorthand for mat2x3<f16>
  mat3x3h: { alignment: 8, size: 24 }, // shorthand for mat3x3<f16>
  mat4x3h: { alignment: 8, size: 32 }, // shorthand for mat4x3<f16>
  mat2x4h: { alignment: 8, size: 16 }, // shorthand for mat2x4<f16>
  mat3x4h: { alignment: 8, size: 24 }, // shorthand for mat3x4<f16>
  mat4x4h: { alignment: 8, size: 32 }, // shorthand for mat4x4<f16>
};

export const vertexFormats = {
  uint8x2: { byteSize: 2, wgslTypes: { "vec2<u32>": true, vec2u: true } },
  uint8x4: { byteSize: 4, wgslTypes: { "vec4<u32>": true, vec4u: true } },
  sint8x2: { byteSize: 2, wgslTypes: { "vec2<i32>": true, vec2i: true } },
  sint8x4: { byteSize: 4, wgslTypes: { "vec4<i32>": true, vec4i: true } },
  unorm8x2: { byteSize: 2, wgslTypes: { "vec2<f32>": true, vec2f: true } },
  unorm8x4: { byteSize: 4, wgslTypes: { "vec4<f32>": true, vec4f: true } },
  snorm8x2: { byteSize: 2, wgslTypes: { "vec2<f32>": true, vec2f: true } },
  snorm8x4: { byteSize: 4, wgslTypes: { "vec4<f32>": true, vec4f: true } },
  uint16x2: { byteSize: 4, wgslTypes: { "vec2<u32>": true, vec2u: true } },
  uint16x4: { byteSize: 8, wgslTypes: { "vec4<u32>": true, vec4u: true } },
  sint16x2: { byteSize: 4, wgslTypes: { "vec2<i32>": true, vec2i: true } },
  sint16x4: { byteSize: 8, wgslTypes: { "vec4<i32>": true, vec4i: true } },
  unorm16x2: { byteSize: 4, wgslTypes: { "vec2<f32>": true, vec2f: true } },
  unorm16x4: { byteSize: 8, wgslTypes: { "vec4<f32>": true, vec4f: true } },
  snorm16x2: { byteSize: 4, wgslTypes: { "vec2<f32>": true, vec2f: true } },
  snorm16x4: { byteSize: 8, wgslTypes: { "vec4<f32>": true, vec4f: true } },
  float16x2: { byteSize: 4, wgslTypes: { "vec2<f16>": true, vec2h: true } },
  float16x4: { byteSize: 8, wgslTypes: { "vec4<f16>": true, vec4h: true } },
  float32: { byteSize: 4, wgslTypes: { f32: true } },
  float32x2: { byteSize: 8, wgslTypes: { "vec2<f32>": true, vec2f: true } },
  float32x3: { byteSize: 12, wgslTypes: { "vec3<f32>": true, vec3f: true } },
  float32x4: { byteSize: 16, wgslTypes: { "vec4<f32>": true, vec4f: true } },
  uint32: { byteSize: 4, wgslTypes: { u32: true } },
  uint32x2: { byteSize: 8, wgslTypes: { "vec2<u32>": true, vec2u: true } },
  uint32x3: { byteSize: 12, wgslTypes: { "vec3<u32>": true, vec3u: true } },
  uint32x4: { byteSize: 16, wgslTypes: { "vec4<u32>": true, vec4u: true } },
  sint32: { byteSize: 4, wgslTypes: { i32: true } },
  sint32x2: { byteSize: 8, wgslTypes: { "vec2<i32>": true, vec2i: true } },
  sint32x3: { byteSize: 12, wgslTypes: { "vec3<i32>": true, vec3i: true } },
  sint32x4: { byteSize: 16, wgslTypes: { "vec4<i32>": true, vec4i: true } },
};

export const textureFormats = [
  //https://www.w3.org/TR/webgpu/#texture-formats
  // 8-bit formats
  "r8unorm",
  "r8snorm",
  "r8uint",
  "r8sint",

  // 16-bit formats
  "r16uint",
  "r16sint",
  "r16float",
  "rg8unorm",
  "rg8snorm",
  "rg8uint",
  "rg8sint",

  // 32-bit formats
  "r32uint",
  "r32sint",
  "r32float",
  "rg16uint",
  "rg16sint",
  "rg16float",
  "rgba8unorm",
  "rgba8unorm-srgb",
  "rgba8snorm",
  "rgba8uint",
  "rgba8sint",
  "bgra8unorm",
  "bgra8unorm-srgb",

  // Packed 32-bit formats
  "rgb9e5ufloat",
  "rgb10a2uint",
  "rgb10a2unorm",
  "rg11b10ufloat",

  // 64-bit formats
  "rg32uint",
  "rg32sint",
  "rg32float",
  "rgba16uint",
  "rgba16sint",
  "rgba16float",

  // 128-bit formats
  "rgba32uint",
  "rgba32sint",
  "rgba32float",

  // Depth/stencil formats
  "stencil8",
  "depth16unorm",
  "depth24plus",
  "depth24plus-stencil8",
  "depth32float",

  // "depth32float-stencil8" feature
  "depth32float-stencil8",

  // BC compressed formats usable if "texture-compression-bc" is both
  // supported by the device/user agent and enabled in requestDevice.
  "bc1-rgba-unorm",
  "bc1-rgba-unorm-srgb",
  "bc2-rgba-unorm",
  "bc2-rgba-unorm-srgb",
  "bc3-rgba-unorm",
  "bc3-rgba-unorm-srgb",
  "bc4-r-unorm",
  "bc4-r-snorm",
  "bc5-rg-unorm",
  "bc5-rg-snorm",
  "bc6h-rgb-ufloat",
  "bc6h-rgb-float",
  "bc7-rgba-unorm",
  "bc7-rgba-unorm-srgb",

  // ETC2 compressed formats usable if "texture-compression-etc2" is both
  // supported by the device/user agent and enabled in requestDevice.
  "etc2-rgb8unorm",
  "etc2-rgb8unorm-srgb",
  "etc2-rgb8a1unorm",
  "etc2-rgb8a1unorm-srgb",
  "etc2-rgba8unorm",
  "etc2-rgba8unorm-srgb",
  "eac-r11unorm",
  "eac-r11snorm",
  "eac-rg11unorm",
  "eac-rg11snorm",

  // ASTC compressed formats usable if "texture-compression-astc" is both
  // supported by the device/user agent and enabled in requestDevice.
  "astc-4x4-unorm",
  "astc-4x4-unorm-srgb",
  "astc-5x4-unorm",
  "astc-5x4-unorm-srgb",
  "astc-5x5-unorm",
  "astc-5x5-unorm-srgb",
  "astc-6x5-unorm",
  "astc-6x5-unorm-srgb",
  "astc-6x6-unorm",
  "astc-6x6-unorm-srgb",
  "astc-8x5-unorm",
  "astc-8x5-unorm-srgb",
  "astc-8x6-unorm",
  "astc-8x6-unorm-srgb",
  "astc-8x8-unorm",
  "astc-8x8-unorm-srgb",
  "astc-10x5-unorm",
  "astc-10x5-unorm-srgb",
  "astc-10x6-unorm",
  "astc-10x6-unorm-srgb",
  "astc-10x8-unorm",
  "astc-10x8-unorm-srgb",
  "astc-10x10-unorm",
  "astc-10x10-unorm-srgb",
  "astc-12x10-unorm",
  "astc-12x10-unorm-srgb",
  "astc-12x12-unorm",
  "astc-12x12-unorm-srgb",
];

//IDK if this is correct but it mostly depends
export const imageToTextureFormats = {
  ".png": [
    "r8unorm",
    "rg8unorm",
    "rgba8unorm",
    "rgba8unorm-srgb",
    "rgb10a2unorm",
    "bgra8unorm",
    "bgra8unorm-srgb",
  ],
  ".jpg": [
    "r8unorm",
    "rg8unorm",
    "rgba8unorm",
    "rgba8unorm-srgb",
    "rgb10a2unorm",
    "bgra8unorm",
    "bgra8unorm-srgb",
  ],
  ".hdr": ["r16float", "rg16float", "rgba16float"],
  ".exr": ["r32float", "rg32float", "rgba32float"],
};

//reference
const wgslBuiltInFunctions = {
  "Constructor Built-in Functions": {
    "Zero Value Built-in Functions": {
      //default values if instantiating empty numbers e.g. f32() or bool()
      bool: "false",
      i32: "0i",
      u32: "0u",
      f32: "0.0f",
      f16: "0.0h",
    },
    "Value Constructor Built-in Functions": [
      "array",
      "bool",
      "f16",
      "f32",
      "i32",
      "mat2x2",
      "mat2x3",
      "mat2x4",
      "mat3x2",
      "mat3x3",
      "mat3x4",
      "mat4x2",
      "mat4x3",
      "mat4x4",
      "Structures",
      "u32",
      "vec2",
      "vec3",
      "vec4",
    ],
  },
  "Bit Reinterpretation Built-in Functions": ["bitcast"],
  "Logical Built-in Functions": ["all", "any", "select"],
  "Array Built-in Functions": ["arrayLength"],
  "Numeric Built-in Functions": [
    "abs",
    "acos",
    "acosh",
    "asin",
    "asinh",
    "atan",
    "atanh",
    "atan2",
    "ceil",
    "clamp",
    "cos",
    "cosh",
    "countLeadingZeros",
    "countOneBits",
    "countTrailingZeros",
    "cross",
    "degrees",
    "determinant",
    "distance",
    "dot",
    "dot4U8Packed",
    "dot4I8Packed",
    "exp",
    "exp2",
    "extractBits",
    "faceForward",
    "firstLeadingBit",
    "firstTrailingBit",
    "floor",
    "fma",
    "fract",
    "frexp",
    "insertBits",
    "inverseSqrt",
    "ldexp",
    "length",
    "log",
    "log2",
    "max",
    "min",
    "mix",
    "modf",
    "normalize",
    "pow",
    "quantizeToF16",
    "radians",
    "reflect",
    "refract",
    "reverseBits",
    "round",
    "saturate",
    "sign",
    "sin",
    "sinh",
    "smoothstep",
    "sqrt",
    "step",
    "tan",
    "tanh",
    "transpose",
    "trunc",
  ],
  "Derivative Built-in Functions": [
    "dpdx",
    "dpdxCoarse",
    "dpdxFine",
    "dpdy",
    "dpdyCoarse",
    "dpdyFine",
    "fwidth",
    "fwidthCoarse",
    "fwidthFine",
  ],
  "Texture Built-in Functions": [
    "textureDimensions",
    "textureGather",
    "textureGatherCompare",
    "textureLoad",
    "textureNumLayers",
    "textureNumLevels",
    "textureNumSamples",
    "textureSample",
    "textureSampleBias",
    "textureSampleCompare",
    "textureSampleCompareLevel",
    "textureSampleGrad",
    "textureSampleLevel",
    "textureSampleBaseClampToEdge",
    "textureStore",
  ],
  "Atomic Built-in Functions": [
    "Atomic Load",
    "Atomic Store",
    "Atomic Read-modify-write",
  ],
  "Data Packing Built-in Functions": [
    "pack4x8snorm",
    "pack4x8unorm",
    "pack4xI8",
    "pack4xU8",
    "pack4xI8Clamp",
    "pack4xU8Clamp",
    "pack2x16snorm",
    "pack2x16unorm",
    "pack2x16float",
  ],
  "Data Unpacking Built-in Functions": [
    "unpack4x8snorm",
    "unpack4x8unorm",
    "unpack4xI8",
    "unpack4xU8",
    "unpack2x16snorm",
    "unpack2x16unorm",
    "unpack2x16float",
  ],
  "Synchronization Built-in Functions": [
    "storageBarrier",
    "textureBarrier",
    "workgroupBarrier",
    "workgroupUniformLoad",
  ],
};

export const WGSLTypeSizes = Object.assign(
  {},
  wgslTypeSizes16,
  wgslTypeSizes32,
);

for (const [key, value] of Object.entries(WGSLTypeSizes)) {
  WGSLTypeSizes[key] = { ...value, type: key };
}
