// Shader functions are translated to WGSL, not executed as JavaScript.
export function voxels(
  field = "array<f32>",
  partials = "array<f32>",
  size = "u32",
  frequency = "f32",
) {
  const p = (vec3f(threadId) / f32(size)) * 2 - vec3f(1);
  const density =
    0.5 +
    0.5 *
      sin(p.x * frequency * 3) *
      cos(p.y * frequency * 3) *
      sin(p.z * frequency * 3);
  const i = threadId.x + threadId.y * size + threadId.z * size * size;
  field[i] = density;
  scratch[localIndex] = density;
  workgroupBarrier();
  for (let stride = u32(32); stride > 0; stride /= 2) {
    if (localIndex < stride)
      scratch[localIndex] += scratch[localIndex + stride];
    workgroupBarrier();
  }
  if (localIndex == 0) {
    const group =
      workgroupId.x +
      workgroupId.y * workgroups.x +
      workgroupId.z * workgroups.x * workgroups.y;
    partials[group] = scratch[0];
  }
}

export function display(field = "array<f32>", size = "u32", slice = "u32") {
  const uv = position.xy / vec2f(resX, resY);
  const p = min(vec2u(uv * f32(size)), vec2u(size - 1));
  const value = field[p.x + p.y * size + slice * size * size];
  return vec4f(0.05 + value * 0.2, value * 0.9, 0.2 + value * 0.65, 1);
}
