/**
 * CNT-23: the bucket grid gives what a plain loop over every box gives, to the last digit.
 */
import { describe, expect, it } from 'vitest'
import { SpatialIndex, type IndexBox } from '../spatialIndex'

function rng(seed: number): () => number {
  let s = seed
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
}

function boxes(n: number, seed: number): IndexBox[] {
  const r = rng(seed)
  return Array.from({ length: n }, () => {
    const x = r() * 40
    const y = r() * 30
    return { minX: x, minY: y, maxX: x + r() * (r() < 0.1 ? 15 : 1), maxY: y + r() * (r() < 0.1 ? 15 : 1) }
  })
}

const distanceTo = (b: IndexBox, x: number, y: number): number => Math.hypot(Math.max(b.minX - x, 0, x - b.maxX), Math.max(b.minY - y, 0, y - b.maxY))

describe('SpatialIndex', () => {
  it('finds the least distance a plain loop finds, for points in and outside its extent', () => {
    for (const seed of [1, 2, 3]) {
      const things = boxes(500, seed)
      const index = new SpatialIndex(things)
      const r = rng(seed + 100)
      for (let k = 0; k < 300; k++) {
        const x = r() * 60 - 10
        const y = r() * 50 - 10
        const plain = Math.min(...things.map((b) => distanceTo(b, x, y)))
        expect(index.nearest(x, y, (i) => distanceTo(things[i]!, x, y))).toBe(plain)
        const squared = Math.min(...things.map((b) => distanceTo(b, x, y) ** 2))
        expect(index.nearest(x, y, (i) => distanceTo(things[i]!, x, y) ** 2, true)).toBe(squared)
      }
    }
  })

  it('visits every box that meets a range, once', () => {
    const things = boxes(400, 7)
    const index = new SpatialIndex(things)
    const r = rng(9)
    for (let k = 0; k < 100; k++) {
      const x = r() * 40
      const y = r() * 30
      const w = r() * 8
      const h = r() * 8
      const seen: number[] = []
      index.range(x, y, x + w, y + h, (i) => seen.push(i))
      expect(new Set(seen).size).toBe(seen.length)
      const meets = things.flatMap((b, i) => (b.maxX >= x && b.minX <= x + w && b.maxY >= y && b.minY <= y + h ? [i] : []))
      for (const i of meets) expect(seen).toContain(i)
    }
  })

  it('says which boxes hold a point, and nothing for a point outside', () => {
    const things = boxes(300, 11)
    const index = new SpatialIndex(things)
    const holds = (x: number, y: number): boolean => things.some((b) => x >= b.minX && x <= b.maxX && y >= b.minY && y <= b.maxY)
    const r = rng(13)
    for (let k = 0; k < 300; k++) {
      const x = r() * 60 - 10
      const y = r() * 50 - 10
      expect(index.some(x, y, () => true)).toBe(holds(x, y))
    }
  })

  it('copes with no things and with things all on a line', () => {
    expect(new SpatialIndex([]).nearest(1, 1, () => 0)).toBe(Infinity)
    const line = Array.from({ length: 100 }, (_, i) => ({ minX: i, minY: 5, maxX: i + 0.5, maxY: 5 }))
    const index = new SpatialIndex(line)
    expect(index.nearest(50.2, 9, (i) => distanceTo(line[i]!, 50.2, 9))).toBe(4)
  })
})
