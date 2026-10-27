import {
  isShaderSource,
  shaderDescriptor,
  type ShaderStages,
} from "./shader-source.js";
import { deviceState, assertDeviceAvailable } from "./lifecycle.js";
import { WGSLTranspiler } from "./transpiler.js";
import { parseFunction } from "./parser.js";
import { rawShader, reflectResources } from "./bindings.js";
import { ShaderHelper } from "./shader.js";
import {
  ComputeChain,
  type ComputeChainStage,
  type ComputeChainPass,
} from "./compute-chain.js";
import type {
  ShaderOptions,
  RenderOptions,
  ComputeOptions,
  ShaderStage,
  ShaderSource,
  TranspiledShader,
  PipelineOptions,
} from "./types.js";

export type ShaderSources = ShaderSource | ShaderStages;
type Options = PipelineOptions;
let chainSerial = 0;

export class WebGPUjs {
  static device: GPUDevice;
  private static defaultDevicePromise?: Promise<GPUDevice>;
  private static async defaultDevice(): Promise<GPUDevice> {
    if (this.device && !deviceState(this.device).lost) return this.device;
    this.device = undefined;
    if (!this.defaultDevicePromise) {
      this.defaultDevicePromise = (async () => {
        if (typeof navigator === "undefined" || !navigator.gpu)
          throw new Error(
            "WebGPU is unavailable; supply a GPUDevice or use a supported browser in a secure context",
          );
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No GPU adapter available");
        const device = await adapter.requestDevice();
        deviceState(device);
        this.device = device;
        return device;
      })().finally(() => {
        this.defaultDevicePromise = undefined;
      });
    }
    return this.defaultDevicePromise;
  }
  /** Connect compute passes by parameter name, with optional explicit resource aliases. */
  static async createComputeChain(
    stages: ComputeChainStage[],
    options: ShaderOptions & ComputeOptions = {},
  ) {
    if (!Array.isArray(stages) || !stages.length)
      throw new Error("A compute chain needs at least one shader");
    const definitions: ComputeChainPass[] = stages.map((stage, index) => {
      if (isShaderSource(stage)) {
        shaderDescriptor(stage, "compute");
        return { shader: stage };
      }
      if (!stage || typeof stage !== "object" || !isShaderSource(stage.shader))
        throw new Error(
          `Pass ${index + 1}: provide a compute shader or {shader,resources?,inputs?,options?}`,
        );
      shaderDescriptor(stage.shader, "compute");
      return {
        ...stage,
        resources: { ...stage.resources },
        inputs: { ...stage.inputs },
        options: { ...stage.options },
      };
    });
    const passes: ShaderHelper[] = [];
    const allocations = new Map<string, string>();
    const namespace = `webgpujs:chain:${chainSerial++}`;
    try {
      for (const [index, stage] of definitions.entries()) {
        const resourceBindings = {
          ...options.resourceBindings,
          ...options.shaderBindings?.compute,
          ...stage.options?.resourceBindings,
          ...stage.options?.shaderBindings?.compute,
        };
        const publicBindings = { ...resourceBindings };
        // A resource alias can refer to an earlier implicit parameter name.
        // Keep its actual allocation identity while exposing the friendly name to run().
        for (const [name, specification] of Object.entries(resourceBindings))
          if (specification.resource && allocations.has(specification.resource))
            resourceBindings[name] = {
              ...specification,
              resource: allocations.get(specification.resource),
            };
        for (const [name, resource] of Object.entries(stage.resources || {}))
          resourceBindings[name] = {
            ...resourceBindings[name],
            resource: allocations.get(resource) || resource,
          };
        const code =
          typeof stage.shader === "string"
            ? stage.shader
            : typeof stage.shader === "object" &&
                !stage.shader.transpileString &&
                typeof stage.shader.code === "string"
              ? stage.shader.code
              : undefined;
        // A later parameter may use the public name introduced by an earlier alias.
        // Resolve that name before the general linker considers authored parameter names.
        const storageNames = code
          ? reflectResources(code)
              .filter((resource) => resource.kind === "buffer")
              .map((resource) => resource.name)
          : parseFunction(
              (typeof stage.shader === "object"
                ? stage.shader.code
                : stage.shader
              ).toString(),
            )
              .params.filter((parameter) => {
                const value = parameter.right;
                const name = (parameter.left || parameter).name;
                const declared =
                  resourceBindings[name]?.type ||
                  stage.options?.variableTypes?.[name] ||
                  options.variableTypes?.[name];
                const explicit = (
                  typeof declared === "string" ? declared : declared?.type
                )?.replace(/\s/g, "");
                return (
                  explicit?.startsWith("array<") ||
                  (value?.type === "Literal" &&
                    typeof value.value === "string" &&
                    value.value.replace(/\s/g, "").startsWith("array<")) ||
                  value?.type === "ArrayExpression" ||
                  (value?.type === "NewExpression" &&
                    /Array$/.test(value.callee?.name))
                );
              })
              .map((parameter) => (parameter.left || parameter).name);
        for (const name of storageNames)
          if (allocations.has(name) && !resourceBindings[name]?.resource)
            resourceBindings[name] = {
              ...resourceBindings[name],
              resource: allocations.get(name),
            };

        // Per-pass uniforms are snapshots: batched dispatches must not all see the last span/gain.
        const uniforms = code
          ? reflectResources(code)
              .filter((r) => r.kind === "uniform")
              .map((r) => r.name)
          : ["uniforms", "defaults"];
        for (const name of uniforms)
          resourceBindings[name] = {
            ...resourceBindings[name],
            resource:
              resourceBindings[name]?.resource ||
              `${namespace}:${index}:${name}`,
          };
        if (code) {
          // Native stages have independent layouts. Relocate their authored slots
          // automatically inside a chain, unless the caller explicitly assigned one.
          const group =
            stage.options?.bindGroupNumber ?? options.bindGroupNumber ?? 0;
          let binding =
            Math.max(
              -1,
              ...(passes.at(-1)?.linkedResources || [])
                .filter((r) => r.group === group)
                .map((r) => r.binding),
            ) + 1;
          const reflected = reflectResources(code);
          const reserved = new Set(
            Object.values(resourceBindings)
              .filter(
                (spec) =>
                  spec.binding !== undefined && (spec.group ?? group) === group,
              )
              .map((spec) => spec.binding),
          );
          for (const resource of reflected) {
            const spec = resourceBindings[resource.name] || {};
            while (reserved.has(binding)) binding++;
            resourceBindings[resource.name] = {
              ...spec,
              group: spec.group ?? group,
              binding: spec.binding ?? binding++,
            };
          }
        }
        const settings = {
          ...options,
          ...stage.options,
          resourceBindings,
          shaderBindings: { compute: resourceBindings },
          // Each pipeline has its own layout; reuse group zero across arbitrarily many passes.
          bindGroupNumber:
            stage.options?.bindGroupNumber ?? options.bindGroupNumber ?? 0,
          computePass: {
            ...options.computePass,
            ...stage.options?.computePass,
            skipOutputDef: true,
          },
        };
        const pass = passes.length
          ? await WebGPUjs.combineShaders(
              { compute: stage.shader },
              settings,
              passes.at(-1),
            )
          : await WebGPUjs.createPipeline({ compute: stage.shader }, settings);
        passes.push(pass);
        for (const descriptor of pass.compute.resources.filter(
          (resource) => resource.kind === "buffer",
        )) {
          const name =
            stage.resources?.[descriptor.name] ||
            publicBindings[descriptor.name]?.resource ||
            descriptor.name;
          const previous = allocations.get(name);
          if (previous && previous !== descriptor.resource)
            throw new Error(
              `Ambiguous chain resource "${name}"; use an explicit resources mapping`,
            );
          allocations.set(name, descriptor.resource);
        }
        stage.options = {
          ...options,
          ...stage.options,
          resourceBindings: publicBindings,
        };
      }
      return new ComputeChain(passes, definitions);
    } catch (error) {
      for (const pass of passes) pass.dispose();
      throw error;
    }
  }
  static createPipeline = async (
    sources: ShaderSources,
    options: Options = {},
  ): Promise<ShaderHelper> => {
    options = {
      ...options,
      entryPoints: { ...options.entryPoints },
      constants: { ...options.constants },
    };
    if (!sources || !["function", "string", "object"].includes(typeof sources))
      throw new Error(
        "Provide shader functions, WGSL strings or stage descriptors",
      );
    options.device ||= await this.defaultDevice();
    assertDeviceAvailable(options.device);
    if (options.canvas && !options.context) {
      options.context = options.canvas.getContext("webgpu") as GPUCanvasContext;
      if (!options.context)
        throw new Error("Cannot create a WebGPU canvas context");
    }
    const single = isShaderSource(sources);
    const block: ShaderStages = single
      ? { [options.canvas ? "fragment" : "compute"]: sources }
      : sources;
    const shaders: Partial<Record<ShaderStage, TranspiledShader>> = {};
    const baseGroup = options.bindGroupNumber ?? 0;
    for (const stage of ["compute", "vertex", "fragment"] as ShaderStage[]) {
      const source = block[stage];
      if (source === undefined) continue;
      const descriptor = shaderDescriptor(source, stage);
      if (descriptor.entryPoint && !options.entryPoints[stage])
        options.entryPoints[stage] = descriptor.entryPoint;
      if (descriptor.constants)
        options.constants[stage] = {
          ...descriptor.constants,
          ...options.constants[stage],
        };
      const bindings = {
        ...options.resourceBindings,
        ...options.shaderBindings?.[stage],
      };
      const group =
        stage === "compute" || !block.compute ? baseGroup : baseGroup + 1;
      const transpile =
        typeof descriptor.code === "function" ||
        descriptor.transpileString ||
        block.transpileString;
      const shader = transpile
        ? WGSLTranspiler.convertToWebGPU(
            descriptor.code,
            stage,
            group,
            options.workGroupSize,
            options.renderPass?.vbos as any,
            options.functions,
            options.variableTypes,
            options.renderPass?.textures,
            options.lastBinding,
            options.params,
            bindings,
            stage === "compute" ? options.workgroupVariables : undefined,
          )
        : rawShader(descriptor.code as string, stage, group, bindings);
      if (options.prependCode)
        shader.code = options.prependCode + "\n" + shader.code;
      shaders[stage] = shader;
    }
    if (!Object.keys(shaders).length)
      throw new Error(
        "Provide at least one compute, vertex or fragment shader",
      );
    const helper = new ShaderHelper(shaders, {
      asyncCompilation: true,
      ...options,
    });
    try {
      const compiled = await Promise.allSettled(helper.pendingCompilation);
      const failure = compiled.find((result) => result.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    } catch (error) {
      helper.dispose();
      const diagnostics = await Promise.all(
        [helper.compute, helper.vertex, helper.fragment]
          .filter(Boolean)
          .map(async (context) => {
            const info = await context.shaderModule.getCompilationInfo();
            return info.messages
              .filter((message) => message.type === "error")
              .map((message) => `line ${message.lineNum}: ${message.message}`)
              .join("\n");
          }),
      );
      throw new Error(diagnostics.filter(Boolean).join("\n") || error.message);
    }
    return helper;
  };

  static init = (
    shaders: Partial<Record<ShaderStage, TranspiledShader>>,
    options?: Options,
  ) => new ShaderHelper(shaders, options);

  /** Share allocations with an earlier helper without changing its compiled layouts or parameter order. */
  static combineShaders = (
    shaders: ShaderSources,
    options: Options = {},
    previousPipeline: ShaderHelper,
  ): Promise<ShaderHelper> => {
    if (!previousPipeline)
      throw new Error("combineShaders requires a previous pipeline");
    previousPipeline.assertUsable();
    if (options.device && options.device !== previousPipeline.device)
      throw new Error("Chained shaders must use the same GPUDevice");
    const group =
      Math.max(-1, ...previousPipeline.linkedResources.map((r) => r.group)) + 1;
    return WebGPUjs.createPipeline(shaders, {
      ...options,
      device: previousPipeline.device,
      bindGroupNumber: options.bindGroupNumber ?? group,
      previousPipeline,
    });
  };

  static dispose = (pipeline: ShaderHelper | ComputeChain) =>
    pipeline.dispose();
  /** Compatibility alias for dispose(). Does not destroy the GPUDevice. */
  static cleanup = (pipeline: ShaderHelper | ComputeChain) =>
    pipeline.dispose();
}
export default WebGPUjs;
