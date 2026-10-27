// Textured cube: shader functions are parsed into WGSL, never called on the CPU.

export function cubeVertex(modelViewProjectionMatrix = "mat4x4f") {
  position = modelViewProjectionMatrix * vertexIn;
  uv = uvIn;
  color = colorIn;
}

export function cubeFragment() {
  return textureSample(image, imgSampler, uv) * color;
}
