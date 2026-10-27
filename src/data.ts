import { normalizeType } from "./parser.js";
import { floatToHalf } from "./util.js";

export const roundUp = (value: number, alignment: number) =>
  Math.ceil(value / alignment) * alignment;
export function typeLayout(input: string): {
  type: string;
  size: number;
  alignment: number;
  columns?: number;
  rows?: number;
  scalar?: string;
} {
  const type = normalizeType(input);
  const scalarSize = (scalar: string) => (scalar === "f16" ? 2 : 4);
  if (/^(f32|i32|u32|f16)$/.test(type))
    return {
      type,
      size: scalarSize(type),
      alignment: scalarSize(type),
      scalar: type,
    };
  const vector = type.match(/^vec([234])<(f32|i32|u32|f16)>$/);
  if (vector) {
    const rows = Number(vector[1]),
      scalar = vector[2],
      bytes = scalarSize(scalar);
    return {
      type,
      size: rows * bytes,
      alignment: (rows === 3 ? 4 : rows) * bytes,
      rows,
      scalar,
    };
  }
  const matrix = type.match(/^mat([234])x([234])<(f32|f16)>$/);
  if (matrix) {
    const columns = Number(matrix[1]),
      rows = Number(matrix[2]),
      scalar = matrix[3];
    const column = typeLayout(`vec${rows}<${scalar}>`);
    return {
      type,
      size: columns * roundUp(column.size, column.alignment),
      alignment: column.alignment,
      columns,
      rows,
      scalar,
    };
  }
  throw new Error(
    `Unsupported host-shareable uniform type ${input}; use numeric scalars, vectors or matrices`,
  );
}

export function uniformLayout(
  fields: { name: string; type: string; align?: number; size?: number }[],
) {
  let offset = 0,
    alignment = 16;
  const entries = fields.map((field) => {
    const natural = typeLayout(field.type);
    const layout = {
      ...natural,
      alignment: field.align ?? natural.alignment,
      size: field.size ?? natural.size,
    };
    if (
      layout.alignment < natural.alignment ||
      layout.alignment & (layout.alignment - 1) ||
      layout.size < natural.size
    )
      throw new Error(
        `Invalid explicit layout for uniform field ${field.name}`,
      );
    alignment = Math.max(alignment, layout.alignment);
    offset = roundUp(offset, layout.alignment);
    const result = { ...field, ...layout, offset };
    offset += layout.size;
    return result;
  });
  return { entries, size: roundUp(offset, alignment) };
}

export function writeValue(
  view: DataView,
  offset: number,
  type: string,
  input: any,
  half: (n: number) => number,
) {
  const layout = typeLayout(type);
  const scalar = layout.scalar;
  const bytes = scalar === "f16" ? 2 : 4;
  const values = Array.isArray(input)
    ? input.flat(Infinity)
    : ArrayBuffer.isView(input)
      ? Array.from(input as any)
      : [input];
  const rows = layout.rows || 1,
    columns = layout.columns || 1;
  const stride = columns > 1 ? layout.size / columns : rows * bytes;
  for (let col = 0; col < columns; col++)
    for (let row = 0; row < rows; row++) {
      const value = values[col * rows + row] ?? 0,
        at = offset + col * stride + row * bytes;
      if (scalar === "f32") view.setFloat32(at, value, true);
      else if (scalar === "u32") view.setUint32(at, value, true);
      else if (scalar === "i32") view.setInt32(at, value, true);
      else view.setUint16(at, half(value), true);
    }
}

export function storageElementLayout(type: string) {
  const normalized = normalizeType(type);
  if (!normalized.startsWith("array<")) return;
  const element = normalized
    .slice(6, -1)
    .replace(/,\d+$/, "")
    .replace(/atomic<(u32|i32)>/, "$1");
  try {
    const layout = typeLayout(element);
    const bytes = layout.scalar === "f16" ? 2 : 4;
    return {
      ...layout,
      bytes,
      components: (layout.rows || 1) * (layout.columns || 1),
      stride: roundUp(layout.size, layout.alignment),
    };
  } catch {
    /* Custom structures use explicitly packed GPUBuffer/ArrayBuffer data. */
  }
}

export function unpackStorageBytes(
  bytes: Uint8Array<ArrayBuffer>,
  type: string,
): Uint8Array<ArrayBuffer> {
  const layout = storageElementLayout(type);
  if (!layout || layout.stride === layout.components * layout.bytes)
    return bytes;
  const count = Math.floor(bytes.byteLength / layout.stride);
  const result = new Uint8Array(count * layout.components * layout.bytes);
  const rows = layout.rows || 1,
    columns = layout.columns || 1;
  const columnStride =
    columns > 1 ? layout.size / columns : rows * layout.bytes;
  for (let i = 0; i < count; i++)
    for (let col = 0; col < columns; col++) {
      const start = i * layout.stride + col * columnStride;
      result.set(
        bytes.subarray(start, start + rows * layout.bytes),
        (i * layout.components + col * rows) * layout.bytes,
      );
    }
  return result;
}

export function storageData(data: any, type: string): ArrayBufferView {
  const layout = storageElementLayout(type);
  if (
    layout &&
    (layout.stride !== layout.components * layout.bytes ||
      layout.scalar === "f16") &&
    !(data instanceof ArrayBuffer)
  ) {
    if (
      ArrayBuffer.isView(data) &&
      (data instanceof DataView ||
        (data as any).BYTES_PER_ELEMENT !== layout.bytes) &&
      !(layout.scalar === "f16" && data instanceof Float32Array)
    )
      return data;
    const values = ArrayBuffer.isView(data)
      ? Array.from(data as any)
      : Array.isArray(data)
        ? data.flat(Infinity)
        : [];
    if (values.length % layout.components)
      throw new Error(
        `${type} inputs need ${layout.components} numeric components per element`,
      );
    const count = values.length / layout.components;
    const ctor =
      layout.scalar === "f16"
        ? Uint16Array
        : layout.scalar === "u32"
          ? Uint32Array
          : layout.scalar === "i32"
            ? Int32Array
            : Float32Array;
    const output = new ctor((count * layout.stride) / layout.bytes);
    const rows = layout.rows || 1,
      columns = layout.columns || 1;
    const columnStride =
      columns > 1 ? layout.size / columns / layout.bytes : rows;
    for (let i = 0; i < count; i++)
      for (let col = 0; col < columns; col++)
        for (let row = 0; row < rows; row++) {
          const value = values[i * layout.components + col * rows + row];
          output[
            (i * layout.stride) / layout.bytes + col * columnStride + row
          ] =
            layout.scalar === "f16" && !(data instanceof Uint16Array)
              ? floatToHalf(value)
              : value;
        }
    return output;
  }
  if (ArrayBuffer.isView(data)) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  const values = Array.isArray(data)
    ? data.flat(Infinity)
    : typeof data === "number"
      ? [data]
      : [];
  return type.includes("u32")
    ? new Uint32Array(values)
    : type.includes("i32")
      ? new Int32Array(values)
      : new Float32Array(values);
}

export function texelBytes(format: string) {
  const match = format.match(
    /^(r|rg|rgba|bgra)(8|16|32)(unorm|snorm|uint|sint|float)(-srgb)?$/,
  );
  if (!match)
    throw new Error(
      `Texture format ${format} requires an explicit copy layout`,
    );
  return (match[1].length * Number(match[2])) / 8;
}

export function isGPUBuffer(value: any): value is GPUBuffer {
  return (
    !!value &&
    typeof value.getMappedRange === "function" &&
    typeof value.mapAsync === "function"
  );
}
