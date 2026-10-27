/** A navigable guide to the shader set, without inferring host dispatch order. */
export function createPipelineOverview(sources, selectShader) {
  const details = document.createElement("details");
  details.className = "pipeline-overview";
  const summary = document.createElement("summary");
  const compute = sources.filter((source) => source.stage === "compute").length;
  const render = new Set(
    sources
      .filter((source) => source.stage !== "compute")
      .map((source) => source.pass),
  ).size;
  summary.textContent = `Pipeline overview · ${[
    compute && `${compute} compute ${compute === 1 ? "stage" : "stages"}`,
    render && `${render} render ${render === 1 ? "pipeline" : "pipelines"}`,
  ]
    .filter(Boolean)
    .join(" + ")}`;
  const hint = document.createElement("p");
  hint.textContent =
    "Compute transforms data; vertex positions geometry; fragment shades pixels. Choose a stage to see its source. Setup and update code determine when each pipeline runs.";
  const list = document.createElement("ol");
  for (const [index, source] of sources.entries()) {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = source.label;
    button.addEventListener("click", () => selectShader(source, index));
    row.append(button);
    list.append(row);
  }
  details.append(summary, hint, list);
  return details;
}
