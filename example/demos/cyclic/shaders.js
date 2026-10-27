// Cyclic cellular automaton: shader functions are parsed into WGSL, never called on the CPU.

export function cyclicStep(
  state = "array<u32>",
  next = "array<u32>",
  width = "u32",
  height = "u32",
  dt = "f32",
  pointer = "vec2f",
  force = "f32",
) {
  const i = threadId.x;
  if (i >= state.length) return;
  const x = i % width;
  const y = i / width;
  const nextState = (state[i] + 1) % 8;
  let matches = u32(0);
  for (let dx = -1; dx <= 1; dx++)
    for (let dy = -1; dy <= 1; dy++) {
      const nx = u32((i32(x) + dx + i32(width)) % i32(width));
      const ny = u32((i32(y) + dy + i32(height)) % i32(height));
      if (state[ny * width + nx] == nextState) matches += 1;
    }
  let value = state[i];
  if (matches >= u32(max(dt, 1))) value = nextState;
  const p = vec2f(f32(x) / f32(width), f32(y) / f32(height));
  if (force > 0 && length(p - pointer) < 0.06) value = (value + 1) % 8;
  next[i] = value;
}

export function cyclicFragment(
  field = "array<u32>",
  width = "u32",
  height = "u32",
) {
  const p = vec2u(
    (position.xy / vec2f(resX, resY)) * vec2f(f32(width), f32(height)),
  );
  const value = f32(field[min(p.y, height - 1) * width + min(p.x, width - 1)]);
  return vec4f(0.5 + 0.5 * cos(vec3f(0, 2, 4) + value * 0.7854), 1);
}
