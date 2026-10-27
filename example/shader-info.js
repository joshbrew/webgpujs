/** Shared naming for the gallery, live editor and exported shader descriptions. */
export function shaderInfo(
  shader,
  stage,
  pass,
  { multiple = true, entryPoint } = {},
) {
  const language = shader.funcStr ? "javascript" : "wgsl";
  const name =
    language === "javascript"
      ? shader.funcStr.match(/\bfunction\s+([\w$]+)/)?.[1] || stage
      : entryPoint ||
        { compute: "compute_main", vertex: "vtx_main", fragment: "frag_main" }[
          stage
        ];
  const location = `${multiple ? `Pass ${pass + 1} / ` : ""}${stage}`;
  return {
    id: `${pass}:${stage}`,
    pass,
    stage,
    name,
    language,
    location,
    label: `${location} — ${name}${language === "wgsl" ? " (WGSL)" : ""}`,
  };
}
