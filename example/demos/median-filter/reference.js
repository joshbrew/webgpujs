export function reference(input) {
  return Float32Array.from({ length: 1024 }, (_, i) => {
    const a = [];
    for (let y = -1; y <= 1; y++)
      for (let x = -1; x <= 1; x++)
        a.push(
          input.input[
            Math.max(0, Math.min(31, Math.floor(i / 32) + y)) * 32 +
              Math.max(0, Math.min(31, (i % 32) + x))
          ],
        );
    return a.sort((a, b) => a - b)[4];
  });
}
