export const occluder = {
  code: `
struct U {
  offset:f32
}
;
@group(0) @binding(0) var<uniform> u:U;
@vertex fn vtx_main(@builtin(vertex_index) i:u32)->@builtin(position) vec4f  {
  var p=array<vec2f,3>(vec2f(-.65,-.5),vec2f(.65,-.5),vec2f(0,.7));
  return vec4f(p[i]+vec2f(u.offset,0),.25,1);
}
`,
  entryPoint: "vtx_main",
};
export function floor(
  shadowMap = "texture_depth_2d",
  compareSampler = "sampler_comparison",
  reference = "f32",
  mode = "u32",
) {
  const uv = position.xy / vec2f(resX, resY);
  const visibility = textureSampleCompare(
    shadowMap,
    compareSampler,
    uv,
    reference,
  );
  const checker = f32((u32(uv.x * 16) + u32(uv.y * 10)) % 2);
  let rgb =
    mix(vec3f(0.2, 0.3, 0.42), vec3f(0.55, 0.72, 0.8), checker) *
    (0.2 + 0.8 * visibility);
  if (mode == 1) {
    const size = textureDimensions(shadowMap);
    const depth = textureLoad(shadowMap, vec2i(uv * vec2f(size)), 0);
    rgb = vec3f(depth);
  }
  return vec4f(rgb, 1);
}
