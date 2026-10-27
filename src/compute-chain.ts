import type { ShaderHelper } from "./shader.js";
import type {
  ShaderOptions,
  ComputeOptions,
  ShaderResource,
  ShaderSource,
  ShaderInputs,
  ShaderInput,
  StorageArray,
} from "./types.js";

export type ComputeChainSource = ShaderSource;
export type ComputeChainPass = {
  shader: ShaderSource;
  /** Optional shader parameter -> shared allocation name. Matching names otherwise connect implicitly. */
  resources?: Record<string, string>;
  /** Per-pass scalar/vector/matrix values; these override run() values. */
  inputs?: Record<string, ShaderInput>;
  options?: ShaderOptions & ComputeOptions;
};
export type ComputeChainStage = ComputeChainSource | ComputeChainPass;
export type ComputeChainRunOptions = {
  readback?: string | readonly string[];
  /** Optional native command encoder; caller submits it, then can read the chain. */
  commandEncoder?: GPUCommandEncoder;
};

type BufferReference = { pass: ShaderHelper; descriptor: ShaderResource };
type PassInput = {
  name: string;
  key: string;
  uniform: boolean;
  resource?: string;
};

/** Named inputs, GPU-resident intermediate buffers, and explicit final readback. */
export class ComputeChain {
  private tail: Promise<unknown> = Promise.resolve();
  private closing = false;
  private disposal?: Promise<void>;
  get disposed() {
    return this.closing;
  }
  private assertUsable() {
    if (this.closing) throw new Error("This compute chain has been disposed");
    for (const pass of this.passes) pass.assertUsable();
  }
  /** Stop accepting work, finish queued operations, then release this chain's helpers. */
  dispose(): Promise<void> {
    if (!this.disposal) {
      this.closing = true;
      this.disposal = this.tail.then(() => {
        for (const pass of this.passes) pass.dispose();
      });
    }
    return this.disposal;
  }
  cleanup() {
    return this.dispose();
  }
  private buffers = new Map<string, BufferReference>();
  private inputNames = new Set<string>();
  private passInputs: PassInput[][] = [];
  private sharedUniforms = false;

  constructor(
    public readonly passes: readonly ShaderHelper[],
    public readonly stages: readonly ComputeChainPass[],
  ) {
    if (!passes.length || passes.length !== stages.length)
      throw new Error(
        "A compute chain needs matching nonempty passes and stages",
      );
    const uniforms = new Set<string>();
    passes.forEach((pass, index) => {
      pass.assertUsable();
      if (!pass.compute)
        throw new Error(`Pass ${index + 1} has no compute stage`);
      if (pass.device !== passes[0].device)
        throw new Error("Compute chain passes must use the same GPUDevice");
      for (const resource of pass.compute.resources.filter(
        (r) => r.kind === "uniform",
      )) {
        if (uniforms.has(resource.resource)) this.sharedUniforms = true;
        uniforms.add(resource.resource);
      }
      if (
        pass.compute.resources.some(
          (resource) => !["buffer", "uniform"].includes(resource.kind),
        )
      )
        throw new Error(
          "Compute chains currently accept storage buffers and numeric uniforms; use combineShaders for texture passes",
        );

      const params = pass.prototypes.compute.params.filter((p) => p.isInput);
      const stage = stages[index];
      const parameters = new Map(params.map((p) => [p.name, p]));
      const available = params.map((p) => p.name).join(", ") || "(none)";
      for (const [name, alias] of Object.entries(stage.resources || {})) {
        if (!parameters.has(name))
          throw new Error(
            `Pass ${index + 1}: unknown resource parameter "${name}". Shader inputs: ${available}`,
          );
        if (typeof alias !== "string" || !alias.trim())
          throw new Error(
            `Pass ${index + 1}: resource "${name}" needs a non-empty shared name`,
          );
      }
      for (const name of Object.keys(stage.inputs || {})) {
        const param = parameters.get(name);
        if (!param)
          throw new Error(
            `Pass ${index + 1}: unknown uniform "${name}" in inputs. Shader inputs: ${available}`,
          );
        if (!param.isUniform)
          throw new Error(
            `Pass ${index + 1}: pass inputs only configure uniforms; supply buffer "${this.key(index, name)}" to run()`,
          );
      }

      // Resolve routing once rather than filtering and relinking on every run.
      this.passInputs.push(
        params.map((param) => ({
          name: param.name,
          key: this.key(index, param.name),
          uniform: !!param.isUniform,
          resource: param.resource,
        })),
      );
      for (const param of params) {
        const key = this.key(index, param.name);
        this.inputNames.add(key);
        if (param.isUniform) continue;
        const descriptor = pass.compute.resources.find(
          (r) => r.name === param.name,
        );
        if (!descriptor || descriptor.kind !== "buffer")
          throw new Error(
            "Compute chains currently accept storage buffers and numeric uniforms; use combineShaders for texture passes",
          );
        const previous = this.buffers.get(key);
        if (previous && previous.descriptor.resource !== descriptor.resource)
          throw new Error(
            `Ambiguous chain input "${key}"; give these buffers distinct resource names`,
          );
        this.buffers.set(key, { pass, descriptor });
      }
    });
  }

  private key(index: number, name: string) {
    const stage = this.stages[index];
    return (
      stage.resources?.[name] ||
      stage.options?.resourceBindings?.[name]?.resource ||
      name
    );
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    try {
      this.assertUsable();
    } catch (error) {
      return Promise.reject(error);
    }
    const result = this.tail.then(work);
    this.tail = result.catch(() => {});
    return result;
  }

  private bufferReference(name: string): BufferReference {
    const reference = this.buffers.get(name);
    if (!reference)
      throw new Error(
        `Unknown compute chain buffer "${name}". Available buffers: ${[...this.buffers.keys()].join(", ") || "(none)"}`,
      );
    return reference;
  }

  /** With no readback option this submits all passes without mapping any GPU buffer. */
  run(
    inputs: ShaderInputs,
    options: { readback: string; commandEncoder?: GPUCommandEncoder },
  ): Promise<StorageArray>;
  run<const Names extends readonly string[]>(
    inputs: ShaderInputs,
    options: { readback: Names; commandEncoder?: GPUCommandEncoder },
  ): Promise<Record<Names[number], StorageArray>>;
  run(
    inputs?: ShaderInputs,
    options?: { readback?: undefined; commandEncoder?: GPUCommandEncoder },
  ): Promise<void>;
  run(
    inputs: ShaderInputs,
    options: ComputeChainRunOptions,
  ): Promise<void | StorageArray | Record<string, StorageArray>>;
  run(
    inputs: ShaderInputs = {},
    options: ComputeChainRunOptions = {},
  ): Promise<void | StorageArray | Record<string, StorageArray>> {
    return this.enqueue(async () => {
      if (
        options.commandEncoder &&
        (options.readback !== undefined || this.sharedUniforms)
      )
        throw new Error(
          "A caller-owned command encoder requires deferred readback and independent per-pass uniforms",
        );
      for (const key of Object.keys(inputs))
        if (!this.inputNames.has(key))
          throw new Error(
            `Unknown compute chain input "${key}". Available inputs: ${[...this.inputNames].join(", ") || "(none)"}`,
          );
      const names =
        options.readback === undefined
          ? []
          : typeof options.readback === "string"
            ? [options.readback]
            : options.readback;
      for (const name of names) this.bufferReference(name);
      // Fail before dispatching rather than silently allocating a one-element output.
      for (const [name, { pass, descriptor }] of this.buffers) {
        if (
          inputs[name] === undefined &&
          !pass.resources.get(descriptor.resource)?.buffer
        )
          throw new Error(
            `Missing compute chain buffer "${name}"; supply a typed array or GPUBuffer on the first run`,
          );
      }
      const uploaded = new Set<string>();
      // Explicitly shared uniform buffers retain legacy ordered write/submit behavior.
      const encoder =
        options.commandEncoder ||
        (!this.sharedUniforms && this.passes[0].device.createCommandEncoder());
      for (const [index, pass] of this.passes.entries()) {
        const args = this.passInputs[index].map((param) => {
          const value =
            this.stages[index].inputs?.[param.name] ?? inputs[param.key];
          if (param.uniform) return value;
          if (uploaded.has(param.resource)) return undefined;
          uploaded.add(param.resource);
          return value;
        });
        if (encoder)
          await pass.compute.run(
            { ...pass.compute.computePass, commandEncoder: encoder },
            ...args,
          );
        else await pass.process(...args);
      }
      if (encoder && !options.commandEncoder)
        this.passes[0].device.queue.submit([encoder.finish()]);
      return options.readback === undefined
        ? undefined
        : this.readNow(options.readback);
    });
  }

  /** Reuse the allocation directly in another WebGPUjs helper without a CPU copy. */
  getBuffer(name: string): GPUBuffer {
    this.assertUsable();
    return this.bufferNow(name);
  }
  private bufferNow(name: string): GPUBuffer {
    const reference = this.bufferReference(name);
    const buffer = reference.pass.resources.get(
      reference.descriptor.resource,
    )?.buffer;
    if (!buffer)
      throw new Error(
        `Compute chain buffer "${name}" has not been allocated; run the chain first`,
      );
    return buffer;
  }

  /** Read one buffer as a typed array, or several as an object keyed by shared name. */
  read(name: string): Promise<StorageArray>;
  read<const Names extends readonly string[]>(
    names: Names,
  ): Promise<Record<Names[number], StorageArray>>;
  read(
    names: string | readonly string[],
  ): Promise<StorageArray | Record<string, StorageArray>>;
  read(
    names: string | readonly string[],
  ): Promise<StorageArray | Record<string, StorageArray>> {
    return this.enqueue(() => this.readNow(names));
  }

  private async readNow(names: string | readonly string[]) {
    const list = typeof names === "string" ? [names] : names;
    // Validate the whole request before copying any buffer to the CPU.
    const references = list.map((name) => ({
      name,
      ...this.bufferReference(name),
      buffer: this.bufferNow(name),
    }));
    const outputs: Record<string, StorageArray> = {};
    for (const { name, pass, descriptor, buffer } of references) {
      outputs[name] = (await pass.compute.getOutputData(
        pass.device.createCommandEncoder(),
        { [descriptor.name]: buffer },
      )) as StorageArray;
    }
    return typeof names === "string" ? outputs[names] : outputs;
  }
}
