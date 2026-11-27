/**
 * CNT-17 (lab EL-15, C-14, J-15): accessibility measurements, as numbers only until figures are
 * confirmed.
 *
 * EL-15's flat is the wheelchair user's probe with everything narrow, as the scoreboard stores the
 * lab's plans (`J/scenarios/7-wheelchair-user/probe-narrow-everything.json`, the one BRF-1's Y-7
 * reads): every door a 0.55 m hole, a hall 0.70 m between its walls and the entrance door with an
 * 18 cm sill. Its walls are the lab's: the entrance door spans the end of the hall's east wall,
 * so the way-out graph reads it as opening into Bedroom 2 (`wall/ends-in-opening` names it).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { approvalWords, confirmedFigure, FIGURES, type FigureKey, type FigureSpec } from '@ongrid/rules'
import { runGrid } from '../../command/main'
import { accessAnswer, ACCESS_CODE_FIGURES, entranceOf, YOUR_FIGURE, type AccessData } from '../../quantities/access'
import { surveyPlan } from '../../quantities/survey'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { genkanFlat, stairHouse, stairRoomHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'
import { bench, type Bench } from './replay/harness'

const LAB = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')

function labPlan(name: string): Record<string, unknown> {
  for (const line of gunzipSync(readFileSync(LAB)).toString('utf8').split('\n')) {
    if (line.length === 0) continue
    const stored = JSON.parse(line) as { name: string; text: string }
    if (stored.name === name) return JSON.parse(stored.text) as Record<string, unknown>
  }
  throw new Error(`${name} is not in the lab data`)
}

const EL15 = 'J/scenarios/7-wheelchair-user/probe-narrow-everything.json'
const DOORS = ['door-entrance', 'door-living', 'door-kitchen', 'door-bed1', 'door-bath', 'door-bed2']

/** The wheelchair user's own figures, as BRF-1's Y-7 keeps them. */
const BRIEF = {
  figures: {
    door_width: { value: 0.8, level: 'must', source: 'given', quote: 'doors 80 cm clear for my chair' },
    corridor_width: { value: 1.2, level: 'must', source: 'given', quote: 'a hall I can pass along, 1.2 m' },
    turning_circle: { value: 1.5, level: 'must', source: 'given', quote: 'room to turn, 1.5 m' },
    step: { value: 0, level: 'must', source: 'given', quote: 'no step at any door' },
  },
}

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

const access = async (plan: Record<string, unknown>, brief?: unknown): Promise<{ text: string; data: AccessData }> => {
  b = bench({ 'probe.json': plan })
  if (brief !== undefined) {
    const written = await b.call('grid_write_brief', { plan: 'probe.json', brief })
    expect(written.isError, written.text).toBe(false)
  }
  const reply = await b.call('grid_measure', { plan: 'probe.json', what: 'access' })
  expect(reply.isError, reply.text).toBe(false)
  return { text: reply.text, data: (reply.data as { answer: AccessData }).answer }
}

/** Every line that sets a number against a figure, with no other words in it. */
const comparisons = (text: string): string[] => text.split('\n').filter((l) => /\b(under|at least|higher than|no higher than) (your figure|the [\d.]+ m of)/.test(l))

describe('EL-15: the narrow flat, measured as numbers', () => {
  it('reports every door\'s 0.55 m hole and its clear width, the hall\'s narrowest point of 0.70 m and the 18 cm step', async () => {
    const { text, data } = await access(labPlan(EL15))
    // Every door: the 0.55 m hole, and 0.50 m clear past an open leaf (CNT-13's allowance).
    expect(data.doors.filter((d) => d.type === 'door').map((d) => [d.id, d.hole, Number(d.clear.toFixed(2))])).toEqual(DOORS.map((id) => [id, 0.55, 0.5]))
    for (const id of DOORS) expect(text).toMatch(new RegExp(`door "${id}"[^\\n]*: 0\\.55 m hole, 0\\.50 m clear past the open leaf`))
    const pass = data.doors.find((d) => d.id === 'pass-kitchen-living')!
    expect([pass.hole, pass.clear.toFixed(2)]).toEqual([1.2, '1.20'])
    // The hall at its narrowest from end to end, and its turning space.
    expect(data.corridors).toHaveLength(1)
    expect(data.corridors[0]!.room).toBe('hall')
    expect(data.corridors[0]!.narrowest).toBeCloseTo(0.7, 2)
    expect(text).toContain('Corridors (1), at their narrowest from end to end:\n  "Hall": 0.70 m, at (')
    expect(data.turning.find((t) => t.room === 'hall')!.diameter).toBeCloseTo(0.7, 2)
    // The 18 cm step: the entrance door's sill, on the way in to every room.
    expect(data.entrance).toEqual({ floor: 'ground', doors: ['door-entrance'], front: false })
    expect(data.ways).toHaveLength(6)
    for (const way of data.ways) expect(way.steps).toEqual([{ kind: 'sill', at: 'door-entrance', height: 0.18, count: 1, up: null }])
    expect(text).toContain('door "door-entrance" (the entrance), "Bedroom 2" to outside: 0.55 m hole, 0.50 m clear past the open leaf; its sill stands 0.18 m above the floor.')
    expect(text).toContain('to "Bathroom": door "door-entrance" into "Bedroom 2", door "door-bed2" into "Hall", door "door-bath" into "Bathroom"; 1 step: 0.18 m at door "door-entrance", its sill;')
    // What it could not tell and what it did not look at, plainly.
    expect(text).toContain('Grid cannot tell whether there is a step between the ground outside and the floor inside door "door-entrance": the plan states no ground level for the site (a \'ground <m>\' line in rooms text, or grid_set_site ground, states it).')
    expect(text).toContain('Not looked at:\n  - the swing and weight of a door leaf')
    expect(text).toContain('  - ramps: a ramp the plan states between two floors is for vehicles and is not measured here, and one within a floor cannot be stated, so no slope, length or landing is measured;')
    expect(data.notLookedAt.length).toBeGreaterThan(5)
    // With no brief and no confirmed figure, nothing is set against anything.
    expect(comparisons(text)).toEqual([])
    expect(text).toContain('No figure from a code is used: none that Grid holds for these measures has been confirmed by a named person against its source.')
  })

  it('never reports "Notes: 0" with "Not checked: (nothing)", marked or not, and says the marked rooms were not checked', async () => {
    const run = async (plan: Record<string, unknown>): Promise<string> => {
      b?.close()
      b = bench({ 'probe.json': plan })
      let out = ''
      const code = await runGrid(['check', 'probe.json'], { stdout: (data) => { out += String(data) }, stderr: () => {}, stdoutIsTerminal: false, cwd: b.folder })
      expect(code).not.toBe(2)
      const tool = await b.call('grid_check', { plan: 'probe.json' })
      return `${out}\n${tool.text}`
    }
    const plain = await run(labPlan(EL15))
    const marked = await run({ ...labPlan(EL15), accessible: { rooms: ['bath', 'bed1'], routes: [{ to: 'hall' }] } })
    for (const text of [plain, marked]) {
      expect(text).not.toMatch(/Notes: 0/)
      expect(text).not.toMatch(/Not checked[^\n]*\(nothing\)/)
      expect(approvalWords(text)).toEqual([])
      expect(text).not.toMatch(/\b(is|are) accessible\b/i)
    }
    expect(plain).not.toContain('plan/not-checked-access')
    expect(marked).toContain('What the plan marks as needing to be accessible (2 rooms and 1 route) was not checked: Grid holds no figure for it that a named person has confirmed. [plan/not-checked-access]')
  })

  it('measures only what the plan marks, and the ways to it, when it marks something', async () => {
    const { text, data } = await access({ ...labPlan(EL15), accessible: { rooms: ['bath'], routes: [{ from: 'bed1', to: 'bath' }], } })
    expect(data.marked).toBe(true)
    expect(data.ways.map((w) => [w.from, w.to, w.legs.flatMap((l) => l.rooms)])).toEqual([
      [null, 'bath', ['bed2', 'hall', 'bath']],
      ['bed1', 'bath', ['bed1', 'hall', 'bath']],
    ])
    // The kitchen and the living room are on no marked way: their turning space is not listed.
    expect(data.turning.map((t) => t.room).sort()).toEqual(['bath', 'bed1', 'bed2', 'hall'])
    expect(data.doors.map((d) => d.id)).not.toContain('pass-kitchen-living')
    expect(text).toContain('Marked as needing to be accessible: room "Bathroom", with the way in to each from the entrance; the route from "Bedroom 1" to "Bathroom".')
  })

  it('says an id the mark names that is no room, and measures the rest', async () => {
    const { text, data } = await access({ ...labPlan(EL15), accessible: { rooms: ['bath', 'shower'] } })
    expect(data.unknown).toEqual(['shower'])
    expect(data.rooms).toEqual(['bath'])
    expect(text).toContain('The mark names "shower", which is no room Grid can measure, so it is not measured.')
  })
})

describe('the person\'s own figures, kept and labelled as theirs (BRF-1)', () => {
  it('sets every number against the brief\'s figures, each said as "your figure"', async () => {
    const { text, data } = await access(labPlan(EL15), BRIEF)
    expect(text).toContain('Set against your figures, from the brief "probe.brief.json": door_width 0.80 m, corridor_width 1.20 m, turning_circle 1.50 m, step 0.00 m. They are yours, not a code\'s.')
    expect(text).toContain('door "door-bath", "Hall" to "Bathroom": 0.55 m hole, 0.50 m clear past the open leaf; under your figure of 0.80 m for its clear width.')
    expect(text).toContain('opening "pass-kitchen-living", "Kitchen" to "Living room": 1.20 m hole, 1.20 m clear; at least your figure of 0.80 m for its clear width.')
    expect(text).toMatch(/"Hall": 0\.70 m, at \([^)]*\); under your figure of 1\.20 m\./)
    expect(text).toMatch(/"Hall": 0\.70 m, centred at \([^)]*\); under your figure of 1\.50 m\./)
    expect(text).toContain('1 step: 0.18 m at door "door-entrance", its sill; higher than your figure of 0.00 m;')
    // Every comparison names the figure as the person's, in the text and in the data.
    const said = comparisons(text)
    expect(said.length).toBeGreaterThan(10)
    for (const line of said) expect(line).toContain(YOUR_FIGURE)
    const against = [...data.doors, ...data.corridors, ...data.turning].flatMap((m) => m.against)
    expect(against.length).toBe(7 + 1 + 6)
    for (const a of against) expect(a.figure).toMatchObject({ from: 'yours', label: 'your figure' })
    expect(data.figures.yours.map((f) => [f.figure, f.value, f.label])).toEqual([
      ['door_width', 0.8, 'your figure'],
      ['corridor_width', 1.2, 'your figure'],
      ['turning_circle', 1.5, 'your figure'],
      ['step', 0, 'your figure'],
    ])
    expect(approvalWords(text)).toEqual([])
    expect(text).not.toMatch(/\b(is|are) accessible\b/i)
  })

  it('keeps a turning circle for the rooms the person named only', async () => {
    const brief = { figures: { turning_circle: { value: 1.5, level: 'must', source: 'given', quote: 'room to turn in the bathroom', rooms: ['Bathroom'] } } }
    const { data } = await access(labPlan(EL15), brief)
    expect(data.turning.filter((t) => t.against.length > 0).map((t) => t.room)).toEqual(['bath'])
  })
})

describe('no figure from a code unless a named person confirmed it', () => {
  /** The table with the two figures the measures may use marked as a person's check would mark them. */
  const table = (status: FigureSpec['provenance']['status'], by: readonly { by: string; on: string }[]): Record<FigureKey, FigureSpec> => {
    const out = { ...FIGURES }
    for (const key of [ACCESS_CODE_FIGURES.entranceDoor, ACCESS_CODE_FIGURES.corridor]) out[key] = { ...FIGURES[key], provenance: { ...FIGURES[key].provenance, status, verifiedBy: by } }
    return out
  }
  const US = (): ReturnType<typeof surveyPlan> => surveyPlan(parseFloorPlan({ ...labPlan(EL15), site: { country: 'US' } }))
  const L = (v: number): string => `${v.toFixed(2)} m`

  it('uses none of the ai-found figures Grid holds, even for a plan in the US', async () => {
    // The entrance door and the corridor are what a code's figure would be set against.
    expect(FIGURES[ACCESS_CODE_FIGURES.entranceDoor].provenance.status).toBe('ai-found')
    expect(FIGURES[ACCESS_CODE_FIGURES.corridor].provenance.status).toBe('ai-found')
    const { text, data } = await access({ ...labPlan(EL15), site: { country: 'US' } })
    expect(data.figures.code).toEqual([])
    for (const m of [...data.doors, ...data.corridors]) expect(m.against).toEqual([])
    expect(text).not.toMatch(/0\.81 m|0\.91 m|IBC|IRC/)
    expect(text).toContain('No figure from a code is used')
  })

  it('never sets a number against an ai-found figure, even one a person is named on', () => {
    for (const t of [table('ai-found', []), table('ai-found', [{ by: 'A. Reviewer', on: '2026-12-01' }]), table('human-entered', [{ by: 'A. Reviewer', on: '2026-12-01' }]), table('checked-once', [])]) {
      const found = accessAnswer(US(), { yours: [], code: (key) => confirmedFigure(key, { country: 'US' }, t) }, L, null)
      expect(found.data.figures.code).toEqual([])
      expect([...found.data.doors, ...found.data.corridors].flatMap((m) => m.against)).toEqual([])
    }
  })

  it('sets the entrance door and the corridor against a figure once a named person has confirmed it, with its source', () => {
    const t = table('checked-once', [{ by: 'A. Reviewer', on: '2026-12-01' }])
    const found = accessAnswer(US(), { yours: [], code: (key) => confirmedFigure(key, { country: 'US' }, t) }, L, null)
    const entrance = found.data.doors.find((d) => d.id === 'door-entrance')!
    expect(entrance.against).toMatchObject([{ short: true, figure: { from: 'code', key: 'exitDoorClearWidth', value: 0.813 } }])
    // Only the entrance door: the figure is for the main door out.
    expect(found.data.doors.filter((d) => d.id !== 'door-entrance').flatMap((d) => d.against)).toEqual([])
    expect(found.data.corridors[0]!.against).toMatchObject([{ short: true, figure: { from: 'code', key: 'routeMinWidth', value: 0.914 } }])
    expect(found.lines.join('\n')).toContain('under the 0.81 m of IBC 2024 1010.1.1, IRC 2024 R318.2 (US model codes, read for homes), checked by A. Reviewer on 2026-12-01')
  })
})

describe('a step-free way needs levels, and a lift or a ramp between floors (LVL-3, LVL-4, LVL-7)', () => {
  const L = (v: number): string => `${v.toFixed(2)} m`
  const measure = (plan: unknown) => accessAnswer(surveyPlan(parseFloorPlan(plan)), { yours: [], code: () => null }, L, null)

  it('goes up by the lift where one joins the floors, and says it measures no lift car', () => {
    const found = measure({ ...stairRoomHouse({ use: 'lift' }), accessible: { rooms: ['second-main'] } })
    const way = found.data.ways[0]!
    expect(way.joins.map((j) => j.kind)).toEqual(['lift', 'lift'])
    expect(way.steps).toEqual([])
    expect(found.lines.join('\n')).toContain('to "Room (Second floor)": door "front" into "Hall", door "ground-d" into "Stair (Ground floor)"; the lift drawn as rooms "ground-stair" and "first-stair", between "Ground floor" and "First floor"; the lift drawn as rooms "first-stair" and "second-stair", between "First floor" and "Second floor"; door "second-d" into "Room (Second floor)"; no step on it that the plan shows;')
    expect(found.lines.join('\n')).toContain('Grid measures no lift car or its doors.')
  })

  it('counts the risers of a stair the plan states, with their height', () => {
    const found = measure({ ...stairHouse(), accessible: { rooms: ['study'] } })
    expect(found.data.ways[0]!.steps).toMatchObject([{ kind: 'stair', at: 's1', count: 14, up: true }])
    expect(found.data.ways[0]!.steps[0]!.height).toBeCloseTo(2.95 / 14, 6)
    expect(found.lines.join('\n')).toContain('1 step: 14 risers of 0.21 m up stair "s1"')
  })

  it('says it cannot tell the steps of a stair drawn only as rooms', () => {
    const found = measure({ ...stairRoomHouse(), accessible: { rooms: ['first-main'] } })
    expect(found.data.ways[0]!.steps).toEqual([{ kind: 'stair', at: 'ground-stair|first-stair', height: null, count: null, up: true, rooms: ['ground-stair', 'first-stair'] }])
    expect(found.lines.join('\n')).toContain('the stair drawn as rooms "Stair (Ground floor)" and "Stair (First floor)", up: Grid cannot tell how many steps it has or how high they are, as the plan states no stair there')
  })

  it('says it cannot tell the way where no stair or lift joins the floors', () => {
    const plan = twoFloorHouse()
    const found = measure({ ...plan, accessible: { rooms: ['study'] } })
    expect(found.data.ways[0]!.found).toBe(false)
    expect(found.lines.join('\n')).toContain('to "Study": No stair or lift that Grid can see joins "Ground floor" to "First floor", so it cannot tell the way to "Study".')
  })

  it('gives the step from the ground the site states, and a step between rooms at different levels', () => {
    const found = measure({ ...genkanFlat(0.18), site: { ground: -0.15 }, accessible: { rooms: ['hall'] } })
    const steps = found.data.ways[0]!.steps
    expect(steps.map((s) => [s.kind, s.at, Number(s.height!.toFixed(3)), s.up])).toEqual([
      ['ground', 'd', 0.33, true],
      ['level', 'g', 0.18, false],
    ])
    expect(found.lines.join('\n')).toContain('2 steps: 0.33 m up from the ground outside to the floor inside door "d"; 0.18 m down at opening "g", between rooms at different levels;')
    expect(found.lines.join('\n')).not.toContain('Grid cannot tell whether there is a step between the ground')
  })

  it('takes the front door the plan names as the entrance', () => {
    const plan = parseFloorPlan(stairRoomHouse())
    expect(entranceOf(surveyPlan({ ...plan, front: { opening: 'front' } }))).toEqual({ floor: 'ground', doors: ['front'], front: true })
  })
})
