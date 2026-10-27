/** Presentation-only controls; shader execution stays inside each demo module. */
export function mountDemoControls(
  definitions,
  container,
  values,
  invalidate,
  prefix = "demo",
) {
  const updates = [];
  for (const [key, title, min, max, step, initial, choices] of definitions) {
    const label = document.createElement("label");
    label.className = "range-control";
    const caption = document.createElement("span");
    caption.textContent = title;
    const toggle = !choices && min === 0 && max === 1 && step === 1;
    const input = document.createElement(choices ? "select" : "input");
    if (choices)
      choices.forEach((title, index) => {
        const option = document.createElement("option");
        option.value = min + index * step;
        option.textContent = title;
        input.append(option);
      });
    else input.type = toggle ? "checkbox" : "range";
    input.id = `${prefix}-${key}`;
    input.setAttribute("aria-label", title);
    const readout = document.createElement("output");
    readout.htmlFor = input.id;
    const value = values[key] ?? initial;
    if (toggle) input.checked = Boolean(value);
    else Object.assign(input, { min, max, step, value });
    const current = () =>
      toggle ? Number(input.checked) : Number(input.value);
    values[key] = current();
    readout.value = toggle ? (input.checked ? "On" : "Off") : input.value;
    if (choices) readout.hidden = true;
    input.addEventListener("input", () => {
      values[key] = current();
      const text = toggle ? (input.checked ? "On" : "Off") : input.value;
      if (readout.value !== text) readout.value = text;
      invalidate();
    });
    label.append(caption, input, readout);
    container.append(label);
    updates.push(() => {
      if (toggle) {
        if (input.checked !== Boolean(values[key]))
          input.checked = Boolean(values[key]);
      } else if (Number(input.value) !== values[key]) input.value = values[key];
      const text = toggle ? (input.checked ? "On" : "Off") : input.value;
      if (readout.value !== text) readout.value = text;
    });
  }
  return () => {
    for (const update of updates) update();
  };
}

export function mountPlotLegend(entries = [], container) {
  if (!entries.length) return;
  const legend = document.createElement("div");
  legend.className = "plot-legend";
  for (const [colour, text] of entries) {
    const label = document.createElement("span"),
      swatch = document.createElement("i");
    swatch.style.background = colour;
    label.append(swatch, document.createTextNode(text));
    legend.append(label);
  }
  container.append(legend);
}

/** Use the same pointer coordinates and drag behavior in every demo host. */
export function mountPointerControls(canvas, definition, values, invalidate) {
  const move = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width),
    );
    const y = Math.max(
      0,
      Math.min(1, (event.clientY - rect.top) / rect.height),
    );
    values.pointer = definition.stateType ? [x, y] : [x * 2 - 1, 1 - y * 2];
    invalidate();
  };
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerdown", (event) => {
    values.down = true;
    values.pressed = true;
    canvas.setPointerCapture(event.pointerId);
    move(event);
  });
  const release = () => {
    values.down = false;
    invalidate();
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    canvas.addEventListener(event, release);
}

/** Keep a quick click until the next update, even if release happened before RAF. */
export function consumePointerPress(values) {
  const pressed = Boolean(values.down || values.pressed);
  values.pressed = false;
  return pressed;
}
