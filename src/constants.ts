// TypeScript 7 declares WebGPU interfaces but currently omits the four global flag objects.
// Read the browser/runtime objects lazily; importing the library needs no GPU environment.
export const gpuConstants = globalThis as typeof globalThis & {
  GPUBufferUsage: Record<
    | "MAP_READ"
    | "MAP_WRITE"
    | "COPY_SRC"
    | "COPY_DST"
    | "INDEX"
    | "VERTEX"
    | "UNIFORM"
    | "STORAGE"
    | "INDIRECT"
    | "QUERY_RESOLVE",
    number
  >;
  GPUTextureUsage: Record<
    | "COPY_SRC"
    | "COPY_DST"
    | "TEXTURE_BINDING"
    | "STORAGE_BINDING"
    | "RENDER_ATTACHMENT",
    number
  >;
  GPUShaderStage: Record<"COMPUTE" | "VERTEX" | "FRAGMENT", number>;
  GPUMapMode: Record<"READ" | "WRITE", number>;
};
