// Flocking: shader functions are parsed into WGSL, never called on the CPU.

export function boidsCompute(
  particlesIn = "array<vec4f>",
  particlesOut = "array<vec4f>",
  deltaT = "f32",
) {
  const index = threadId.x;
  if (index >= particlesIn.length) return;
  const current = particlesIn[index];
  let velocity = current.zw;
  let center = vec2f(0);
  let alignment = vec2f(0);
  let separation = vec2f(0);
  let count = 0;
  for (let i = 0; i < i32(particlesIn.length); i++) {
    if (u32(i) != index) {
      const other = particlesIn[i];
      const distanceToOther = distance(current.xy, other.xy);
      if (distanceToOther < 0.18) {
        center += other.xy;
        alignment += other.zw;
        count++;
      }
      if (distanceToOther < 0.045) separation -= other.xy - current.xy;
    }
  }
  if (count > 0)
    velocity +=
      (center / f32(count) - current.xy) * 0.02 +
      (alignment / f32(count) - velocity) * 0.08;
  velocity += separation * 0.08;
  const speed = max(length(velocity), 0.0001);
  velocity = (velocity / speed) * clamp(speed, 0.02, 0.13);
  let nextPosition = current.xy + velocity * deltaT;
  if (nextPosition.x < -1) nextPosition.x = 1;
  if (nextPosition.x > 1) nextPosition.x = -1;
  if (nextPosition.y < -1) nextPosition.y = 1;
  if (nextPosition.y > 1) nextPosition.y = -1;
  particlesOut[index] = vec4f(nextPosition, velocity);
}

export function boidsVertex() {
  const direction = normalize(velocityIn + vec2f(0.00001));
  const perpendicular = vec2f(-direction.y, direction.x);
  const p = centerIn + spriteIn.x * perpendicular + spriteIn.y * direction;
  position = vec4f(p, 0, 1);
  color = vec4f(0.25 + abs(direction.x) * 0.75, 0.5 + direction.y * 0.4, 1, 1);
}

export function colorFragment() {
  return color;
}
