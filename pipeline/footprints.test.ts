import { describe, expect, it } from 'vitest';
import { area, assembleRings, groupRings, type P3 } from './footprints';

const sq = (x: number, z: number, s: number, y: number): P3[] => [
  [x, z, y],
  [x + s, z, y],
  [x + s, z + s, y],
  [x, z + s, y],
  [x, z, y],
];

describe('footprints', () => {
  it('keeps closed rings and joins split polylines', () => {
    const closed = sq(0, 0, 10, 20);
    const a: P3[] = [
      [100, 0, 15],
      [110, 0, 15],
      [110, 10, 15],
    ];
    const b: P3[] = [
      [100, 0, 15],
      [100, 10, 15],
      [110, 10, 15],
    ]; // reversed direction on purpose
    const { rings, dropped } = assembleRings([
      closed,
      a,
      b,
      [
        [500, 500, 1],
        [501, 500, 1],
      ],
    ]);
    expect(rings).toHaveLength(2);
    expect(dropped).toBe(1);
    expect(Math.abs(area(rings[1]))).toBeCloseTo(100, 5);
  });

  it('treats a same-height inner contour as a courtyard and a higher one as a tower', () => {
    const outer = sq(0, 0, 50, 20).slice(0, -1);
    const court = sq(15, 15, 10, 20).slice(0, -1);
    const tower = sq(2, 2, 6, 35).slice(0, -1);
    const fps = groupRings([court, outer, tower]);
    expect(fps).toHaveLength(2);
    const block = fps.find((f) => f.outer === outer)!;
    expect(block.holes).toEqual([court]);
    expect(fps.some((f) => f.outer === tower && f.holes.length === 0)).toBe(true);
  });
});
