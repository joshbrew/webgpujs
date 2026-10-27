import type { WorkgroupSize } from "./types.js";

export function workgroupDimensions(
  size: WorkgroupSize = 64,
): [number, number, number] {
  const dimensions = typeof size === "number" ? [size] : size;
  if (
    !Array.isArray(dimensions) ||
    dimensions.length < 1 ||
    dimensions.length > 3 ||
    dimensions.some((value) => !Number.isInteger(value) || value < 1)
  )
    throw new Error(
      "workGroupSize must be a positive integer or one to three positive integer dimensions",
    );
  return [dimensions[0], dimensions[1] ?? 1, dimensions[2] ?? 1];
}
