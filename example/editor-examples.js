import { demos } from "./demos/index.js";
import { galleryGroups } from "./gallery-catalog.js";
import { sourceText } from "./host-source.js";

// Both the gallery and live editor consume the same standalone demo modules.
const order = galleryGroups.flatMap((group) => group.examples);
export const editorExamples = demos
  .map((demo) => ({
    ...demo,
    setupSource: demo.setup.moduleSource ?? sourceText(demo.setup),
  }))
  .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
