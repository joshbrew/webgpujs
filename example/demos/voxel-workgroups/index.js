// 3D workgroups and cooperative voxel reduction: complete GPU plan, allocations and update for this demo.
import { WebGPUjs } from "../../../src/pipeline";
import { voxels, display } from "./shaders.js";

function createPlan() {
  return [
    {
      shader: voxels,
      inputs: { size: 32 },
      options: {
        workGroupSize: [4, 4, 4],
        workgroupVariables: { scratch: "array<f32,64>" },
        computePass: { workgroupsX: 8, workgroupsY: 8, workgroupsZ: 8 },
      },
    },
  ];
}
function createInputs(controls = {}, seed = 0) {
  return {
    field: new Float32Array(32768),
    partials: new Float32Array(512),
    frequency: controls.frequency ?? 3,
  };
}

export async function setup(canvas, device) {
  const stages = createPlan();
  const chain = await WebGPUjs.createComputeChain(stages, { device });
  let seed = 0,
    previous = "",
    input,
    summary = "";
  const resultName = "field";
  const displayPipeline = await WebGPUjs.combineShaders(
    display,
    {
      canvas,
      resourceBindings: { field: { resource: "field" } },
      renderPass: { vbos: [], vertexCount: 3 },
    },
    chain.passes.at(-1),
  );
  async function frame(time, controls = {}) {
    const key = JSON.stringify([controls, seed]);
    if (key !== previous) {
      input = createInputs(controls, seed);
      await chain.run(input);
      previous = key;
    }
    await displayPipeline.render({
      inputs: { size: 32, slice: Math.round(controls.slice ?? 16) },
    });
  }
  return {
    pipelines: [...chain.passes, displayPipeline],
    chain,
    frame,
    continuous: false,
    reset() {
      seed++;
      previous = "";
    },
    get input() {
      return input;
    },
    resultName,
    get resultInfo() {
      return (
        summary ||
        "4×4×4 workgroups generate a 32³ scalar field and reduce each tile in shared memory. The slice control inspects GPU-resident volume data." +
          "\n" +
          stages.length +
          " compute passes; intermediates and visualization stay on the GPU."
      );
    },
  };
}
export default {
  id: "voxel-workgroups",
  title: "3D workgroups and cooperative voxel reduction",
  description:
    "4×4×4 workgroups generate a 32³ scalar field and reduce each tile in shared memory. The slice control inspects GPU-resident volume data.",
  category: "Parallel algorithms",
  algorithm: true,
  controls: [
    ["slice", "Z slice", 0, 31, 1, 16],
    ["frequency", "Field frequency", 1, 6, 0.1, 3],
  ],
  setup,
};
