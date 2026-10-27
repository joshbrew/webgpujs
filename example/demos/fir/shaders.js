// FIR smoothing → gain: shader functions are parsed into WGSL, never called on the CPU.

export function firPass(
  signalData = "array<f32>",
  filtered = "array<f32>",
  radius = "u32",
) {
  const i = threadId.x;
  if (i >= signalData.length) return;
  let sum = f32(0);
  let weight = f32(0);
  for (let j = -i32(radius); j <= i32(radius); j++) {
    const at = u32(clamp(i32(i) + j, 0, i32(signalData.length) - 1));
    const tap = f32(i32(radius) + 1 - abs(j));
    sum += signalData[at] * tap;
    weight += tap;
  }
  filtered[i] = sum / weight;
}

export const nativeGain = `
struct SignalBuffer { values: array<f32>, };
struct GainSettings { gain: f32, };
@group(0) @binding(0) var<storage, read_write> samples: SignalBuffer;
@group(0) @binding(1) var<uniform> settings: GainSettings;
@compute @workgroup_size(64)
fn compute_main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x < arrayLength(&samples.values)) {
    samples.values[id.x] *= settings.gain;
  }
}`;

export function signalDisplay(
  original = "array<f32>",
  processed = "array<f32>",
  spectrum = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const i = min(u32(uv.x * f32(original.length)), original.length - 1);
  let colour = vec3f(0.02, 0.04, 0.08);
  const top = 0.24 - original[i] * 0.18;
  if (abs(uv.y - top) < 0.008) colour = vec3f(0.3, 0.9, 1);
  if (spectrum == 1) {
    if (uv.y > 0.53 && uv.y > 0.98 - processed[i] * 0.42)
      colour = vec3f(0.9, 0.65, 0.3);
  } else {
    const bottom = 0.75 - processed[i] * 0.18;
    if (abs(uv.y - bottom) < 0.008) colour = vec3f(1, 0.65, 0.3);
  }
  if (abs(uv.y - 0.5) < 0.002) colour = vec3f(0.2, 0.3, 0.4);
  return vec4f(colour, 1);
}
