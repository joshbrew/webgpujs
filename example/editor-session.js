import { WebGPUjs } from "../src/pipeline";
import { WGSLTranspiler } from "../src/transpiler";
import { linkBindings, rawShader } from "../src/bindings";
import { shaderInfo } from "./shader-info.js";

export const shaderKey = (pass, stage) => `${pass}:${stage}`;
let recording = false;

/** Demo-only build scope: reuses the actual example factories without executing editor text. */
export async function buildExample(setup, canvas, device, drafts = new Map()) {
  if (recording) throw new Error("Another example is still building");
  recording = true;
  const original = WebGPUjs.createPipeline,
    records = [];
  const helpers = [];
  WebGPUjs.createPipeline = async (sources, options = {}) => {
    const index = records.length;
    const previous = helpers.indexOf(options.previousPipeline);
    const overrides = [...drafts].filter(([key]) =>
      key.startsWith(`${index}:`),
    );
    const single =
      typeof sources === "function" ||
      typeof sources === "string" ||
      "code" in sources;
    const block = single
      ? { [options.canvas ? "fragment" : "compute"]: sources }
      : { ...sources };
    const originalStages = new Set(
      Object.keys(block).filter((key) =>
        ["compute", "vertex", "fragment"].includes(key),
      ),
    );
    let input = sources,
      buildOptions = { ...options, device };
    if (overrides.length) {
      input = { ...block };
      for (const [key, source] of overrides) {
        const stage = key.split(":")[1],
          previous = block[stage];
        const raw =
          (typeof previous === "string" && !block.transpileString) ||
          (previous &&
            typeof previous === "object" &&
            typeof previous.code === "string" &&
            !previous.transpileString &&
            !block.transpileString);
        input[stage] = {
          ...(typeof previous === "object" ? previous : {}),
          code: source,
          transpileString: !raw,
        };
      }
      // Generated vertex shaders originally have no fragment-only resource options.
      if (overrides.some(([key]) => !originalStages.has(key.split(":")[1]))) {
        buildOptions.shaderBindings = { ...options.shaderBindings };
        for (const stage of originalStages)
          buildOptions.shaderBindings[stage] = {
            ...options.resourceBindings,
            ...options.shaderBindings?.[stage],
          };
        delete buildOptions.resourceBindings;
      }
    }
    device.pushErrorScope("validation");
    let helper, error;
    try {
      helper = await original(input, buildOptions);
    } finally {
      error = await device.popErrorScope();
    }
    if (helper) helpers.push(helper);
    if (error) throw new Error(`Pass ${index + 1}: ${error.message}`);
    for (const [stage, context] of Object.entries(helper.prototypes)) {
      const info = await helper[stage].shaderModule.getCompilationInfo();
      const errors = info.messages.filter(
        (message) => message.type === "error",
      );
      if (errors.length)
        throw new Error(
          `Pass ${index + 1} / ${stage}: ${errors.map((m) => `line ${m.lineNum}: ${m.message}`).join("\n")}`,
        );
    }
    records.push({
      index,
      previous,
      options: { ...helper.options },
      shaders: Object.entries(helper.prototypes).map(([stage, shader]) => ({
        ...shaderInfo(shader, stage, index, {
          entryPoint: helper.options.entryPoints?.[stage],
        }),
        source: shader.funcStr || shader.code,
        raw: !shader.funcStr,
        auto: !originalStages.has(stage),
        code: shader.code,
      })),
    });
    return helper;
  };
  try {
    device.pushErrorScope("validation");
    let demo, error;
    try {
      demo = await setup(canvas, device);
    } finally {
      error = await device.popErrorScope();
    }
    if (error) throw new Error(error.message);
    return { demo, records, helpers, canvas };
  } catch (error) {
    disposeExample({ helpers, canvas });
    throw error;
  } finally {
    WebGPUjs.createPipeline = original;
    recording = false;
  }
}

/** Same compiler and binding linker as a real build; no device calls or JS evaluation. */
export function translateDrafts(records, drafts) {
  const shaders = [],
    errors = [],
    linked = [];
  let complete = true;
  for (const record of records) {
    const options = record.options;
    const previous = record.previous >= 0 ? linked[record.previous] : [];
    const base =
      options.bindGroupNumber ??
      (record.previous >= 0 && previous
        ? Math.max(-1, ...previous.map((r) => r.group)) + 1
        : 0);
    const hasCompute = record.shaders.some(
      (shader) => shader.stage === "compute",
    );
    const pass = [];
    for (const saved of [...record.shaders].sort(
      (a, b) =>
        ["compute", "vertex", "fragment"].indexOf(a.stage) -
        ["compute", "vertex", "fragment"].indexOf(b.stage),
    )) {
      try {
        const source = drafts.get(saved.id) ?? saved.source;
        const bindings = saved.auto
          ? {}
          : {
              ...options.resourceBindings,
              ...options.shaderBindings?.[saved.stage],
            };
        const group =
          saved.stage === "compute" || !hasCompute ? base : base + 1;
        const shader = saved.raw
          ? rawShader(source, saved.stage, group, bindings)
          : WGSLTranspiler.convertToWebGPU(
              source,
              saved.stage,
              group,
              options.workGroupSize,
              options.renderPass?.vbos,
              options.functions,
              options.variableTypes,
              options.renderPass?.textures,
              options.lastBinding,
              options.params,
              bindings,
              saved.stage === "compute"
                ? options.workgroupVariables
                : undefined,
            );
        if (options.prependCode)
          shader.code = options.prependCode + "\n" + shader.code;
        pass.push(shader);
        shaders.push({ ...saved, shader, code: shader.code });
      } catch (error) {
        complete = false;
        errors.push({ id: saved.id, message: error.message });
        shaders.push({ ...saved, code: "", error: error.message });
      }
    }
    if (complete) {
      try {
        linked[record.index] = linkBindings(
          pass,
          previous || [],
          !options.skipCombinedBindings,
        );
        for (const shader of pass) {
          const view = shaders.find(
            (view) => view.id === shaderKey(record.index, shader.type),
          );
          view.code = shader.code;
        }
      } catch (error) {
        complete = false;
        errors.push({ pass: record.index, message: error.message });
      }
    }
  }
  return { shaders, errors, linked: complete };
}

/** Release a discarded preview, while keeping the shared device and active preview alive. */
export function disposeExample(session) {
  if (!session) return;
  session.demo?.dispose?.();
  for (const helper of session.helpers || session.demo?.pipelines || [])
    helper.dispose();
}
