export function instances(time = "f32") {
  const corners = [vec2f(0, 0.048), vec2f(-0.04, -0.034), vec2f(0.04, -0.034)];
  const point = corners[vertexIndex];
  const angle = time + f32(instanceIndex) * 0.08;
  const center =
    (vec2f(f32(instanceIndex % 16), f32(instanceIndex / 16)) / 16) * 2 -
    vec2f(0.94);
  const p =
    center +
    vec2f(
      point.x * cos(angle) - point.y * sin(angle),
      point.x * sin(angle) + point.y * cos(angle),
    );
  position = vec4f(p, 0.2, 1);
  color = vec4f(0.5 + 0.5 * sin(angle), 0.55 + 0.4 * cos(angle * 0.7), 0.85, 1);
}
export function shade() {
  return color;
}
