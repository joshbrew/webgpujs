import { BuiltinInputs } from "./builtin-inputs.js";
import { readGPUOutputs, type ReadbackOutputs } from "./readback.js";
import { uploadGeometry } from "./vertex-data.js";
import {
  ResourceScope,
  withResourceInputs,
  ResourceRegistry,
  assertDeviceAvailable,
  type ResourceRecord,
} from "./lifecycle.js";
import type { PipelineOptions, ShaderInput } from "./types.js";
import {
  uniformLayout,
  writeValue,
  storageData,
  storageElementLayout,
  isGPUBuffer,
  roundUp,
  typeLayout,
  texelBytes,
} from "./data.js";
import { linkBindings, compatible } from "./bindings.js";
import type { ShaderResource } from "./types.js";
import { WGSLTranspiler, WGSLTypeSizes } from "./transpiler.js";
import { workgroupDimensions } from "./workgroups.js";
import { getMediaDimensions, isMediaSource } from "./media.js";
import { gpuConstants } from "./constants.js";
import {
  ShaderOptions,
  RenderOptions,
  ComputeOptions,
  RenderPassSettings,
  ComputePassSettings,
  TranspiledShader,
  BufferGroup,
  TextureInfo,
  Param,
  WorkgroupSize,
  RenderPipelineOverrides,
  VertexBufferOptions,
} from "./types.js";
import {
  combineVertices,
  flattenArray,
  floatToHalf,
  isTypedArray,
  splitVertices,
} from "./util.js";

//Self contained shader execution boilerplate
export class ShaderHelper {
  prototypes: {
    compute?: TranspiledShader;
    fragment?: TranspiledShader;
    vertex?: TranspiledShader;
  } = {};

  options: PipelineOptions = {};
  private registry = new ResourceRegistry();
  private closed = false;
  get disposed() {
    return this.closed;
  }
  assertUsable() {
    if (this.closed) throw new Error("This shader pipeline has been disposed");
    assertDeviceAvailable(this.device);
  }

  compute?: ShaderContext;
  vertex?: ShaderContext;
  fragment?: ShaderContext;

  process = (...inputs: (ShaderInput | undefined)[]) => {
    const shader = this.compute;
    if (!shader) throw new Error("This pipeline has no compute stage");
    return shader.run(this.compute.computePass, ...inputs);
  };

  render = (
    renderPass?: RenderPassSettings,
    ...inputs: (ShaderInput | undefined)[]
  ) => {
    const shader = this.fragment ? this.fragment : this.vertex;
    if (shader) {
      const { textures, vbos, indexBuffer, ...defaults } =
        shader.renderPass || { vertexCount: 1 };
      return shader.run({ ...defaults, ...renderPass }, ...inputs);
    }
    throw new Error("This pipeline has no render stage");
  };

  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: GPUCanvasContext;
  device: GPUDevice;
  functions: (Function | string)[] = [];

  //copy these to new ShaderHelpers to share buffers between shaders
  bindGroupLayouts: GPUBindGroupLayout[] = [];
  bindGroups: GPUBindGroup[] = [];
  bufferGroups: BufferGroup[] = [];

  constructor(
    shaders: {
      compute?: TranspiledShader;
      fragment?: TranspiledShader;
      vertex?: TranspiledShader;
    },
    options: ShaderOptions & ComputeOptions & RenderOptions,
  ) {
    try {
      if (shaders) this.init(shaders, options);
    } catch (error) {
      void Promise.allSettled(this.pendingCompilation);
      this.dispose();
      throw error;
    }
  }

  /** @internal Linked allocation records; prefer named inputs and chain.getBuffer(). */
  get resources() {
    return this.registry.records;
  }
  /** @internal */
  setBuffer(
    id: string,
    record: ResourceRecord,
    buffer: GPUBuffer,
    owned = false,
  ) {
    this.assertUsable();
    this.registry.buffer(id, record, buffer, owned);
  }
  /** @internal */
  setTexture(
    id: string,
    record: ResourceRecord,
    texture: GPUTexture,
    owned = false,
  ) {
    this.assertUsable();
    this.registry.texture(id, record, texture, owned);
  }
  linkedResources: ShaderResource[] = [];
  pendingCompilation: Promise<void>[] = [];

  init = (
    shaders: {
      compute?: TranspiledShader;
      vertex?: TranspiledShader;
      fragment?: TranspiledShader;
    },
    options: ShaderOptions & ComputeOptions & RenderOptions = {},
  ) => {
    if (this.closed) throw new Error("This shader pipeline has been disposed");
    if (options.renderPipelineSettings && !options.renderPipelineDescriptor)
      options = {
        ...options,
        renderPipelineDescriptor: options.renderPipelineSettings,
      };
    Object.assign(this, options);
    if (!this.device)
      throw new Error("Supply a GPUDevice or use WebGPUjs.createPipeline()");
    this.assertUsable();
    this.options = { ...options };
    this.pendingCompilation = [];
    shaders = Object.fromEntries(
      Object.entries(shaders).map(([stage, s]) => [
        stage,
        {
          ...s,
          params: (s.params || []).map((p) => ({ ...p })),
          resources: (s.resources || []).map((r) => ({
            ...r,
            fields: r.fields?.map((f) => ({ ...f })),
          })),
        },
      ]),
    );
    if (shaders.fragment && !shaders.vertex)
      shaders = this.generateShaderBoilerplate(shaders, options);
    const previous = options.previousPipeline as ShaderHelper;
    previous?.assertUsable();
    if (previous && previous.registry !== this.registry) {
      this.registry.detach(this);
      this.registry = previous.registry;
    }
    this.linkedResources = linkBindings(
      Object.values(shaders),
      previous?.linkedResources || [],
      !options.skipCombinedBindings,
    );
    this.registry.attach(
      this,
      Object.values(shaders).flatMap((shader) =>
        shader.resources.map((resource) => resource.resource),
      ),
    );
    for (const ctx of [this.compute, this.vertex, this.fragment])
      ctx?.dispose();
    this.compute = this.vertex = this.fragment = undefined;
    this.prototypes = shaders;
    const contextOptions = { ...options };
    delete contextOptions.bindGroupNumber;
    delete contextOptions.params;
    for (const stage of ["compute", "vertex", "fragment"] as const) {
      if (!shaders[stage]) continue;
      this[stage] = new ShaderContext({ ...contextOptions, ...shaders[stage] });
      this[stage].helper = this;
    }
    const graphics = this.fragment || this.vertex;
    if (this.vertex && this.fragment) {
      graphics.vertex = this.vertex;
      graphics.params = WGSLTranspiler.combineShaderParams(
        shaders.vertex,
        shaders.fragment,
      );
      const fragmentResources = this.fragment.resources;
      graphics.resources = [...this.vertex.resources];
      for (const resource of fragmentResources) {
        const existing = graphics.resources.find(
          (r) => r.group === resource.group && r.binding === resource.binding,
        );
        if (!existing) graphics.resources.push(resource);
        else if (
          !compatible(existing, resource) ||
          existing.resource !== resource.resource
        )
          throw new Error(
            `Incompatible vertex/fragment binding at ${resource.group}:${resource.binding}`,
          );
      }
    }
    for (const ctx of [this.compute, graphics]) {
      if (!ctx) continue;
      ctx.bindGroupLayouts = [...(options.bindGroupLayouts || [])];
      ctx.bindGroups = [];
      ctx.externalBindGroups = options.bindGroups;
      ctx.bufferGroups = options.bufferGroups ? [...options.bufferGroups] : [];
      const visibility =
        ctx === this.compute
          ? gpuConstants.GPUShaderStage.COMPUTE
          : gpuConstants.GPUShaderStage.VERTEX |
            gpuConstants.GPUShaderStage.FRAGMENT;
      const maxGroup = Math.max(
        ctx.bindGroupNumber,
        ...ctx.resources.map((r) => r.group),
      );
      for (let group = 0; group <= maxGroup; group++) {
        const entries = ctx.createBindGroupEntries(
          options.renderPass?.textures,
          group,
          visibility,
        );
        if (!options.bindGroupLayouts?.[group])
          ctx.setBindGroupLayout(entries, group);
      }
      ctx.pipelineLayout = this.device.createPipelineLayout({
        bindGroupLayouts: ctx.bindGroupLayouts,
      });
    }
    if (this.compute) {
      this.compute.shaderModule = this.device.createShaderModule({
        code: shaders.compute.code,
      });
      const descriptor = {
        layout: this.compute.pipelineLayout,
        compute: {
          module: this.compute.shaderModule,
          entryPoint: options.entryPoints?.compute || "compute_main",
          constants: options.constants?.compute,
        },
        ...options.computePipelineSettings,
      };
      if (options.asyncCompilation && this.device.createComputePipelineAsync)
        this.pendingCompilation.push(
          this.device
            .createComputePipelineAsync(descriptor)
            .then((pipeline) => {
              if (!this.disposed) this.compute.computePipeline = pipeline;
            }),
        );
      else
        this.compute.computePipeline =
          this.device.createComputePipeline(descriptor);
    }
    for (const stage of ["vertex", "fragment"] as const) {
      if (this[stage])
        this[stage].shaderModule = this.device.createShaderModule({
          code: shaders[stage].code,
        });
    }
    if (graphics) {
      const ready = graphics.updateGraphicsPipeline(
        options.renderPass?.vbos as any,
        options.contextSettings,
        options.renderPipelineDescriptor,
        options.renderPassDescriptor,
        this.fragment ? "fragment" : "vertex",
        !!options.asyncCompilation,
      );
      if (ready) this.pendingCompilation.push(ready);
    }
    this.bufferGroups = (this.compute || graphics).bufferGroups;
    this.bindGroups = (this.compute || graphics).bindGroups;
    this.bindGroupLayouts = (this.compute || graphics).bindGroupLayouts;
    const uploadInputs = () => {
      this.assertUsable();
      if (options.inputs)
        (this.compute || graphics).buffer({}, ...options.inputs);
      if (graphics && options.renderPass?.vbos)
        options.renderPass.vbos.forEach((vbo: any, index) => {
          if (vbo.vertices || isGPUBuffer(vbo) || isTypedArray(vbo))
            graphics.updateVBO(vbo.vertices || vbo, index);
        });
      if (graphics && options.renderPass?.indexBuffer)
        graphics.updateVBO(
          options.renderPass.indexBuffer,
          0,
          0,
          0,
          undefined,
          true,
          options.renderPass.indexFormat,
        );
    };
    if (options.asyncCompilation)
      this.pendingCompilation.push(
        Promise.all(this.pendingCompilation).then(uploadInputs),
      );
    else uploadInputs();
  };
  addFunction = (func: Function | string) => {
    this.functions.push(func);
    for (const key of ["compute", "fragment", "vertex"]) {
      if (this.prototypes[key]?.funcStr)
        Object.assign(
          this.prototypes[key],
          WGSLTranspiler.convertToWebGPU(
            //just recompile the pipeline with current settings
            this.prototypes[key].funcStr,
            key as any,
            this.prototypes[key].bindGroupNumber,
            this.options?.workGroupSize,
            this.options?.renderPass?.vbos,
            this.functions,
            this.options?.variableTypes,
            this.options?.renderPass?.textures,
            undefined,
            undefined,
            {
              ...this.options.resourceBindings,
              ...this.options.shaderBindings?.[key],
            },
            key === "compute" ? this.options.workgroupVariables : undefined,
          ),
        );
    }
    this.init(this.prototypes, this.options);
  };

  generateShaderBoilerplate = (shaders, options) => {
    const vertex = WGSLTranspiler.convertToWebGPU(
      `function fullscreenVertex() {
            const corners = [vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3)];
            position = vec4f(corners[vertexIndex],0,1);
        }`,
      "vertex",
      options.bindGroupNumber,
      64,
      options.renderPass?.vbos as any,
    );
    return { ...shaders, vertex };
  };
  /** Release this helper's leases. Caller-owned devices, contexts and resources stay usable. */
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    for (const ctx of [this.compute, this.vertex, this.fragment])
      ctx?.dispose();
    this.registry.detach(this);
    this.bindGroups = [];
    this.bindGroupLayouts = [];
    this.bufferGroups = [];
  };
  /** Compatibility alias for dispose(). */
  cleanup = () => this.dispose();

  static flattenArray = flattenArray;

  //we're just assuming that for the default frag/vertex we may want colors, positions, normals, or uvs. If you define your entire own shader pipeline then this can be ignored
  static combineVertices = combineVertices;

  static splitVertices = splitVertices;
}

export class ShaderContext {
  entryPoints?: ShaderOptions["entryPoints"];
  constants?: ShaderOptions["constants"];
  asyncCompilation?: boolean;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  context: GPUCanvasContext;
  device: GPUDevice;
  helper: ShaderHelper;
  vertex?: ShaderContext; //The vertex shader context if this is a fragment shader

  code: string;
  header: string;
  ast: any[];

  params: Param[];

  funcStr: string;
  defaultUniforms: any;
  type: "compute" | "vertex" | "fragment";
  workGroupSize: WorkgroupSize = 64;
  returnedVars?: any[];

  functions;

  shaderModule?: GPUShaderModule;
  pipelineLayout?: GPUPipelineLayout;

  computePass?: ComputePassSettings;
  renderPass?: RenderPassSettings;

  computePipeline?: GPUComputePipeline;
  graphicsPipeline?: GPURenderPipeline;
  private localResources = new ResourceScope();
  private pointerInputs?: BuiltinInputs;
  getBuiltinInputs() {
    this.assertUsable();
    return (this.pointerInputs ||= new BuiltinInputs(this.canvas));
  }
  private closed = false;
  private assertUsable() {
    if (this.closed) throw new Error("This shader stage has been disposed");
    this.helper.assertUsable();
  }
  private depth: GPUTexture;
  get depthTexture() {
    return this.depth;
  }
  set depthTexture(texture: GPUTexture) {
    if (this.closed) throw new Error("This shader stage has been disposed");
    this.depth = this.localResources.set("depth", texture);
  }
  private multisample: GPUTexture;
  get multisampleTexture() {
    return this.multisample;
  }
  set multisampleTexture(texture: GPUTexture) {
    if (this.closed) throw new Error("This shader stage has been disposed");
    this.multisample = this.localResources.set("multisample", texture);
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.localResources.dispose();
    this.pointerInputs?.dispose();
    this.bindGroups = [];
    this.bindGroupLayouts = [];
    this.bufferGroups = [];
    this.computePipeline = undefined;
    this.graphicsPipeline = undefined;
  }

  private sampleCount = 1;
  private renderDepthFormat?: GPUTextureFormat;
  private renderColorFormats: GPUTextureFormat[] = [];
  private automaticColorAttachment = true;
  private automaticDepthAttachment = true;

  renderPassDescriptor: GPURenderPassDescriptor;

  indexBuffer: GPUBuffer;
  indexFormat: string;
  contextSettings: GPUCanvasConfiguration;

  altBindings: any;

  builtInUniforms: any;

  bufferGroup: BufferGroup;
  bufferGroups: BufferGroup[] = [];

  bindings?: ShaderOptions["bindings"];
  resources: ShaderResource[] = [];
  samplers?: ShaderOptions["samplers"];
  textureViews?: ShaderOptions["textureViews"];
  bindGroups: GPUBindGroup[] = [];
  externalBindGroups?: GPUBindGroup[];
  bindGroupLayouts: GPUBindGroupLayout[] = [];

  bindGroupNumber: number;
  bindGroupLayout: GPUBindGroupLayout;
  bindGroupLayoutEntries: GPUBindGroupLayoutEntry[];

  vertexBufferOptions: VertexBufferOptions[];
  private vertexComponents: number[] = [];

  constructor(props?) {
    Object.assign(this, props);

    const bIUCopy = {};
    for (const key in WGSLTranspiler.builtInUniforms) {
      bIUCopy[key] = Object.assign({}, WGSLTranspiler.builtInUniforms[key]);
    }

    this.builtInUniforms = bIUCopy;
  }

  createBindGroupEntries = (
    textures?: RenderPassSettings["textures"],
    group = this.bindGroupNumber,
    visibility = gpuConstants.GPUShaderStage.COMPUTE,
  ) => {
    const bufferGroup = this.bufferGroups[group] || this.makeBufferGroup(group);
    const entries = this.resources
      .filter((r) => r.group === group)
      .map((r) => {
        const stageVisibility =
          this.type === "compute"
            ? visibility
            : (this.helper.prototypes.vertex?.resources.some(
                (resource) =>
                  resource.group === r.group && resource.binding === r.binding,
              )
                ? gpuConstants.GPUShaderStage.VERTEX
                : 0) |
              (this.helper.prototypes.fragment?.resources.some(
                (resource) =>
                  resource.group === r.group && resource.binding === r.binding,
              )
                ? gpuConstants.GPUShaderStage.FRAGMENT
                : 0);
        const entry: any = {
          name: r.name,
          binding: r.binding,
          visibility: stageVisibility || visibility,
        };
        if (r.kind === "uniform") entry.buffer = { type: "uniform" };
        else if (r.kind === "buffer")
          entry.buffer = {
            type: r.access === "read_write" ? "storage" : "read-only-storage",
          };
        else if (r.kind === "sampler")
          entry.sampler = {
            type: r.type === "sampler_comparison" ? "comparison" : "filtering",
          };
        else if (r.type === "texture_external") entry.externalTexture = {};
        else {
          const dimension = r.type.includes("cube_array")
            ? "cube-array"
            : r.type.includes("cube")
              ? "cube"
              : r.type.includes("2d_array")
                ? "2d-array"
                : r.type.includes("3d")
                  ? "3d"
                  : r.type.includes("1d")
                    ? "1d"
                    : "2d";
          if (r.kind === "storageTexture") {
            const [format, access] = r.type
              .slice(r.type.indexOf("<") + 1, -1)
              .split(",")
              .map((s) => s.trim());
            entry.storageTexture = {
              format,
              access:
                access === "read"
                  ? "read-only"
                  : access === "read_write"
                    ? "read-write"
                    : "write-only",
              viewDimension: dimension,
            };
          } else
            entry.texture = {
              viewDimension: dimension,
              sampleType: r.type.includes("depth")
                ? "depth"
                : r.type.includes("<i32>")
                  ? "sint"
                  : r.type.includes("<u32>")
                    ? "uint"
                    : "float",
              multisampled: r.type.includes("multisampled"),
            };
          if (
            textures?.[r.name] &&
            !this.helper.resources.get(r.resource)?.texture
          )
            this.updateTexture(textures[r.name], r.name, group);
        }
        if (this.bindings?.[r.name]) {
          const override = this.bindings[r.name];
          if (override.binding !== undefined && override.binding !== r.binding)
            throw new Error(
              `Use resourceBindings or shaderBindings to change the binding for ${r.name}`,
            );
          Object.assign(entry, override);
        }
        return entry;
      });
    bufferGroup.bindGroupLayoutEntries = entries;
    if (group === this.bindGroupNumber) this.bindGroupLayoutEntries = entries;
    return entries as GPUBindGroupLayoutEntry[];
  };

  setBindGroupLayout = (entries: any[] = [], group = this.bindGroupNumber) => {
    const layout = this.device.createBindGroupLayout({
      entries: entries.map(({ name, resource, ...entry }) => entry),
    });
    this.bindGroupLayouts[group] = layout;
    if (group === this.bindGroupNumber) this.bindGroupLayout = layout;
    return layout;
  };
  updateTextures = (
    textures: RenderPassSettings["textures"],
    updateBindGroup = false,
    group = this.bindGroupNumber,
  ) => {
    return withResourceInputs(Object.values(textures || {}), () => {
      for (const [name, data] of Object.entries(textures || {})) {
        const resource = this.resources.find(
          (r) =>
            r.name === name &&
            (r.kind === "texture" || r.kind === "storageTexture"),
        );
        if (resource) this.updateTexture(data, name, resource.group);
      }
      if (updateBindGroup) this.updateBindGroup(group);
    });
  };

  updateTexture = (
    data: TextureInfo | ImageBitmap | any,
    name: string,
    group = this.bindGroupNumber,
  ) => {
    this.assertUsable();
    if (!data) return;
    const resource = this.resources.find(
      (r) => r.name === name && r.group === group,
    );
    if (!resource || !["texture", "storageTexture"].includes(resource.kind))
      throw new Error(`No texture named ${name} in group ${group}`);
    this.assertUsable();
    const record = this.helper.resources.get(resource.resource) || {};
    if (resource.type === "texture_external") {
      record.externalTexture =
        typeof GPUExternalTexture !== "undefined" &&
        data instanceof GPUExternalTexture
          ? data
          : this.device.importExternalTexture({
              source: data.source || data,
              colorSpace:
                typeof data.colorSpace === "string"
                  ? data.colorSpace
                  : undefined,
            });
      this.helper.resources.set(resource.resource, record);
      return true;
    }
    const source = data.source || (isMediaSource(data) ? data : undefined);
    const dimensions = source ? getMediaDimensions(source) : undefined;
    const width =
        (data === source ? dimensions?.width : data.width) ?? dimensions?.width,
      height =
        (data === source ? dimensions?.height : data.height) ??
        dimensions?.height ??
        1;
    const storage =
      resource.kind === "storageTexture" ||
      data.isStorage ||
      this.helper.linkedResources.some(
        (r) => r.resource === resource.resource && r.kind === "storageTexture",
      );
    const format =
      data.format ||
      resource.type.match(/texture_storage_\w+<([^,]+)/)?.[1] ||
      data.texture?.format ||
      "rgba8unorm";
    const provided =
      typeof data.createView === "function"
        ? data
        : typeof data.texture?.createView === "function"
          ? data.texture
          : undefined;
    if (provided) {
      this.helper.setTexture(resource.resource, record, provided);
    } else {
      if (!width || !height)
        throw new Error(
          `Texture ${name} requires a width and height or a GPUTexture`,
        );
      if (
        !record.texture ||
        record.texture.width !== width ||
        record.texture.height !== height ||
        record.texture.depthOrArrayLayers !== (data.depthOrArrayLayers || 1) ||
        record.texture.format !== format
      ) {
        const texture = this.device.createTexture({
          label: data.label || name,
          size: [width, height, data.depthOrArrayLayers || 1],
          format,
          usage:
            data.usage ??
            gpuConstants.GPUTextureUsage.TEXTURE_BINDING |
              gpuConstants.GPUTextureUsage.COPY_DST |
              gpuConstants.GPUTextureUsage.COPY_SRC |
              (storage ? gpuConstants.GPUTextureUsage.STORAGE_BINDING : 0) |
              (source ? gpuConstants.GPUTextureUsage.RENDER_ATTACHMENT : 0),
          dimension: resource.type.includes("3d")
            ? "3d"
            : resource.type.includes("1d")
              ? "1d"
              : "2d",
          ...(data.mipLevelCount ? { mipLevelCount: data.mipLevelCount } : {}),
          ...data.texture,
        });
        this.helper.setTexture(resource.resource, record, texture, true);
      }
    }
    const destination = {
      texture: record.texture,
      mipLevel: data.mipLevel ?? 0,
      origin: data.origin,
      aspect: data.aspect,
    };
    if (source)
      this.device.queue.copyExternalImageToTexture(
        { source, ...data.layout },
        destination,
        [width, height],
      );
    else if (data.buffer)
      this.device.queue.writeTexture(
        destination,
        data.buffer,
        {
          bytesPerRow: data.bytesPerRow || width * texelBytes(format),
          rowsPerImage: data.rowsPerImage || height,
          ...data.layout,
        },
        [width, height, data.depthOrArrayLayers || 1],
      );
    this.helper.resources.set(resource.resource, record);
    const bufferGroup = this.bufferGroups[group] || this.makeBufferGroup(group);
    bufferGroup.textures[name] = record.texture;
    return true;
  };
  setUBOposition = (
    view: DataView,
    typeInfo: { type: string; size: number; alignment: number },
    offset: number,
    input: any,
  ) => {
    offset = roundUp(offset, typeInfo.alignment);
    if (input !== undefined)
      writeValue(view, offset, typeInfo.type, input, floatToHalf);
    return offset + typeLayout(typeInfo.type).size;
  };

  updateArrayBuffers = (
    buffers: { [key: string]: any },
    updateBindGroup = false,
    group = this.bindGroupNumber,
  ) => {
    return withResourceInputs(Object.values(buffers || {}), () => {
      this.assertUsable();
      for (const [name, data] of Object.entries(buffers)) {
        const resource = this.resources.find(
          (r) => r.name === name && r.kind === "buffer" && r.group === group,
        );
        if (!resource)
          throw new Error(`No storage buffer named ${name} in group ${group}`);
        this.writeStorage(resource, data);
      }
      if (updateBindGroup) this.updateBindGroup(group);
    });
  };

  private writeUniform(
    resource: ShaderResource,
    updates: Record<string, any> = {},
  ) {
    this.assertUsable();
    const record = this.helper.resources.get(resource.resource) || {};
    const layout = uniformLayout(resource.fields);
    record.values ||= Object.fromEntries(
      resource.fields.map((f) => [f.name, f.defaultValue]),
    );
    Object.assign(
      record.values,
      Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined),
      ),
    );
    if (!record.buffer) {
      const buffer = this.device.createBuffer({
        label: resource.name,
        size: layout.size,
        usage:
          gpuConstants.GPUBufferUsage.UNIFORM |
          gpuConstants.GPUBufferUsage.COPY_DST |
          gpuConstants.GPUBufferUsage.COPY_SRC,
      });
      this.helper.setBuffer(resource.resource, record, buffer, true);
    }
    const view = new DataView(new ArrayBuffer(layout.size));
    layout.entries.forEach((field) =>
      writeValue(
        view,
        field.offset,
        field.type,
        record.values[field.name],
        floatToHalf,
      ),
    );
    this.device.queue.writeBuffer(record.buffer, 0, view.buffer);
    this.helper.resources.set(resource.resource, record);
    const group =
      this.bufferGroups[resource.group] || this.makeBufferGroup(resource.group);
    if (resource.name === "uniforms") {
      group.uniformBuffer = record.buffer;
      group.uniformBufferInputs = record.values;
      group.totalUniformBufferSize = layout.size;
      group.inputBuffers.uniform = record.buffer;
    } else if (resource.defaultUniforms)
      group.defaultUniformBuffer = record.buffer;
    return record.buffer;
  }

  updateUBO = (
    inputs: any[] | { [key: string]: any },
    _newBuffer = false,
    updateBindGroup = false,
    group = this.bindGroupNumber,
  ) => {
    const updates = Array.isArray(inputs)
      ? Object.fromEntries(
          this.params
            .filter((p) => p.isInput)
            .map((p, i) => [p.name, inputs[i]]),
        )
      : inputs;
    for (const resource of this.resources.filter(
      (r) => r.kind === "uniform" && !r.defaultUniforms && r.group === group,
    ))
      this.writeUniform(resource, updates);
    if (updateBindGroup) this.updateBindGroup(group);
  };

  updateDefaultUBO = (
    updateBindGroup = false,
    group = this.bindGroupNumber,
  ) => {
    this.resources
      .filter((r) => r.defaultUniforms && r.group === group)
      .forEach((r) =>
        this.writeUniform(
          r,
          Object.fromEntries(
            r.defaultUniforms.map((name) => [
              name,
              this.builtInUniforms[name].callback(this),
            ]),
          ),
        ),
      );
    if (updateBindGroup) this.updateBindGroup(group);
  };

  getUBODataView = (group = this.bindGroupNumber) => {
    const resource = this.resources.find(
      (r) => r.kind === "uniform" && !r.defaultUniforms && r.group === group,
    );
    if (!resource) throw new Error(`No uniform buffer in group ${group}`);
    return new DataView(new ArrayBuffer(uniformLayout(resource.fields).size));
  };
  allocateUBO = (group = this.bindGroupNumber) => {
    this.resources
      .filter(
        (r) => r.kind === "uniform" && !r.defaultUniforms && r.group === group,
      )
      .forEach((r) => this.writeUniform(r));
    return true;
  };
  updateVBO = (
    vertices: any,
    index = 0,
    bufferOffset = 0,
    dataOffset = 0,
    bindGroupNumber = this.bindGroupNumber,
    indexBuffer?: boolean,
    indexFormat?: "uint32" | "uint16",
  ) => {
    this.assertUsable();
    const group =
      this.bufferGroups[bindGroupNumber] ||
      this.makeBufferGroup(bindGroupNumber);
    uploadGeometry(
      this.device,
      this.localResources,
      group,
      vertices,
      index,
      bufferOffset,
      dataOffset,
      this.vertexComponents[index] || 4,
      !!indexBuffer,
      indexFormat,
    );
  };

  createRenderPipelineDescriptor = (
    vertexBufferOptions: VertexBufferOptions[] = [
      {
        color: "vec4<f32>",
      },
    ],
    swapChainFormat = navigator.gpu.getPreferredCanvasFormat(),
    renderPipelineDescriptor: RenderPipelineOverrides = {},
    shaderType: "fragment" | "vertex" = "fragment",
  ) => {
    //remember to just use your own render pipeline descriptor to avoid the assumptions we make;
    const vertexBuffers = [];
    let loc = 0;

    this.vertexBufferOptions = vertexBufferOptions.map((option) => ({
      ...option,
    }));

    this.vertexBufferOptions.forEach((opt, i) => {
      let arrayStride = 0;
      const attributes = [];

      let ct = 0;
      for (const key in opt) {
        if (key === "stepMode" || key === "__COUNT" || key === "vertices")
          continue;

        const attributeType = opt[key];
        if (typeof attributeType !== "string" || !WGSLTypeSizes[attributeType])
          throw new Error(
            `Vertex attribute ${key} needs a supported type string`,
          );
        const typeInfo = WGSLTypeSizes[attributeType];
        const format =
          Object.keys(typeInfo.vertexFormats).find((f) => {
            if (f.startsWith("float32")) return true;
          }) || Object.keys(typeInfo.vertexFormats)[0];
        ct += typeInfo.ct;

        attributes.push({
          format,
          offset: arrayStride,
          shaderLocation: loc,
        });

        arrayStride += typeInfo.size;
        loc++;
      }

      this.vertexComponents[i] = ct;

      const vtxState = {
        arrayStride,
        attributes,
      } as any;

      if (opt.stepMode) vtxState.stepMode = opt.stepMode;

      vertexBuffers.push(vtxState);
    });

    // 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
    // const vertexBuffers = Array.from({length:vertexBufferOptions.length}, (_,i) => {
    //     return {
    //         arrayStride: 52,
    //         attributes: [
    //             {format: "float32x4", offset: 0,  shaderLocation:  4*i},   //vertex vec4
    //             {format: "float32x4", offset: 16, shaderLocation:  4*i+1}, //color vec4
    //             {format: "float32x2", offset: 32, shaderLocation:  4*i+2}, //uv vec2
    //             {format: "float32x3", offset: 40, shaderLocation:  4*i+3}  //normal vec3
    //         ]
    //     }
    // });

    let desc = {
      //https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/createRenderPipeline
      label: "renderPipeline",
      layout: this.pipelineLayout ? this.pipelineLayout : "auto",
      vertex:
        shaderType === "fragment"
          ? {
              //if using only the vertex buffer use a different descriptor
              module: this.vertex.shaderModule,
              entryPoint: this.entryPoints?.vertex || "vtx_main",
              constants: this.constants?.vertex,
              buffers: vertexBuffers,
            }
          : {
              module: this.shaderModule,
              entryPoint: this.entryPoints?.vertex || "vtx_main",
              constants: this.constants?.vertex,
              targets: [
                {
                  format: swapChainFormat,
                },
              ],
            },
      fragment:
        shaderType === "fragment"
          ? {
              module: this.shaderModule,
              entryPoint: this.entryPoints?.fragment || "frag_main",
              constants: this.constants?.fragment,
              targets: [
                {
                  format: swapChainFormat,
                },
              ],
            }
          : undefined,
      depthStencil: {
        format: "depth24plus",
        depthWriteEnabled: true,
        depthCompare: "less",
      },
    } as GPURenderPipelineDescriptor;
    return {
      ...desc,
      ...renderPipelineDescriptor,
      vertex: { ...desc.vertex, ...renderPipelineDescriptor.vertex },
      depthStencil:
        Object.prototype.hasOwnProperty.call(
          renderPipelineDescriptor,
          "depthStencil",
        ) && renderPipelineDescriptor.depthStencil === undefined
          ? undefined
          : { ...desc.depthStencil, ...renderPipelineDescriptor.depthStencil },
      fragment:
        desc.fragment || renderPipelineDescriptor.fragment
          ? { ...desc.fragment, ...renderPipelineDescriptor.fragment }
          : undefined,
    } as GPURenderPipelineDescriptor;
  };

  createRenderPassDescriptor = () => {
    //const view = (this.context as GPUCanvasContext)?.getCurrentTexture().createView();
    const depthTexture = this.renderDepthFormat
      ? this.device.createTexture({
          //allows 3D rendering
          size: [this.canvas.width, this.canvas.height],
          format: this.renderDepthFormat || "depth24plus",
          sampleCount: this.sampleCount,
          usage: gpuConstants.GPUTextureUsage.RENDER_ATTACHMENT,
        })
      : undefined;

    this.depthTexture = this.localResources.set("depth", depthTexture, true);

    return {
      //some assumptions. todo: unassume
      colorAttachments: [
        {
          view: undefined, //view,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
          loadOp: "clear",
          storeOp: "store", //discard
        },
      ],
      depthStencilAttachment: this.renderDepthFormat
        ? {
            view: undefined,
            depthLoadOp: "clear",
            depthClearValue: 1.0,
            depthStoreOp: "store", //discard
            ...(this.renderDepthFormat.includes("stencil")
              ? {
                  stencilLoadOp: "clear" as const,
                  stencilStoreOp: "store" as const,
                  stencilClearValue: 0,
                }
              : {}),
            // stencilLoadOp: "clear",
            // stencilClearValue: 0,
            // stencilStoreOp: "store"
          }
        : undefined,
    } as GPURenderPassDescriptor;
  };

  updateGraphicsPipeline = (
    vertexBufferOptions: VertexBufferOptions[] = [
      {
        color: "vec4<f32>",
      },
    ],
    contextSettings?: GPUCanvasConfiguration,
    renderPipelineDescriptor?: RenderPipelineOverrides,
    renderPassDescriptor?: GPURenderPassDescriptor,
    shaderType: "fragment" | "vertex" = "fragment",
    asynchronous = false,
  ) => {
    this.assertUsable();
    // Setup render outputs
    this.contextSettings = contextSettings;
    const swapChainFormat =
      contextSettings?.format || navigator.gpu.getPreferredCanvasFormat();

    (this.context as GPUCanvasContext)?.configure(
      contextSettings
        ? contextSettings
        : {
            device: this.device,
            format: swapChainFormat,
            //usage: gpuConstants.GPUTextureUsage.RENDER_ATTACHMENT,
            alphaMode: "premultiplied",
          },
    );

    renderPipelineDescriptor = this.createRenderPipelineDescriptor(
      vertexBufferOptions,
      swapChainFormat,
      renderPipelineDescriptor,
      shaderType,
    );

    this.sampleCount = renderPipelineDescriptor.multisample?.count ?? 1;
    this.renderDepthFormat = renderPipelineDescriptor.depthStencil?.format;
    this.renderColorFormats = Array.from(
      renderPipelineDescriptor.fragment?.targets || [],
      (target) => target?.format,
    );
    if (!renderPassDescriptor)
      renderPassDescriptor = this.createRenderPassDescriptor();
    this.automaticColorAttachment =
      Array.from(renderPassDescriptor.colorAttachments).length > 0 &&
      !Array.from(renderPassDescriptor.colorAttachments)[0]?.view;
    this.automaticDepthAttachment =
      !!renderPassDescriptor.depthStencilAttachment &&
      !renderPassDescriptor.depthStencilAttachment.view;
    this.renderPassDescriptor = renderPassDescriptor;

    if (asynchronous && this.device.createRenderPipelineAsync)
      return this.device
        .createRenderPipelineAsync(
          renderPipelineDescriptor as GPURenderPipelineDescriptor,
        )
        .then((pipeline) => {
          if (!this.closed) this.graphicsPipeline = pipeline;
        });
    this.graphicsPipeline = this.device.createRenderPipeline(
      renderPipelineDescriptor as GPURenderPipelineDescriptor,
    );

    // const canvasView = this.device.createTexture({
    //     size: [this.canvas.width, this.canvas.height],
    //     sampleCount:4,
    //     format: navigator.gpu.getPreferredCanvasFormat(),
    //     usage: gpuConstants.GPUTextureUsage.RENDER_ATTACHMENT,
    // });
  };

  makeBufferGroup = (group = this.bindGroupNumber) => {
    const result: BufferGroup = {
      params: this.params.filter((p) => Number(p.group) === group),
      returnedVars: this.returnedVars || [],
      inputBuffers: {},
      outputBuffers: {},
      textures: {},
      samplers: {},
      uniformBufferInputs: {},
      inputTypes: {},
      defaultUniforms: this.defaultUniforms,
      bindGroupLayoutEntries: [],
    };
    this.bufferGroups[group] = result;
    if (group === this.bindGroupNumber || !this.bufferGroup)
      this.bufferGroup = result;
    return result;
  };

  private writeStorage(resource: ShaderResource, data?: any) {
    this.assertUsable();
    const record = this.helper.resources.get(resource.resource) || {};
    if (isGPUBuffer(data))
      this.helper.setBuffer(resource.resource, record, data);
    else if (data !== undefined || !record.buffer) {
      const bytes = storageData(data, resource.type);
      if (data !== undefined && bytes.byteLength === 0)
        throw new Error(
          `Storage buffer "${resource.name}" cannot be empty; skip GPU work for empty datasets`,
        );
      const size = Math.max(
        4,
        storageElementLayout(resource.type)?.stride || 0,
        roundUp(bytes.byteLength, 4),
      );
      if (!record.buffer || record.buffer.size !== size) {
        const buffer = this.device.createBuffer({
          label: resource.name,
          size,
          usage:
            gpuConstants.GPUBufferUsage.STORAGE |
            gpuConstants.GPUBufferUsage.COPY_DST |
            gpuConstants.GPUBufferUsage.COPY_SRC |
            gpuConstants.GPUBufferUsage.VERTEX,
        });
        this.helper.setBuffer(resource.resource, record, buffer, true);
      }
      if (bytes.byteLength)
        this.device.queue.writeBuffer(
          record.buffer,
          0,
          bytes.buffer as ArrayBuffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
    }
    this.helper.resources.set(resource.resource, record);
    const group =
      this.bufferGroups[resource.group] || this.makeBufferGroup(resource.group);
    group.inputBuffers[resource.name] = record.buffer;
    return record.buffer;
  }

  buffer = (
    settings: Partial<RenderPassSettings & ComputePassSettings> = {},
    ...inputs: (ShaderInput | undefined)[]
  ) => {
    return withResourceInputs(
      [
        ...inputs,
        ...Object.values(settings.inputs || {}),
        ...Object.values(settings.textures || {}),
        ...(settings.vbos || []),
        settings.indexBuffer,
      ],
      () => {
        this.assertUsable();
        if (settings.inputs !== undefined) {
          if (
            !settings.inputs ||
            typeof settings.inputs !== "object" ||
            Array.isArray(settings.inputs)
          )
            throw new Error(
              "settings.inputs must be an object keyed by shader parameter names",
            );
          if (inputs.length)
            throw new Error(
              "Supply named inputs in settings.inputs or positional arguments, not both",
            );
          const params = this.params.filter((p) => p.isInput);
          const names = new Set(params.map((p) => p.name));
          for (const resource of this.resources.filter(
            (r) => r.kind !== "uniform",
          ))
            names.add(resource.name);
          for (const name of Object.keys(settings.inputs))
            if (!names.has(name))
              throw new Error(
                `Unknown ${this.type} input "${name}". Shader inputs: ${[...names].join(", ") || "(none)"}`,
              );
          inputs = params.map((p) => settings.inputs[p.name]);
        }
        const groupNumber = settings.bindGroupNumber ?? this.bindGroupNumber;
        const group =
          this.bufferGroups[groupNumber] || this.makeBufferGroup(groupNumber);
        if (settings.vbos)
          settings.vbos.forEach((vbo: any, i) =>
            this.updateVBO(vbo?.vertices || vbo, i, 0, 0, groupNumber),
          );
        if (settings.indexBuffer)
          this.updateVBO(
            settings.indexBuffer,
            0,
            0,
            0,
            groupNumber,
            true,
            settings.indexFormat,
          );
        const values = new Map<string, Record<string, any>>();
        this.params
          .filter((p) => p.isInput)
          .forEach((p, i) => {
            const record = values.get(p.resource) || {};
            record[p.name] = inputs[i];
            values.set(p.resource, record);
          });
        if (settings.textures) this.updateTextures(settings.textures);
        for (const resource of this.resources) {
          const named = values.get(resource.resource) || {};
          if (
            settings.inputs &&
            Object.prototype.hasOwnProperty.call(settings.inputs, resource.name)
          )
            named[resource.name] = settings.inputs[resource.name];
          const target =
            this.bufferGroups[resource.group] ||
            this.makeBufferGroup(resource.group);
          // Supplied native bindings own their packing and lifetime.
          if (
            this.bindings?.[resource.name]?.resource ||
            this.externalBindGroups?.[resource.group]
          )
            continue;
          if (resource.kind === "buffer") {
            const buffer = this.writeStorage(resource, named[resource.name]);
            if (
              !settings.skipOutputDef &&
              this.params.some((p) => p.name === resource.name && p.isReturned)
            )
              group.outputBuffers[resource.name] = buffer;
          } else if (resource.kind === "uniform") {
            if (resource.defaultUniforms)
              this.writeUniform(
                resource,
                Object.fromEntries(
                  resource.defaultUniforms.map((name) => [
                    name,
                    this.builtInUniforms[name].callback(this),
                  ]),
                ),
              );
            else this.writeUniform(resource, named);
          } else if (resource.kind === "sampler") {
            let record = this.helper.resources.get(resource.resource);
            if (named[resource.name] !== undefined) {
              const supplied = named[resource.name];
              record = {
                sampler:
                  typeof GPUSampler !== "undefined" &&
                  supplied instanceof GPUSampler
                    ? supplied
                    : this.device.createSampler(supplied),
              };
              this.helper.resources.set(resource.resource, record);
            }
            if (!record?.sampler) {
              const settings = this.samplers?.[resource.name];
              const layout = this.bindings?.[resource.name]?.sampler;
              const descriptor: GPUSamplerDescriptor =
                resource.type === "sampler_comparison"
                  ? { compare: "less" }
                  : layout?.type === "non-filtering"
                    ? {}
                    : { magFilter: "linear", minFilter: "linear" };
              record = {
                sampler:
                  typeof GPUSampler !== "undefined" &&
                  settings instanceof GPUSampler
                    ? settings
                    : this.device.createSampler({ ...descriptor, ...settings }),
              };
              this.helper.resources.set(resource.resource, record);
            }
            target.samplers[resource.name] = record.sampler;
          } else {
            if (named[resource.name] !== undefined)
              this.updateTexture(
                named[resource.name],
                resource.name,
                resource.group,
              );
            const texture = this.helper.resources.get(
              resource.resource,
            )?.texture;
            if (texture) target.textures[resource.name] = texture;
          }
        }
        if (settings.outputVBOs)
          group.vertexBuffers?.forEach(
            (vbo, i) => (group.outputBuffers[`vbo${i}`] = vbo),
          );
        if (settings.outputTextures)
          Object.assign(group.outputBuffers, group.textures);
        for (let index = 0; index < this.bindGroupLayouts.length; index++)
          this.updateBindGroup(index);
        return true;
      },
    );
  };

  updateBindGroup = (
    group = this.bindGroupNumber,
    custom?: GPUBindGroupEntry[],
  ) => {
    if (!this.bindGroupLayouts[group]) return;
    if (this.externalBindGroups?.[group] && !custom) {
      this.bindGroups[group] = this.externalBindGroups[group];
      return;
    }
    const resources = this.resources.filter((r) => r.group === group);
    const bufferGroup = this.bufferGroups[group] || this.makeBufferGroup(group);
    const identities = resources.map((r) => {
      const record = this.helper.resources.get(r.resource);
      return (
        this.bindings?.[r.name]?.resource ||
        record?.buffer ||
        record?.texture ||
        record?.sampler ||
        record?.externalTexture
      );
    });
    if (
      !custom &&
      bufferGroup.bindGroup &&
      (bufferGroup as any).identities?.every(
        (value, i) => value === identities[i],
      ) &&
      (bufferGroup as any).identities.length === identities.length
    )
      return;
    const entries: GPUBindGroupEntry[] = resources.map((r) => {
      const record = this.helper.resources.get(r.resource);
      const override = this.bindings?.[r.name]?.resource;
      let resource: GPUBindingResource =
        override ||
        (r.kind === "buffer" || r.kind === "uniform"
          ? record?.buffer
            ? { buffer: record.buffer }
            : undefined
          : r.kind === "sampler"
            ? record?.sampler
            : r.type === "texture_external"
              ? record?.externalTexture
              : record?.texture?.createView(this.textureViews?.[r.name]));
      if (!resource)
        throw new Error(
          `Missing ${r.kind} resource "${r.name}" at @group(${r.group}) @binding(${r.binding}); provide it before running this shader`,
        );
      return { binding: r.binding, resource };
    });
    if (custom)
      custom.forEach((entry) => {
        const index = entries.findIndex((e) => e.binding === entry.binding);
        if (index < 0) entries.push(entry);
        else entries[index] = entry;
      });
    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayouts[group],
      entries,
    });
    bufferGroup.bindGroup = bindGroup;
    (bufferGroup as any).identities = identities;
    this.bindGroups[group] = bindGroup;
  };
  getOutputData = <Buffers extends boolean = false>(
    encoder: GPUCommandEncoder,
    outputs: ReadbackOutputs = this.bufferGroups[this.bindGroupNumber]
      ?.outputBuffers || {},
    returnBuffers: Buffers = false as Buffers,
  ) => {
    this.assertUsable();
    return readGPUOutputs(
      this.device,
      encoder,
      outputs,
      this.resources,
      returnBuffers,
    );
  };
  //bound to the shader scope. Todo: make this more robust for passing values for specific vertexbuffers or say texturebuffers etc
  run = (
    {
      vertexCount,
      instanceCount,
      firstVertex,
      firstInstance,
      vbos,
      outputVBOs,
      textures,
      outputTextures,
      bufferOnly,
      skipOutputDef,
      returnBuffers,
      bindGroupNumber,
      viewport,
      scissorRect,
      blendConstant,
      indexBuffer,
      indexFormat,
      indexCount,
      firstIndex,
      baseVertex,
      stencilReference,
      useRenderBundle,
      workgroupsX,
      workgroupsY,
      workgroupsZ,
      newBindings,
      commandEncoder: suppliedEncoder,
      inputs: namedInputs,
      dynamicOffsets,
      descriptor,
      indirect,
      occlusionQueryIndex,
    }: RenderPassSettings &
      ComputePassSettings & { returnBuffers?: boolean } = {} as any,
    ...inputs: (ShaderInput | undefined)[]
  ) => {
    // Default bind group
    bindGroupNumber ??= this.bindGroupNumber;

    // Prepare input buffers
    const newInputBuffer = this._allocateInputs(
      {
        vbos,
        textures,
        indexBuffer,
        indexFormat,
        skipOutputDef,
        bindGroupNumber,
        outputVBOs,
        outputTextures,
        newBindings,
        inputs: namedInputs,
      },
      ...inputs,
    );

    if (bufferOnly) return;

    const bufferGroup = this._ensureBufferGroup(bindGroupNumber);
    if (
      suppliedEncoder &&
      !skipOutputDef &&
      Object.keys(bufferGroup.outputBuffers || {}).length
    )
      throw new Error(
        "External command encoders require skipOutputDef:true; submit the encoder before reading results",
      );
    const commandEncoder =
      suppliedEncoder || this.device.createCommandEncoder();

    // Compute pass
    if (this.computePipeline) {
      this._executeCompute(
        commandEncoder,
        bindGroupNumber,
        workgroupsX,
        workgroupsY,
        workgroupsZ,
        descriptor,
        indirect,
        dynamicOffsets,
      );
    }

    // Graphics pass
    if (this.graphicsPipeline) {
      this._executeGraphics(
        commandEncoder,
        bufferGroup,
        {
          vertexCount,
          instanceCount,
          firstVertex,
          firstInstance,
          indexFormat,
          indexCount,
          firstIndex,
          baseVertex,
          indirect,
        },
        {
          viewport,
          scissorRect,
          blendConstant,
          useRenderBundle,
          newInputBuffer,
          occlusionQueryIndex,
          stencilReference,
          dynamicOffsets,
        },
      );
    }

    // Finish and output
    return this._finalize(
      commandEncoder,
      bufferGroup,
      skipOutputDef,
      returnBuffers,
      !suppliedEncoder,
    );
  };

  // Private helpers

  _allocateInputs(settings: any, ...inputs: (ShaderInput | undefined)[]) {
    return this.buffer(settings, ...inputs);
  }

  _ensureBufferGroup(bindGroupNumber) {
    let group = this.bufferGroups[bindGroupNumber];
    if (!group) {
      group = this.makeBufferGroup(bindGroupNumber);
    }
    return group;
  }

  _executeCompute(
    commandEncoder,
    bindGroupNumber,
    wX,
    wY,
    wZ,
    descriptor?,
    indirect?: ComputePassSettings["indirect"],
    dynamicOffsets?: Record<number, number[]>,
  ) {
    const pass = commandEncoder.beginComputePass(descriptor);
    pass.setPipeline(this.computePipeline);
    this.bindGroups.forEach((group, i) => {
      if (group) pass.setBindGroup(i, group, dynamicOffsets?.[i] || []);
    });

    if (indirect) {
      pass.dispatchWorkgroupsIndirect(indirect.buffer, indirect.offset ?? 0);
      pass.end();
      return;
    }
    const firstResource = this.resources.find((r) => r.kind === "buffer");
    const firstBuf =
      firstResource &&
      this.helper.resources.get(firstResource.resource)?.buffer;
    const stride = storageElementLayout(firstResource?.type || "")?.stride || 4;
    const shape = workgroupDimensions(this.workGroupSize);
    if ((shape[1] > 1 || shape[2] > 1) && wX === undefined)
      throw new Error(
        "Multidimensional workgroups need explicit computePass.workgroupsX/Y/Z dispatch counts",
      );
    const dispatchX =
      wX ?? (firstBuf ? Math.ceil(firstBuf.size / stride / shape[0]) : 1);
    pass.dispatchWorkgroups(dispatchX, wY ?? 1, wZ ?? 1);
    pass.end();
  }

  _executeGraphics(commandEncoder, bufferGroup, drawParams, renderOptions) {
    const {
      vertexCount,
      instanceCount,
      firstVertex,
      firstInstance,
      indexCount,
      indexFormat,
      firstIndex,
      baseVertex,
      indirect,
    } = drawParams;
    const {
      viewport,
      scissorRect,
      blendConstant,
      useRenderBundle,
      newInputBuffer,
      occlusionQueryIndex,
      stencilReference,
      dynamicOffsets,
    } = renderOptions;

    for (const [i, buffer] of (bufferGroup.vertexBuffers || []).entries())
      if (buffer) this.localResources.set(`vertex:${i}`, buffer);
    if (bufferGroup.indexBuffer)
      this.localResources.set("index", bufferGroup.indexBuffer);
    // Update count
    bufferGroup.vertexCount = vertexCount ?? bufferGroup.vertexCount ?? 1;

    this._prepareRenderTargets();
    const renderPass = commandEncoder.beginRenderPass(
      this.renderPassDescriptor,
    );
    const pass = useRenderBundle
      ? this.device.createRenderBundleEncoder({
          colorFormats: this.renderColorFormats,
          depthStencilFormat: this.renderDepthFormat,
          sampleCount: this.sampleCount,
        })
      : renderPass;
    // Bind pipeline and groups
    pass.setPipeline(this.graphicsPipeline);
    this.bindGroups.forEach((group, i) => {
      if (group) {
        pass.setBindGroup(i, group, dynamicOffsets?.[i] || []);
      }
    });

    (this.vertexBufferOptions || []).forEach((vbo, index) => {
      if (!bufferGroup.vertexBuffers?.[index]) {
        const count =
          vbo.stepMode === "instance"
            ? instanceCount || 1
            : bufferGroup.vertexCount;
        this.updateVBO(
          new Float32Array(count * (this.vertexComponents[index] || 4)),
          index,
        );
      }
    });
    bufferGroup.vertexBuffers?.forEach((vbo, i) =>
      pass.setVertexBuffer(i, vbo),
    );
    // Set dynamic states
    {
      if (viewport)
        renderPass.setViewport(
          viewport.x,
          viewport.y,
          viewport.width,
          viewport.height,
          viewport.minDepth ?? 0,
          viewport.maxDepth ?? 1,
        );
      if (scissorRect)
        renderPass.setScissorRect(
          scissorRect.x,
          scissorRect.y,
          scissorRect.width,
          scissorRect.height,
        );
      if (blendConstant) renderPass.setBlendConstant(blendConstant);
      if (stencilReference !== undefined)
        renderPass.setStencilReference(stencilReference);
    }

    // Draw call
    if (occlusionQueryIndex !== undefined)
      renderPass.beginOcclusionQuery(occlusionQueryIndex);
    if (indirect) {
      if (bufferGroup.indexBuffer) {
        pass.setIndexBuffer(
          bufferGroup.indexBuffer,
          indexFormat ?? bufferGroup.indexFormat,
        );
        pass.drawIndexedIndirect(indirect.buffer, indirect.offset ?? 0);
      } else pass.drawIndirect(indirect.buffer, indirect.offset ?? 0);
    } else if (bufferGroup.indexBuffer) {
      pass.setIndexBuffer(
        bufferGroup.indexBuffer,
        indexFormat ?? bufferGroup.indexFormat,
      );
      pass.drawIndexed(
        indexCount ?? bufferGroup.indexCount,
        instanceCount,
        firstIndex,
        baseVertex ?? 0,
        firstInstance,
      );
    } else {
      pass.draw(
        bufferGroup.vertexCount,
        instanceCount,
        firstVertex,
        firstInstance,
      );
    }

    if (useRenderBundle) {
      bufferGroup.renderBundle = (pass as GPURenderBundleEncoder).finish();
      renderPass.executeBundles([bufferGroup.renderBundle]);
    }
    if (occlusionQueryIndex !== undefined) renderPass.endOcclusionQuery();
    renderPass.end();
  }

  _prepareRenderTargets() {
    if (this.automaticColorAttachment) {
      const canvasTexture = (
        this.context as GPUCanvasContext
      )?.getCurrentTexture();
      if (!canvasTexture)
        throw new Error(
          "Rendering needs a canvas context or explicit renderPassDescriptor attachment views",
        );
      const attachment = this.renderPassDescriptor.colorAttachments[0];
      if (this.sampleCount > 1) {
        if (
          !this.multisampleTexture ||
          this.multisampleTexture.width !== canvasTexture.width ||
          this.multisampleTexture.height !== canvasTexture.height
        ) {
          this.multisampleTexture = this.localResources.set(
            "multisample",
            this.device.createTexture({
              size: [canvasTexture.width, canvasTexture.height],
              format: canvasTexture.format,
              sampleCount: this.sampleCount,
              usage: gpuConstants.GPUTextureUsage.RENDER_ATTACHMENT,
            }),
            true,
          );
        }
        attachment.view = this.multisampleTexture.createView();
        attachment.resolveTarget = canvasTexture.createView();
      } else attachment.view = canvasTexture.createView();
    }
    if (this.automaticDepthAttachment) {
      if (
        !this.depthTexture ||
        this.depthTexture.width !== this.canvas.width ||
        this.depthTexture.height !== this.canvas.height
      ) {
        this.depthTexture = this.localResources.set(
          "depth",
          this.device.createTexture({
            size: [this.canvas.width, this.canvas.height],
            format: this.renderDepthFormat,
            sampleCount: this.sampleCount,
            usage: gpuConstants.GPUTextureUsage.RENDER_ATTACHMENT,
          }),
          true,
        );
      }
      this.renderPassDescriptor.depthStencilAttachment.view =
        this.depthTexture.createView();
    }
  }

  _finalize(
    commandEncoder,
    bufferGroup,
    skipOutputDef,
    returnBuffers,
    submit = true,
  ) {
    if (!submit) return Promise.resolve(true);
    if (
      !skipOutputDef &&
      bufferGroup.outputBuffers &&
      Object.keys(bufferGroup.outputBuffers).length
    ) {
      return this.getOutputData(
        commandEncoder,
        bufferGroup.outputBuffers,
        returnBuffers,
      );
    }
    this.device.queue.submit([commandEncoder.finish()]);
    return Promise.resolve(true);
  }
}
