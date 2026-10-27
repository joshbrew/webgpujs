export function reference(input) {
  return Float32Array.from(input.keys, (key) => key * key);
}
