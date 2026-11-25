/**
 * BRF-1: the brief held beside the plan and checked after every edit.
 *
 * The lab's cases are read from the scoreboard's stored lab plans: FD-2's house is the room-list
 * attempt the lab drew (`I/scenarios/s1-room-list/attempt-1.json`), where the floor left over went
 * into Bathroom 1; Y-7's probe is the wheelchair user's flat with everything narrow
 * (`J/scenarios/7-wheelchair-user/probe-narrow-everything.json`). R-14's room is written here.
 */
import { existsSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { approvalWords } from '@ongrid/rules'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { MARK_SOURCES } from '@ongrid/floorplan/types/floorplan'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { SOURCES, parseBrief, briefJson, BriefRefused } from '../brief'
import { namedSize, type BriefLine } from '../lines'

const LAB = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')

function labPlan(name: string): unknown {
  const lines = gunzipSync(readFileSync(LAB)).toString('utf8').split('\n')
  for (const line of lines) {
    if (line.length === 0) continue
    const stored = JSON.parse(line) as { name: string; text: string }
    if (stored.name === name) return JSON.parse(stored.text)
  }
  throw new Error(`${name} is not in the lab data`)
}

const FD2 = 'I/scenarios/s1-room-list/attempt-1.json'
const Y7 = 'J/scenarios/7-wheelchair-user/probe-narrow-everything.json'

/** The room list the person gave for FD-2's house, as far as the lab records it. */
const FD2_BRIEF = {
  rooms: [
    { name: 'Bathroom 1', area: 4.5, level: 'must', source: 'given', quote: 'a bathroom of about 4.5 square metres' },
    { use: 'bedroom', count: 3, level: 'must', source: 'given', quote: 'three bedrooms' },
    { use: 'bathroom', count: 2, level: 'should', source: 'assumed' },
  ],
}

/** The wheelchair user's own figures, as Y-7 asked them. */
const Y7_BRIEF = {
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

const linesOf = (data: Record<string, unknown> | undefined, key = 'brief'): BriefLine[] => ((data?.[key] as { lines: BriefLine[] }).lines)

describe('FD-2: the house whose bathroom took the floor left over', () => {
  it('reports "asked 4.5, drawn 11.93" for Bathroom 1 after the edit, where the check gives no note', async () => {
    b = bench({ 'house.json': labPlan(FD2) })
    const check = await b.call('grid_check', { plan: 'house.json' })
    expect(check.isError).toBe(false)
    // Today: 0 notes, and nothing about the bathroom being far bigger than asked.
    expect((check.data as { count: number }).count).toBe(0)
    expect(check.text).toContain('To look at: nothing.')
    expect(check.text).not.toContain('Bathroom 1')

    const written = await b.call('grid_write_brief', { plan: 'house.json', brief: FD2_BRIEF })
    expect(written.isError, written.text).toBe(false)
    expect(written.text).toContain('missed (must): "Bathroom 1" area asked 4.5, drawn 11.93 m².')
    expect(written.text).toContain('Their words: "a bathroom of about 4.5 square metres".')
    expect(existsSync(join(b.folder, 'house.brief.json'))).toBe(true)

    // Any edit then says it: here, the bathroom door made wider.
    const edit = await b.call('grid_change_opening', { plan: 'house.json', opening: 'd-bath1', width: 0.8 })
    expect(edit.isError, edit.text).toBe(false)
    expect(edit.text).toContain('asked 4.5, drawn 11.93')
    const lines = linesOf(edit.data)
    const bath = lines.find((l) => l.parts.some((p) => p.id === 'bath1'))!
    expect(bath).toMatchObject({ state: 'missed', level: 'must', source: 'given', asked: '4.5', drawn: '11.93', unit: 'm²', quote: 'a bathroom of about 4.5 square metres' })
    expect(lines.filter((l) => l.wish === 'rooms').map((l) => [l.state, l.text])).toEqual([
      ['met', 'met (must): rooms used as bedroom: asked 3, drawn 3 (Bedroom 1, Bedroom 2, Bedroom 3).'],
      ['met', 'met (should, assumed): rooms used as bathroom: assumed 2, drawn 2 (Bathroom 1, Bathroom 2).'],
    ])
    // The brief is never in the plan file.
    expect(readFileSync(join(b.folder, 'house.json'), 'utf8')).not.toContain('4.5 square metres')
  })

  it('says the same through grid edit, which runs the same tool', async () => {
    b = bench({ 'house.json': labPlan(FD2) })
    await b.call('grid_write_brief', { plan: 'house.json', brief: FD2_BRIEF })
    const renamed = await b.call('grid_rename_room', { plan: 'house.json', room: 'bed1', name: 'Main bedroom' })
    expect(renamed.text).toContain('asked 4.5, drawn 11.93')
  })
})

describe('Y-7: the narrow flat, against the wheelchair user\'s own figures', () => {
  it('lists its 9 shortfalls: six doors, the hall\'s width and turning circle, and the step at the entrance', async () => {
    b = bench({ 'probe.json': labPlan(Y7) })
    const reply = await b.call('grid_write_brief', { plan: 'probe.json', brief: Y7_BRIEF })
    expect(reply.isError, reply.text).toBe(false)
    const all = (reply.data as { lines: BriefLine[] }).lines
    const missed = all.filter((l) => l.state === 'missed')
    expect(missed).toHaveLength(9)
    expect(missed.map((l) => `${l.wish} ${l.parts.map((p) => p.id).join(',')} ${l.drawn}`).sort()).toEqual([
      'corridor_width hall 0.70',
      'door_width door-bath 0.50',
      'door_width door-bed1 0.50',
      'door_width door-bed2 0.50',
      'door_width door-entrance 0.50',
      'door_width door-kitchen 0.50',
      'door_width door-living 0.50',
      'step door-entrance 0.18',
      'turning_circle hall 0.70',
    ])
    expect(all.filter((l) => l.state !== 'missed')).toEqual([])
    // Under their heading: the person's own figures, not a code's.
    expect(reply.text).toContain("The person's own figures: theirs, not from any code or standard.")
    expect(reply.text).toContain('missed (must): door "door-bath" ("Hall" to "Bathroom") clear width asked at least 0.8, drawn 0.50 m, its hole 0.55 m.')
    // The file keeps them under the same heading.
    const file = JSON.parse(readFileSync(join(b.folder, 'probe.brief.json'), 'utf8')) as { figures: { heading: string } }
    expect(file.figures.heading).toBe("The person's own figures: theirs, not from any code or standard.")
  })

  it('refuses a figure Grid does not know, with the ones it knows', async () => {
    b = bench({ 'probe.json': labPlan(Y7) })
    const reply = await b.call('grid_write_brief', { plan: 'probe.json', brief: { figures: { worktop_height: { value: 0.8, level: 'must', source: 'given', quote: 'a low worktop' } } } })
    expect(reply.isError).toBe(true)
    expect(reply.text).toBe('The brief was not written: figures names a figure Grid does not know "worktop_height". The figures it knows: door_width, corridor_width, turning_circle, step, ceiling_height, plot_coverage, floor_area_ratio, building_height and parking_per_home.')
    expect(existsSync(join(b.folder, 'probe.brief.json'))).toBe(false)
  })
})

describe('R-14: a size written in a room\'s name, until the brief gives one', () => {
  // 2.70 x 3.48 m inside is 9.396 m², 5.8 mats of 0.9 x 1.8 m.
  const ROOMS = 'walls outside 0.3 inside 0.1 height 2.6\nroom washitsu "6 tatami room" other 2.7 x 3.48\nroom hall "Hall" corridor 1.2 x 3.48 east of washitsu\ndoor d1 between hall and washitsu, centred, 0.8 wide, opens into washitsu\ndoor front in hall south, centred, 0.9 wide, opens in\n'

  it('gives the "6 tatami" room that measures 5.8 mats a line, and no reminder is a refusal', async () => {
    b = bench({})
    const reply = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: ROOMS })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('differs: "6 tatami room" is named 6 mats; drawn 5.80 mats (9.40 m², a mat taken as 0.90 × 1.80 m), net area.')
    const lines = linesOf(reply.data)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ state: 'differs', wish: 'name', asked: '6', drawn: '5.80', unit: 'mats', parts: [{ kind: 'room', id: 'washitsu' }] })
  })

  it('leaves the room to the brief once the brief gives it a size', async () => {
    b = bench({})
    await b.call('grid_write_brief', { plan: 'plan.json', brief: { rooms: [{ name: '6 tatami room', area: 9.4, level: 'must', source: 'given', quote: 'a six-mat room' }] } })
    const reply = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: ROOMS })
    const lines = linesOf(reply.data)
    expect(lines.map((l) => l.state)).toEqual(['met'])
    expect(lines[0]!.text).toBe('met (must): "6 tatami room" area asked 9.4, drawn 9.40 m².')
  })

  it('reads sizes in names in square metres, square feet and mats', () => {
    expect(namedSize('6 tatami room')).toEqual({ value: 6, unit: 'mats' })
    expect(namedSize('Washitsu 4.5 jo')).toEqual({ value: 4.5, unit: 'mats' })
    expect(namedSize('和室 6畳')).toEqual({ value: 6, unit: 'mats' })
    expect(namedSize('Bedroom 12 m²')).toEqual({ value: 12, unit: 'm²' })
    expect(namedSize('Office 10,5 sqm')).toEqual({ value: 10.5, unit: 'm²' })
    expect(namedSize('Den 120 sq ft')).toEqual({ value: 120, unit: 'ft²' })
    expect(namedSize('Bedroom 2')).toBeNull()
    expect(namedSize('Room 3 jobs')).toBeNull()
  })
})

describe('the brief before the first room (lab AA-11)', () => {
  it('is written in one call, each quote beside its target, what is open marked, every line open until rooms are drawn', async () => {
    b = bench({})
    const reply = await b.call('grid_write_brief', {
      plan: 'plan.json',
      brief: {
        rooms: [
          { name: 'Kitchen', inside: [3, 4], level: 'must', source: 'given', quote: 'a kitchen about three by four' },
          { name: 'Study', level: 'should', source: 'assumed' },
        ],
        footprint: { width: 10, depth: 12, level: 'should', source: 'given', quote: 'the plot takes about 10 by 12' },
        touch: [{ rooms: ['Kitchen', 'Living room'], level: 'must', source: 'given', quote: 'the kitchen open to the living room' }],
        open: [{ quote: 'somewhere to work from home', about: 'its size, and which room' }],
      },
    })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain('The plan is not written yet, so every line is open until the rooms are drawn.')
    const lines = (reply.data as { lines: BriefLine[] }).lines
    expect(lines.map((l) => l.state)).toEqual(['open', 'open', 'open', 'open', 'open'])
    expect(lines.map((l) => l.quote)).toEqual(['a kitchen about three by four', null, 'the plot takes about 10 by 12', 'the kitchen open to the living room', 'somewhere to work from home'])
    expect(reply.text).toContain('open: "somewhere to work from home": still to ask, its size, and which room.')
    // The file keeps each quote beside its target.
    const file = JSON.parse(readFileSync(join(b.folder, 'plan.brief.json'), 'utf8')) as { rooms: Array<{ name: string; quote?: string; source: string }> }
    expect(file.rooms[0]).toEqual({ name: 'Kitchen', inside: [3, 4], level: 'must', source: 'given', quote: 'a kitchen about three by four' })
    expect(file.rooms[1]).toEqual({ name: 'Study', level: 'should', source: 'assumed' })
    expect(existsSync(join(b.folder, 'plan.json'))).toBe(false)
  })

  it('marks each wish given or assumed in WRT-6\'s words, and refuses the plan\'s other two', async () => {
    expect(SOURCES).toEqual(['given', 'assumed'])
    for (const source of SOURCES) expect(MARK_SOURCES).toContain(source)
    b = bench({})
    const reply = await b.call('grid_write_brief', { plan: 'plan.json', brief: { rooms: [{ name: 'Kitchen', area: 12, level: 'must', source: 'scanned' }] } })
    expect(reply).toMatchObject({ isError: true, text: 'The brief was not written: rooms[0].source must be given (the person said it) or assumed (for the person to confirm).' })
  })

  it('refuses a wish given with no words of the person\'s', async () => {
    b = bench({})
    const reply = await b.call('grid_write_brief', { plan: 'plan.json', brief: { rooms: [{ name: 'Kitchen', area: 12, level: 'must', source: 'given' }] } })
    expect(reply).toMatchObject({ isError: true, text: 'The brief was not written: rooms[0] is given, so it keeps the person\'s words in quote.' })
  })

  it('reads the brief back, writing nothing, when brief is left out', async () => {
    b = bench({ 'house.json': labPlan(FD2) })
    const none = await b.call('grid_write_brief', { plan: 'house.json' })
    expect(none.isError).toBe(false)
    expect(none.text).toContain('There is no brief beside the plan yet')
    await b.call('grid_write_brief', { plan: 'house.json', brief: FD2_BRIEF })
    const before = readFileSync(join(b.folder, 'house.brief.json'), 'utf8')
    const read = await b.call('grid_write_brief', { plan: 'house.json' })
    expect(read.text).toContain('nothing was written')
    expect(read.data).toMatchObject({ written: null, file: 'house.brief.json' })
    expect(readFileSync(join(b.folder, 'house.brief.json'), 'utf8')).toBe(before)
  })
})

describe('no line met reads as approval, and the first write is reminded, never refused', () => {
  it('holds every met line, and every line, to MSG-3\'s forbidden words', async () => {
    b = bench({ 'house.json': labPlan(FD2), 'probe.json': labPlan(Y7) })
    const generous = {
      rooms: [
        { name: 'Bathroom 1', at_least: 4, level: 'must', source: 'given', quote: 'a bathroom that passes for a family one' },
        { use: 'bedroom', count: 3, level: 'must', source: 'given', quote: 'three bedrooms' },
        { name: 'Kitchen', level: 'should', source: 'assumed' },
        { use: 'parking', level: 'avoid', source: 'given', quote: 'no garage' },
      ],
      footprint: { area: 120, level: 'should', source: 'assumed' },
      touch: [{ rooms: ['Kitchen', 'Living room'], level: 'must', source: 'given', quote: 'kitchen next to the living room' }],
      figures: { door_width: { value: 0.6, level: 'should', source: 'given', quote: 'doors of 60' }, ceiling_height: { value: 2.4, level: 'must', source: 'assumed' } },
    }
    const said: string[] = []
    for (const plan of ['house.json', 'probe.json']) {
      const reply = await b.call('grid_write_brief', { plan, brief: generous })
      expect(reply.isError, reply.text).toBe(false)
      const lines = (reply.data as { lines: BriefLine[] }).lines
      expect(lines.some((l) => l.state === 'met')).toBe(true)
      for (const l of lines) said.push(l.text)
      said.push(reply.text)
      const edit = await b.call('grid_rename_room', { plan, room: plan === 'house.json' ? 'bed1' : 'bed2', name: 'Bedroom' })
      said.push(edit.text)
    }
    const found = said.flatMap((text) => approvalWords(text))
    expect(found).toEqual([])
    expect(said.join('\n')).toContain('A line met says the drawing holds what the person asked for, and nothing about any rule.')
  })

  it('gives the first write with no brief one reminder line, never a refusal, and none after', async () => {
    b = bench({})
    const rooms = 'walls outside 0.3 inside 0.1 height 2.6\nroom living "Living" living 4 x 4\ndoor front in living south, centred, 0.9 wide, opens in\n'
    const first = await b.call('grid_write_rooms', { plan: 'plan.json', rooms })
    expect(first.isError, first.text).toBe(false)
    const reminders = first.text.split('\n').filter((l) => l.includes('No brief is kept beside this plan'))
    expect(reminders).toEqual(['No brief is kept beside this plan ("plan.brief.json"): write what the person asked for with grid_write_brief, from their own words, and every change then says what is met and what missed.'])
    expect(first.data).toMatchObject({ reminder: reminders[0], brief: { file: null, problem: null, lines: [] } })
    expect(existsSync(join(b.folder, 'plan.json'))).toBe(true)
    const again = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: rooms.replace('4 x 4', '4 x 5') })
    expect(again.isError, again.text).toBe(false)
    expect(again.text).not.toContain('No brief is kept')
    expect(again.data).toMatchObject({ reminder: null })
  })

  it('says a brief it can\'t read in one line, and writes the change as asked', async () => {
    b = bench({ 'house.json': labPlan(FD2) })
    b.write('house.brief.json', { version: '1', rooms: [{ name: 'Bathroom 1', area: -2, level: 'must', source: 'assumed' }] })
    const edit = await b.call('grid_rename_room', { plan: 'house.json', room: 'bed1', name: 'Main bedroom' })
    expect(edit.isError, edit.text).toBe(false)
    expect(edit.text).toContain('The brief beside the plan was not read, so no line is checked: house.brief.json is not a brief: rooms[0].area must be a number of square metres above 0 and at most 100,000.')
  })
})

describe('ARE-17: a corridor is judged by its narrowest point', () => {
  const rooms = (polygon: string): string => `walls outside 0.3 inside 0.1 height 2.6\nroom hall "Hall" corridor polygon ${polygon}\nroom study "Study" other 3 x 3 south of hall\ndoor d1 between hall and study, centred, 0.9 wide, opens into study\n`
  const asked = { figures: { corridor_width: { value: 1.2, level: 'must', source: 'given', quote: 'a hall I can pass along' } } }
  const run = async (polygon: string): Promise<BriefLine[]> => {
    const compiled = compileRoomsText(rooms(polygon))
    expect(compiled.problems).toEqual([])
    b = bench({ 'probe.json': compiled.plan })
    const reply = await b.call('grid_write_brief', { plan: 'probe.json', brief: asked })
    expect(reply.isError, reply.text).toBe(false)
    return (reply.data as { lines: BriefLine[] }).lines.filter((l) => l.wish === 'corridor_width')
  }

  it('misses a hall 0.90 m wide for 7 m with one wide end, and says where it is narrowest', async () => {
    const lines = await run('0,0 8,0 8,1.6 7,1.6 7,0.9 0,0.9')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.state).toBe('missed')
    expect(lines[0]!.drawn).toBe('0.90')
    expect(lines[0]!.text).toContain('at its narrowest, at (')
  })

  it('still misses it when only one stretch is widened', async () => {
    const lines = await run('0,0 8,0 8,1.6 4,1.6 4,0.9 0,0.9')
    expect(lines[0]!.state).toBe('missed')
    expect(lines[0]!.drawn).toBe('0.90')
  })

  it('meets it when the whole hall is wide enough', async () => {
    const lines = await run('0,0 8,0 8,1.3 0,1.3')
    expect(lines.map((l) => l.state)).toEqual(['met'])
  })
})

describe('ARE-33: a count of rooms is its own field, apart from an area', () => {
  const said = { level: 'must', source: 'given' } as const

  it('reads and writes count_at_least and count_at_most', () => {
    const brief = parseBrief({ rooms: [{ use: 'bathroom', count_at_least: 4, count_at_most: 6, ...said, quote: 'at least 4 toilet rooms, six at most' }] }, { versionNeeded: false })
    expect(brief.rooms[0]).toMatchObject({ countAtLeast: 4, countAtMost: 6, count: null, atLeast: null })
    expect(briefJson(brief)['rooms']).toEqual([expect.objectContaining({ count_at_least: 4, count_at_most: 6 })])
  })

  it('refuses a count beside the exact count, and a least above a most', () => {
    expect(() => parseBrief({ rooms: [{ use: 'bathroom', count: 4, count_at_least: 2, ...said, quote: 'x' }] }, { versionNeeded: false })).toThrow(BriefRefused)
    expect(() => parseBrief({ rooms: [{ use: 'bathroom', count_at_least: 5, count_at_most: 2, ...said, quote: 'x' }] }, { versionNeeded: false })).toThrow(/more than/)
  })

  it('refuses at_least that reads like a count on a use wish, naming the right field, and keeps a real area', () => {
    expect(() => parseBrief({ rooms: [{ use: 'bathroom', at_least: 4, ...said, quote: 'at least 4 toilet rooms' }] }, { versionNeeded: false })).toThrow(/count_at_least/)
    expect(() => parseBrief({ rooms: [{ use: 'bathroom', at_most: 2, level: 'must', source: 'assumed' }] }, { versionNeeded: false })).toThrow(/count_at_most/)
    expect(parseBrief({ rooms: [{ use: 'bedroom', at_least: 9, ...said, quote: 'bedrooms of at least 9 m2' }] }, { versionNeeded: false }).rooms[0]!.atLeast).toBe(9)
    expect(parseBrief({ rooms: [{ name: 'Bedroom 1', at_least: 9, ...said, quote: 'a decent bedroom' }] }, { versionNeeded: false }).rooms[0]!.atLeast).toBe(9)
  })

  it('reads six rooms against at least 4 as met in rooms, and two as missed', async () => {
    const run = bench({ 'house.json': labPlan(FD2) })
    b = run
    const ask = async (n: number) => {
      const reply = await run.call('grid_write_brief', { plan: 'house.json', replace: true, brief: { rooms: [{ use: 'bedroom', count_at_least: n, level: 'must', source: 'given', quote: 'bedrooms' }] } })
      expect(reply.isError, reply.text).toBe(false)
      return (reply.data as { lines: BriefLine[] }).lines.find((l) => l.wish === 'rooms')!
    }
    const drawn = Number((await ask(1)).drawn)
    expect(drawn).toBeGreaterThanOrEqual(2)
    const met = await ask(drawn - 1)
    expect(met).toMatchObject({ state: 'met', unit: 'rooms', asked: `at least ${drawn - 1}` })
    expect((await ask(drawn + 1)).state).toBe('missed')
    const refused = await b.call('grid_write_brief', { plan: 'house.json', replace: true, brief: { rooms: [{ use: 'bedroom', at_least: 4, level: 'must', source: 'given', quote: 'at least 4 bedrooms' }] } })
    expect(refused.isError).toBe(true)
  })
})

describe('ARE-38: a room wish by name counts numbered names and lists the rooms counted', () => {
  const clinic = [
    'walls outside 0.3 inside 0.1 height 2.6',
    'room c1 "Consult 1" other 3 x 3',
    'room c2 "Consult 2" other 3 x 3 east of c1',
    'room c3 "Consult 3" other 3 x 3 east of c2',
    'room cat "Cat consult" other 3 x 3 south of c1',
    'room prep "Prep" other 3 x 3 south of c2',
    '',
  ].join('\n')
  const ask = async (name: string, count: number): Promise<BriefLine> => {
    const compiled = compileRoomsText(clinic)
    expect(compiled.problems).toEqual([])
    b = bench({ 'clinic.json': compiled.plan })
    const reply = await b.call('grid_write_brief', { plan: 'clinic.json', brief: { rooms: [{ name, count, level: 'must', source: 'given', quote: 'consult rooms' }] } })
    expect(reply.isError, reply.text).toBe(false)
    return (reply.data as { lines: BriefLine[] }).lines.find((l) => l.wish === 'rooms')!
  }

  it('counts Consult 1, 2 and 3 for "Consult" and names them, leaving "Cat consult" out', async () => {
    const found = await ask('Consult', 3)
    expect(found).toMatchObject({ state: 'met', drawn: '3', asked: '3' })
    expect(found.text).toContain('(Consult 1, Consult 2, Consult 3)')
    expect(found.text).not.toContain('Cat consult')
  })

  it('still counts an exact name by itself', async () => {
    const found = await ask('Consult 2', 1)
    expect(found).toMatchObject({ state: 'met', drawn: '1' })
    expect(found.text).toContain('(Consult 2)')
  })
})
