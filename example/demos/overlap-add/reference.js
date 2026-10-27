export function reference(input) {
  return Float32Array.from({ length: 272 }, (_, i) => {
    let sum = 0;
    for (let k = 0; k < input.taps.length; k++)
      if (i >= k && i - k < input.input.length)
        sum += input.input[i - k] * input.taps[k];
    return sum;
  });
}
