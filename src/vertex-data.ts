import { isGPUBuffer, roundUp } from "./data.js";
import { flattenArray, isTypedArray } from "./util.js";
import { gpuConstants } from "./constants.js";
import { ResourceScope } from "./lifecycle.js";
import type { BufferGroup } from "./types.js";

/** Upload interleaved geometry without reallocating unchanged buffers or leaking replacements. */
export function uploadGeometry(
  device: GPUDevice,
  scope: ResourceScope,
  group: BufferGroup,
  vertices,
  index: number,
  bufferOffset: number,
  dataOffset: number,
  stride: number,
  indexed = false,
  format?: GPUIndexFormat,
) {
  if (!vertices) return;
  const key = indexed ? "index" : `vertex:${index}`;
  const previous = indexed ? group.indexBuffer : group.vertexBuffers?.[index];
  let buffer: GPUBuffer;
  if (isGPUBuffer(vertices)) {
    buffer = vertices;
    if (indexed)
      group.indexCount = Math.floor(
        vertices.size / (format === "uint16" ? 2 : 4),
      );
  } else {
    if (Array.isArray(vertices)) {
      const values = flattenArray(vertices);
      vertices = indexed
        ? format === "uint16"
          ? new Uint16Array(values)
          : new Uint32Array(values)
        : new Float32Array(values);
    }
    if (!isTypedArray(vertices))
      throw new Error(
        "Vertex data must be a numeric typed array, array or GPUBuffer",
      );
    if (
      indexed &&
      !(vertices instanceof Uint16Array || vertices instanceof Uint32Array)
    )
      throw new Error("Index data must be Uint16Array or Uint32Array");
    if (
      !Number.isInteger(dataOffset) ||
      dataOffset < 0 ||
      dataOffset > vertices.length ||
      !Number.isInteger(bufferOffset) ||
      bufferOffset < 0 ||
      bufferOffset % 4
    )
      throw new Error(
        "Geometry offsets must be nonnegative integers; bufferOffset must be a multiple of 4",
      );
    const length =
      vertices.byteLength - dataOffset * vertices.BYTES_PER_ELEMENT;
    const required = Math.max(4, roundUp(bufferOffset + length, 4));
    buffer =
      previous?.size === required
        ? previous
        : scope.set(
            key,
            device.createBuffer({
              label: indexed ? "indexBuffer" : `vbo${index}`,
              size: required,
              usage:
                gpuConstants.GPUBufferUsage.COPY_DST |
                gpuConstants.GPUBufferUsage.COPY_SRC |
                (indexed
                  ? gpuConstants.GPUBufferUsage.INDEX
                  : gpuConstants.GPUBufferUsage.VERTEX),
            }),
            true,
          );
    const bytes = new Uint8Array(
      vertices.buffer,
      vertices.byteOffset + dataOffset * vertices.BYTES_PER_ELEMENT,
      length,
    );
    if (length) {
      const upload = length % 4 ? new Uint8Array(roundUp(length, 4)) : bytes;
      if (upload !== bytes) upload.set(bytes);
      device.queue.writeBuffer(buffer, bufferOffset, upload);
    }
    if (indexed) {
      group.indexCount = vertices.length - dataOffset;
      format ||= vertices instanceof Uint16Array ? "uint16" : "uint32";
    } else if (index === 0)
      group.vertexCount = Math.floor((vertices.length - dataOffset) / stride);
  }
  scope.set(key, buffer);
  if (indexed) {
    group.indexBuffer = buffer;
    group.indexFormat = format || "uint32";
    group.indexCount ??= 1;
  } else {
    (group.vertexBuffers ||= [])[index] = buffer;
  }
}
