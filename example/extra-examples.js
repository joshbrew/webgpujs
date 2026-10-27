import { demos } from "./demos/index.js";
import { legacyCatalog } from "./shared/catalog-adapter.js";

export const extraCatalog = legacyCatalog(
  demos.filter((demo) =>
    [
      "batch-fft",
      "fft-2d",
      "newton",
      "fft",
      "game",
      "gyroid",
      "menger",
      "spectral",
      "ocean",
      "caustics",
      "diffraction",
      "fir",
      "sharpen",
      "emboss",
      "pixelate",
      "dither",
      "chromatic",
      "mosaic",
      "heat",
      "cyclic",
      "excitable",
      "coupled",
    ].includes(demo.id),
  ),
);
