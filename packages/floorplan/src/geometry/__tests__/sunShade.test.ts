/**
 * CNT-58: the shadows the plan casts, the share of each open space in sun, and the way each face
 * of a building looks. The suns here are set by hand where a figure is checked by hand: at 45°
 * a shadow is as long as what casts it is high.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { multiArea } from '../polygons'
import { casterShadow, faceSun, planFaces, planSunAt, shadowsOn, shareInSun, sunCasters, sunMoments, sunSurfaces, type PlanSun } from '../sunShade'

function written(text: string, extra: Record<string, unknown> = {}): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.plan, JSON.stringify(result.problems)).not.toBeNull()
  return parseFloorPlan({ ...(result.plan as object), ...extra })
}

/** Four wings round a 6 × 4 m courtyard open to the sky, walls 2.7 m high. */
const courtyard = (extra: Record<string, unknown> = {}): FloorPlan =>
  written(
    [
      'walls outside 0.3 inside 0.1 height 2.7',
      'room n "North wing" living 12 x 4 at 0,0',
      'room c "Court" - 6 x 4 south of n align west shift 3 outdoor courtyard',
      'room w "West wing" bedroom 2.9 x 4 west of c',
      'room e "East wing" bedroom 3 x 4 east of c',
      'room s "South wing" kitchen 12 x 4 south of c align west shift -3',
    ].join('\n'),
    extra,
  )

/** A sun set by hand: level way toward it on the drawing, and its elevation. */
function handSun(toward: { x: number; y: number }, elevation: number): PlanSun {
  const per = 1 / Math.tan((elevation * Math.PI) / 180)
  return {
    moment: { day: { year: 2026, month: 6, day: 21 }, minutes: 720 },
    position: { azimuth: 180, elevation, declination: 0, equationOfTime: 0, solarMinutes: 720, utcMinutes: 720 },
    up: true,
    toward,
    drawing: 180,
    compass: 'south',
    shadowPerMetre: per,
    northStated: true,
  }
}

describe('the shadows the plan casts', () => {
  it('casts a box as its footprint swept away from the sun by its height', () => {
    const plan = written(['walls outside 0.2 height 3', 'room a "A" living 4 x 4 at 0,0'].join('\n'))
    const { casters, ground } = sunCasters(plan)
    const floor = casters.find((c) => c.kind === 'floor')!
    expect(floor.top - floor.bottom).toBeCloseTo(3, 6)
    const xs = floor.pieces[0]![0]!.map((p) => p[0])
    const side = Math.max(...xs) - Math.min(...xs)
    // At 45° from the south a 3 m box throws its shadow 3 m north of it.
    const shadow = casterShadow(floor, handSun({ x: 0, y: -1 }, 45), ground)
    expect(multiArea(shadow)).toBeCloseTo(side * (side + 3), 4)
    const ys = shadow.flatMap((p) => p[0]!.map((q) => q[1]))
    const top = Math.max(...floor.pieces[0]![0]!.map((p) => p[1]))
    expect(Math.max(...ys)).toBeCloseTo(top + 3, 6)
    expect(Math.min(...ys)).toBeCloseTo(top - side, 6)
  })

  it('casts nothing with the sun down, and nothing on a plane above what casts it', () => {
    const plan = written(['walls outside 0.2 height 3', 'room a "A" living 4 x 4 at 0,0'].join('\n'))
    const casters = sunCasters(plan)
    expect(shadowsOn(casters, { ...handSun({ x: 0, y: 1 }, 45), up: false })).toEqual([])
    expect(shadowsOn(casters, handSun({ x: 0, y: 1 }, 45), 3)).toEqual([])
  })

  it('leaves a courtyard open, and shades it as deep as its south wing is high at 45°', () => {
    const plan = courtyard()
    const court = sunSurfaces(plan).find((s) => s.id === 'c')!
    expect(court.area).toBeCloseTo(24, 6)
    const casters = sunCasters(plan)
    // The sun high overhead shades none of it: the court is a hole in the building, not under it.
    const overhead = handSun({ x: 0, y: -1 }, 89.9)
    expect(shareInSun(court, shadowsOn(casters, overhead), overhead)).toBeCloseTo(1, 2)
    // Sun from the south of the drawing at 45°: the south wing, 2.7 m high, shades 2.7 of the 4 m.
    const south = handSun({ x: 0, y: -1 }, 45)
    expect(shareInSun(court, shadowsOn(casters, south), south)).toBeCloseTo((4 - 2.7) / 4, 2)
  })

  it('shades a tree\'s crown from part way up, and leaves a tree with no height out', () => {
    const plan = written(['walls outside 0.2 height 3', 'room a "A" living 4 x 4 at 0,0'].join('\n'), {
      site: { things: [{ id: 'oak', kind: 'tree', at: [20, 20], canopy: 4, height: 10 }, { id: 'ash', kind: 'tree', at: [30, 30] }] },
    })
    const { casters, noHeight } = sunCasters(plan)
    const oak = casters.find((c) => c.id === 'oak')!
    expect(oak.bottom).toBeCloseTo(4, 6)
    expect(oak.top).toBeCloseTo(10, 6)
    expect(noHeight).toEqual(['ash'])
  })
})

describe('the faces of the buildings', () => {
  it('faces a courtyard\'s sides into it, by the north the plan states', () => {
    const faces = planFaces(courtyard())
    const inner = faces.filter((f) => f.inner)
    expect(inner.map((f) => f.faces).sort()).toEqual(['east', 'north', 'south', 'west'])
    // The wings' outside faces step where the wings meet, so each side may be more than one face.
    expect([...new Set(faces.filter((f) => !f.inner).map((f) => f.faces))].sort()).toEqual(['east', 'north', 'south', 'west'])
    // North turned a quarter counter-clockwise (to -x): the drawing's top now faces east.
    const turned = planFaces(courtyard({ north: 90 }))
    const top = turned.find((f) => !f.inner && f.outward.y > 0.9)!
    expect(top.faces).toBe('east')
  })

  it('gives a massing floor of an outline alone its faces', () => {
    const plan = parseFloorPlan({ version: '1', walls: [], openings: [], rooms: [], floors: [{ id: 'ground', name: 'Ground', level: 0, height: 3, outline: [[0, 0], [20, 0], [20, 10], [0, 10]] }] })
    const faces = planFaces(plan)
    expect(faces.map((f) => [f.faces, Number(f.length.toFixed(2))]).sort()).toEqual([['east', 10], ['north', 20], ['south', 20], ['west', 10]])
  })

  it('says the sun is on a face in front of it, and how much of its foot is in another\'s shadow', () => {
    const plan = courtyard()
    const casters = sunCasters(plan)
    const south = handSun({ x: 0, y: -1 }, 45)
    const shadow = shadowsOn(casters, south)
    const faces = planFaces(plan)
    const outerSouth = faceSun(faces.find((f) => !f.inner && f.faces === 'south')!, south, shadow)
    expect(outerSouth.facing).toBe(true)
    expect(outerSouth.angle).toBeCloseTo(45, 4)
    expect(outerSouth.footInShade).toBeCloseTo(0, 4)
    // The court's north side faces south too: in sun at 45°, as the south wing's 2.7 m shadow
    // stops short of the 4 m court; with the sun lower, its foot is in that shadow.
    const courtNorth = faces.find((f) => f.inner && f.faces === 'south')!
    expect(faceSun(courtNorth, south, shadow).footInShade).toBeCloseTo(0, 4)
    const low = handSun({ x: 0, y: -1 }, (Math.atan(1 / 2) * 180) / Math.PI)
    const lowSun = faceSun(courtNorth, low, shadowsOn(casters, low))
    expect(lowSun.facing).toBe(true)
    expect(lowSun.footInShade).toBeCloseTo(1, 2)
    expect(faceSun(faces.find((f) => !f.inner && f.faces === 'north')!, south, shadow)).toEqual({ facing: false, angle: null, footInShade: 1 })
  })
})

describe('the sun over the plan', () => {
  it('works the sun out from the site and turns it by north', () => {
    const place = { latitude: 51.5, longitude: 0 }
    const up = planSunAt({}, place, { day: { year: 2026, month: 6, day: 21 }, minutes: 720 })
    // Due south at noon: down the drawing when north is up it.
    expect(up.toward.x).toBeCloseTo(0, 2)
    expect(up.toward.y).toBeCloseTo(-1, 2)
    expect(up.northStated).toBe(false)
    const turned = planSunAt({ north: 90 }, place, { day: { year: 2026, month: 6, day: 21 }, minutes: 720 })
    // North to -x: south is +x.
    expect(turned.toward.x).toBeCloseTo(1, 2)
    expect(turned.northStated).toBe(true)
    expect(turned.shadowPerMetre).toBeCloseTo(1 / Math.tan((turned.position.elevation * Math.PI) / 180), 6)
  })

  it('samples a range of days and hours, the last of each always in', () => {
    const moments = sunMoments({ year: 2026, month: 6, day: 1 }, { year: 2026, month: 6, day: 10 }, 9 * 60, 10 * 60 + 15, 7, 30)
    expect(moments.map((m) => `${m.day.day} ${m.minutes}`)).toEqual(['1 540', '1 570', '1 600', '1 615', '8 540', '8 570', '8 600', '8 615', '10 540', '10 570', '10 600', '10 615'])
  })
})
