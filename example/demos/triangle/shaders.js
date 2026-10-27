// Triangle: shader functions are parsed into WGSL, never called on the CPU.

export function triangleVertex() {
  const corners = [vec2f(0, 0.75), vec2f(-0.75, -0.65), vec2f(0.75, -0.65)];
  const colors = [
    vec4f(0.2, 1, 0.8, 1),
    vec4f(0.3, 0.35, 1, 1),
    vec4f(1, 0.3, 0.6, 1),
  ];
  position = vec4f(corners[vertexIndex], 0, 1);
  color = colors[vertexIndex];
}

export function colorFragment() {
  return color;
}
