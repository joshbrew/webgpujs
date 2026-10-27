export function reference(input) {
  const out = input.input.slice();
  const max = Math.max(...out);
  out[out.indexOf(max)] += 1;
  return out;
}
