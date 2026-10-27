// Shader functions are translated to WGSL, not executed as JavaScript.
export const expand = `
struct Params  {
  level:u32,side:u32,
}
;
@group(0) @binding(0) var<storage,read_write> distances:array<atomic<u32>>;
@group(0) @binding(1) var<storage,read> walls:array<u32>;
@group(0) @binding(2) var<uniform> params:Params;
@compute @workgroup_size(64) fn compute_main(@builtin(global_invocation_id) id:vec3<u32>) {
  let i=id.x;
  if(i>=arrayLength(&walls)||walls[i]!=0u||atomicLoad(&distances[i])!=params.level) {
    return;
  }
  let x=i%params.side;
  let y=i/params.side;
  for(var axis=0u;axis<4u;axis++) {
    var j=i;
    var valid=false;
    if(axis==0u&&x>0u) {
      j=i-1u;
      valid=true;
    }
    if(axis==1u&&x+1u<params.side) {
      j=i+1u;
      valid=true;
    }
    if(axis==2u&&y>0u) {
      j=i-params.side;
      valid=true;
    }
    if(axis==3u&&y+1u<params.side) {
      j=i+params.side;
      valid=true;
    }
    if(valid&&walls[j]==0u) {
      atomicMin(&distances[j],params.level+1u);
    }
  }
}
`;
export function visualize(distances = "array<u32>", result = "array<f32>") {
  const i = threadId.x;
  if (i >= result.length) return;
  let value = f32(-8);
  if (distances[i] != u32(4294967295)) value = f32(distances[i]);
  result[i] = value;
}

export function display(
  values = "array<f32>",
  walls = "array<u32>",
  source = "u32",
  frontier = "u32",
  hoverIndex = "i32",
) {
  const uv = position.xy / vec2f(resX, resY),
    cell = min(vec2u(uv * 16), vec2u(15)),
    i = cell.y * 16 + cell.x,
    d = values[i];
  let colour = vec3f(0.025, 0.05, 0.08);
  if (walls[i] > 0) colour = vec3f(0.2, 0.25, 0.33);
  else if (d < 0) colour = vec3f(0.28, 0.06, 0.1);
  else if (d <= f32(frontier))
    colour = mix(
      vec3f(0.12, 0.85, 0.7),
      vec3f(1, 0.65, 0.2),
      clamp(d / 32, 0, 1),
    );
  if (d == f32(frontier)) colour = vec3f(0.6, 0.85, 1);
  if (i == source) colour = vec3f(1, 0.95, 0.55);
  if (i32(i) == hoverIndex) colour = mix(colour, vec3f(1), 0.4);
  colour *= step(0.06, fract(uv.x * 16)) * step(0.06, fract(uv.y * 16));
  return vec4f(colour, 1);
}
