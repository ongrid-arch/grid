/**
 * VEW-9: the walk-through, `grid describe --length walk` and `grid_describe length=walk`.
 *
 * AD-4's witnesses of the block's ground floor are not in the repository, so the 19 checks below
 * were written from the plan by hand: the block is the lab's six-storey block as the scoreboard
 * stores it (`D/scenarios/d2-block-g+5.json`, VEW-5's), and each figure is worked out from its
 * walls and openings, not from Grid's answer.
 *
 * Its ground floor, on the drawing (north at the top, +y): a band of rooms along the south
 * (y 0–7.6): Shop 1 (x 0–10), the Stair (10–13), the Riser (13–16, y 0–5) under the Lift (13–16,
 * y 5–7.6) and Shop 2 (16–26); the Lift lobby, a corridor (y 7.6–9.6) the whole width; and along
 * the north (y 9.6–18) the Bin store (0–9), the Entrance lobby (9–17) and the Cycle store (17–26).
 * Outside walls 0.35 m thick, the corridor's 0.25, the core's 0.30, the Stair's east wall and the
 * Lift's south wall 0.20, the lobby's sides 0.25. The way in is the 1.8 m main door in the middle
 * of the Entrance lobby's north wall (x 13), the only door from outside into a corridor.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../../quantities/survey'
import { planWalk, walkText, type WalkStop, type WalkThing } from '../walk'
import { runGrid } from '../../command/main'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

const LAB = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')

function labPlan(name: string): Record<string, unknown> {
  for (const line of gunzipSync(readFileSync(LAB)).toString('utf8').split('\n')) {
    if (line.length === 0) continue
    const stored = JSON.parse(line) as { name: string; text: string }
    if (stored.name === name) return JSON.parse(stored.text) as Record<string, unknown>
  }
  throw new Error(`${name} is not in the lab data`)
}

const BLOCK = labPlan('D/scenarios/d2-block-g+5.json')
const FLAT = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')) as Record<string, unknown>

const block = surveyPlan(parseFloorPlan(BLOCK))
const ground = planWalk(block, 'ground').floors[0]!
const stop = (room: string): WalkStop => {
  const found = ground.stops.find((s) => s.room === room)
  if (found === undefined) throw new Error(`${room} is not walked`)
  return found
}
/** A wall's things as [id, figure] pairs, the figure rounded to centimetres. */
const said = (things: readonly WalkThing[], figure: 'ahead' | 'across'): Array<[string, number]> => things.map((t) => [t.id, Math.round(t[figure] * 100) / 100])

describe('the walk of the block\'s ground floor: 19 checks written from the plan (AD-4)', () => {
  it('1. it starts at the main door, the way in from outside into a corridor', () => {
    expect(ground.start).toBe('way in')
    expect([ground.stops[0]!.room, ground.stops[0]!.from, ground.stops[0]!.via, ground.stops[0]!.viaWidth]).toEqual(['G-entrance', 'outside', 'G-d-main', 1.8])
  })

  it('2. every room is walked, sweeping left to right and depth first: the Riser straight after the Stair', () => {
    expect(ground.stops.map((s) => s.room)).toEqual(['G-entrance', 'G-lift-lobby', 'G-cycles', 'G-shop2', 'G-lift', 'G-stair', 'G-riser', 'G-shop1', 'G-bins'])
    expect(ground.notReached).toEqual([])
  })

  it('3. in the Entrance lobby you face south, into a room 7.75 m across and 8.10 m deep', () => {
    // Across: between the lobby's sides' faces, 9.125 to 16.875. Deep: from the north wall's face (17.825) to the corridor's (9.725).
    const s = stop('G-entrance')
    expect([s.facing, Number(s.across.toFixed(2)), Number(s.deep.toFixed(2))]).toEqual(['S', 7.75, 8.1])
  })

  it('4. straight ahead, 8.10 m away, the opening into the Lift lobby', () => {
    const s = stop('G-entrance')
    expect(said(s.ahead, 'across')).toEqual([['G-d-entr', 0]])
    expect(s.ahead[0]!.to).toBe('G-lift-lobby')
    expect(s.reach.ahead).toBeCloseTo(8.1, 6)
  })

  it('5. in the wall you stand in, a window 2 m to your left (east, x 15) and one 2 m to your right (west, x 11)', () => {
    expect(said(stop('G-entrance').behind, 'across')).toEqual([['G-w-e2', 2], ['G-w-e1', -2]])
  })

  it('6. the lobby\'s sides are plain walls, 3.875 m to either side', () => {
    const s = stop('G-entrance')
    expect([s.left, s.right]).toEqual([[], []])
    expect(s.reach.left).toBeCloseTo(3.875, 6)
    expect(s.reach.right).toBeCloseTo(3.875, 6)
  })

  it('7. into the Lift lobby through the opening, facing south: 25.65 m across, 1.75 m deep', () => {
    const s = stop('G-lift-lobby')
    expect([s.from, s.via, s.viaKind, s.facing, Number(s.across.toFixed(2)), Number(s.deep.toFixed(2))]).toEqual(['G-entrance', 'G-d-entr', 'opening', 'S', 25.65, 1.75])
  })

  it('8. ahead in the Lift lobby, left to right: Shop 2\'s back door 10.5 m left, the Lift 1.5 m left, the Stair 1.5 m right, Shop 1\'s back door 5.5 m right', () => {
    // Facing south from x 13: the doors' middles are at x 23.5, 14.5, 11.5 and 7.5.
    expect(said(stop('G-lift-lobby').ahead, 'across')).toEqual([['G-d-shop2-back', 10.5], ['G-d-lift', 1.5], ['G-d-stair', -1.5], ['G-d-shop1-back', -5.5]])
  })

  it('9. beside you in the Lift lobby: the Cycle store\'s door 8 m to the left and the Bin store\'s 8 m to the right', () => {
    // In the corridor's north wall, the one you came through, at x 21 and x 5.
    expect(said(stop('G-lift-lobby').behind, 'across')).toEqual([['G-d-cyc-in', 8], ['G-d-bins-in', -8]])
  })

  it('10. the Lift lobby\'s ends are plain walls, 12.825 m to either side', () => {
    const s = stop('G-lift-lobby')
    expect([s.left, s.right]).toEqual([[], []])
    expect(s.reach.left).toBeCloseTo(12.825, 6)
    expect(s.reach.right).toBeCloseTo(12.825, 6)
  })

  it('11. in the Cycle store, facing north: the door out on your right, 4.275 m ahead, its east wall 4.825 m away', () => {
    // From x 21 on the corridor's face (y 9.725): the door out is in the east wall's face (x 25.825), its middle at y 14.
    const s = stop('G-cycles')
    expect(s.facing).toBe('N')
    expect(said(s.right, 'ahead')).toEqual([['G-d-cyc-out', 4.28]])
    expect(s.right[0]!.to).toBe('outside')
    expect(s.reach.right).toBeCloseTo(4.825, 6)
  })

  it('12. in the Bin store, facing north: the door out on your left, 4.275 m ahead', () => {
    const s = stop('G-bins')
    expect(s.facing).toBe('N')
    expect(said(s.left, 'ahead')).toEqual([['G-d-bins-out', 4.28]])
    expect(s.reach.left).toBeCloseTo(4.825, 6)
  })

  it('13. in Shop 2, facing south: a window 0.5 m left, the street door 2.5 m right and a window 5.5 m right', () => {
    // From x 23.5: the window middles at x 24 and 18, the street door's at 21.
    const s = stop('G-shop2')
    expect(s.facing).toBe('S')
    expect(said(s.ahead, 'across')).toEqual([['G-w-shop2-b', 0.5], ['G-d-shop2-street', -2.5], ['G-w-shop2-a', -5.5]])
    expect(s.reach.ahead).toBeCloseTo(7.3, 6)
  })

  it('14. Shop 2\'s sides: the east wall 2.325 m to your left, the core\'s wall 7.35 m to your right, both plain', () => {
    const s = stop('G-shop2')
    expect([s.left, s.right]).toEqual([[], []])
    expect(s.reach.left).toBeCloseTo(2.325, 6)
    expect(s.reach.right).toBeCloseTo(7.35, 6)
  })

  it('15. in Shop 1, facing south: a window 0.5 m left, the street door 2.5 m right and a window 5.5 m right', () => {
    // From x 7.5: the window middles at x 8 and 2, the street door's at 5.
    expect(said(stop('G-shop1').ahead, 'across')).toEqual([['G-w-shop1-b', 0.5], ['G-d-shop1-street', -2.5], ['G-w-shop1-a', -5.5]])
  })

  it('16. Shop 1\'s sides: the core\'s wall 2.35 m to your left, the west wall 7.325 m to your right', () => {
    const s = stop('G-shop1')
    expect(s.reach.left).toBeCloseTo(2.35, 6)
    expect(s.reach.right).toBeCloseTo(7.325, 6)
  })

  it('17. in the Stair, facing south: the window straight ahead 7.3 m away, the Riser\'s door on your left 4.975 m ahead', () => {
    // From x 11.5 on the corridor's face (y 7.475); the Riser's door is in the Stair's east wall, its middle at y 2.5.
    const s = stop('G-stair')
    expect(said(s.ahead, 'across')).toEqual([['G-w-stair', 0]])
    expect(s.reach.ahead).toBeCloseTo(7.3, 6)
    expect(s.left.map((t) => t.id)).toEqual(['G-d-riser'])
    expect(s.left[0]!.ahead).toBeCloseTo(4.975, 6)
  })

  it('18. into the Riser from the Stair, facing east: 2.75 m deep, plain walls all round', () => {
    // From the Stair's east wall's face (x 13.1) to the core's (x 15.85); y 0.175 to 4.9.
    const s = stop('G-riser')
    expect([s.from, s.facing, Number(s.deep.toFixed(3)), Number(s.across.toFixed(3))]).toEqual(['G-stair', 'E', 2.75, 4.725])
    expect([s.ahead, s.left, s.right, s.behind]).toEqual([[], [], [], []])
  })

  it('19. the Lift, from the Lift lobby, facing south: 2.75 m across, 2.375 m deep and nothing in its walls', () => {
    const s = stop('G-lift')
    expect([s.from, s.facing, Number(s.across.toFixed(3)), Number(s.deep.toFixed(3))]).toEqual(['G-lift-lobby', 'S', 2.75, 2.375])
    expect([s.ahead, s.left, s.right, s.behind]).toEqual([[], [], [], []])
  })
})

describe('the walk in words', () => {
  it('for a person: names only, never an id, and what is ahead, left, right and beside you', () => {
    const text = walkText(block, planWalk(block, 'ground'), 'person')
    expect(text).toContain('1. Entrance lobby, in from outside through a door 1.8 m wide. Facing S, it is 7.75 m across and 8.1 m deep, 62.8 m².')
    expect(text).toContain('   Ahead, 8.1 m away: an opening 1.8 m wide to Lift lobby, straight ahead.')
    expect(text).toContain('   In the wall you stand in: a window 1.6 m wide, 2 m to your left; a window 1.6 m wide, 2 m to your right.')
    expect(text).toContain('   On your left, 1.4 m away: a door 0.8 m wide to Riser and cleaner store, 4.97 m ahead.')
    expect(text).toContain('checks nothing')
    for (const id of block.plan.rooms.map((r) => r.id).concat(block.plan.openings.map((o) => o.id))) expect(text).not.toContain(id)
  })

  it('for an agent: one terse line a stop, with the ids', () => {
    const text = walkText(block, planWalk(block, 'ground'), 'agent')
    expect(text).toContain('1 G-entrance <OUT G-d-main d1.8 | S 7.75x8.1 62.78 | A8.1 G-d-entr o1.8>G-lift-lobby 0 | L3.88 - | R3.88 - | B G-w-e2 w1.6>OUT L2; G-w-e1 w1.6>OUT R2')
  })

  it('a floor laid out like an earlier one is said once; a floor with no door from outside starts in its stair room', () => {
    const walk = planWalk(block)
    expect(walk.floors.map((f) => [f.floor, f.repeats])).toEqual([['ground', null], ['L1', null], ['L2', 'L1'], ['L3', 'L1'], ['L4', 'L1'], ['L5', 'L1']])
    const l1 = walk.floors[1]!
    expect([l1.start, l1.stops[0]!.room, l1.stops[0]!.from, l1.notReached]).toEqual(['stair', 'L1-stair', null, []])
  })

  it('with the plan\'s y running down the page, left and right are the building\'s', () => {
    const flat = surveyPlan(parseFloorPlan(FLAT))
    const mirrored = surveyPlan(parseFloorPlan({ ...FLAT, yAxis: 'down' }))
    const hall = planWalk(flat).floors[0]!.stops[0]!
    const flipped = planWalk(mirrored).floors[0]!.stops[0]!
    expect(hall.left.map((t) => t.id)).toEqual(['door-bed2', 'door-bath'])
    expect(flipped.right.map((t) => t.id)).toEqual(['door-bed2', 'door-bath'])
    expect(walkText(mirrored, planWalk(mirrored), 'person')).toContain('left and right are read the right way round')
  })
})

describe('grid describe --length walk', () => {
  let b: Bench
  afterEach(() => b?.close())

  async function grid(args: string[]): Promise<{ code: number; out: string; err: string }> {
    let out = ''
    let err = ''
    const code = await runGrid(args, { stdout: (d) => { out += String(d) }, stderr: (d) => { err += String(d) }, stdoutIsTerminal: false, cwd: b.folder })
    return { code, out, err }
  }

  it('walks one floor with --floor, and refuses --floor and --pictures with another length', async () => {
    b = bench({ 'block.json': BLOCK })
    const run = await grid(['describe', 'block.json', '--length', 'walk', '--floor', 'ground'])
    expect(run.code).toBe(0)
    expect(run.out.split('\n')[0]).toBe('General guidance, not your local rules')
    expect(run.out).toContain('Ground floor: 9 rooms walked.')
    expect(run.out).not.toContain('Floor 1')
    const refused = await grid(['describe', 'block.json', '--floor', 'ground'])
    expect(refused.code).not.toBe(0)
    expect(refused.err).toContain('--floor goes with --length walk only')
    const pictures = await grid(['describe', 'block.json', '--length', 'rooms', '--pictures', 'walk'])
    expect(pictures.err).toContain('--pictures goes with --length walk only')
  })

  it('writes a picture from each doorway with --pictures, and names it under its room', async () => {
    b = bench({ 'flat.json': FLAT })
    const { mkdirSync, readdirSync } = await import('fs')
    const { join } = await import('path')
    mkdirSync(join(b.folder, 'walk'))
    const run = await grid(['describe', 'flat.json', '--length', 'walk', '--pictures', 'walk'])
    expect(run.code).toBe(0)
    expect(readdirSync(join(b.folder, 'walk')).sort()).toEqual(['walk-01.png', 'walk-02.png', 'walk-03.png', 'walk-04.png', 'walk-05.png', 'walk-06.png'])
    expect(run.out).toContain('   Picture: walk/walk-01.png, at eye height (1.6 m), a step in, looking ahead.')
  }, 30_000)
})

describe('grid_describe length=walk', () => {
  let b: Bench
  afterEach(() => b?.close())

  it('gives the walk, and with pictures one picture a doorway, in the walk\'s order', async () => {
    b = bench({ 'flat.json': FLAT })
    const reply = await b.call('grid_describe', { plan: 'flat.json', length: 'walk', pictures: true })
    expect(reply.isError).toBe(false)
    expect(reply.images).toBe(6)
    expect(reply.text).toContain('1 hall <OUT door-entrance d0.9 | S 1.3x4.1 5.33')
    expect(reply.text).toContain('| PIC picture 1')
    const pictures = reply.data!['pictures'] as Array<{ picture: number; room: string }>
    expect(pictures.map((p) => p.room)).toEqual(['hall', 'bed2', 'bath', 'bed1', 'living', 'kitchen'])
  }, 30_000)

  it('refuses floor or pictures with another length', async () => {
    b = bench({ 'flat.json': FLAT })
    const reply = await b.call('grid_describe', { plan: 'flat.json', length: 'rooms', pictures: true })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('pictures goes with length=walk only')
  })
})

describe('ARE-23: a room is sized by its own sides, whatever way the doorway faces', () => {
  // A hall 40 by 16 with its south-west corner cut off by a wall at 45 degrees, and the way in
  // through that wall: the doorway is crossed square to the cut, a skewed line to the hall.
  const hall = parseFloorPlan({
    version: '1',
    units: 'm',
    walls: [
      { id: 'south', start: [4, 0], end: [40, 0], thickness: 0.3, height: 2.6, kind: 'exterior' },
      { id: 'east', start: [40, 0], end: [40, 16], thickness: 0.3, height: 2.6, kind: 'exterior' },
      { id: 'north', start: [40, 16], end: [0, 16], thickness: 0.3, height: 2.6, kind: 'exterior' },
      { id: 'west', start: [0, 16], end: [0, 4], thickness: 0.3, height: 2.6, kind: 'exterior' },
      { id: 'cut', start: [0, 4], end: [4, 0], thickness: 0.3, height: 2.6, kind: 'exterior' },
    ],
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: ['south', 'east', 'north', 'west', 'cut'] }],
    openings: [{ id: 'door-cut', wall: 'cut', type: 'door', offset: 1.4, width: 1.2, sill: 0, height: 2.1, hinge: 'start', swing: 'left' }],
  })
  it('says the hall across and deep as drawn, and the two figures agree with its area', () => {
    const s = planWalk(surveyPlan(hall), undefined).floors[0]!.stops[0]!
    expect(s.room).toBe('hall')
    expect(Math.max(s.across, s.deep)).toBeGreaterThan(36)
    expect(Math.min(s.across, s.deep)).toBeCloseTo(15.7, 1)
    expect(s.across * s.deep).toBeGreaterThan(s.area * 0.9)
    expect(s.across * s.deep).toBeLessThan(s.area * 1.1)
  })
})
