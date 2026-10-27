export const halfTransform = `
enable f16;
struct Settings  {
  gain:f32,
}
;
@group(0) @binding(0) var<storage,read> input:array<f32>;
@group(0) @binding(1) var<storage,read_write> packed:array<f16>;
@group(0) @binding(2) var<uniform> settings:Settings;
@compute @workgroup_size(64) fn compute_main(@builtin(global_invocation_id) id:vec3<u32>) {
  if(id.x<arrayLength(&input)) {
    packed[id.x]=f16(input[id.x])*f16(settings.gain)+f16(0.111);
  }
}
`;
export const inspectHalf = `
enable f16;
struct Settings  {
  gain:f32,
}
;
@group(0) @binding(0) var<storage,read> packed:array<f16>;
@group(0) @binding(1) var<storage,read> input:array<f32>;
@group(0) @binding(2) var<storage,read_write> result:array<f32>;
@group(0) @binding(3) var<storage,read_write> error:array<f32>;
@group(0) @binding(4) var<uniform> settings:Settings;
@compute @workgroup_size(64) fn compute_main(@builtin(global_invocation_id) id:vec3<u32>) {
  if(id.x<arrayLength(&input)) {
    let value=f32(packed[id.x]);
    result[id.x]=value;
    error[id.x]=abs(value-(input[id.x]*settings.gain+0.111));
  }
}
`;
export function fullPrecision(
  input = "array<f32>",
  result = "array<f32>",
  error = "array<f32>",
  gain = "f32",
) {
  const i = threadId.x;
  if (i < input.length) {
    result[i] = input[i] * gain + 0.111;
    error[i] = 0;
  }
}
export function display(
  result = "array<f32>",
  error = "array<f32>",
  errorScale = "f32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const p = min(vec2u(vec2f(fract(uv.x * 2), uv.y) * 16), vec2u(15)),
    i = p.y * 16 + p.x;
  let colour = vec3f(0.05, 0.1, 0.15) + vec3f(0.15, 0.85, 0.65) * result[i];
  if (uv.x >= 0.5)
    colour =
      vec3f(0.05, 0.03, 0.08) + vec3f(1, 0.4, 0.2) * error[i] * errorScale;
  return vec4f(clamp(colour, vec3f(0), vec3f(1)), 1);
}
