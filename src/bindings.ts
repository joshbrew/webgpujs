import { normalizeType } from "./parser.js";
import type {
  ShaderBinding,
  ShaderResource,
  TranspiledShader,
} from "./types.js";
import { splitWGSLList } from "./wgsl.js";

/** Ignore comments without changing offsets used to rewrite WGSL declarations. */
export function maskComments(code: string) {
  let result = "",
    block = 0,
    line = false;
  for (let i = 0; i < code.length; i++) {
    const pair = code.slice(i, i + 2),
      char = code[i];
    if (!block && pair === "//") line = true;
    if (!line && pair === "/*") {
      block++;
      result += "  ";
      i++;
      continue;
    }
    if (block && pair === "*/") {
      block--;
      result += "  ";
      i++;
      continue;
    }
    if (char === "\n" || char === "\r") {
      line = false;
      result += char;
    } else result += block || line ? " " : char;
  }
  return result;
}
const declarations =
  /((?:@\w+\s*\([^)]*\)\s*)+)var\s*(?:<([^>]+)>)?\s*([A-Za-z_]\w*)\s*:\s*([^;]+);/g;

export function reflectResources(code: string): ShaderResource[] {
  const resources: ShaderResource[] = [];
  for (const match of maskComments(code).matchAll(declarations)) {
    const group = match[1].match(/@group\s*\(\s*(\d+)\s*\)/),
      binding = match[1].match(/@binding\s*\(\s*(\d+)\s*\)/);
    if (!group || !binding) continue;
    const type = normalizeType(match[4]),
      space = match[2]?.replace(/\s+/g, "");
    const kind: ShaderResource["kind"] = space?.startsWith("uniform")
      ? "uniform"
      : space?.startsWith("storage")
        ? "buffer"
        : type.startsWith("texture_storage")
          ? "storageTexture"
          : type.startsWith("texture_")
            ? "texture"
            : type.startsWith("sampler")
              ? "sampler"
              : undefined;
    if (!kind)
      throw new Error(`Cannot infer binding type for ${match[3]}: ${type}`);
    const resource: ShaderResource = {
      name: match[3],
      group: Number(group[1]),
      binding: Number(binding[1]),
      type,
      kind,
      access: space?.split(",")[1] || "read",
      explicit: true,
    };
    if (kind === "buffer" && !type.startsWith("array<")) {
      const body = maskComments(code).match(
        new RegExp(`struct\\s+${type}\\s*\\{([^}]*)\\}`),
      )?.[1];
      const wrappedArray = body?.match(
        /^\s*\w+\s*:\s*(array<[\s\S]+>)\s*,?\s*$/,
      );
      if (wrappedArray) {
        resource.type = normalizeType(wrappedArray[1]);
        resource.storageWrapper = true;
      }
    }
    if (kind === "uniform") {
      const struct = maskComments(code).match(
        new RegExp(`struct\\s+${type}\\s*\\{([\\s\\S]*?)\\}`),
      );
      if (
        !struct &&
        !/^(f32|u32|i32|f16|vec[234]<.+>|mat[234]x[234]<.+>)$/.test(type)
      )
        throw new Error(
          `Uniform ${resource.name}: struct ${type} was not found`,
        );
      resource.fields = struct
        ? splitWGSLList(struct[1]).map((member) => {
            const field = member.match(
              /^((?:@\w+(?:\([^)]*\))?\s*)*)([A-Za-z_]\w*)\s*:\s*(.+)$/,
            );
            if (!field)
              throw new Error(`Cannot reflect uniform member: ${member}`);
            const align = field[1].match(/@align\s*\(\s*(\d+)\s*\)/)?.[1];
            const size = field[1].match(/@size\s*\(\s*(\d+)\s*\)/)?.[1];
            return {
              name: field[2],
              type: normalizeType(field[3]),
              ...(align ? { align: Number(align) } : {}),
              ...(size ? { size: Number(size) } : {}),
            };
          })
        : [{ name: resource.name, type }];
    }
    resources.push(resource);
  }
  return resources;
}

export function rewriteBindings(code: string, resources: ShaderResource[]) {
  const masked = maskComments(code);
  const changes = [...masked.matchAll(declarations)]
    .map((match) => {
      const r = resources.find((r) => r.name === match[3]);
      if (!r) return undefined;
      const attributes = code
        .slice(match.index, match.index + match[1].length)
        .replace(/@group\s*\(\s*\d+\s*\)/, `@group(${r.group})`)
        .replace(/@binding\s*\(\s*\d+\s*\)/, `@binding(${r.binding})`);
      return {
        start: match.index,
        end: match.index + match[1].length,
        attributes,
      };
    })
    .filter(Boolean)
    .reverse();
  for (const change of changes)
    code =
      code.slice(0, change.start) + change.attributes + code.slice(change.end);
  return code;
}

export function compatible(a: ShaderResource, b: ShaderResource) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "uniform")
    return (
      JSON.stringify(
        a.fields?.map((f) => [f.name, normalizeType(f.type), f.align, f.size]),
      ) ===
      JSON.stringify(
        b.fields?.map((f) => [f.name, normalizeType(f.type), f.align, f.size]),
      )
    );
  const representation = (r: ShaderResource) =>
    r.kind === "buffer"
      ? normalizeType(r.type).replace(/atomic<(u32|i32)>/g, "$1")
      : normalizeType(r.type);
  return representation(a) === representation(b);
}

function allocationCompatible(a: ShaderResource, b: ShaderResource) {
  if (
    (a.kind === "texture" && b.kind === "storageTexture") ||
    (a.kind === "storageTexture" && b.kind === "texture")
  ) {
    const storage = a.kind === "storageTexture" ? a : b,
      sampled = a.kind === "texture" ? a : b;
    const dimension = (type: string) =>
      type
        .replace("texture_storage_", "")
        .replace("texture_", "")
        .split("<")[0];
    const format = storage.type.match(/<([^,]+)/)?.[1] || "";
    const scalar = format.endsWith("uint")
      ? "u32"
      : format.endsWith("sint")
        ? "i32"
        : "f32";
    return (
      dimension(storage.type) === dimension(sampled.type) &&
      sampled.type.includes(`<${scalar}>`)
    );
  }
  return compatible(a, b);
}

/** Resolve the whole set once. Previously compiled shaders are immutable. */
export function linkBindings(
  shaders: TranspiledShader[],
  previous: ShaderResource[] = [],
  implicit = true,
) {
  const known = previous.map((r) => ({ ...r }));
  const slots = new Map<string, ShaderResource>();
  known.forEach((r) => slots.set(`${r.group}:${r.binding}`, r));
  const pending = shaders.flatMap((shader) => shader.resources || []);
  const reserved = new Set([
    ...slots.keys(),
    ...pending.filter((r) => r.explicit).map((r) => `${r.group}:${r.binding}`),
  ]);
  let serial = known.length;
  for (const shader of shaders) {
    const seen = new Set<string>();
    for (const r of shader.resources || []) {
      for (const value of [r.group, r.binding])
        if (!Number.isInteger(value) || value < 0)
          throw new Error(
            `Binding ${r.name}: group and binding must be non-negative integers`,
          );
      const named = implicit
        ? known.find(
            (k) =>
              k.name === r.name &&
              allocationCompatible(k, r) &&
              k.kind !== "uniform",
          )
        : undefined;
      if (
        implicit &&
        !r.resource &&
        !r.explicit &&
        r.kind !== "uniform" &&
        !named &&
        known.some((k) => k.name === r.name && k.kind !== "uniform")
      )
        throw new Error(
          `Resource ${r.name} has incompatible shader types; use distinct explicit resource names to keep allocations separate`,
        );
      const uniform =
        implicit && r.kind === "uniform"
          ? known.find((k) => k.name === r.name && compatible(k, r))
          : undefined;
      let shared = r.resource
        ? known.find((k) => k.resource === r.resource)
        : named || uniform;
      // A public alias may name an earlier implicit parameter, whose allocation
      // has an internal identity. Prefer exact identities; reject ambiguous names.
      if (r.resource && !shared && r.kind !== "uniform") {
        const aliases = known.filter(
          (k) =>
            k.name === r.resource &&
            k.kind !== "uniform" &&
            allocationCompatible(k, r),
        );
        const identities = new Set(aliases.map((k) => k.resource));
        if (identities.size > 1)
          throw new Error(
            `Ambiguous resource alias "${r.resource}"; use an explicit allocation identity`,
          );
        if (aliases.length) {
          shared = aliases[0];
          r.resource = shared.resource;
        }
      }
      if (shared && !allocationCompatible(shared, r))
        throw new Error(
          `Resource ${r.resource || r.name} has incompatible shader types (${shared.type} and ${r.type})`,
        );
      if (!r.explicit && shared && compatible(shared, r)) {
        r.group = shared.group;
        r.binding = shared.binding;
      }
      let slot = `${r.group}:${r.binding}`;
      let occupant = slots.get(slot);
      if (r.explicit && occupant && !compatible(occupant, r))
        throw new Error(
          `Binding collision at @group(${r.group}) @binding(${r.binding}): ${occupant.name} and ${r.name}`,
        );
      if (
        !r.explicit &&
        occupant &&
        (!shared || occupant.resource !== shared.resource)
      ) {
        while (reserved.has(slot) || slots.has(slot)) {
          r.binding++;
          slot = `${r.group}:${r.binding}`;
        }
        occupant = undefined;
      }
      if (seen.has(slot))
        throw new Error(
          `Shader declares multiple resources at @group(${r.group}) @binding(${r.binding})`,
        );
      seen.add(slot);
      const id =
        r.resource ||
        shared?.resource ||
        (r.explicit && occupant?.resource) ||
        `webgpujs:${serial++}:${r.name}`;
      if (r.explicit && occupant && occupant.resource !== id)
        throw new Error(
          `Binding collision at ${slot}: different resources use the same slot`,
        );
      const alias = known.find((k) => k.resource === id);
      if (alias && !allocationCompatible(alias, r))
        throw new Error(`Resource ${id} has incompatible shader types`);
      r.resource = id;
      slots.set(slot, r);
      reserved.add(slot);
      known.push(r);
    }
    shader.code = rewriteBindings(shader.code, shader.resources || []);
    shader.header = rewriteBindings(shader.header, shader.resources || []);
    shader.altBindings = {};
    shader.params.forEach((p) => {
      const r = shader.resources.find(
        (r) =>
          r.name === p.name ||
          (r.kind === "uniform" && r.fields?.some((f) => f.name === p.name)),
      );
      if (r) {
        p.group = r.group;
        p.binding = r.binding;
        p.resource = r.resource;
        shader.altBindings[p.name] = { group: r.group, binding: r.binding };
      }
    });
    shader.lastBinding = Math.max(
      0,
      ...shader.resources
        .filter((r) => r.group === shader.bindGroupNumber)
        .map((r) => r.binding + 1),
    );
  }
  return known;
}

export function rawShader(
  code: string,
  type: TranspiledShader["type"],
  group = 0,
  options: Record<string, ShaderBinding> = {},
): TranspiledShader {
  const resources = reflectResources(code);
  for (const r of resources) {
    const spec = options[r.name];
    if (spec) {
      r.group = spec.group ?? r.group;
      r.binding = spec.binding ?? r.binding;
      r.resource = spec.resource;
    }
  }
  const params: any[] = resources.flatMap<any>((r) =>
    r.kind === "uniform"
      ? r.fields.map((f) => ({
          ...f,
          type: f.type,
          value: "unknown",
          isUniform: true,
          isInput: true,
          isReturned: false,
          isModified: false,
          group: r.group,
          binding: r.binding,
        }))
      : [
          {
            name: r.name,
            type: r.type,
            value: "unknown",
            isInput: r.kind === "buffer",
            isReturned: false,
            isModified: r.access === "read_write",
            group: r.group,
            binding: r.binding,
            isTexture: r.kind === "texture",
            isStorageTexture: r.kind === "storageTexture",
            isSampler: r.kind === "sampler",
          },
        ],
  );
  return {
    code: rewriteBindings(code, resources),
    header: code,
    resources,
    params,
    ast: params,
    funcStr: "",
    defaultUniforms: undefined,
    type,
    bindGroupNumber: resources[0]?.group ?? group,
    lastBinding: 0,
    workGroupSize:
      type === "compute"
        ? Number(code.match(/@workgroup_size\s*\(\s*(\d+)/)?.[1] || 64)
        : undefined,
    returnedVars: [],
  };
}
