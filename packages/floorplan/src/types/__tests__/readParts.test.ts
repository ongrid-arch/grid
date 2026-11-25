/* eslint-disable @typescript-eslint/no-explicit-any -- these tests write wrong values into plans on purpose */
import { describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import { indexPlan, roomArea, validatePlan } from '../../geometry'
import { parseFloorPlan } from '../floorplan'
import { readPlanText } from '../jsonText'
import { readPlanParts } from '../readParts'

/** The flat as a file would hold it, to damage. */
const file = (): Record<string, any> => JSON.parse(JSON.stringify(flat()))

function read(raw: unknown) {
  const result = readPlanParts(raw)
  if (result.plan === null) throw new Error(`refused: ${JSON.stringify(result.refusal)}`)
  return result
}

describe('readPlanParts (MSG-6)', () => {
  it('reads a sound plan as parseFloorPlan does, with nothing to say', () => {
    const result = read(file())
    expect(result.faults).toEqual([])
    expect(result.plan).toEqual(parseFloorPlan(file()))
  })

  it('leaves out only the opening with a negative offset, named by its id and place', () => {
    const raw = file()
    raw.openings[1].offset = -0.3
    expect(() => parseFloorPlan(raw)).toThrow()
    const result = read(raw)
    expect(result.faults).toEqual([
      { kind: 'part-left-out', part: { list: 'openings', index: 1, id: 'd_hk' }, path: ['openings', 1, 'offset'], found: '-0.3', wants: 'a number of at least 0' }
    ])
    expect(result.plan.openings.map((o) => o.id)).toEqual(['front', 'd_hb', 'd_bb', 'win_k', 'win_b'])
    expect(result.plan.rooms).toHaveLength(4)
  })

  it('reads a number written as text, and says so', () => {
    const raw = file()
    raw.walls[0].thickness = '0.25'
    raw.openings[0].width = '0.9 m'
    const result = read(raw)
    expect(result.faults.map((f) => ('read' in f ? [f.path.join('.'), f.found, f.read] : null))).toEqual([
      ['walls.0.thickness', 'the text "0.25"', '0.25'],
      ['openings.0.width', 'the text "0.9 m"', '0.9']
    ])
    expect(result.plan.walls[0]!.thickness).toBe(0.25)
    expect(result.plan.openings[0]!.width).toBe(0.9)
  })

  it('uses the default for a null where the field has one, and says which', () => {
    const raw = file()
    raw.walls[2].thickness = null
    raw.openings[4].sill = null
    const result = read(raw)
    expect(result.faults).toMatchObject([
      { kind: 'value-left-out', path: ['walls', 2, 'thickness'], found: 'null', used: '0.2' },
      { kind: 'value-left-out', path: ['openings', 4, 'sill'], found: 'null', used: '0' }
    ])
    expect(result.plan.walls[2]!.thickness).toBe(0.2)
  })

  it('never puts the default in place of a size that was stated: the part is left out', () => {
    for (const value of [-0.3, 0, 'thick']) {
      const raw = file()
      raw.walls[1].thickness = value
      expect(read(raw).faults).toMatchObject([{ kind: 'part-left-out', path: ['walls', 1, 'thickness'] }])
    }
    // A floor's level only orders the floors: leaving the floor out would leave out all on it.
    const floors = { ...file(), floors: [{ id: 'ground', name: 'Ground', level: 'first' }] }
    expect(read(floors).faults).toMatchObject([{ kind: 'value-left-out', path: ['floors', 0, 'level'], used: '0' }])
  })

  it('reads a word that differs only in capitals as meant, and leaves out one it does not know', () => {
    const raw = file()
    raw.walls[0].kind = 'Exterior'
    raw.openings[0].hinge = 'Start'
    raw.openings[1].hinge = 'left'
    raw.openings[2].type = 'gate'
    const result = read(raw)
    expect(result.faults).toMatchObject([
      { kind: 'read-as-meant', path: ['walls', 0, 'kind'], read: '"exterior"' },
      { kind: 'read-as-meant', path: ['openings', 0, 'hinge'], read: '"start"' },
      { kind: 'value-left-out', path: ['openings', 1, 'hinge'], used: null },
      { kind: 'part-left-out', path: ['openings', 2, 'type'], wants: 'one of "door", "window", "opening"' }
    ])
    expect(result.plan.openings.find((o) => o.id === 'd_hk')?.hinge).toBeUndefined()
  })

  it('reads a unit in other capitals as metres, and a file in millimetres in millimetres, saying so (WRT-7)', () => {
    const upper = file()
    upper.units = 'M'
    expect(read(upper).faults).toMatchObject([{ kind: 'read-as-meant', part: null, path: ['units'], read: '"m"' }])
    const mm = file()
    mm.units = 'mm'
    const wall = mm.walls[0] as { thickness: number }
    wall.thickness = wall.thickness * 1000
    for (const w of mm.walls as Array<{ start: number[]; end: number[]; height?: number; thickness: number }>) {
      w.start = w.start.map((v) => v * 1000)
      w.end = w.end.map((v) => v * 1000)
      if (w !== wall) w.thickness *= 1000
      if (w.height !== undefined) w.height *= 1000
    }
    for (const o of mm.openings as Array<Record<string, number>>) for (const k of ['offset', 'width', 'sill', 'height']) if (typeof o[k] === 'number') o[k] *= 1000
    const result = read(mm)
    expect(result.faults).toMatchObject([{ kind: 'read-as-meant', part: null, path: ['units'], read: '"m", every length read in millimetres and converted to metres' }])
    expect(result.plan!.walls).toEqual(read(file()).plan!.walls)
    // A unit Grid has no word for keeps the default, metres, as before.
    const furlongs = file()
    furlongs.units = 'furlong'
    expect(read(furlongs).faults).toMatchObject([{ kind: 'value-left-out', part: null, path: ['units'], used: '"m"' }])
  })

  it('names a wall with no id by its place, and leaves out the rooms on it with the reason', () => {
    const raw = file()
    delete raw.walls[8].id // hk: the hall and the kitchen rest on it
    const result = read(raw)
    expect(result.faults).toMatchObject([{ kind: 'part-left-out', part: { list: 'walls', index: 8, id: null }, found: 'missing' }])
    const checked = validatePlan(result.plan, indexPlan(result.plan), { leftOutWalls: result.leftOutWalls, spaces: false })
    expect([...checked.broken].filter((id) => result.plan.rooms.some((r) => r.id === id))).toEqual(['hall', 'kitchen'])
  })

  it('names the wall a room rests on when the reader left it out', () => {
    const raw = file()
    raw.walls[8].start = null // hk, required
    const result = read(raw)
    expect([...result.leftOutWalls]).toEqual(['hk'])
    const checked = validatePlan(result.plan, indexPlan(result.plan), { leftOutWalls: result.leftOutWalls, spaces: false })
    const lines = checked.issues.filter((i) => i.code === 'room/broken-wall' || i.code === 'opening/broken-wall').map((i) => i.message)
    expect(lines).toEqual([
      'Opening "d_hk" hangs off wall "hk", which was left out when the plan was read',
      'Room "hall" rests on wall "hk", left out when the plan was read',
      'Room "kitchen" rests on wall "hk", left out when the plan was read'
    ])
  })

  it('names NaN and a decimal comma for what they are, and still reads the rest', () => {
    const text = JSON.stringify(file(), null, 1).replace('"offset": 1.5', '"offset": NaN').replace('"thickness": 0.2', '"thickness": 0,25')
    const parsed = readPlanText(text)
    if (!parsed.ok) throw new Error('not read')
    // In the order the text holds them.
    expect(parsed.marks.map((m) => [m.what, m.token, m.path.join('.')])).toEqual([
      ['not-a-number', 'NaN', 'openings.0.offset'],
      ['decimal-comma', '0,25', 'walls.0.thickness']
    ])
    const result = readPlanParts(parsed.value, parsed.marks)
    if (result.plan === null) throw new Error('refused')
    expect(result.faults).toMatchObject([
      { kind: 'part-left-out', path: ['walls', 0, 'thickness'], found: '0,25, written with a decimal comma' },
      { kind: 'part-left-out', path: ['openings', 0, 'offset'], found: 'NaN, which JSON does not hold as a number' }
    ])
  })

  it('says a point of four whole numbers is most likely two numbers with decimal commas', () => {
    const raw = file()
    raw.walls[9].start = [0, 4, 4, 0]
    expect(read(raw).faults).toMatchObject([{ kind: 'part-left-out', found: 'a list of 4 numbers, 0, 4, 4, 0: a decimal comma splits each number of a point in two', wants: 'at most 2 items' }])
  })

  it('refuses what is wrong at the plan level: a version it does not read, a list that is not a list', () => {
    expect(readPlanParts({ ...file(), version: '2' })).toMatchObject({ plan: null, refusal: { kind: 'schema' } })
    expect(readPlanParts({ ...file(), walls: {} })).toMatchObject({ plan: null, refusal: { kind: 'schema' } })
    expect(readPlanParts([])).toEqual({ plan: null, refusal: { kind: 'not-an-object' } })
    expect(read({ ...file(), version: 1 }).faults).toMatchObject([{ kind: 'read-as-meant', path: ['version'], read: '"1"' }])
  })
})

describe('ids, read part by part (MSG-6, lab MS-9)', () => {
  it('leaves out only the room of a room and a wall that share an id, so the rooms on the wall are measured', () => {
    const raw = file()
    raw.rooms[3].id = 'hk' // the bathroom takes the id of the wall between hall and kitchen
    const result = read(raw)
    expect(result.faults).toEqual([
      { kind: 'id-clash', part: { list: 'rooms', index: 3, id: 'hk' }, kept: { list: 'walls', index: 8, id: 'hk' } }
    ])
    const index = indexPlan(result.plan)
    const checked = validatePlan(result.plan, index, { leftOutWalls: result.leftOutWalls })
    expect(checked.broken.size).toBe(0)
    expect(result.plan.rooms.map((r) => [r.id, roomArea(r, index) > 0])).toEqual([
      ['hall', true],
      ['kitchen', true],
      ['bedroom', true]
    ])
    // Read whole, the same plan loses all four rooms that rest on "hk", or are it.
    const whole = validatePlan(parseFloorPlan(raw))
    expect(raw.rooms.filter((r: { id: string }) => whole.broken.has(r.id)).map((r: { id: string }) => r.id)).toEqual(['hall', 'kitchen', 'hk'])
  })

  it('leaves two walls with one id to validatePlan, which names both and suggests a rename', () => {
    const raw = file()
    raw.walls[9].id = 'hk'
    const result = read(raw)
    expect(result.faults).toEqual([])
    const line = validatePlan(result.plan).issues.find((i) => i.code === 'plan/duplicate-id')
    expect(line?.message).toBe('Id "hk" names 2 walls. Every lookup resolves to only one of them, so all of them are skipped. Rename one, for example to "hk-2", and update what points at it')
  })

  it('leaves a blank id and ids alike but for capitals or spaces to validatePlan, which skips the later', () => {
    const raw = file()
    raw.openings[5].id = '  '
    raw.rooms[0].id = 'Kitchen '
    raw.rooms[1].id = 'kitchen'
    const result = read(raw)
    expect(result.faults).toEqual([])
    const checked = validatePlan(result.plan, indexPlan(result.plan), { spaces: false })
    expect(checked.issues.filter((i) => i.code === 'plan/blank-id' || i.code === 'plan/similar-id').map((i) => [i.code, i.entity, i.id, i.message])).toEqual([
      ['plan/similar-id', 'room', 'kitchen', 'Room "kitchen" has an id that differs from the id of room "Kitchen " only in capitals or spaces, so it is skipped. If it is "Kitchen ", use that id letter for letter; if not, rename it'],
      ['plan/blank-id', 'opening', '  ', 'Opening "  " has a blank id. Every part needs an id of its own, so it is skipped']
    ])
    expect([...checked.broken].sort()).toEqual(['  ', 'kitchen'])
  })
})

describe('readPlanText (MSG-6, lab U-10)', () => {
  const plan = JSON.stringify(file())
  const other = JSON.stringify({ ...file(), openings: [...file().openings.slice(0, 5), { id: 'win_x', wall: 'e1', type: 'window', offset: 1, width: 1, sill: 1, height: 1 }] })

  it('names an unfinished merge, where it is and what each side adds', () => {
    const text = `<<<<<<< agent-a\n${plan}\n=======\n${other}\n>>>>>>> agent-b\n`
    const read = readPlanText(text)
    expect(read).toEqual({
      ok: false,
      fault: {
        kind: 'unfinished-merge',
        line: 1,
        conflicts: 1,
        ours: { label: 'agent-a', adds: ['win_b'] },
        theirs: { label: 'agent-b', adds: ['win_x'] },
        changed: []
      }
    })
  })

  it('finds what each side adds by id when a side is not JSON on its own', () => {
    const text = '{"walls": [\n<<<<<<< HEAD\n{"id": "a"}, {"id": "b"}\n=======\n{"id": "a"}, {"id": "c"}\n>>>>>>> feature\n]}'
    expect(readPlanText(text)).toMatchObject({ ok: false, fault: { line: 2, ours: { label: 'HEAD', adds: ['b'] }, theirs: { label: 'feature', adds: ['c'] } } })
  })

  it('reads a plan whose text holds the markers only inside a string', () => {
    expect(readPlanText('{"walls": [], "note": "<<<<<<< not a marker"}')).toMatchObject({ ok: true, marks: [] })
  })

  it('says where the text stops being JSON otherwise', () => {
    expect(readPlanText('{\n  "walls": [}\n')).toEqual({ ok: false, fault: { kind: 'not-json', line: 2, column: 13, ends: false } })
    expect(readPlanText('{"walls": [')).toEqual({ ok: false, fault: { kind: 'not-json', line: null, column: null, ends: true } })
  })

  it('never reads a comma in a list as a decimal comma: [4,6] is two numbers', () => {
    expect(readPlanText('{"start": [4,6], "x": NaN}')).toMatchObject({ ok: true, value: { start: [4, 6], x: null } })
  })
})

describe('one entry of another list of parts (MSG-20)', () => {
  /** Twenty sketch lines, and a note of each kind. */
  function sketched(): Record<string, any> {
    const raw = file()
    raw.sketch = Array.from({ length: 20 }, (_, i) => ({ id: `s${i}`, kind: 'line', category: 'level', points: [[i, 0], [i, 1]] }))
    raw.annotations = [
      { id: 'n1', kind: 'note', text: 'Cornice to be kept', at: [1, 1] },
      { id: 'n2', kind: 'note', text: 'Survey: ' + 'x'.repeat(139), at: [2, 1] },
      { id: 'n3', kind: 'tag', text: 'Lintel', at: [3, 1] }
    ]
    return raw
  }

  it('leaves out a sketch line written with from and to alone, and keeps the other items', () => {
    const raw = sketched()
    raw.sketch.splice(4, 0, { id: 'bad', kind: 'line', category: 'level', from: [0, 0], to: [4, 0] })
    const result = read(raw)
    expect(result.plan.sketch!.map((s) => s.id)).toEqual(Array.from({ length: 20 }, (_, i) => `s${i}`))
    const lines = result.faults.filter((f) => f.kind !== 'id-clash' && f.path[0] === 'sketch')
    expect(lines).toEqual([expect.objectContaining({ kind: 'value-left-out', part: null, path: ['sketch', 4, 'points'] })])
  })

  it('leaves out a note longer than a name may be alone, and keeps the others', () => {
    const result = read(sketched())
    expect(result.plan.annotations!.map((a) => a.id)).toEqual(['n1', 'n3'])
    expect(result.faults).toEqual([expect.objectContaining({ kind: 'value-left-out', part: null, path: ['annotations', 1, 'text'] })])
    expect(result.faults[0]).toMatchObject({ found: expect.stringMatching(/147 characters long/) })
  })

  it('gives each bad entry its own line at its place in the file, however many there are', () => {
    const raw = sketched()
    for (const at of [0, 5, 9, 12, 13, 14, 15, 16, 17, 18, 19]) raw.sketch[at] = { ...raw.sketch[at], points: [[0, 0]] }
    raw.annotations[0].text = 'one\nline'
    const result = read(raw)
    expect(result.plan.sketch!.map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's6', 's7', 's8', 's10', 's11'])
    expect(result.faults.map((f) => (f.kind === 'id-clash' ? [] : f.path.slice(0, 2)))).toEqual([
      ['annotations', 0],
      ['annotations', 1],
      ...[0, 5, 9, 12, 13, 14, 15, 16, 17, 18, 19].map((at) => ['sketch', at])
    ])
  })
})
