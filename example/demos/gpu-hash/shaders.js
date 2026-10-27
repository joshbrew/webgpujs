// Shader functions are translated to WGSL, not executed as JavaScript.
export const insert = `
@group(0) @binding(0) var<storage,read> keys:array<u32>;
@group(0) @binding(1) var<storage,read_write> tableKeys:array<atomic<u32>>;
@group(0) @binding(2) var<storage,read_write> tableValues:array<u32>;
@compute @workgroup_size(64) fn compute_main(@builtin(global_invocation_id) id:vec3<u32>) {
  if(id.x>=arrayLength(&keys)) {
    return;
  }
  let key=keys[id.x];
  var slot=(key*2654435761u)&511u;
  for(var attempt=0u;attempt<1024u;attempt++) {
    let found=atomicCompareExchangeWeak(&tableKeys[slot],0u,key);
    if(found.exchanged) {
      tableValues[slot]=key*key;
      return;
    }
    if(found.old_value==key) {
      return;
    }
    if(found.old_value!=0u) {
      slot=(slot+1u)&511u;
    }
  }
}
`;
export const lookup = `
@group(0) @binding(0) var<storage,read> keys:array<u32>;
@group(0) @binding(1) var<storage,read_write> tableKeys:array<atomic<u32>>;
@group(0) @binding(2) var<storage,read> tableValues:array<u32>;
@group(0) @binding(3) var<storage,read_write> result:array<f32>;
@compute @workgroup_size(64) fn compute_main(@builtin(global_invocation_id) id:vec3<u32>) {
  if(id.x>=arrayLength(&keys)) {
    return;
  }
  let key=keys[id.x];
  var slot=(key*2654435761u)&511u;
  result[id.x]=-1.0;
  for(var attempt=0u;attempt<512u;attempt++) {
    let found=atomicLoad(&tableKeys[slot]);
    if(found==key) {
      result[id.x]=f32(tableValues[slot]);
      return;
    }
    if(found==0u) {
      return;
    }
    slot=(slot+1u)&511u;
  }
}
`;

export function display(
  tableKeys = "array<atomic<u32>>",
  values = "array<f32>",
  hoverIndex = "i32",
  maximum = "f32",
) {
  const uv = position.xy / vec2f(resX, resY);
  let colour = vec3f(0.025, 0.045, 0.08);
  if (uv.x < 0.6) {
    const q = vec2f(uv.x / 0.6, uv.y),
      cell = min(vec2u(q * vec2f(32, 16)), vec2u(31, 15)),
      slot = cell.y * 32 + cell.x,
      key = atomicLoad(tableKeys[slot]);
    if (key > 0) {
      const home = (key * u32(2654435761)) & u32(511),
        probe = (slot + 512 - home) % 512;
      colour = mix(
        vec3f(0.12, 0.8, 0.68),
        vec3f(1, 0.4, 0.22),
        clamp(f32(probe) / 5, 0, 1),
      );
    }
    colour *= step(0.07, fract(q.x * 32)) * step(0.07, fract(q.y * 16));
    if (i32(slot) == hoverIndex) colour = mix(colour, vec3f(1), 0.5);
  } else {
    const x = (uv.x - 0.64) / 0.36;
    if (x >= 0) {
      const i = min(u32(x * f32(values.length)), values.length - 1),
        height = values[i] / maximum;
      if (1 - uv.y < height) colour = vec3f(0.5, 0.65, 1);
    }
  }
  return vec4f(colour, 1);
}
