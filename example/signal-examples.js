import { demos } from "./demos/index.js";
import { legacyCatalog } from "./shared/catalog-adapter.js";
export { prepareSignal } from "./demos/fft/shaders.js";
export { fftPass } from "./demos/fft/shaders.js";
export { spectrumPass } from "./demos/fft/shaders.js";
export { lowPassBins } from "./demos/spectral/shaders.js";
export { reverseComplex } from "./demos/spectral/shaders.js";
export { realSignal } from "./demos/spectral/shaders.js";
export { firPass } from "./demos/fir/shaders.js";
export function gainPass(data = "array<f32>", gain = "f32") {
  const i = threadId.x;
  if (i < data.length) data[i] *= gain;
  return data;
}
export { nativeGain } from "./demos/fir/shaders.js";
export { signalDisplay } from "./demos/fft/shaders.js";
export { fftStages } from "./demos/fft/index.js";
export { signalSamples } from "./demos/fft/index.js";
export const createSignalDemo = (definition, canvas, device) =>
  demos
    .find(
      (demo) =>
        demo.mode === definition.mode &&
        ["fft", "spectral", "fir"].includes(demo.id),
    )
    .setup(canvas, device, definition);
