import { gpuConstants } from "./constants.js";
import { roundUp, texelBytes, unpackStorageBytes } from "./data.js";
import type { ShaderResource, ShaderReadback } from "./types.js";
export type ReadbackOutputs = Record<string, GPUBuffer | GPUTexture>;
export type ReadbackResult<Buffers extends boolean = false> =
  Buffers extends true
    ? GPUBuffer | Record<string, GPUBuffer>
    : ShaderReadback | Record<string, ShaderReadback>;
function isTexture(resource: GPUBuffer | GPUTexture): resource is GPUTexture {
  return "createView" in resource;
}

/** Copy/map is isolated from shader execution so partial failures always release staging buffers. */
export async function readGPUOutputs<Buffers extends boolean = false>(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  outputs: ReadbackOutputs,
  resources: ShaderResource[],
  returnBuffers: Buffers = false as Buffers,
): Promise<ReadbackResult<Buffers>> {
  const copies: {
    name: string;
    buffer: GPUBuffer;
    output: GPUBuffer | GPUTexture;
    row: number;
    bytesPerPixel: number;
  }[] = [];
  let transferred = false;
  try {
    for (const [name, output] of Object.entries(outputs)) {
      const texture = isTexture(output),
        bytesPerPixel = texture ? texelBytes(output.format) : 0;
      const row = texture ? roundUp(output.width * bytesPerPixel, 256) : 0;
      const size = texture
        ? row * output.height * output.depthOrArrayLayers
        : output.size;
      const buffer = device.createBuffer({
        size,
        usage:
          gpuConstants.GPUBufferUsage.MAP_READ |
          gpuConstants.GPUBufferUsage.COPY_DST,
      });
      copies.push({ name, buffer, output, row, bytesPerPixel });
      if (texture)
        encoder.copyTextureToBuffer(
          { texture: output },
          { buffer, bytesPerRow: row, rowsPerImage: output.height },
          [output.width, output.height, output.depthOrArrayLayers],
        );
      else encoder.copyBufferToBuffer(output, 0, buffer, 0, size);
    }
    device.queue.submit([encoder.finish()]);
    if (returnBuffers) {
      transferred = true;
      return (
        copies.length === 1
          ? copies[0].buffer
          : Object.fromEntries(copies.map((copy) => [copy.name, copy.buffer]))
      ) as ReadbackResult<Buffers>;
    }
    const settled = await Promise.allSettled(
      copies.map(async ({ buffer, output, row, bytesPerPixel, name }) => {
        await buffer.mapAsync(gpuConstants.GPUMapMode.READ);
        let bytes = new Uint8Array(buffer.getMappedRange()).slice();
        if (isTexture(output)) {
          const width = output.width * bytesPerPixel;
          const packed = new Uint8Array(
            width * output.height * output.depthOrArrayLayers,
          );
          for (let i = 0; i < packed.byteLength / width; i++)
            packed.set(bytes.subarray(i * row, i * row + width), i * width);
          bytes = packed;
        }
        const type =
          resources.find((resource) => resource.name === name)?.type || "";
        if (!isTexture(output)) bytes = unpackStorageBytes(bytes, type);
        const format = isTexture(output) ? output.format : "";
        const ctor =
          isTexture(output) && /8/.test(format)
            ? Uint8Array
            : type.includes("f16") || (isTexture(output) && /16/.test(format))
              ? Uint16Array
              : type.includes("u32") || format.endsWith("uint")
                ? Uint32Array
                : type.includes("i32") || format.endsWith("sint")
                  ? Int32Array
                  : Float32Array;
        return new ctor(bytes.buffer);
      }),
    );
    const failure = settled.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const values = settled.map(
      (result) => (result as PromiseFulfilledResult<ShaderReadback>).value,
    );
    return (
      values.length === 1
        ? values[0]
        : Object.fromEntries(copies.map((copy, i) => [copy.name, values[i]]))
    ) as ReadbackResult<Buffers>;
  } finally {
    if (!transferred)
      for (const { buffer } of copies) {
        if (buffer.mapState === "mapped") buffer.unmap();
        buffer.destroy();
      }
  }
}
