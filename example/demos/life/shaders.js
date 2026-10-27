// Conway’s Game of Life: shader functions are parsed into WGSL, never called on the CPU.

export function lifeStep(
  state = "array<u32>",
  next = "array<u32>",
  width = "u32",
  height = "u32",
  dt = "f32",
  pointer = "vec2f",
  painting = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  let count = u32(0);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx != 0 || dy != 0) {
        const nx = u32((i32(x) + dx + i32(width)) % i32(width));
        const ny = u32((i32(y) + dy + i32(height)) % i32(height));
        count += state[ny * width + nx];
      }
    }
  }
  next[i] = select(u32(0), u32(1), count == 3 || (state[i] == 1 && count == 2));
  if (
    painting > 0 &&
    distance(vec2f(f32(x) / f32(width), f32(y) / f32(height)), pointer) < 0.035
  )
    next[i] = 1;
}

export function lifeFragment(
  field = "array<u32>",
  width = "u32",
  height = "u32",
) {
  const p = vec2u(
    (position.xy / vec2f(resX, resY)) * vec2f(f32(width), f32(height)),
  );
  const alive = field[min(p.y, height - 1) * width + min(p.x, width - 1)];
  return vec4f(mix(vec3f(0.02, 0.04, 0.08), vec3f(0.3, 1, 0.7), f32(alive)), 1);
}
