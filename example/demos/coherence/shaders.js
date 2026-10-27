// Shader functions are translated to WGSL, not executed as JavaScript.
export function spectralMoments(
  left = "array<f32>",
  right = "array<f32>",
  moments = "array<vec4f>",
  count = "u32",
  bins = "u32",
) {
  const i = threadId.x;
  if (i >= moments.length) return;
  const trial = i / bins,
    k = i % bins;
  let a = vec2f(0),
    b = vec2f(0);
  for (let n = u32(0); n < count; n++) {
    const phase = (-2 * Math.PI * f32(k * n)) / f32(count),
      twiddle = vec2f(cos(phase), sin(phase));
    a += left[trial * count + n] * twiddle;
    b += right[trial * count + n] * twiddle;
  }
  moments[i] = vec4f(
    dot(a, a),
    dot(b, b),
    a.x * b.x + a.y * b.y,
    a.y * b.x - a.x * b.y,
  );
}
export function coherence(
  moments = "array<vec4f>",
  result = "array<f32>",
  bins = "u32",
  trials = "u32",
) {
  const k = threadId.x;
  if (k >= result.length) return;
  let sum = vec4f(0);
  for (let trial = u32(0); trial < trials; trial++)
    sum += moments[trial * bins + k];
  result[k] = clamp(dot(sum.zw, sum.zw) / max(sum.x * sum.y, 0.000001), 0, 1);
}

export function display(values = "array<f32>") {
  const uv = position.xy / vec2f(resX, resY);
  const i = min(u32(uv.x * f32(values.length)), values.length - 1);
  let colour = select(
    vec3f(0.025, 0.045, 0.08),
    vec3f(0.25, 0.9, 0.75),
    1 - uv.y < values[i],
  );
  if (fract(uv.y * 4) < 0.01)
    colour = mix(colour, vec3f(0.35, 0.45, 0.55), 0.4);
  return vec4f(colour, 1);
}
