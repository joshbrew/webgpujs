export function reference(input) {
  return Float32Array.from({ length: 64 }, (_, r) => {
    let sum = 0;
    for (let j = input.offsets[r]; j < input.offsets[r + 1]; j++)
      sum += input.values[j] * input.vector[input.columns[j]];
    return sum;
  });
}
