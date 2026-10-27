import { demos } from "./demos/index.js";
import { legacyCatalog } from "./shared/catalog-adapter.js";

export const fftCatalog = legacyCatalog(
  demos.filter((demo) => ["batch-fft", "fft-2d"].includes(demo.id)),
);
export { fftAxisStages, channelFilterPlan } from "./demos/batch-fft/index.js";
export { fft2DStages, imageFFTPlan } from "./demos/fft-2d/index.js";
import { setup as channels } from "./demos/batch-fft/index.js";
import { setup as image } from "./demos/fft-2d/index.js";
export const createChannelFilterDemo = (definition, canvas, device) =>
  channels(canvas, device, definition);
export const createFFTImageDemo = (definition, canvas, device) =>
  image(canvas, device, definition);
