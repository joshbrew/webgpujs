export function triangle(time = "f32", offset = "f32") {
  const corners = [vec2f(0, 0.75), vec2f(-0.8, -0.7), vec2f(0.8, -0.7)];
  const p = corners[vertexIndex];
  const angle = time * 0.6;
  position = vec4f(
    p.x * cos(angle) - p.y * sin(angle) + offset,
    p.x * sin(angle) + p.y * cos(angle),
    0.3,
    1,
  );
  color = vec4f(0.2, 0.85, 0.65, 1);
}
export function shade() {
  return color;
}
