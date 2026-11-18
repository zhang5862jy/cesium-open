export interface ColorStop {
  offset: number;
  color: readonly [number, number, number];
}

export interface ColorRamp {
  id: string;
  name: string;
  css: string;
  stops: ColorStop[];
}

export const COLOR_RAMPS: ColorRamp[] = [
  {
    id: "terrain",
    name: "地形",
    css: "linear-gradient(90deg, #183c6b, #1f8f81, #65b95a, #d6cf61, #b2743c, #f4f0e6)",
    stops: [
      { offset: 0, color: [24, 60, 107] },
      { offset: 0.2, color: [31, 143, 129] },
      { offset: 0.42, color: [101, 185, 90] },
      { offset: 0.64, color: [214, 207, 97] },
      { offset: 0.82, color: [178, 116, 60] },
      { offset: 1, color: [244, 240, 230] },
    ],
  },
  {
    id: "viridis",
    name: "Viridis",
    css: "linear-gradient(90deg, #440154, #3b528b, #21918c, #5ec962, #fde725)",
    stops: [
      { offset: 0, color: [68, 1, 84] },
      { offset: 0.25, color: [59, 82, 139] },
      { offset: 0.5, color: [33, 145, 140] },
      { offset: 0.75, color: [94, 201, 98] },
      { offset: 1, color: [253, 231, 37] },
    ],
  },
  {
    id: "magma",
    name: "Magma",
    css: "linear-gradient(90deg, #000004, #51127c, #b73779, #fc8961, #fcfdbf)",
    stops: [
      { offset: 0, color: [0, 0, 4] },
      { offset: 0.25, color: [81, 18, 124] },
      { offset: 0.5, color: [183, 55, 121] },
      { offset: 0.75, color: [252, 137, 97] },
      { offset: 1, color: [252, 253, 191] },
    ],
  },
  {
    id: "grayscale",
    name: "灰度",
    css: "linear-gradient(90deg, #101820, #69747d, #d9dde0, #ffffff)",
    stops: [
      { offset: 0, color: [16, 24, 32] },
      { offset: 0.42, color: [105, 116, 125] },
      { offset: 0.8, color: [217, 221, 224] },
      { offset: 1, color: [255, 255, 255] },
    ],
  },
];

export function findColorRamp(id: string): ColorRamp {
  return COLOR_RAMPS.find((ramp) => ramp.id === id) ?? COLOR_RAMPS[0]!;
}

export function createColorLookup(
  ramp: ColorRamp,
  size = 1024,
): Uint8ClampedArray {
  const lookup = new Uint8ClampedArray(size * 3);
  let stopIndex = 0;

  for (let index = 0; index < size; index += 1) {
    const offset = index / (size - 1);
    while (
      stopIndex < ramp.stops.length - 2 &&
      offset > ramp.stops[stopIndex + 1]!.offset
    ) {
      stopIndex += 1;
    }

    const first = ramp.stops[stopIndex]!;
    const second = ramp.stops[stopIndex + 1]!;
    const span = Math.max(second.offset - first.offset, Number.EPSILON);
    const amount = Math.max(0, Math.min(1, (offset - first.offset) / span));

    lookup[index * 3] = mix(first.color[0], second.color[0], amount);
    lookup[index * 3 + 1] = mix(first.color[1], second.color[1], amount);
    lookup[index * 3 + 2] = mix(first.color[2], second.color[2], amount);
  }

  return lookup;
}

function mix(first: number, second: number, amount: number): number {
  return Math.round(first + (second - first) * amount);
}

