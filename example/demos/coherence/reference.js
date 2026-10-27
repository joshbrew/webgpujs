export function reference(input) {
  return Float32Array.from({ length: 64 }, (_, k) => {
    let aa = 0,
      bb = 0,
      re = 0,
      im = 0;
    for (let trial = 0; trial < 8; trial++) {
      let ar = 0,
        ai = 0,
        br = 0,
        bi = 0;
      for (let n = 0; n < 128; n++) {
        const p = (-2 * Math.PI * k * n) / 128,
          c = Math.cos(p),
          s = Math.sin(p),
          a = input.left[trial * 128 + n],
          b = input.right[trial * 128 + n];
        ar += a * c;
        ai += a * s;
        br += b * c;
        bi += b * s;
      }
      aa += ar * ar + ai * ai;
      bb += br * br + bi * bi;
      re += ar * br + ai * bi;
      im += ai * br - ar * bi;
    }
    return Math.max(
      0,
      Math.min(1, (re * re + im * im) / Math.max(aa * bb, 1e-6)),
    );
  });
}
