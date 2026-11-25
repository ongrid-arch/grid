import { tolerance, type SceneOpening, type Vec2, type WallElevation } from '@ongrid/floorplan/geometry'

/**
 * VEW-58: a wall of a floor shown as a cutaway, lowered to a height above its floor. Pure, with
 * no Three: `useWallGeometries` raises what this returns. An elevation's x runs along the wall and
 * its y up from the floor.
 */

/** Closer than this to the cut is on it, in metres: a height below `noLength` is none. */
const ON_CUT = tolerance('noLength')

/** The polygon kept below `height`: Sutherland-Hodgman against the half-plane under the cut. */
function below(points: readonly Vec2[], height: number): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const aIn = a.y <= height
    const bIn = b.y <= height
    if (aIn) out.push(a)
    if (aIn !== bIn) {
      const t = (height - a.y) / (b.y - a.y)
      out.push({ x: a.x + (b.x - a.x) * t, y: height })
    }
  }
  return out.filter((p, i) => {
    const q = out[(i + out.length - 1) % out.length]!
    return Math.abs(p.x - q.x) > ON_CUT || Math.abs(p.y - q.y) > ON_CUT
  })
}

const onCut = (p: Vec2, height: number): boolean => p.y >= height - ON_CUT

/**
 * A hole that reaches the cut is open at the top: its lower edge, from one end of where it meets
 * the cut to the other, in the order the outline runs along the cut.
 */
function notch(hole: readonly Vec2[], height: number, direction: number): Vec2[] | null {
  const n = hole.length
  for (let i = 0; i < n; i++) {
    const a = hole[i]!
    const b = hole[(i + 1) % n]!
    if (!onCut(a, height) || !onCut(b, height)) continue
    // The edge a→b lies on the cut: the rest of the hole, b round to a, is the notch.
    const chain: Vec2[] = []
    for (let k = 1; k <= n; k++) chain.push(hole[(i + k) % n]!)
    return (chain[chain.length - 1]!.x - chain[0]!.x) * direction < 0 ? chain.reverse() : chain
  }
  return null
}

/**
 * The elevation with everything above `height` taken off. A wall no higher than that is returned
 * as it is. Holes wholly under the cut stay holes; one that reaches it becomes a notch in the top.
 */
export function cutElevation(elevation: WallElevation, height: number): WallElevation {
  if (Math.max(...elevation.outline.map((p) => p.y)) <= height + ON_CUT) return elevation

  let outline = below(elevation.outline, height)
  const holes: Vec2[][] = []
  const notches: Vec2[][] = []
  for (const hole of elevation.holes) {
    if (Math.max(...hole.map((p) => p.y)) < height - ON_CUT) {
      holes.push([...hole])
      continue
    }
    const clipped = below(hole, height)
    if (clipped.length >= 3) notches.push(clipped)
  }

  if (notches.length > 0) {
    const top = outline.findIndex((p, i) => onCut(p, height) && onCut(outline[(i + 1) % outline.length]!, height))
    if (top >= 0) {
      const p = outline[top]!
      const q = outline[(top + 1) % outline.length]!
      const direction = Math.sign(q.x - p.x) || 1
      const chains = notches
        .map((hole) => notch(hole, height, direction))
        .filter((chain): chain is Vec2[] => chain !== null)
        .sort((a, b) => direction * (a[0]!.x - b[0]!.x))
      const joined: Vec2[] = []
      for (const point of [p, ...chains.flat(), q]) {
        const last = joined[joined.length - 1]
        if (last === undefined || Math.abs(last.x - point.x) > ON_CUT || Math.abs(last.y - point.y) > ON_CUT) joined.push(point)
      }
      outline =
        top + 1 < outline.length
          ? [...outline.slice(0, top), ...joined, ...outline.slice(top + 2)]
          : [...outline.slice(1, top), ...joined]
    }
  }

  return { ...elevation, outline, holes, height: Math.min(elevation.height, height) }
}

/** A door or window with its boxes held under `height`: a part wholly above it is not drawn. */
export function cutOpening(opening: SceneOpening, height: number): SceneOpening {
  if (opening.parts.every((part) => part.top <= height)) return opening
  return {
    ...opening,
    parts: opening.parts.filter((part) => part.bottom < height).map((part) => ({ ...part, top: Math.min(part.top, height) }))
  }
}
