export const cubeVertices = new Float32Array([
    // float4 vertex, float4 color, float2 uv, float3 normal
  1, -1, 1, 1,   1, 0, 1, 1,  0, 1, //0,0,0,
  -1, -1, 1, 1,  0, 0, 1, 1,  1, 1, //0,0,0,
  -1, -1, -1, 1, 0, 0, 0, 1,  1, 0, //0,0,0,
  1, -1, -1, 1,  1, 0, 0, 1,  0, 0, //0,0,0,
  1, -1, 1, 1,   1, 0, 1, 1,  0, 1, //0,0,0,
  -1, -1, -1, 1, 0, 0, 0, 1,  1, 0, //0,0,0,

  1, 1, 1, 1,    1, 1, 1, 1,  0, 1, //0,0,0,
  1, -1, 1, 1,   1, 0, 1, 1,  1, 1, //0,0,0,
  1, -1, -1, 1,  1, 0, 0, 1,  1, 0, //0,0,0,
  1, 1, -1, 1,   1, 1, 0, 1,  0, 0,// 0,0,0,
  1, 1, 1, 1,    1, 1, 1, 1,  0, 1, //0,0,0,
  1, -1, -1, 1,  1, 0, 0, 1,  1, 0, //0,0,0,

  -1, 1, 1, 1,   0, 1, 1, 1,  0, 1, //0,0,0,
  1, 1, 1, 1,    1, 1, 1, 1,  1, 1, //0,0,0,
  1, 1, -1, 1,   1, 1, 0, 1,  1, 0, //0,0,0,
  -1, 1, -1, 1,  0, 1, 0, 1,  0, 0, //0,0,0,
  -1, 1, 1, 1,   0, 1, 1, 1,  0, 1,// 0,0,0,
  1, 1, -1, 1,   1, 1, 0, 1,  1, 0,// 0,0,0,

  -1, -1, 1, 1,  0, 0, 1, 1,  0, 1, //0,0,0,
  -1, 1, 1, 1,   0, 1, 1, 1,  1, 1, //0,0,0,
  -1, 1, -1, 1,  0, 1, 0, 1,  1, 0, //0,0,0,
  -1, -1, -1, 1, 0, 0, 0, 1,  0, 0, //0,0,0,
  -1, -1, 1, 1,  0, 0, 1, 1,  0, 1, //0,0,0,
  -1, 1, -1, 1,  0, 1, 0, 1,  1, 0, //0,0,0,

  1, 1, 1, 1,    1, 1, 1, 1,  0, 1, //0,0,0,
  -1, 1, 1, 1,   0, 1, 1, 1,  1, 1, //0,0,0,
  -1, -1, 1, 1,  0, 0, 1, 1,  1, 0, //0,0,0,
  -1, -1, 1, 1,  0, 0, 1, 1,  1, 0,// 0,0,0,
  1, -1, 1, 1,   1, 0, 1, 1,  0, 0,// 0,0,0,
  1, 1, 1, 1,    1, 1, 1, 1,  0, 1,// 0,0,0,

  1, -1, -1, 1,  1, 0, 0, 1,  0, 1, //0,0,0,
  -1, -1, -1, 1, 0, 0, 0, 1,  1, 1, //0,0,0,
  -1, 1, -1, 1,  0, 1, 0, 1,  1, 0, //0,0,0,
  1, 1, -1, 1,   1, 1, 0, 1,  0, 0,// 0,0,0,
  1, -1, -1, 1,  1, 0, 0, 1,  0, 1,// 0,0,0,
  -1, 1, -1, 1,  0, 1, 0, 1,  1, 0, //0,0,0
]);

export const cubeIndices = new Uint16Array([
  0, 1, 2, 3, 4, 5,       // Bottom face
  6, 7, 8, 9, 10, 11,     // Right face
  12, 13, 14, 15, 16, 17, // Top face
  18, 19, 20, 21, 22, 23, // Left face
  24, 25, 26, 27, 28, 29, // Front face
  30, 31, 32, 33, 34, 35  // Back face
]);

