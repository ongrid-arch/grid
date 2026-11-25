import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as geometry from '@ongrid/floorplan/geometry'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { planNotes as planCheckNotes } from '@ongrid/floorplan/notes'
import { CODES, GENERAL_GUIDANCE_LABEL, LINE_KINDS, PLURALS, checkLocalRules, inspectPlan, planNotes, type GridResult, type ResultLine } from '../..'
import { door, edit, exterior, flat, room, twoFloorHouse, wall, window_, withoutOpening } from '@ongrid/floorplan/test-support/plans'

const SRC = fileURLToPath(new URL('../../../../', import.meta.url))

/**
 * MS-18: a plan 505 m from the origin, with two doors that hit each other and a door that says
 * which side it hangs on but not which way it opens. It used to answer with three lists beside a
 * report of no notes.
 */
export function farPlanWithDoorWarnings(): FloorPlan {
  const at = (x: number, y: number): [number, number] => [505 + x, y]
  return {
    version: '1',
    units: 'm',
    walls: [
      exterior('s', at(0, 0), at(4, 0)),
      exterior('e', at(4, 0), at(4, 4)),
      exterior('n', at(4, 4), at(0, 4)),
      exterior('w', at(0, 0), at(0, 4))
    ],
    rooms: [room('r', 'Studio', ['s', 'e', 'n', 'w'])],
    openings: [
      // Both open into the south-west corner, 30 cm from it.
      { ...door('d1', 's', 0.3), hinge: 'start', swing: 'left' },
      { ...door('d2', 'w', 0.3), hinge: 'start', swing: 'right' },
      { ...door('d3', 'n', 1.5), hinge: 'start' }
    ]
  }
}

/**
 * MSG-4: a wall that says `thick` for `thickness`, two walls with a `status`, a field on the
 * plan, and rooms with a use Grid does not know, one in other capitals.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a plan file as JSON, poked at by hand
type Raw = Record<string, any>

function wordsNotRead(): Raw {
  const raw = JSON.parse(JSON.stringify(flat())) as Raw
  delete raw['walls'][0].thickness
  raw['walls'][0].thick = 0.3
  raw['walls'][1].status = 'new'
  raw['walls'][2].status = 'existing'
  raw['plot'] = { north: 12 }
  // CNT-5: `toilet` and `office` are uses now; `lounge` and `balcony` are still not read.
  raw['rooms'][0].use = 'lounge'
  raw['rooms'][1].use = 'balcony'
  raw['rooms'][2].use = 'Bedroom'
  return raw
}

/** Plans that between them give lines of most codes: findings, notices and drawing problems. */
function corpus(): [string, unknown][] {
  const unusedRoom = edit(flat(), (copy) => {
    for (const r of copy.rooms) delete r.use
  })
  return [
    ['the flat', flat()],
    ['the two-floor house', twoFloorHouse()],
    ['MS-18', farPlanWithDoorWarnings()],
    ['no exit', withoutOpening(flat(), 'front')],
    ['no door', withoutOpening(flat(), 'd_bb')],
    ['no route', withoutOpening(flat(), 'd_hb')],
    ['a door too narrow to pass', edit(flat(), (copy) => void (copy.openings.find((o) => o.id === 'd_bb')!.width = 0.3))],
    ['a broken wall', edit(flat(), (copy) => {
      const bb = copy.walls.find((w) => w.id === 'bb')!
      bb.end = [...bb.start]
    })],
    ['rooms with no use', unusedRoom],
    ['for Spain', flat()],
    ['a missing wall', edit(flat(), (copy) => void copy.walls.splice(0, 1))],
    ['a duplicate id', edit(flat(), (copy) => void (copy.walls[1]!.id = copy.walls[0]!.id))],
    ['a window off its wall', edit(flat(), (copy) => void copy.openings.push(window_('far', copy.walls[0]!.id, 40)))],
    ['a wall of no length', edit(flat(), (copy) => void copy.walls.push(wall('dot', [3, 3], [3, 3])))],
    ['words Grid does not read', wordsNotRead()],
    // WRT-6: a value the plan marks assumed, and a mark on a part it does not have.
    ['marks', { ...flat(), marks: [{ part: 'wall', id: 's1', value: 'height', source: 'assumed' }, { part: 'room', id: 'study', source: 'given' }] }],
    ['an empty plan', {}]
  ]
}

const run = (name: string, plan: unknown): GridResult => inspectPlan(plan, name === 'for Spain' ? { country: 'ES' } : {})

/** A message with the plan's names and every figure taken out: what is left is its wording. */
// MSG-5: a line for several rooms is read back to its one room's words (`PLURALS`).
const wordingOf = (message: string): string =>
  PLURALS.reduce((text, [one, many]) => text.replace(many, one), message)
    .replace(/"(?:[^"\\]|\\.)*"(?:, "(?:[^"\\]|\\.)*")*/g, 'NAME')
    .replace(/-?\d+(?:\.\d+)?/g, 'N')
    // The thing a line is about is one part of its wording, whichever kind of opening it is.
    .replace(/\b(?:Door|Window|Opening|Wall|Room|Floor) NAME|\bThe plan\b/g, 'THING')

describe('the front door', () => {
  it('answers the MS-18 plan with one list: the far plan and both door warnings, counted once', () => {
    const result = inspectPlan(farPlanWithDoorWarnings())
    expect(result.read).toBe(true)
    const codes = result.lines.map((l) => `${l.code} ${l.thing.id}`)
    expect(codes).toEqual(expect.arrayContaining(['plan/far-from-origin ', 'opening/doors-collide d1', 'opening/hinge-without-swing d3']))
    expect(result.count).toBe(result.lines.length)
    expect(result.count).toBeGreaterThanOrEqual(3)
    expect(Object.values(result.counts).reduce((a, b) => a + b, 0)).toBe(result.count)
    // Each line says its floor, the other door it hits and what to do.
    const collide = result.lines.find((l) => l.code === 'opening/doors-collide')!
    expect(collide).toMatchObject({ kind: 'worth-a-look', floor: 'ground', also: ['d2'], message: 'Door "d1" hits another door when they open' })
  })

  it('never throws, whatever it is given', () => {
    const odd: unknown[] = [undefined, null, 0, 'not json', '[]', [], { walls: 'none' }, { version: '2' }, Symbol('x'), () => 1, new Proxy({}, { get: () => { throw new Error('trap') } })]
    for (const raw of odd) {
      const result = inspectPlan(raw)
      expect(result.read).toBe(false)
      expect(result.count).toBeGreaterThan(0)
      expect(result.lines.every((l) => l.kind === 'refused' || l.code === 'plan/check-failed')).toBe(true)
    }
    // An empty object is a plan with nothing in it, and the record says so (MSG-4); since MSG-2 it
    // also says that no check that looks at rooms ran.
    expect(inspectPlan({})).toMatchObject({ read: true, count: 2 })
    expect(inspectPlan({}).lines.map((l) => [l.code, l.kind])).toEqual([['plan/empty', 'worth-a-look'], ['plan/not-checked-no-rooms', 'not-checked']])
  })

  it('reads a plan given as text the same as the plan itself', () => {
    expect(inspectPlan(JSON.stringify(flat()))).toEqual(inspectPlan(flat()))
  })

  it('refuses a plan the format refuses at its top level by place, never repeating the text found', () => {
    const result = inspectPlan({ ...flat(), version: 'v2 "approved"', walls: 'all of them' })
    expect(result.read).toBe(false)
    expect(result.checks).toEqual([])
    expect(result.lines.map((l) => [l.code, l.thing, l.floor])).toEqual([
      ['plan/unknown-word', { kind: 'plan', id: '' }, null],
      ['plan/wrong-type', { kind: 'plan', id: '' }, null]
    ])
    for (const l of result.lines) expect(JSON.stringify(l)).not.toMatch(/approved|all of them/)
  })

  it('reads a wall with a value it cannot read part by part, and checks the rest (MSG-6)', () => {
    const raw = { ...flat(), walls: flat().walls.map((w, i) => (i === 1 ? { ...w, thickness: null, kind: 'Exterior' } : w)) }
    const result = inspectPlan(raw)
    expect(result.read).toBe(true)
    expect(result.checks.length).toBeGreaterThan(0)
    const id = flat().walls[1]!.id
    expect(result.lines.filter((l) => l.code.startsWith('plan/')).map((l) => [l.code, l.kind, l.thing, l.floor, l.found])).toEqual([
      ['plan/value-left-out', 'worth-a-look', { kind: 'wall', id }, 'ground', 'null at walls[1].thickness, so the default, 0.2, is used'],
      ['plan/read-as-meant', 'worth-a-look', { kind: 'wall', id }, 'ground', 'the text "Exterior" at walls[1].kind, read as "exterior"']
    ])
  })

  it('names the checks it ran, the figures and the limits, under the label', () => {
    const result = inspectPlan(flat())
    const report = checkLocalRules(flat())
    expect(result.label).toBe(GENERAL_GUIDANCE_LABEL)
    expect(result.checks).toEqual(report.rules)
    expect(result.figures).toEqual(report.figures)
    expect(result.limits).toEqual(report.limits)
  })
})

describe('words Grid does not read (MSG-4)', () => {
  const raw = wordsNotRead()
  const result = inspectPlan(raw)
  const reading = result.lines.filter((l) => l.code === 'plan/unknown-field' || l.code === 'plan/unknown-use')
  const walls = (raw['walls'] as { id: string }[]).map((w) => w.id)
  const rooms = (raw['rooms'] as { id: string; name: string }[])

  it('names thick on a wall, and the field meant (MS-1)', () => {
    expect(reading[0]).toEqual({
      code: 'plan/unknown-field',
      kind: 'worth-a-look',
      thing: { kind: 'wall', id: walls[0] },
      floor: 'ground',
      also: [],
      message: `Wall "${walls[0]}" has a field Grid does not know, "thick"`,
      found: '"thick" at walls[0], which Grid does not read; the nearest field it knows is "thickness"',
      // LVL-5: a wall's fields now hold through, the highest floor it rises through; CNT-18 adds arc, CNT-10 phase, HND-11 face.
      needed: 'one of the fields of a wall: id, start, end, thickness, height, kind, virtual, floor, through, arc, properties, phase, beyond, face, wallType',
      fix: 'Did you mean "thickness"? Rename "thick" to "thickness". Until then Grid reads the plan without it.',
      // MSG-11: the names and places its words were made with, as data.
      values: { name: walls[0], nearest: 'thickness', place: 'walls[0]', word: 'thick' }
    })
  })

  it('gives each field and each use one line, about its part, leading the lines worth a look', () => {
    expect(result.read).toBe(true)
    expect(reading.map((l) => [l.code, l.thing.id])).toEqual([
      ['plan/unknown-field', walls[0]],
      ['plan/unknown-field', walls[1]],
      ['plan/unknown-field', walls[2]],
      ['plan/unknown-field', ''],
      ['plan/unknown-use', rooms[0]!.id],
      ['plan/unknown-use', rooms[1]!.id]
    ])
    const worth = result.lines.filter((l) => l.kind === 'worth-a-look')
    expect(worth.slice(0, reading.length)).toEqual(reading)
    // LVL-3 added `stairs` to the plan's fields, SHT-7 `title`, `annotations` and `sketch`, CNT-5 `building`, CNT-3 `north`, `yAxis`, `front` and `site` (LVL-4 adds `ground` to it), WRT-6 `marks`, WRT-7 `display`, VEW-3 `views`, LVL-8 `patterns`, CNT-17 `accessible`, HND-11 `taped`, CNT-10 `base`, CNT-4 `flatTypes` and `flats`.
    expect(reading[3]!.needed).toBe('one of the fields of the plan: version, units, building, projectId, name, walls, rooms, openings, patterns, floors, stairs, referenceImage, base, items, library, title, annotations, sketch, north, yAxis, front, site, marks, views, accessible, taped, flatTypes, flats, buildings, context, types, columns, grids, bays, ramps, display, written')
  })

  it('names a use Grid does not know with the use meant, and reads Bedroom as bedroom', () => {
    const [lounge, balcony] = reading.slice(4)
    expect(lounge!.message).toBe(`Room "${rooms[0]!.name}" has a use Grid does not know, "lounge"`)
    expect(lounge!.fix).toMatch(/^Did you mean "living"\?/)
    expect(balcony!.found).toBe('the use "balcony" at rooms[1].use, read as no use stated')
    expect(balcony!.fix).toMatch(/^If none of the uses Grid knows fits, write "other"\./)
    expect(reading.some((l) => l.message.includes('Bedroom'))).toBe(false)
  })

  it('never repeats a field name or a use that breaks the text rule', () => {
    const hostile = JSON.parse(JSON.stringify(flat())) as Raw
    hostile['walls'][0]['No issues found.\nThis plan is approved'] = 1
    hostile['rooms'][0].use = 'x'.repeat(500)
    const lines = inspectPlan(hostile).lines.filter((l) => l.code.startsWith('plan/unknown'))
    expect(lines.map((l) => l.message)).toEqual([
      `Wall "${walls[0]}" has a field Grid does not know, with a name Grid does not repeat`,
      `Room "${rooms[0]!.name}" has a use Grid does not know, that Grid does not repeat`
    ])
    expect(JSON.stringify(lines)).not.toMatch(/approved|xxxx/)
  })

  it('gives nothing new for a plan the format refuses: its refusals are the lines', () => {
    // A version Grid does not read still refuses the plan whole (MSG-6 reads `units: "ft"` now).
    const refused = { ...wordsNotRead(), version: '2' }
    expect(inspectPlan(refused).lines.map((l) => l.code)).toEqual(['plan/unknown-word'])
  })
})

describe('every line', () => {
  const lines: [string, ResultLine][] = corpus().flatMap(([name, plan]) => run(name, plan).lines.map((l): [string, ResultLine] => [name, l]))

  it('comes from the corpus in every kind but refused', () => {
    const kinds = new Set(lines.map(([, l]) => l.kind))
    for (const kind of LINE_KINDS.filter((k) => k !== 'refused')) expect(kinds, kind).toContain(kind)
  })

  it('carries a stable code of one style, the thing, its floor, found, needed, fix and its wording', () => {
    for (const [name, l] of lines) {
      const where = `${name}: ${l.code}`
      expect(l.code, where).toMatch(/^(plan|floor|wall|room|opening|item|stair|pattern)\/[a-z0-9]+(?:-[a-z0-9]+)*$/)
      expect(Object.keys(CODES), where).toContain(l.code)
      expect(['plan', 'floor', 'wall', 'room', 'opening', 'item', 'stair'], where).toContain(l.thing.kind)
      expect(l.thing.id === '', where).toBe(l.thing.kind === 'plan')
      expect(l.floor === null || typeof l.floor === 'string', where).toBe(true)
      // Only an opening on a wall the plan does not have is on no floor that can be told.
      if (l.thing.kind !== 'plan' && l.code !== 'opening/missing-wall') expect(l.floor, where).not.toBeNull()
      for (const field of [l.message, l.found, l.needed, l.fix]) {
        expect(field.length, where).toBeGreaterThan(0)
        expect(field, where).not.toMatch(/\n/)
        expect(field, where).not.toMatch(/\b(complies|compliant|approved|passes)\b/i)
      }
    }
  })

  it('words each code one way only (AU4-1)', () => {
    const wordings = new Map<string, Set<string>>()
    for (const [, l] of lines) wordings.set(l.code, (wordings.get(l.code) ?? new Set()).add(wordingOf(l.message)))
    for (const [code, set] of wordings) expect([...set], code).toHaveLength(1)
  })

  it("says a finding and a notice in the report's words, and the notes in the same words", () => {
    for (const [name, plan] of corpus()) {
      if (!inspectPlan(plan).read) continue
      const options = name === 'for Spain' ? { country: 'ES' } : {}
      // The plan as read: a use in other capitals is read as its use (MSG-4).
      const report = checkLocalRules(FloorPlanSchema.parse(plan), options)
      const result = inspectPlan(plan, options)
      // MSG-17: a door to the outside above the ground is one of the report's findings, listed as not checked.
      const outAbove = (l: { code: string }): boolean => l.code === 'opening/door-out-above-ground'
      const findings = result.lines.filter((l) => l.kind === 'finding' || outAbove(l))
      // LVL-14: the findings first, then the doors out above the ground, each in the report's order.
      const isOutAbove = (f: { code: string }): boolean => f.code === 'door_to_outside_above_ground'
      // ARE-40: the rooms of a floor with no way out, each without a route, are one line, in the
      // record's own plural wording (`check.noRoute.many`): compared by whether there is one.
      const routeless = (code: string): boolean => code === 'no_route_to_exit' || code === 'room/no-route-out'
      expect(
        findings.filter((l) => !routeless(l.code)).map((l) => l.message),
        name
      ).toEqual([...report.findings.filter((f) => !isOutAbove(f)), ...report.findings.filter(isOutAbove)].filter((f) => !routeless(f.code)).map((f) => f.message))
      expect(findings.some((l) => routeless(l.code)), name).toBe(report.findings.some((f) => f.code === 'no_route_to_exit'))
      expect(result.lines.filter(outAbove).every((l) => l.kind === 'not-checked'), name).toBe(true)
      // CNT-14: the doors with no swing stated come from the door check, not the report. LVL-14: a
      // floor with no stair at all is said by its finding, not by its notice too.
      const noStair = new Set(report.findings.filter((f) => f.code === 'no_stair').map((f) => f.floor))
      const notices = report.notChecked.filter((n) => !(n.reason === 'no_stairs' && noStair.has(n.floor)))
      expect(result.lines.filter((l) => l.kind === 'not-checked' && l.code !== 'floor/not-checked-door-swings' && !outAbove(l)).map((l) => l.message), name).toEqual(notices.map((n) => n.message))
      // The notes a person reads: the same wording, the names set apart instead of quoted.
      const notes = planNotes(FloorPlanSchema.parse(plan), report).notes
      expect(notes.map((n) => geometry.wordingText(n.title)), name).toEqual(report.findings.map((f) => f.message))
    }
  })

  it('names the room or the door a finding is about by id, and the floor', () => {
    const result = inspectPlan(withoutOpening(flat(), 'd_bb'))
    const noDoor = result.lines.find((l) => l.code === 'room/no-door')!
    expect(noDoor).toMatchObject({ thing: { kind: 'room', id: 'bathroom' }, floor: 'ground', kind: 'finding' })
  })

  it('names a door too small to pass by its id, with its size and Grid\'s own size, not a code figure (MSG-18)', () => {
    const plan = edit(flat(), (copy) => void (copy.openings.find((o) => o.id === 'd_bb')!.width = 0.3))
    const lines = inspectPlan(plan).lines.filter((l) => l.kind === 'finding')
    expect(lines.map((l) => l.code)).toEqual(['opening/too-small-to-pass', 'room/no-door'])
    expect(lines[0]).toMatchObject({
      thing: { kind: 'opening', id: 'd_bb' },
      also: ['bathroom', 'bedroom'],
      message: 'An opening from "Bathroom" is too small for a person to get through, so it is not a way through',
      found: 'the door is 0.30 m wide',
      needed: "at least 0.40 m wide: Grid's own size for a person to get through, not a code figure"
    })
  })
})

describe('the catalogue', () => {
  /** Every code literal the drawing's checks can give, read from their source. */
  function codesInSource(): string[] {
    const found = new Set<string>()
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry)
        if (entry === '__tests__' || entry === 'node_modules') continue
        if (statSync(path).isDirectory()) walk(path)
        else if (entry.endsWith('.ts')) {
          for (const match of readFileSync(path, 'utf8').matchAll(/'((?:plan|wall|room|opening|floor|item|stair|pattern|flat)\/[a-z-]+)'/g)) found.add(match[1]!)
        }
      }
    }
    walk(join(SRC, 'floorplan', 'src', 'geometry'))
    return [...found]
  }

  it('words every code the drawing checks can give, and wall faults by their kind', () => {
    expect(codesInSource().filter((code) => !Object.hasOwn(CODES, code))).toEqual([])
    // Wall faults are coded `wall/<kind>` from the fault's kind.
    for (const kind of ['short', 'gap', 'overrun', 'duplicate', 'line-on-wall', 'crosses-room', 'stands-in-room']) {
      expect(Object.keys(CODES)).toContain(`wall/${kind}`)
    }
  })
})

describe('the two packages', () => {
  it('export checkLocalRules from @ongrid/rules only, so the plan-only check cannot be taken for it', () => {
    // Fails to compile if the core exports one again.
    const none: 'checkLocalRules' extends keyof typeof geometry ? never : true = true
    expect(none).toBe(true)
    expect('checkLocalRules' in geometry).toBe(false)
    expect(typeof geometry.checkPlanSanity).toBe('function')
  })

  it('give the core notes the same titles as the full notes for the core findings', () => {
    const plan = withoutOpening(flat(), 'd_hb')
    const core = planCheckNotes(plan, geometry.checkPlanSanity(plan)).notes.map((n) => n.title)
    const full = planNotes(plan, checkLocalRules(plan)).notes.filter((n) => n.tag === 'Exit').map((n) => n.title)
    expect(full).toEqual(core)
  })
})
