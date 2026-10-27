export function reference(input) {
  let sum = 0;
  return Float32Array.from(input.A, (v, i) => {
    if (input["heads-A"][i]) sum = 0;
    sum += v;
    return sum;
  });
}
