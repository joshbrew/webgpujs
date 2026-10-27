// Fourier transform: shader functions are parsed into WGSL, never called on the CPU.

export function dft(inputData = "array<f32>", outputData = "array<f32>") {
  const k = threadId.x;
  if (k >= inputData.length) return;
  let sum = vec2f(0);
  for (let n = 0; n < i32(inputData.length); n++) {
    const phase = (2 * Math.PI * f32(k) * f32(n)) / f32(inputData.length);
    sum += vec2f(inputData[n] * cos(phase), -inputData[n] * sin(phase));
  }
  outputData[k * 2] = sum.x;
  outputData[k * 2 + 1] = sum.y;
  return outputData;
}
