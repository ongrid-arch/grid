/**
 * CNT-14: kinds of door and window, their handing in the person's terms and the part that
 * opens, in the core: the door-swing check, the doors listed as not checked, the drawing's
 * questions, the plan symbol and the 3D parts.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan, Opening, Wall } from '../plan'
import { parseFloorPlan } from '../../types/floorplan'
import { checkDoorSweeps, validateDoorSweeps } from '../sweep'
import { handingFromRooms, handingInRooms, hingeSeenFrom, sideSeenFrom } from '../handing'
import { buildFloorPlan } from '../floorplan'
import { openingSymbol } from '../openingSymbol'
import { guessedDoorKind } from '../openingKinds'
import { openingParts } from '../openingParts'
import { buildScene } from '../scene3d'
import { validatePlan } from '../validate'
import { doorSwing } from '../door'
import { openingChord, openingSpan } from '../wall'
import { exportPlan } from '../../export/planExport'
import { dot, sub } from '../vec2'

type Tuple = [number, number]

const wall = (id: string, start: Tuple, end: Tuple, extra: Partial<Wall> = {}): Wall => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'interior', ...extra })
const door = (id: string, wallId: string, offset: number, extra: Partial<Opening> = {}): Opening => ({ id, wall: wallId, type: 'door', offset, width: 0.9, sill: 0, height: 2.1, ...extra })
const bare = (walls: Wall[], openings: Opening[]): FloorPlan => ({ version: '1', units: 'm', walls, rooms: [], openings })

/**
 * A hall (west, 0–3 m) and a bedroom (east, 3–6 m), 3 m deep, with a door in the wall between them
 * from y = 1 to 1.8. `reversed` draws that wall north to south instead of south to north, so the
 * same door is written the other way round in the wall's terms.
 */
function twoRooms(reversed = false, extra: Partial<Opening> = {}): FloorPlan {
  const mid = reversed ? wall('mid', [3, 3], [3, 0]) : wall('mid', [3, 0], [3, 3])
  // C2: the offset runs from the wall's start, so the same place along a reversed wall is 3 - 1.8.
  const offset = reversed ? 1.2 : 1
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1', [0, 0], [3, 0], { kind: 'exterior' }),
      mid,
      wall('n1', [3, 3], [0, 3], { kind: 'exterior' }),
      wall('w', [0, 3], [0, 0], { kind: 'exterior' }),
      wall('s2', [3, 0], [6, 0], { kind: 'exterior' }),
      wall('e', [6, 0], [6, 3], { kind: 'exterior' }),
      wall('n2', [6, 3], [3, 3], { kind: 'exterior' })
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s1', 'mid', 'n1', 'w'] },
      { id: 'bedroom', name: 'Bedroom', boundary: ['s2', 'e', 'n2', 'mid'] }
    ],
    openings: [door('d', 'mid', offset, { width: 0.8, ...extra })]
  }
}

/** Where the leaf of a door stated in the wall's terms hangs, in the plan: its pivot and the way it opens. */
function hung(plan: FloorPlan): { pivot: Tuple; opens: Tuple } {
  const drawn = buildFloorPlan(plan).openings[0]!
  const opening = plan.openings[0]!
  const swing = doorSwing(drawn, opening.hinge, opening.swing)!
  const [a, b] = swing.leaf
  const round = (v: number): number => Math.round(v * 1000) / 1000
  return { pivot: [round(a.x), round(a.y)], opens: [Math.sign(round(b.x - a.x)), Math.sign(round(b.y - a.y))] }
}

describe('handing in the person\'s terms (done when 2)', () => {
  it('"opens into the hall" turns into the face of the wall the hall is on, whichever way the wall was drawn', () => {
    const plan = twoRooms()
    expect(handingFromRooms(plan, plan.openings[0]!, { opensInto: 'hall' })).toEqual({ swing: 'left' })
    expect(handingFromRooms(plan, plan.openings[0]!, { opensInto: 'bedroom' })).toEqual({ swing: 'right' })
    const reversed = twoRooms(true)
    expect(handingFromRooms(reversed, reversed.openings[0]!, { opensInto: 'hall' })).toEqual({ swing: 'right' })
  })

  it('"opens into the hall, hinged on the left" hangs the door from the north jamb, opening west, drawn either way', () => {
    for (const reversed of [false, true]) {
      const plan = twoRooms(reversed)
      const asked = handingFromRooms(plan, plan.openings[0]!, { opensInto: 'hall', hinged: 'left' })
      expect('refused' in asked).toBe(false)
      const stated = { ...plan, openings: [{ ...plan.openings[0]!, ...(asked as object) }] }
      // Standing in the hall facing east, the left is north: the leaf hangs at y = 1.8 on the
      // hall's face of the wall (x = 2.9) and opens west, into the hall.
      expect(hung(stated)).toEqual({ pivot: [2.9, 1.8], opens: [-1, 0] })
    }
  })

  it('"hinged on the left as seen from the bedroom" is the other jamb, the room it opens into apart', () => {
    const plan = twoRooms()
    const asked = handingFromRooms(plan, plan.openings[0]!, { opensInto: 'hall', hinged: 'left', seenFrom: 'bedroom' })
    const stated = { ...plan, openings: [{ ...plan.openings[0]!, ...(asked as object) }] }
    // Standing in the bedroom facing west, the left is south: y = 1.
    expect(hung(stated)).toEqual({ pivot: [2.9, 1], opens: [-1, 0] })
  })

  it('reads a door back in rooms, and refuses a room that is not beside it', () => {
    const plan = twoRooms(false, { hinge: 'end', swing: 'left' })
    expect(handingInRooms(plan, plan.openings[0]!)).toEqual({ opensInto: 'hall', hinged: 'left' })
    for (const face of ['left', 'right'] as const) for (const side of ['left', 'right'] as const) expect(sideSeenFrom(face, hingeSeenFrom(face, side))).toBe(side)
    const refused = handingFromRooms(plan, plan.openings[0]!, { opensInto: 'kitchen' })
    expect(refused).toEqual({ refused: 'Door "d" is between "hall" and "bedroom": it can open into one of those only.' })
    expect(handingFromRooms(plan, plan.openings[0]!, { opensInto: 'outside' })).toHaveProperty('refused')
  })
})

describe('the door-swing check by kind', () => {
  // A 0.9 m door at x 1–1.9 on a wall along +x, opening north (left), and a wall across at x = 1.5
  // that a swinging leaf hits.
  const blocked = (extra: Partial<Opening>): FloorPlan =>
    bare([wall('w0', [0, 0], [4, 0]), wall('x', [1.5, 0.1], [1.5, 2])], [door('d1', 'w0', 1, { hinge: 'start', swing: 'left', ...extra })])
  const codes = (plan: FloorPlan): string[] => validateDoorSweeps(plan, (o) => o).map((i) => `${i.code} ${i.id}`)

  it('a sliding door sweeps nothing: the wall a swinging leaf hits is never in its way (done when 2)', () => {
    expect(codes(blocked({}))).toEqual(['opening/door-blocked d1'])
    for (const kind of ['sliding', 'pocket', 'roller', 'garage'] as const) expect(codes(blocked({ kind })), kind).toEqual([])
  })

  it('a door that sweeps nothing needs no swing, and is not listed as not checked', () => {
    const plan = bare([wall('w0', [0, 0], [4, 0])], [door('d1', 'w0', 1, { kind: 'sliding' }), door('d2', 'w0', 2.5)])
    const checked = checkDoorSweeps(plan, (o) => o)
    expect(checked.issues).toEqual([])
    expect(checked.notChecked).toEqual([{ floor: 'ground', doors: ['d2'] }])
  })

  it('lists the doors with no swing stated, floor by floor; a door with half a swing has its own warning instead (done when 2)', () => {
    const plan = parseFloorPlan({
      walls: [wall('w0', [0, 0], [6, 0]), wall('u0', [0, 0], [6, 0], { floor: 'first' })],
      floors: [{ id: 'ground', name: 'Ground floor', level: 0 }, { id: 'first', name: 'First floor', level: 1 }],
      openings: [door('a', 'w0', 0.5), door('b', 'w0', 2, { hinge: 'start' }), door('c', 'w0', 4, { kind: 'double' }), door('e', 'u0', 1)]
    })
    const checked = checkDoorSweeps(plan, (o) => o)
    expect(checked.notChecked).toEqual([{ floor: 'ground', doors: ['a', 'c'] }, { floor: 'first', doors: ['e'] }])
    expect(checked.issues.map((i) => `${i.code} ${i.id}`)).toEqual(['opening/hinge-without-swing b'])
  })

  it('a pair sweeps from both jambs and needs only its face; it hits what either leaf reaches', () => {
    // A wall 0.6 m in front of the door's face: one 0.9 m leaf reaches it, neither 0.45 m leaf of a pair does.
    const front = (extra: Partial<Opening>): FloorPlan =>
      bare([wall('w0', [0, 0], [4, 0]), wall('x', [0.5, 0.8], [2.5, 0.8])], [door('d1', 'w0', 1, { hinge: 'start', swing: 'left', ...extra })])
    expect(codes(front({}))).toEqual(['opening/door-blocked d1'])
    expect(codes(front({ kind: 'double', hinge: undefined }))).toEqual([])
    const far = bare([wall('w0', [0, 0], [4, 0]), wall('x', [2.2, 0.1], [2.2, 2])], [door('d1', 'w0', 1, { width: 1.6, kind: 'double', swing: 'left' })])
    // From x = 1 to 2.6: the leaf hung at 2.6 swings back to 1.8 and passes 2.2.
    expect(codes(far)).toEqual(['opening/door-blocked d1'])
    const half = bare([wall('w0', [0, 0], [4, 0])], [door('d1', 'w0', 1, { kind: 'double', hinge: 'start' })])
    expect(codes(half)).toEqual(['opening/hinge-without-swing d1'])
  })

  it('a folding door sweeps a strip one panel deep: a wall further out is clear, one nearer is not', () => {
    // A 1.8 m folding door folds in three 0.6 m panels and sweeps 0.6 m out from the wall's face (0.1).
    const at = (y: number): FloorPlan =>
      bare([wall('w0', [0, 0], [4, 0]), wall('x', [0.5, y], [3.5, y])], [door('d1', 'w0', 1, { width: 1.8, kind: 'folding', hinge: 'start', swing: 'left' })])
    expect(codes(at(0.9))).toEqual([])
    expect(codes(at(0.5))).toEqual(['opening/door-blocked d1'])
    // As one leaf, the 1.8 m arc would reach the far wall.
    const leaf = at(0.9)
    expect(codes({ ...leaf, openings: [{ ...leaf.openings[0]!, kind: undefined }] })).toEqual(['opening/wide-single-leaf d1', 'opening/door-blocked d1'])
  })

  it('a door that opens only in part sweeps only that part', () => {
    expect(codes(blocked({ opens: { width: 0.4 } }))).toEqual([])
  })

  it('asks about a wide door that states no kind, and not once it states one (lab EL-5)', () => {
    const wide = bare([wall('w0', [0, 0], [6, 0], { height: 5 })], [door('d1', 'w0', 1, { width: 3.5, height: 4.5, hinge: 'start', swing: 'left' })])
    const issue = validateDoorSweeps(wide, (o) => o).find((i) => i.code === 'opening/wide-single-leaf')
    expect(issue).toMatchObject({ id: 'd1', severity: 'warning', message: 'This door states no kind, so it is checked as one swinging leaf and drawn as Grid\'s guess, a pair or a sliding door; a leaf this wide is rare.' })
    expect(codes({ ...wide, openings: [{ ...wide.openings[0]!, kind: 'roller' }] })).toEqual([])
    expect(codes({ ...wide, openings: [{ ...wide.openings[0]!, kind: 'single' }] })).toEqual([])
    expect(codes({ ...wide, openings: [{ ...wide.openings[0]!, width: 1.49 }] })).toEqual([])
  })

  it('guesses a pair or a sliding door for a wide door that states no kind, to draw it by (VEW-22)', () => {
    expect(guessedDoorKind(0.9, {})).toBeNull()
    expect(guessedDoorKind(1.49, { swing: 'left' })).toBeNull()
    expect(guessedDoorKind(1.8, { swing: 'left' })).toBe('double')
    expect(guessedDoorKind(3, { swing: 'right' })).toBe('double')
    expect(guessedDoorKind(1.8, {})).toBe('sliding')
    expect(guessedDoorKind(4, { swing: 'left' })).toBe('sliding')
    // A door that states its kind, or the part of it that opens, is drawn as it states.
    expect(guessedDoorKind(4, { kind: 'single' })).toBeNull()
    expect(guessedDoorKind(4, { opens: { width: 0.9 } })).toBeNull()
  })
})

describe('the drawing\'s questions on a kind', () => {
  const issues = (opening: Opening): string[] =>
    validatePlan(bare([wall('w0', [0, 0], [4, 0])], [opening])).issues.map((i) => `${i.code}: ${i.message}`)

  it('names a kind its type does not take, and draws it as one with no kind', () => {
    expect(issues({ ...door('d1', 'w0', 1), kind: 'fixed' })).toEqual([
      'opening/kind-not-for-type: Opening "d1" is a door of kind "fixed", which a door cannot be, so it is drawn as one with no kind. The kinds a door takes: single, double, sliding, pocket, folding, roller, garage'
    ])
    expect(issues({ ...door('w1', 'w0', 1, { type: 'window', sill: 0.9, height: 1.2 }), kind: 'garage' })).toHaveLength(1)
    expect(buildFloorPlan(bare([wall('w0', [0, 0], [4, 0])], [{ ...door('d1', 'w0', 1), kind: 'fixed' }])).openings[0]!.kind).toBeUndefined()
  })

  it('names a part that opens larger than its opening, or on a fixed window', () => {
    expect(issues(door('d1', 'w0', 1, { opens: { width: 1.2 } }))).toEqual([
      'opening/part-too-large: Opening "d1": the part that opens is 1.20 m wide, wider than the 0.90 m opening, so it is drawn and measured as the whole opening'
    ])
    expect(issues(door('w1', 'w0', 1, { type: 'window', sill: 0.9, height: 1.2, kind: 'fixed', opens: { width: 0.5 } }))[0]).toMatch(/a fixed window has no part that opens/)
    expect(issues(door('d1', 'w0', 1, { opens: { width: 0.5, height: 2 } }))).toEqual([])
  })
})

describe('the plan symbol of each kind (done when 1)', () => {
  const drawn = (opening: Opening, thickness = 0.2) => buildFloorPlan(bare([wall('w0', [0, 0], [6, 0], { thickness, height: 5 })], [opening])).openings[0]!

  it('draws a 3.5 m dock door as its kind, never as a 3.5 m arc', () => {
    const dock = drawn(door('dock', 'w0', 1, { width: 3.5, height: 4.5, kind: 'roller', swing: 'right' }))
    const symbol = openingSymbol(dock)!
    expect(symbol.kind).toBe('roller')
    expect(symbol.pieces.filter((p) => p.shape === 'arc')).toEqual([])
    // The curtain across the opening on the face it runs on, and its roll overhead, dashed.
    const lines = symbol.pieces.filter((p) => p.shape === 'line' && p.part === 'leaf')
    expect(lines).toHaveLength(2)
    expect(lines.filter((p) => p.shape === 'line' && p.above === true)).toHaveLength(1)
    // As one leaf it was the 3.5 m arc.
    const leaf = openingSymbol(drawn(door('dock', 'w0', 1, { width: 3.5, height: 4.5, hinge: 'start', swing: 'right' })))!
    expect(leaf.pieces.filter((p) => p.shape === 'arc').map((p) => p.shape === 'arc' && p.radius)).toEqual([3.5])
  })

  it('draws one leaf as before CNT-14, a pair as two swings, a sliding door with none, and a door with no swing stated not at all', () => {
    const one = drawn(door('d', 'w0', 1, { hinge: 'end', swing: 'left' }))
    const swing = doorSwing(one, 'end', 'left')!
    const symbol = openingSymbol(one)!
    expect(symbol.pieces.map((p) => (p.shape === 'arc' ? 'arc' : p.part))).toEqual(['jamb', 'jamb', 'leaf', 'arc'])
    expect(symbol.pieces[2]).toMatchObject({ from: swing.leaf[0], to: swing.leaf[1] })
    const pair = openingSymbol(drawn(door('d', 'w0', 1, { width: 1.6, kind: 'double', swing: 'right' })))!
    expect(pair.pieces.filter((p) => p.shape === 'arc').map((p) => p.shape === 'arc' && Number(p.radius.toFixed(3)))).toEqual([0.8, 0.8])
    const sliding = openingSymbol(drawn(door('d', 'w0', 1, { width: 2.4, kind: 'sliding' })))!
    expect(sliding.pieces.map((p) => (p.shape === 'arc' ? 'arc' : p.part))).toEqual(['jamb', 'jamb', ...Array(2).fill(['leaf', 'leaf', 'leaf', 'leaf', 'glass']).flat(), ...Array(6).fill('arrow')])
    expect(openingSymbol(drawn(door('d', 'w0', 1)))).toBeNull()
    expect(openingSymbol(drawn(door('d', 'w0', 1, { kind: 'double' })))).toBeNull()
  })

  it('draws a pocket door\'s pocket and a high-level window dashed, and a sliding window as two panes', () => {
    const pocket = openingSymbol(drawn(door('d', 'w0', 2, { kind: 'pocket', hinge: 'start' })))!
    expect(pocket.pieces.filter((p) => p.shape === 'line' && p.above === true)).toHaveLength(1)
    const window = (kind: Opening['kind']) => openingSymbol(drawn(door('w', 'w0', 2, { type: 'window', sill: 2, height: 0.5, width: 1.2, kind })))!
    expect(window(undefined).pieces.map((p) => p.shape === 'line' && p.part)).toEqual(['face', 'face', 'glass'])
    expect(window('high-level').pieces.every((p) => p.shape === 'line' && p.above === true)).toBe(true)
    expect(window('sliding').pieces.map((p) => p.shape === 'line' && p.part)).toEqual(['face', 'face', 'glass', 'glass'])
    expect(window('double').pieces).toHaveLength(4)
  })
})

describe('glass, frames and leaves in 3D (done when 3)', () => {
  const host = wall('w0', [0, 0], [6, 0], { thickness: 0.3 })

  it('hangs a door\'s leaf, closed, from the face of the wall it opens toward', () => {
    for (const [swing, face] of [['left', 0.15], ['right', -0.15]] as const) {
      const parts = openingParts(door('d', 'w0', 1, { hinge: 'start', swing }), host)
      const leaves = parts.filter((p) => p.part === 'leaf')
      expect(leaves).toHaveLength(1)
      const leaf = leaves[0]!
      expect(swing === 'left' ? leaf.across[1] : leaf.across[0]).toBeCloseTo(face, 12)
      expect(leaf.across[1] - leaf.across[0]).toBeCloseTo(0.04, 12)
      // Between the jambs and under the head of its frame, which lines the wall's whole depth.
      expect(leaf.along[0]).toBeCloseTo(1.05, 12)
      expect(leaf.along[1]).toBeCloseTo(1.85, 12)
      expect(leaf.up[0]).toBe(0)
      expect(leaf.up[1]).toBeCloseTo(2.05, 12)
      const frame = parts.filter((p) => p.part === 'frame')
      expect(frame).toHaveLength(3)
      for (const member of frame) expect(member.across).toEqual([-0.15, 0.15])
    }
  })

  it('gives a pair two leaves, a folding door its panels and a sliding door two leaves in the wall', () => {
    const count = (extra: Partial<Opening>): number => openingParts(door('d', 'w0', 1, { width: 1.8, swing: 'left', ...extra }), host).filter((p) => p.part === 'leaf').length
    expect(count({ kind: 'double' })).toBe(2)
    expect(count({ kind: 'folding', hinge: 'start' })).toBe(3)
    expect(count({ kind: 'sliding' })).toBe(2)
    expect(count({ kind: 'garage' })).toBe(1)
    // A door that opens in part: its leaf, and a glazed fixed panel beside it.
    const sidelight = openingParts(door('d', 'w0', 1, { width: 1.8, hinge: 'start', swing: 'left', opens: { width: 1 } }), host)
    expect(sidelight.filter((p) => p.part === 'glass')).toHaveLength(1)
  })

  it('fills a window with its frame, a sash and its glass; a fixed one with glass alone', () => {
    const window = (extra: Partial<Opening>) => openingParts(door('w', 'w0', 1, { type: 'window', width: 1.2, sill: 0.9, height: 1.2, ...extra }), host)
    const casement = window({})
    expect(casement.filter((p) => p.part === 'glass')).toHaveLength(1)
    expect(casement.filter((p) => p.part === 'frame')).toHaveLength(8)
    const fixed = window({ kind: 'fixed' })
    expect(fixed.map((p) => p.part)).toEqual(['frame', 'frame', 'frame', 'frame', 'glass'])
    // In the middle of the wall, 0.07 m deep, the glass 0.02 m thick.
    expect(fixed[0]!.across).toEqual([-0.035, 0.035])
    expect(fixed[4]!.across).toEqual([-0.01, 0.01])
    expect(window({ kind: 'sliding' }).filter((p) => p.part === 'glass')).toHaveLength(2)
    // Opening in part: the sash at the start end, fixed glass beside it.
    expect(window({ opens: { width: 0.6 } }).filter((p) => p.part === 'glass')).toHaveLength(2)
  })

  it('puts the parts in the scene the views and the files are made from, and none in a doorless opening or a dividing line', () => {
    const plan = bare([host, wall('v', [0, 2], [6, 2], { virtual: true })], [
      door('d', 'w0', 1, { hinge: 'start', swing: 'left' }),
      door('w', 'w0', 3, { type: 'window', width: 1.2, sill: 0.9, height: 1.2 }),
      door('o', 'w0', 4.6, { type: 'opening', width: 1 }),
      door('dv', 'v', 1)
    ])
    const scene = buildScene(plan)
    expect(scene.openings.map((o) => o.id)).toEqual(['d', 'w'])
    const leaf = scene.openings[0]!.parts.find((p) => p.part === 'leaf')!
    // On the plan: the leaf's outline lies on the wall's left face, y from 0.11 to 0.15.
    expect(Math.max(...leaf.outline.map((p) => p.y))).toBeCloseTo(0.15, 12)
    expect(Math.min(...leaf.outline.map((p) => p.y))).toBeCloseTo(0.11, 12)
  })

  it('places, checks and draws a door or window of a kind on a wall placed by its face (HND-11) as on the centre line it is read on', () => {
    const openings = [
      { id: 'd', wall: 'w0', type: 'door', offset: 1, width: 1.8, height: 2.1, kind: 'double', swing: 'left' },
      { id: 's', wall: 'w0', type: 'door', offset: 3, width: 1.2, height: 2.1, kind: 'sliding', opens: { width: 0.6 } },
      { id: 'w', wall: 'w0', type: 'window', offset: 4.6, width: 1.2, sill: 0.9, height: 1.2, kind: 'fixed' }
    ]
    // The same wall, 0.3 m thick: by its centre line, and by its left face, 0.15 m to the north.
    const byCentre = parseFloorPlan({ version: '1', walls: [{ id: 'w0', start: [0, 0], end: [6, 0], thickness: 0.3 }], openings })
    const byFace = parseFloorPlan({ version: '1', walls: [{ id: 'w0', start: [0, 0.15], end: [6, 0.15], face: 'left', thickness: 0.3 }], openings })
    expect(byFace.walls[0]!.start).toEqual([0, 0])
    expect(byFace.openings).toEqual(byCentre.openings)
    expect(buildScene(byFace).openings).toEqual(buildScene(byCentre).openings)
    const symbols = (plan: FloorPlan) => buildFloorPlan(plan).openings.map((o) => openingSymbol(o))
    expect(symbols(byFace)).toEqual(symbols(byCentre))
    const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => `${i.code} ${i.id}`).sort()
    expect(codes(byFace)).toEqual(codes(byCentre))
  })
})

describe('kinds on a curved wall (CNT-18)', () => {
  /** A round room: one wall, a whole circle of radius 3 m round (5, 5), with a door or window of every kind on it. */
  const on = (id: string, offset: number, extra: Partial<Opening>): Opening => door(id, 'round', offset, extra)
  const drum = (): FloorPlan => ({
    version: '1',
    units: 'm',
    walls: [wall('round', [8, 5], [8, 5], { kind: 'exterior', arc: { centre: [5, 5], sweep: 360 } })],
    rooms: [{ id: 'drum', name: 'Drum', boundary: ['round'] }],
    openings: [
      on('single', 0.5, { hinge: 'start', swing: 'left' }),
      on('double', 2, { kind: 'double', width: 1.4, swing: 'left' }),
      on('sliding', 4, { kind: 'sliding', width: 1.6 }),
      on('pocket', 6, { kind: 'pocket' }),
      on('folding', 7.5, { kind: 'folding', width: 1.6, hinge: 'start', swing: 'right' }),
      on('roller', 10, { kind: 'roller', width: 2 }),
      on('garage', 13, { kind: 'garage', width: 2.2 }),
      on('w1', 16, { type: 'window', kind: 'double', sill: 0.9, height: 1.2, width: 1.2, opens: { width: 0.6 } }),
      on('w2', 17.6, { type: 'window', kind: 'fixed', sill: 0.9, height: 1.2, width: 0.6 })
    ]
  })

  it('checks each kind on the curve: no question, no door left unchecked, and nothing in the way', () => {
    const plan = drum()
    expect(validatePlan(plan).issues).toEqual([])
    const checked = checkDoorSweeps(plan, (o) => o)
    expect(checked.issues).toEqual([])
    expect(checked.notChecked).toEqual([])
    // A door that swings or folds sweeps the floor from its straight hole; one that slides or lifts sweeps nothing.
    const drawn = buildFloorPlan(plan)
    for (const id of ['sliding', 'pocket', 'roller', 'garage']) expect(drawn.openings.find((o) => o.id === id)!.kind).toBeDefined()
  })

  it('raises each door in 3D square to its straight hole, and each window along the curve, within the wall', () => {
    const plan = drum()
    const scene = buildScene(plan)
    expect(scene.openings.map((o) => o.id).sort()).toEqual(plan.openings.map((o) => o.id).sort())
    const round = plan.walls[0]!
    for (const opening of scene.openings) {
      const span = openingSpan(plan.openings.find((o) => o.id === opening.id)!)
      const chord = openingChord(round, span.from, span.to)
      if (opening.type === 'window') {
        // VEW-77: a window follows the curve in facets, each inside the wall's faces.
        for (const point of opening.parts.flatMap((part) => part.outline)) {
          const r = Math.hypot(point.x - 5, point.y - 5)
          expect(Math.abs(r - 3)).toBeLessThanOrEqual(round.thickness / 2 + 1e-9)
          // Round the curve, between its edges (the drum starts at angle 0 and turns counter-clockwise),
          // to the millimetre: a facet's edge stands square to its chord, not quite on the radius.
          const along = ((Math.atan2(point.y - 5, point.x - 5) + 2 * Math.PI) % (2 * Math.PI)) * 3
          expect(along).toBeGreaterThanOrEqual(span.from - 1e-3)
          expect(along).toBeLessThanOrEqual(span.to + 1e-3)
        }
        continue
      }
      for (const part of opening.parts) {
        for (const point of part.outline) {
          const d = sub(point, chord.start)
          // Along the chord, between its ends; across it, within the wall's half thickness.
          expect(dot(d, chord.dir)).toBeGreaterThanOrEqual(-1e-9)
          expect(dot(d, chord.dir)).toBeLessThanOrEqual(chord.length + 1e-9)
          expect(Math.abs(dot(d, chord.normal))).toBeLessThanOrEqual(round.thickness / 2 + 1e-9)
        }
      }
    }
  })

  it('turns a handing said in rooms into the wall\'s terms on the curve', () => {
    const plan = parseFloorPlan(drum())
    const single = plan.openings.find((o) => o.id === 'single')!
    expect(handingFromRooms(plan, single, { opensInto: 'drum', hinged: 'left' })).toEqual({ hinge: 'end', swing: 'left' })
    expect(handingFromRooms(plan, single, { opensInto: 'outside' })).toEqual({ swing: 'right' })
  })

  it('exports every kind on the curve, each door and window filled in the IFC', () => {
    const options = { projectId: 'p', projectName: 'Drum', now: new Date(0) }
    const ifc = exportPlan(drum(), 'ifc', options).data as string
    expect(ifc.match(/IFCDOOR\(/g)?.length).toBe(7)
    expect(ifc.match(/IFCWINDOW\(/g)?.length).toBe(2)
    for (const format of ['dxf', 'obj', 'glb'] as const) expect(() => exportPlan(drum(), format, options)).not.toThrow()
  })
})
