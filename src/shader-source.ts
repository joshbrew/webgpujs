import type {
  ShaderSource,
  ShaderSourceDescriptor,
  ShaderStage,
} from "./types.js";
export type ShaderStages = Partial<Record<ShaderStage, ShaderSource>> & {
  transpileString?: boolean;
};
export function isShaderSource(value: unknown): value is ShaderSource {
  return (
    typeof value === "function" ||
    typeof value === "string" ||
    (!!value && typeof value === "object" && "code" in value)
  );
}
export function shaderDescriptor(
  value: ShaderSource,
  stage: string,
): ShaderSourceDescriptor {
  const descriptor =
    typeof value === "function" || typeof value === "string"
      ? { code: value }
      : value;
  if (!descriptor || !["function", "string"].includes(typeof descriptor.code))
    throw new Error(
      `Invalid ${stage} shader: provide a function or WGSL source string`,
    );
  return descriptor;
}
