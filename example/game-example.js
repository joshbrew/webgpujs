export { terrainHeight } from "./demos/game/index.js";
export {
  buildTerrain,
  terrainVertex,
  litFragment,
  actorVertex,
} from "./demos/game/shaders.js";
import { setup } from "./demos/game/index.js";
export const createGame = (definition, canvas, device) =>
  setup(canvas, device, definition);
