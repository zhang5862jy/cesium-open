/** Separable Euclidean squared-distance transform, run once per glyph in the Worker. */
function transform(grid: Float64Array, width: number, height: number): void {
  const size = Math.max(width, height);
  const f = new Float64Array(size), d = new Float64Array(size);
  const sites = new Int32Array(size), boundaries = new Float64Array(size + 1);
  const scan = (length: number) => {
    let k = 0;
    sites[0] = 0; boundaries[0] = -Infinity; boundaries[1] = Infinity;
    for (let q = 1; q < length; q++) {
      let crossing: number;
      do {
        const p = sites[k]!;
        crossing = (f[q]! + q * q - f[p]! - p * p) / (2 * (q - p));
        if (crossing > boundaries[k]!) break;
        k--;
      } while (k >= 0);
      k++; sites[k] = q; boundaries[k] = crossing; boundaries[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < length; q++) {
      while (boundaries[k + 1]! < q) k++;
      const p = sites[k]!; d[q] = (q - p) ** 2 + f[p]!;
    }
  };
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x]!;
    scan(height);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y]!;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x]!;
    scan(width);
    for (let x = 0; x < width; x++) grid[y * width + x] = d[x]!;
  }
}

/** Store distance in RGB with opaque alpha to avoid bitmap premultiplication. */
export function encodeGlyphDistanceField(image: ImageData, radius = 8): ImageData {
  const { width, height, data } = image;
  const inside = new Float64Array(width * height), outside = new Float64Array(width * height);
  for (let i = 0; i < inside.length; i++) {
    const a = data[i * 4 + 3]! / 255;
    outside[i] = a === 1 ? 0 : a === 0 ? 1e12 : Math.max(0, .5 - a) ** 2;
    inside[i] = a === 0 ? 0 : a === 1 ? 1e12 : Math.max(0, a - .5) ** 2;
  }
  transform(inside, width, height); transform(outside, width, height);
  for (let i = 0; i < inside.length; i++) {
    const distance = Math.sqrt(inside[i]!) - Math.sqrt(outside[i]!);
    const value = Math.round(255 * Math.max(0, Math.min(1, .5 + distance / (2 * radius))));
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = value;
    data[i * 4 + 3] = 255;
  }
  return image;
}
