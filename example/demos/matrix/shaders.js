// Tiled matrix multiplication: shader functions are parsed into WGSL, never called on the CPU.

export function heatmapUnsigned(
  values = "array<u32>",
  width = "u32",
  scale = "f32",
) {
  const rows = (values.length + width - 1) / width;
  const uv = position.xy / vec2f(resX, resY);
  const p = min(
    vec2u(uv * vec2f(f32(width), f32(rows))),
    vec2u(width - 1, rows - 1),
  );
  const i = p.y * width + p.x;
  let value = f32(0);
  if (i < values.length) value = f32(values[i]) / max(scale, 0.00001);
  const grid = select(
    0.5,
    1.0,
    fract(uv.x * f32(width)) > 0.05 && fract(uv.y * f32(rows)) > 0.05,
  );
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(2, 1, 0) + value * 3)) *
      grid *
      clamp(abs(value) * 2 + 0.15, 0.15, 1),
    1,
  );
}

export function heatmapFloat(
  values = "array<f32>",
  width = "u32",
  scale = "f32",
) {
  const rows = (values.length + width - 1) / width;
  const uv = position.xy / vec2f(resX, resY);
  const p = min(
    vec2u(uv * vec2f(f32(width), f32(rows))),
    vec2u(width - 1, rows - 1),
  );
  const i = p.y * width + p.x;
  let value = f32(0);
  if (i < values.length) value = values[i] / max(scale, 0.00001);
  const grid = select(
    0.5,
    1.0,
    fract(uv.x * f32(width)) > 0.05 && fract(uv.y * f32(rows)) > 0.05,
  );
  return vec4f(
    (0.5 + 0.5 * cos(vec3f(2, 1, 0) + value * 3)) *
      grid *
      clamp(abs(value) * 2 + 0.15, 0.15, 1),
    1,
  );
}

export const tiledMatrix = `
struct MatrixSize { dimension: u32, };
@group(0) @binding(0) var<storage,read> leftMatrix: array<f32>;
@group(0) @binding(1) var<storage,read> rightMatrix: array<f32>;
@group(0) @binding(2) var<storage,read_write> product: array<f32>;
@group(0) @binding(3) var<uniform> settings: MatrixSize;
var<workgroup> tileA: array<f32,64>;
var<workgroup> tileB: array<f32,64>;
@compute @workgroup_size(8,8,1)
fn compute_main(@builtin(global_invocation_id) id:vec3<u32>, @builtin(local_invocation_id) local:vec3<u32>) {
  let n=settings.dimension;let lane=local.y*8u+local.x;
  var sum=0.0;
  for(var tile=0u;tile<(n+7u)/8u;tile++) {
    tileA[lane]=0.0;tileB[lane]=0.0;
    if(id.y<n&&tile*8u+local.x<n){tileA[lane]=leftMatrix[id.y*n+tile*8u+local.x];}
    if(id.x<n&&tile*8u+local.y<n){tileB[lane]=rightMatrix[(tile*8u+local.y)*n+id.x];}
    workgroupBarrier();
    for(var k=0u;k<8u;k++){sum+=tileA[local.y*8u+k]*tileB[k*8u+local.x];}
    workgroupBarrier();
  }
  if(id.x<n&&id.y<n){product[id.y*n+id.x]=sum;}
}`;
