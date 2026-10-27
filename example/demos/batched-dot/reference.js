export function reference(input) {
  return Float32Array.from({ length: 64 }, (_, r) => {
    let sum = 0;
    for (let j = 0; j < 32; j++)
      sum += input.left[r * 32 + j] * input.right[r * 32 + j];
    return sum;
  });
}
