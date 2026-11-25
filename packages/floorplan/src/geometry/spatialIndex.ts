/**
 * A bucket grid over things with a box (CNT-23): the nearest of many segments to a point, and
 * which things could hold a point, without looking at every one. A room with thousands of items
 * has tens of thousands of edges, and the measures that ask "how far is the nearest edge" at
 * every point of a grid would otherwise take hours.
 *
 * Exact, not approximate: `nearest` returns the least of the same distances a plain loop over
 * every thing would, because it only stops when no thing it has not looked at can be nearer.
 * Pure: boxes in, numbers out.
 */

import { tolerance } from './tolerances'

/** A thing's box, in plan metres. */
export interface IndexBox {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** Fewer things than this are not worth an index: a plain loop is as fast. */
export const INDEX_FROM = 64

export class SpatialIndex {
  private readonly minX: number
  private readonly minY: number
  private readonly maxX: number
  private readonly maxY: number
  private readonly size: number
  private readonly columns: number
  private readonly rows: number
  private readonly cells: number[][]
  private readonly stamp: Int32Array
  private round = 0

  constructor(private readonly boxes: readonly IndexBox[]) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const b of boxes) {
      if (b.minX < minX) minX = b.minX
      if (b.minY < minY) minY = b.minY
      if (b.maxX > maxX) maxX = b.maxX
      if (b.maxY > maxY) maxY = b.maxY
    }
    if (boxes.length === 0) {
      minX = minY = maxX = maxY = 0
    }
    this.minX = minX
    this.minY = minY
    this.maxX = maxX
    this.maxY = maxY
    const width = Math.max(maxX - minX, tolerance('noLength'))
    const height = Math.max(maxY - minY, tolerance('noLength'))
    // About one thing to a bucket, never more than 400 buckets along the longer side.
    this.size = Math.max(Math.sqrt((width * height) / Math.max(1, boxes.length)), Math.max(width, height) / 400, tolerance('noLength'))
    this.columns = Math.max(1, Math.ceil(width / this.size))
    this.rows = Math.max(1, Math.ceil(height / this.size))
    this.cells = Array.from({ length: this.columns * this.rows }, () => [])
    this.stamp = new Int32Array(boxes.length)
    boxes.forEach((b, i) => {
      const c0 = this.column(b.minX)
      const c1 = this.column(b.maxX)
      const r0 = this.row(b.minY)
      const r1 = this.row(b.maxY)
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.cells[r * this.columns + c]!.push(i)
    })
  }

  private column(x: number): number {
    return Math.min(this.columns - 1, Math.max(0, Math.floor((x - this.minX) / this.size)))
  }

  private row(y: number): number {
    return Math.min(this.rows - 1, Math.max(0, Math.floor((y - this.minY) / this.size)))
  }

  private inside(x: number, y: number): boolean {
    return x >= this.minX && x <= this.maxX && y >= this.minY && y <= this.maxY
  }

  /**
   * The least of `distance(i)` over every thing, for a point at (x, y), or Infinity for no things.
   * `distance` must never be less than the distance from the point to the thing's box; with
   * `squared` it is a squared distance, never less than that distance squared.
   */
  nearest(x: number, y: number, distance: (i: number) => number, squared = false): number {
    const n = this.boxes.length
    let best = Infinity
    if (!this.inside(x, y)) {
      for (let i = 0; i < n; i++) best = Math.min(best, distance(i))
      return best
    }
    const round = ++this.round
    const c = this.column(x)
    const r = this.row(y)
    const rings = Math.max(this.columns, this.rows)
    for (let ring = 0; ring <= rings; ring++) {
      for (let row = r - ring; row <= r + ring; row++) {
        if (row < 0 || row >= this.rows) continue
        const edge = row === r - ring || row === r + ring
        const step = edge ? 1 : 2 * ring
        for (let col = c - ring; col <= c + ring; col += step || 1) {
          if (col < 0 || col >= this.columns) continue
          for (const i of this.cells[row * this.columns + col]!) {
            if (this.stamp[i] === round) continue
            this.stamp[i] = round
            const d = distance(i)
            if (d < best) best = d
          }
        }
      }
      // Anything not yet looked at is at least `ring` buckets away.
      const reach = ring * this.size
      if (best <= (squared ? reach * reach : reach)) break
    }
    return best
  }

  /** Calls `visit(i)` once for each thing whose box meets the range (a few others may come too: the box only narrows what is tried). */
  range(minX: number, minY: number, maxX: number, maxY: number, visit: (i: number) => void): void {
    if (maxX < this.minX || minX > this.maxX || maxY < this.minY || minY > this.maxY) return
    const round = ++this.round
    const c1 = this.column(maxX)
    const r1 = this.row(maxY)
    for (let r = this.row(minY); r <= r1; r++) {
      for (let c = this.column(minX); c <= c1; c++) {
        for (const i of this.cells[r * this.columns + c]!) {
          if (this.stamp[i] === round) continue
          this.stamp[i] = round
          visit(i)
        }
      }
    }
  }

  /** Whether `test(i)` holds for any thing whose box holds the point (the box only narrows what is tried). */
  some(x: number, y: number, test: (i: number) => boolean): boolean {
    if (!this.inside(x, y)) return false
    for (const i of this.cells[this.row(y) * this.columns + this.column(x)]!) {
      const b = this.boxes[i]!
      if (x < b.minX || x > b.maxX || y < b.minY || y > b.maxY) continue
      if (test(i)) return true
    }
    return false
  }
}
