// Template cross-correlation: shader functions are parsed into WGSL, never called on the CPU.

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

export function correlate(
  signalData = "array<f32>",
  templateData = "array<f32>",
  result = "array<f32>",
) {
  const i = threadId.x;
  if (i >= result.length) return;
  let dotValue = f32(0);
  let energy = f32(0);
  let referenceEnergy = f32(0);
  for (let j = 0; j < templateData.length; j++) {
    let sample = f32(0);
    if (i + j < signalData.length) sample = signalData[i + j];
    dotValue += sample * templateData[j];
    energy += sample * sample;
    referenceEnergy += templateData[j] * templateData[j];
  }
  result[i] = dotValue / max(sqrt(energy * referenceEnergy), 0.00001);
}

export function correlationView(
  signal = "array<f32>",
  pattern = "array<f32>",
  values = "array<f32>",
  bestLag = "u32",
  plantedLag = "u32",
  hoverIndex = "i32",
) {
  const uv = position.xy / vec2f(resX, resY),
    at = uv.x * f32(signal.length - 1),
    i = min(u32(at), signal.length - 1),
    next = min(i + 1, signal.length - 1),
    fraction = fract(at),
    signalY = 0.22 - mix(signal[i], signal[next], fraction) * 0.09,
    scoreY = 0.75 - mix(values[i], values[next], fraction) * 0.19;
  let colour = vec3f(0.025, 0.045, 0.08);
  if (i >= plantedLag && i < plantedLag + pattern.length && uv.y < 0.48)
    colour += vec3f(0.06, 0.04, 0.015);
  if (abs(uv.y - 0.22) < 0.002 || abs(uv.y - 0.75) < 0.002)
    colour = vec3f(0.15, 0.22, 0.3);
  if (abs(uv.y - signalY) < max(0.004, fwidth(signalY) * 0.6))
    colour = vec3f(0.25, 0.85, 1);
  if (
    i >= plantedLag &&
    i < plantedLag + pattern.length &&
    abs(uv.y - (0.22 - pattern[i - plantedLag] * 0.09)) < 0.004
  )
    colour = vec3f(1, 0.7, 0.25);
  if (abs(uv.y - scoreY) < max(0.004, fwidth(scoreY) * 0.6))
    colour = vec3f(0.3, 1, 0.65);
  if (i == bestLag && uv.y > 0.48)
    colour = mix(colour, vec3f(1, 0.9, 0.35), 0.6);
  if (i32(i) == hoverIndex) colour += vec3f(0.12, 0.1, 0.03);
  return vec4f(colour, 1);
}
