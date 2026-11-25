/**
 * ARE-27: one clear-width rule for doors. The brief's door_width and grid_measure what=access
 * judge the same door the same way, each saying which width it measured; a pair is measured leaf
 * by leaf; a roller door keeps its whole hole; and grid check lists the person's missed figures.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { runGrid } from '../../command/main'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { accessAnswer } from '../../quantities/access'
import { surveyPlan } from '../../quantities/survey'
import { parseBrief } from '../brief'
import { briefLines } from '../lines'

const wall = (id: string, start: [number, number], end: [number, number]): Record<string, unknown> => ({ id, start, end, thickness: 0.2, height: 2.7, kind: 'exterior' })

/** A 6 × 4 m hall with a 1.0 m swinging door, a 1.8 m roller door and a 1.8 m pair of doors, all to outside. */
const HALL = {
  version: '1',
  units: 'm',
  walls: [wall('w1', [0, 0], [6, 0]), wall('w2', [6, 0], [6, 4]), wall('w3', [6, 4], [0, 4]), wall('w4', [0, 4], [0, 0])],
  rooms: [{ id: 'r1', name: 'Hall', boundary: ['w1', 'w2', 'w3', 'w4'], use: 'living' }],
  openings: [
    { id: 'd1', wall: 'w1', type: 'door', offset: 1, width: 1, height: 2.1, hinge: 'start', swing: 'left' },
    { id: 'roller', wall: 'w2', type: 'door', offset: 1, width: 1.8, height: 2.4, kind: 'roller' },
    { id: 'pair', wall: 'w3', type: 'door', offset: 2, width: 1.8, height: 2.1, kind: 'double', hinge: 'start', swing: 'left' },
  ],
}

const L = (v: number): string => `${v.toFixed(2)} m`
const brief = (value: number, measure?: string): ReturnType<typeof parseBrief> =>
  parseBrief({ figures: { door_width: { value, ...(measure === undefined ? {} : { measure }), level: 'must', source: 'given', quote: 'the doors' } } }, { versionNeeded: false })

/** Each door's verdict from the brief and from the access measure: the ids each finds short. */
function verdicts(value: number, measure?: string): { brief: string[]; access: string[]; briefText: string[]; accessText: string[] } {
  const plan = parseFloorPlan(HALL)
  const b = brief(value, measure)
  const lines = briefLines(plan, b).filter((l) => l.wish === 'door_width')
  const access = accessAnswer(surveyPlan(plan), { yours: b.figures, code: () => null }, L, 'plan.brief.json')
  return {
    brief: lines.filter((l) => l.state === 'missed').flatMap((l) => l.parts.map((p) => p.id)).sort(),
    access: access.data.doors.filter((d) => d.against.some((a) => a.short)).map((d) => d.id).sort(),
    briefText: lines.map((l) => l.text),
    accessText: access.lines.filter((t) => /^ {2}door /.test(t)),
  }
}

describe('the brief and the access measure judge a door the same way (ARE-27)', () => {
  it('finds a 1.0 m swinging door short of a 1.0 m figure in both, by its clear width', () => {
    const v = verdicts(1)
    expect(v.brief).toEqual(['d1'])
    expect(v.access).toEqual(['d1'])
    expect(v.briefText.join('\n')).toContain('door "d1" ("Hall" to outside) clear width asked at least 1, drawn 0.95 m, its hole 1.00 m.')
    expect(v.accessText.find((t) => t.includes('"d1"'))).toContain('under your figure of 1.00 m for its clear width')
  })

  it('meets a 1.0 m figure for the hole in both, and each says it measured the hole', () => {
    const v = verdicts(1, 'hole')
    expect(v.brief).toEqual([])
    expect(v.access).toEqual([])
    expect(v.briefText.join('\n')).toContain('nothing drawn is short of it (hole: the hole in the wall')
    expect(v.accessText.find((t) => t.includes('"d1"'))).toContain('at least your figure of 1.00 m for its hole')
  })

  it('keeps a roller door\'s whole hole, and measures a pair leaf by leaf', () => {
    const v = verdicts(1.8)
    // The roller door leaves its 1.8 m whole; the pair leaves 1.70 m, each leaf taking its own allowance.
    expect(v.brief).toEqual(['d1', 'pair'])
    expect(v.access).toEqual(['d1', 'pair'])
    expect(v.accessText.find((t) => t.includes('"roller"'))).toContain('1.80 m hole, 1.80 m clear;')
    const pair = v.briefText.find((t) => t.includes('"pair"'))!
    expect(pair).toContain('drawn 1.70 m, its hole 1.80 m; leaves 0.90 m (opens), 0.85 m clear; 0.90 m (opens), 0.85 m clear; both leaves open together.')
    expect(v.accessText.find((t) => t.includes('"pair"'))).toContain('1.80 m hole, 1.70 m clear past the open leaves (leaves 0.90 m (opens), 0.85 m clear; 0.90 m (opens), 0.85 m clear; both leaves open together)')
  })

  it('judges a pair by the active leaf its plan states', () => {
    const plan = parseFloorPlan({ ...HALL, openings: HALL.openings.map((o) => (o.id === 'pair' ? { ...o, opens: { width: 1.2 } } : o)) })
    const b = brief(1.2)
    const line = briefLines(plan, b).find((l) => l.parts.some((p) => p.id === 'pair'))!
    expect(line.drawn).toBe('1.15')
    const access = accessAnswer(surveyPlan(plan), { yours: b.figures, code: () => null }, L, null)
    expect(access.data.doors.find((d) => d.id === 'pair')).toMatchObject({ judgedBy: 'leaf', against: [{ short: true, measure: 'clear' }] })
  })

  it('refuses a door measure it does not know, and writes the one it reads back', () => {
    expect(() => brief(1, 'frame')).toThrow('figures.door_width.measure must be clear, leaf or hole')
    expect(brief(1, 'leaf').figures[0]!.door).toBe('leaf')
  })
})

describe('grid check lists the person\'s missed figures (ARE-27)', () => {
  let b: Bench | undefined
  afterEach(() => b?.close())

  it('says the missed door under the person\'s own heading, in the command and the tool', async () => {
    b = bench({ 'plan.json': HALL })
    const written = await b.call('grid_write_brief', { plan: 'plan.json', brief: { figures: { door_width: { value: 1, level: 'must', source: 'given', quote: 'a metre clear' } } } })
    expect(written.isError, written.text).toBe(false)
    let out = ''
    const code = await runGrid(['check', 'plan.json'], { stdout: (data) => { out += String(data) }, stderr: () => {}, stdoutIsTerminal: false, cwd: b.folder })
    expect(code).not.toBe(2)
    const tool = await b.call('grid_check', { plan: 'plan.json' })
    for (const text of [out, tool.text]) {
      expect(text).toContain('The person\'s own figures missed (1), from the brief "plan.brief.json": theirs, not from any code or standard')
      expect(text).toContain('door "d1" ("Hall" to outside) clear width asked at least 1, drawn 0.95 m')
    }
  })
})
