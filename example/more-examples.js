import { demos } from "./demos/index.js";
import { legacyCatalog } from "./shared/catalog-adapter.js";

export const catalog = legacyCatalog(
  demos.filter((demo) =>
    [
      "julia",
      "burning-ship",
      "torus",
      "soft-shadows",
      "metaballs",
      "voronoi",
      "terrain",
      "warp",
      "kaleidoscope",
      "interference",
      "tunnel",
      "bump",
      "life",
      "waves",
      "nbody",
      "cloth",
      "sort",
      "scan",
      "sobel",
      "bloom",
    ].includes(demo.id),
  ),
);
const select = (definition) =>
  demos.find(
    (demo) =>
      demo.id === definition.id ||
      (definition.mode && demo.mode === definition.mode),
  );
export const createFragmentDemo = (definition, canvas, device) =>
  select(definition).setup(canvas, device, definition);
export const createSimulation = createFragmentDemo;
export const createFilterDemo = createFragmentDemo;
export const createBitonicDemo = createFragmentDemo;
export const createScanDemo = createFragmentDemo;

import { simulationSeed as lifeSeed } from "./demos/life/index.js";
import { simulationSeed as waveSeed } from "./demos/waves/index.js";
import { simulationSeed as nbodySeed } from "./demos/nbody/index.js";
import { simulationSeed as clothSeed } from "./demos/cloth/index.js";
import { simulationSeed as heatSeed } from "./demos/heat/index.js";
import { simulationSeed as cyclicSeed } from "./demos/cyclic/index.js";
import { simulationSeed as excitableSeed } from "./demos/excitable/index.js";
import { simulationSeed as coupledSeed } from "./demos/coupled/index.js";
const seeders = {
  life: lifeSeed,
  wave: waveSeed,
  nbody: nbodySeed,
  cloth: clothSeed,
  heat: heatSeed,
  cyclic: cyclicSeed,
  excitable: excitableSeed,
  coupled: coupledSeed,
};
export const simulationSeed = (definition) =>
  seeders[definition.mode](definition);
