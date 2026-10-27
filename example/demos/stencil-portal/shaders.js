export const mask = {
  code: `
struct U  {
  size:vec2f, radius:f32, time:f32
}
;
@group(0) @binding(0) var<uniform> u:U;
@fragment fn frag_main(@builtin(position) p:vec4f)->@location(0) vec4f  {
  let q=(p.xy/u.size*2-1)*vec2f(u.size.x/u.size.y,1)-vec2f(sin(u.time)*.35,0);
  if(length(q)>u.radius) {
    discard;
  }
  return vec4f(0);
}
`,
  entryPoint: "frag_main",
};
export function world(time = "f32") {
  const p = position.xy / vec2f(resX, resY);
  const bands = 0.5 + 0.5 * sin(p.x * 40 + sin(p.y * 14 + time) * 3);
  return vec4f(mix(vec3f(0.08, 0.16, 0.4), vec3f(0.3, 0.95, 0.75), bands), 1);
}
