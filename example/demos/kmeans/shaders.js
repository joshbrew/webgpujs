export function assign(
  points = "array<vec2f>",
  centers = "array<vec2f>",
  labels = "array<u32>",
) {
  const i = threadId.x;
  if (i >= points.length) return;
  let best = f32(1e6),
    label = u32(0);
  for (let j = u32(0); j < centers.length; j++) {
    const delta = points[i] - centers[j],
      d = dot(delta, delta);
    if (d < best) {
      best = d;
      label = j;
    }
  }
  labels[i] = label;
}
export function updateCenters(
  points = "array<vec2f>",
  labels = "array<u32>",
  centers = "array<vec2f>",
  next = "array<vec2f>",
  iteration = "u32",
  iterations = "u32",
) {
  const k = threadId.x;
  if (k >= next.length) return;
  if (iteration >= iterations) {
    next[k] = centers[k];
    return;
  }
  let sum = vec2f(0),
    count = f32(0);
  for (let j = u32(0); j < points.length; j++)
    if (labels[j] == k) {
      sum += points[j];
      count += 1;
    }
  next[k] = select(centers[k], sum / max(count, 1), count > 0);
}
export function display(
  points = "array<vec2f>",
  labels = "array<u32>",
  centers = "array<vec2f>",
  regions = "u32",
) {
  const uv = position.xy / vec2f(resX, resY),
    palette = [vec3f(0.2, 0.95, 0.7), vec3f(1, 0.5, 0.25), vec3f(0.5, 0.6, 1)];
  let colour = vec3f(0.025, 0.045, 0.08),
    nearest = u32(0),
    best = f32(1e6);
  for (let j = u32(0); j < centers.length; j++) {
    const d = distance(uv, centers[j]);
    if (d < best) {
      best = d;
      nearest = j;
    }
  }
  if (regions == 1) colour += palette[nearest] * 0.09;
  for (let j = u32(0); j < points.length; j++)
    if (distance(uv, points[j]) < 0.0065) colour = palette[labels[j]];
  for (let j = u32(0); j < centers.length; j++) {
    const d = abs(uv - centers[j]);
    if ((d.x < 0.025 && d.y < 0.003) || (d.y < 0.025 && d.x < 0.003))
      colour = vec3f(1, 0.96, 0.8);
  }
  return vec4f(colour, 1);
}
