/** Enable only optional features used by capability-aware demos. */
export function requestDemoDevice(adapter) {
  const requiredFeatures = ["timestamp-query", "shader-f16"].filter((feature) =>
    adapter.features.has(feature),
  );
  return adapter.requestDevice({ requiredFeatures });
}
