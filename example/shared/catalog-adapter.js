// Keep earlier example imports working; the site consumes demos/index.js directly.
export const legacyCatalog = (entries) =>
  entries.map((demo) => ({
    ...demo,
    setup: (definition, canvas, device) =>
      demo.setup(canvas, device, definition),
  }));
