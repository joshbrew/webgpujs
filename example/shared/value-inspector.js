/** Small final-result readback for numeric inspection; compute/render intermediates remain GPU-resident. */
export function createValueInspector(columns = 16) {
  let values,
    viewPointer,
    viewMode = 0;
  return {
    update(next) {
      values = next;
    },
    setView(pointer, mode = 0) {
      viewPointer = pointer ? [...pointer] : undefined;
      viewMode = mode;
      return this.index(viewPointer, viewMode);
    },
    index(pointer, mode = 0) {
      if (
        !values ||
        !pointer ||
        pointer[0] < 0 ||
        pointer[0] > 1 ||
        pointer[1] < 0 ||
        pointer[1] > 1
      )
        return -1;
      const col = Math.min(columns - 1, Math.floor(pointer[0] * columns)),
        rows = Math.ceil(values.length / columns);
      return Math.min(
        values.length - 1,
        mode
          ? Math.floor(pointer[0] * values.length)
          : Math.floor(Math.min(0.9999, pointer[1]) * rows) * columns + col,
      );
    },
    describe(pointer = viewPointer, mode = viewMode) {
      if (!values) return "";
      const format = (n) =>
        Number.isFinite(n) ? Number(n.toPrecision(5)).toString() : String(n);
      const index = this.index(pointer, mode);
      let low = Infinity,
        high = -Infinity;
      for (const v of values) {
        low = Math.min(low, v);
        high = Math.max(high, v);
      }
      return (
        `${values.length} output values · range ${format(low)} to ${format(high)}.\n` +
        (index < 0
          ? "Hover the preview to inspect a value."
          : `Index ${index}${mode ? "" : ` · row ${Math.floor(index / columns) + 1}, column ${(index % columns) + 1}`} = ${format(values[index])}`)
      );
    },
  };
}
export function dataControls(controls) {
  return Object.fromEntries(
    Object.entries(controls).filter(
      ([name]) =>
        !["pointer", "down", "pressed", "gain", "viewMode"].includes(name),
    ),
  );
}
