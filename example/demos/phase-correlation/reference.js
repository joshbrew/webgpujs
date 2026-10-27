// Independent spatial-domain check: find the cyclic translation without using FFTs.
export function reference(input) {
  const a = input["image-A"],
    b = input["image-B"],
    out = new Float32Array(1024);
  for (let dy = 0; dy < 32; dy++)
    for (let dx = 0; dx < 32; dx++) {
      let matches = true;
      for (let i = 0; i < 1024; i++) {
        const x = i % 32,
          y = Math.floor(i / 32);
        if (b[i] !== a[((y - dy + 32) % 32) * 32 + ((x - dx + 32) % 32)]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        out[dy * 32 + dx] = 1;
        return out;
      }
    }
  throw new Error("No cyclic shift found");
}
