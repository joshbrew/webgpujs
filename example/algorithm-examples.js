import { demos } from "./demos/index.js";
import { legacyCatalog } from "./shared/catalog-adapter.js";

export const algorithmCatalog = legacyCatalog(
  demos.filter((demo) =>
    [
      "reduction",
      "matrix",
      "compact",
      "correlation",
      "nearest",
      "rle",
      "integral",
      "spatial",
    ].includes(demo.id),
  ),
);
export { algorithmReference } from "./shared/algorithm-reference.js";
export { unsignedScanStages } from "./demos/compact/index.js";
export const createAlgorithmDemo = (definition, canvas, device) =>
  demos
    .find((demo) => demo.id === definition.id || demo.mode === definition.mode)
    .setup(canvas, device, definition);
