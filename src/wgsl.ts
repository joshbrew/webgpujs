/** Split WGSL member/type lists without breaking nested generics or attributes. */
export function splitWGSLList(source: string): string[] {
  const parts = [];
  let start = 0,
    angles = 0,
    parentheses = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "<") angles++;
    else if (char === ">") angles--;
    else if (char === "(") parentheses++;
    else if (char === ")") parentheses--;
    else if (
      (char === "," || char === ";") &&
      angles === 0 &&
      parentheses === 0
    ) {
      if (source.slice(start, i).trim())
        parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (source.slice(start).trim()) parts.push(source.slice(start).trim());
  return parts;
}
