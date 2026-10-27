import type { ShaderHelper } from "./shader.js";
export type ShaderStage = "compute" | "vertex" | "fragment";
export type WorkgroupSize = number | readonly [number, number?, number?];

/** Numeric storage readback preserves the shader's f32, i32, u32 or f16 representation. */
export type StorageArray =
  | Float32Array
  | Int32Array
  | Uint32Array
  | Uint16Array;
export type ShaderReadback = StorageArray | Uint8Array;
/** Host inputs may contain numeric data, existing GPU resources or image/video sources. */
export type ShaderInput =
  | number
  | readonly number[]
  | readonly (readonly number[])[]
  | ArrayBufferLike
  | ArrayBufferView
  | GPUBuffer
  | GPUTexture
  | GPUExternalTexture
  | GPUSampler
  | GPUCopyExternalImageSource
  | TextureInfo;
export type ShaderInputs = Record<string, ShaderInput | undefined>;
/** Shared factory options, including native compute and render descriptor overrides. */
export type PipelineOptions = ShaderOptions & ComputeOptions & RenderOptions;

/** Interleaved attributes plus optional uploaded data and instance/vertex stepping. */
export type VertexBufferOptions = {
  vertices?: Float32Array | GPUBuffer;
  stepMode?: GPUVertexStepMode;
  [attribute: string]: string | Float32Array | GPUBuffer | undefined;
};

export type ShaderSourceDescriptor = {
  code: Function | string;
  transpileString?: boolean;
  /** Native shader entry point; options.entryPoints takes precedence. */
  entryPoint?: string;
  /** Native specialization defaults; options.constants takes precedence. */
  constants?: Record<string, number>;
};
/** Functions are JavaScript; strings are WGSL unless transpileString is true. */
export type ShaderSource = Function | string | ShaderSourceDescriptor;

/** A resource name shares an allocation; group/binding select a shader's slot. */
export type ShaderBinding = {
  group?: number;
  binding?: number;
  resource?: string;
  type?: string;
  access?: "read" | "read_write" | "write";
};

export type ShaderResource = {
  name: string;
  group: number;
  binding: number;
  type: string;
  kind: "buffer" | "uniform" | "texture" | "storageTexture" | "sampler";
  access?: string;
  resource?: string;
  explicit?: boolean;
  fields?: {
    name: string;
    type: string;
    defaultValue?: any;
    align?: number;
    size?: number;
  }[];
  defaultUniforms?: string[];
  storageWrapper?: boolean;
};

export type ShaderOptions = {
  /** Native WGSL entry points; generated stages use their conventional defaults. */
  entryPoints?: Partial<Record<ShaderStage, string>>;
  /** Native WGSL override constants, separately for each stage. */
  constants?: Partial<Record<ShaderStage, Record<string, number>>>;
  /** Factory-created pipelines compile asynchronously by default. Set false for synchronous construction. */
  asyncCompilation?: boolean;
  samplers?: { [name: string]: GPUSamplerDescriptor | GPUSampler };
  /** Per-shader native texture views, including array layers and mip ranges. */
  textureViews?: Record<string, GPUTextureViewDescriptor>;
  resourceBindings?: { [name: string]: ShaderBinding };
  shaderBindings?: Partial<
    Record<ShaderStage, { [name: string]: ShaderBinding }>
  >;
  device?: GPUDevice;
  prependCode?: string;
  bindGroupNumber?: number;
  previousPipeline?: ShaderHelper;
  functions?: (Function | string)[];
  /** Compute-only shared memory, e.g. { scratch: "array<f32,64>" }. */
  workgroupVariables?: Record<string, string>;
  variableTypes?: { [key: string]: string | { prefix?: string; type: string } }; //we can skip the implicit typing of the bindings and set them ourselves e.g. tex1:'texture_2d' or tex1:{prefix:'var', type:'texture_2d'} etc.
  inputs?: (ShaderInput | undefined)[];
  bindGroupLayouts?: GPUBindGroupLayout[];
  bindGroups?: GPUBindGroup[];
  bindings?: {
    [key: string]: Partial<GPUBindGroupLayoutEntry> & {
      resource?: GPUBindingResource;
    };
  };
  lastBinding?: number;
  params?: Param[];
  bufferGroups?: BufferGroup[];
  skipCombinedBindings?: boolean;
};

export type RenderOptions = {
  canvas?: HTMLCanvasElement | OffscreenCanvas;
  context?: GPUCanvasContext;
  contextSettings?: GPUCanvasConfiguration;
  renderPipelineDescriptor?: RenderPipelineOverrides;
  renderPassDescriptor?: GPURenderPassDescriptor;
  /** @deprecated Use renderPipelineDescriptor. */
  renderPipelineSettings?: RenderPipelineOverrides;
  renderPass?: RenderPassSettings;
};

/** Stage overrides keep the generated modules/entry points unless explicitly replaced. */
export type RenderPipelineOverrides = Omit<
  Partial<GPURenderPipelineDescriptor>,
  "vertex" | "fragment" | "depthStencil"
> & {
  depthStencil?: Partial<GPUDepthStencilState>;
  vertex?: Partial<GPUVertexState>;
  fragment?: Partial<GPUFragmentState>;
};

export type ComputeOptions = {
  workGroupSize?: WorkgroupSize;
  computePipelineSettings?: Partial<GPUComputePipelineDescriptor>;
  computePass?: ComputePassSettings;
};

export type ShaderPassSettings = {
  /** Named shader parameters. Omitted fields retain their current GPU values. */
  inputs?: ShaderInputs;
  dynamicOffsets?: Record<number, number[]>;
  /** Encode into a caller-owned command buffer. Suppress readback, then submit it yourself. */
  commandEncoder?: GPUCommandEncoder;
  bufferOnly?: boolean;
  skipOutputDef?: boolean;
  bindGroupNumber?: number; //can buffer specific bindGroupNumbers
};

export type RenderPassSettings = {
  indirect?: { buffer: GPUBuffer; offset?: number };
  occlusionQueryIndex?: number;
  vertexCount?: number;
  instanceCount?: number;
  firstVertex?: number;
  firstInstance?: number;
  viewport?: {
    x: number;
    y: number;
    width: number;
    height: number;
    minDepth?: number;
    maxDepth?: number;
  };
  scissorRect?: { x: number; y: number; width: number; height: number };
  blendConstant?: GPUColor;
  indexBuffer?: Uint16Array | Uint32Array | number[] | GPUBuffer;
  indexFormat?: "uint16" | "uint32"; //uint16 or uint32
  /** Override the index count, e.g. when a native buffer contains padding or unused capacity. */
  indexCount?: number;
  firstIndex?: number;
  baseVertex?: number;
  stencilReference?: number;
  useRenderBundle?: boolean;
  vbos?: (
    | VertexBufferOptions
    //array of objects that specify vertices optionally plus the key value
    // pairs in the interleaved vertex buffer structs
    | Float32Array
    | GPUBuffer
  )[];
  outputVBOs?: boolean;
  textures?: {
    [key: string]:
      | TextureInfo
      | GPUCopyExternalImageSource
      | GPUTexture
      | GPUExternalTexture
      | VideoFrame
      | HTMLVideoElement;
  };
  outputTextures?: boolean;
  newBindings?: boolean;
} & ShaderPassSettings;

export type ComputePassSettings = {
  /** Native descriptor, including optional timestampWrites. */
  descriptor?: GPUComputePassDescriptor;
  indirect?: { buffer: GPUBuffer; offset?: number };
  workgroupsX?: number;
  workgroupsY?: number;
  workgroupsZ?: number;
} & ShaderPassSettings;

export type Param = {
  /** Reflected WGSL type, such as f32, vec4<f32> or array<u32>. */
  type: string;
  name: string;
  value: string;
  isInput: boolean;
  length?: number;
  isReturned: boolean;
  isModified: boolean;
  isUniform?: boolean;
  resource?: string;

  binding?: number | string;
  group?: number | string;
  sharedBinding?: boolean;

  isTexture?: boolean;
  isStorageTexture?: boolean; //something to help with identifying in the bindgroup automation
  isSampler?: boolean;
  isComparisonSampler?: boolean;
  isDepthTexture?: boolean;

  isSharedStorageTexture?: boolean;

  is3dStorageTexture?: boolean;
  is1dStorageTexture?: boolean;
  is2dStorageTextureArray?: boolean;
  isDepthTextureArray?: boolean;
  isDepthCubeArrayTexture?: boolean;
  isDepthCubeTexture?: boolean;
  isDepthMSAATexture?: boolean;
  isDepthTexture2d?: boolean;
  isCubeArrayTexture?: boolean;
  isCubeTexture?: boolean;
  is3dTexture?: boolean;
  isis2dTextureArrayDepthTextureArray?: boolean;
  is1dTexture?: boolean;
  is2dMSAATexture?: boolean;
};

export type TranspiledShader = {
  resources?: ShaderResource[];
  code: string;
  header: string;
  bindGroupNumber: number;
  lastBinding: number; //the last binding in the list, e.g. vertex and fragment bindings need to be in series
  ast: any[];
  params: Param[];
  funcStr: string;
  defaultUniforms: any;
  type: "compute" | "vertex" | "fragment";
  workGroupSize?: WorkgroupSize;
  altBindings?: any;
  returnedVars?: any;
};

export type BufferGroup = {
  params: Param[];
  returnedVars: string[];
  inputTypes: { [key: string]: any };
  firstPass?: boolean;

  bindGroup?: GPUBindGroup;
  renderBundle?: GPURenderBundle;

  inputBuffers: {
    [key: string]: GPUBuffer;
  };
  outputBuffers: {
    [key: string]: GPUBuffer;
  };

  uniformBuffer?: GPUBuffer;
  uniformBufferInputs: { [key: string]: any };
  totalUniformBufferSize?: number;

  defaultUniformBuffer?: GPUBuffer;
  totalDefaultUniformBufferSize?: number;
  defaultUniformBinding?: number;

  textures: { [key: string]: GPUTexture };
  samplers?: { [key: string]: GPUSampler };
  defaultUniforms: { [key: string]: any }; //defined in the transpiler class
  indexCount?: number;
  indexBuffer?: GPUBuffer;
  indexFormat?: GPUIndexFormat;
  vertexBuffers?: GPUBuffer[];
  vertexCount?: number;
  bindGroupLayoutEntries: GPUBindGroupEntry[] | GPUBindGroupLayoutEntry[];

  //[key:string]:any
};

export type TextureInfo = {
  source?: GPUCopyExternalImageSource;
  texture?: GPUTextureDescriptor | GPUTexture;
  buffer?: BufferSource | SharedArrayBuffer;
  width?: number;
  height?: number;
  depthOrArrayLayers?: number;
  rowsPerImage?: number;
  mipLevel?: number;
  origin?: GPUOrigin3D;
  aspect?: GPUTextureAspect;
  bytesPerRow?: number;
  label?: string;
  format?: GPUTextureFormat; //default: 'rgba8unorm'
  usage?: GPUTextureUsageFlags;
  layout?: GPUTexelCopyBufferLayout | GPUCopyExternalImageSourceInfo; //customize the layout that gets created for an image source e.g. flipY

  mipLevelCount?: number; //todo: support more stuff or roll it in neater

  isDepth?: boolean; //depth texture?
  isStorage?: boolean; //something to help with identifying in the bindgroup automation
  isSampler?: boolean;
  isComparisonSampler?: boolean;
} & (
  | { source: GPUCopyExternalImageSource }
  | { texture: GPUTexture }
  | { width: number; height: number }
);
