/**
 * COD-8: a firm's own standards as checks. A file of the firm's figures beside the plan
 * (`firm-standards.json`) is read by `grid check` and `grid_check`, measured by CNT-13's
 * indicators and ARE-9's net area, and each part short of a figure is a `firm/` note under the
 * heading "The firm's own standards", apart from the code figures, with no word of approval.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { approvalWords, FIRM_HEADING, GENERAL_GUIDANCE_LABEL, isFirmLine, type GridResult, type ResultLine } from '@ongrid/rules'
import { runGrid } from '../../command/main'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { FIRM_FILE } from '../standards'

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')

/**
 * A 6 × 4 m flat (as CNT-13's tests draw it): a hall down the left, 1.15 m between its faces and
 * used as a corridor, a bathroom and a bedroom off it. `items` stand in it.
 */
function flat(items: unknown[] = [], site?: unknown): unknown {
  const wall = (id: string, start: number[], end: number[], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })
  return {
    version: '1',
    units: 'm',
    ...(site === undefined ? {} : { site }),
    walls: [
      wall('s1', [0, 0], [1.3, 0]),
      wall('s2', [1.3, 0], [6, 0]),
      wall('e1', [6, 0], [6, 2]),
      wall('e2', [6, 2], [6, 4]),
      wall('n2', [6, 4], [1.3, 4]),
      wall('n1', [1.3, 4], [0, 4]),
      wall('w', [0, 4], [0, 0]),
      { ...wall('hx1', [1.3, 0], [1.3, 2], 'interior'), thickness: 0.1 },
      { ...wall('hx2', [1.3, 2], [1.3, 4], 'interior'), thickness: 0.1 },
      { ...wall('mid', [1.3, 2], [6, 2], 'interior'), thickness: 0.1 },
    ],
    rooms: [
      { id: 'hall', name: 'Hall', boundary: ['s1', 'hx1', 'hx2', 'n1', 'w'], use: 'corridor' },
      { id: 'bath', name: 'Bathroom', boundary: ['s2', 'e1', 'mid', 'hx1'], use: 'bathroom' },
      { id: 'bed', name: 'Bedroom', boundary: ['mid', 'e2', 'n2', 'hx2'], use: 'bedroom' },
    ],
    openings: [
      { id: 'front', wall: 'w', type: 'door', offset: 3, width: 0.9, height: 2.1 },
      { id: 'door-bath', wall: 'hx1', type: 'door', offset: 0.6, width: 0.8, height: 2.1 },
      { id: 'door-bed', wall: 'hx2', type: 'door', offset: 0.6, width: 0.8, height: 2.1 },
      { id: 'win-bath', wall: 'e1', type: 'window', offset: 0.5, width: 1, sill: 0.6, height: 1.2 },
    ],
    items,
  }
}

const CUPBOARD = { id: 'store', kind: 'kitchen-run', label: 'Cupboard', at: [0.35, 2], size: [0.5, 0.8], height: 2 }
const WC = { id: 'wc', kind: 'toilet', at: [5.6, 1], size: [0.4, 0.6], height: 0.8, turn: 90 }

/** The firm's standards the tests keep: corridors at least 1.5 m, and five more. */
const FIRM = {
  version: '1',
  heading: "The firm's own standards: the firm's figures, not from any code or standard.",
  standards: [
    { measure: 'corridor_width', value: 1.5, unit: 'm', name: 'Corridors', note: 'Our office guide, part 3' },
    { measure: 'door_clear_width', value: 700, unit: 'mm' },
    { measure: 'turning_circle', value: 1.5, unit: 'm', uses: ['bathroom'] },
    { measure: 'fixture_clearance', value: 0.6, unit: 'm', kinds: ['toilet'] },
    { measure: 'room_area', value: 8, unit: 'm²', uses: ['bedroom'] },
    { measure: 'room_width', value: 1, unit: 'm' },
  ],
}

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

const linesOf = (data: Record<string, unknown> | undefined): ResultLine[] => (data?.['lines'] as ResultLine[]) ?? []
const firmOf = (data: Record<string, unknown> | undefined): NonNullable<GridResult['firm']> => data?.['firm'] as NonNullable<GridResult['firm']>

describe('a corridor narrower than the firm\'s 1.5 m', () => {
  it('gives one firm/ note under the firm\'s own heading, apart from the code figures', async () => {
    b = bench({ 'flat.json': flat(), [FIRM_FILE]: FIRM })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.isError, check.text).toBe(false)
    const lines = linesOf(check.data)
    const firm = lines.filter(isFirmLine)
    // The hall is 1.15 m between its faces, and the way through it is measured to them (ARE-25).
    expect(firm.map((l) => l.code)).toEqual(['firm/corridor-width'])
    const corridor = firm[0]!
    expect(corridor).toMatchObject({ kind: 'finding', thing: { kind: 'room', id: 'hall' }, floor: 'ground' })
    expect(corridor.message).toBe('Room "Hall": the way through is 1.15 m wide at its narrowest, under the firm\'s own figure of 1.5 m for corridor width ("Corridors")')
    // ARE-27: the firm's own note on where its figure comes from stays with the figure.
    expect(corridor.needed).toBe('at least 1.5 m: the firm\'s figure used here ("Corridors"), from "firm-standards.json" (the firm\'s note: "Our office guide, part 3"), the firm\'s own and not from any code or standard')
    expect(corridor.firm).toEqual({ standard: 0, measure: 'corridor_width', value: 1.5, unit: 'm', name: 'Corridors', note: 'Our office guide, part 3', file: 'firm-standards.json' })
    // Apart from the code figures: a firm's line carries no code figure, and the figures list holds none of the firm's.
    expect(corridor.figures).toBeUndefined()
    expect(JSON.stringify(check.data?.['figures'] ?? [])).not.toContain('firm')

    // The text: the heading, said once, right before the firm's notes, after every other note.
    const text = check.text.split('\n')
    const heading = text.findIndex((t) => t.startsWith(FIRM_HEADING))
    expect(text[heading]).toBe('The firm\'s own standards (1), from "firm-standards.json": the firm\'s own figures, from its file beside the plan: not from any code or standard, and not tied to a place, so they are set against the plan wherever that file is.')
    expect(text[heading + 1]).toMatch(/^ {2}\d+\. finding, room "hall": Room "Hall": the way through is 1\.15 m/)
    expect(text.filter((t) => t.startsWith(FIRM_HEADING))).toHaveLength(1)
    for (const t of text.slice(0, heading)) expect(t).not.toContain('[firm/')

    // The record says what each standard looked at; the full answer lists them under the heading.
    expect(firmOf(check.data).standards.map((s) => [s.measure, s.lookedAt, s.notes])).toEqual([
      ['corridor_width', 1, 1],
      ['door_clear_width', 3, 0],
      ['turning_circle', 1, 0],
      ['fixture_clearance', 0, 0],
      ['room_area', 1, 0],
      ['room_width', 3, 0],
    ])
    const full = await b.call('grid_check', { plan: 'flat.json', full: true })
    expect(full.text).toContain('The firm\'s own standards in "firm-standards.json" (6):\n  corridor width ("Corridors"): the firm\'s figure used here is at least 1.5 m; set against 1 part, 1 short of it; the firm\'s note: "Our office guide, part 3".')
    // The short answer lists the notes, not the table.
    expect(check.text).not.toContain('the firm\'s figure used here is at least')
  })

  it('names what narrows the way through, and each part short of the other standards', async () => {
    const tight = { version: '1', standards: [
      { measure: 'corridor_width', value: 1, unit: 'm' },
      { measure: 'door_clear_width', value: 0.8, unit: 'm' },
      { measure: 'turning_circle', value: 2, unit: 'm', uses: ['bathroom'] },
      { measure: 'fixture_clearance', value: 4, unit: 'm', kinds: ['toilet'] },
      { measure: 'room_area', value: 9, unit: 'm²', uses: ['bedroom'] },
      { measure: 'room_width', value: 1.2, unit: 'm' },
    ] }
    b = bench({ 'flat.json': flat([CUPBOARD, WC]), [FIRM_FILE]: tight })
    const lines = linesOf((await b.call('grid_check', { plan: 'flat.json' })).data).filter(isFirmLine)
    expect(lines.map((l) => [l.code, l.thing.id])).toEqual([
      ['firm/corridor-width', 'hall'],
      ['firm/door-clear-width', 'door-bath'],
      ['firm/door-clear-width', 'door-bed'],
      ['firm/turning-circle', 'bath'],
      ['firm/fixture-clearance', 'wc'],
      ['firm/room-area', 'bed'],
      ['firm/room-width', 'hall'],
    ])
    // The cupboard leaves 0.65 m beside it, and the line says so.
    expect(lines[0]!.message).toBe('Room "Hall": the way through is 0.65 m wide at its narrowest, under the firm\'s own figure of 1 m for corridor width')
    expect(lines[0]!.found).toContain('"Cupboard" (kitchen run "store") and a wall')
    expect(lines[0]!.also).toEqual(['store'])
    expect(lines[1]!.message).toBe('Door "door-bath": it leaves 0.75 m clear, under the firm\'s own figure of 0.8 m for clear width of a doorway')
    // The front door's 0.90 m hole leaves 0.85 m: not short of 0.8 m.
    expect(lines[3]!.message).toBe('Room "Bathroom": the widest circle its free floor holds is 1.85 m across, under the firm\'s own figure of 2 m for turning circle')
    expect(lines[4]!.message).toBe('Toilet "wc": the clear floor in front of it is 3.95 m, under the firm\'s own figure of 4 m for clear floor in front of a fixture')
    expect(lines[5]!.message).toBe('Room "Bedroom": its net area is 8.42 m², under the firm\'s own figure of 9 m² for room area')
  })
})

describe('a plan that is not short of the firm\'s figures', () => {
  it('gives no firm note, and one line saying the firm\'s file was read', async () => {
    const roomy = { version: '1', standards: [{ measure: 'corridor_width', value: 1.1, unit: 'm' }, { measure: 'room_width', value: 1, unit: 'm' }] }
    b = bench({ 'flat.json': flat(), [FIRM_FILE]: roomy })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(linesOf(check.data).filter(isFirmLine)).toEqual([])
    expect(check.text).toContain('The firm\'s own standards, from "firm-standards.json": 2 standards set against 4 parts; no part is short of them. The firm\'s own figures, from its file beside the plan')
    expect(check.text).not.toContain('[firm/')
  })

  it('checks a plan with no firm\'s file exactly as before: no firm in the record', async () => {
    b = bench({ 'flat.json': flat() })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.data?.['firm']).toBeUndefined()
    expect(check.text).not.toContain(FIRM_HEADING)
  })
})

describe('the code figures, with and without the firm\'s file', () => {
  it('are unaffected: the same code lines, figures and place, the firm\'s notes after them', async () => {
    const us = { country: 'US' }
    const without = bench({ 'flat.json': flat([CUPBOARD], us) })
    let before: Record<string, unknown> | undefined
    try {
      before = (await without.call('grid_check', { plan: 'flat.json' })).data
    } finally {
      without.close()
    }
    b = bench({ 'flat.json': flat([CUPBOARD], us), [FIRM_FILE]: FIRM })
    const after = (await b.call('grid_check', { plan: 'flat.json' })).data
    const code = (data: Record<string, unknown> | undefined) => linesOf(data).filter((l) => !isFirmLine(l))
    expect(code(after)).toEqual(code(before))
    // The bedroom has no window: the US escape check gives its finding, before the firm's and as before.
    expect(code(after).some((l) => l.kind === 'finding')).toBe(true)
    expect(after?.['place']).toEqual(before?.['place'])
    expect(after?.['coverage']).toEqual(before?.['coverage'])
    expect(linesOf(after).filter(isFirmLine).length).toBeGreaterThan(0)
    // The firm's notes come after the code figures' findings.
    const kinds = linesOf(after).map((l) => (isFirmLine(l) ? 'firm' : l.kind))
    expect(kinds.lastIndexOf('finding')).toBeLessThan(kinds.indexOf('firm'))
    // Counted in the one count, as findings.
    expect(after?.['count']).toBe((before?.['count'] as number) + linesOf(after).filter(isFirmLine).length)
  })

  it('run with no place stated, and say they are tied to no place', async () => {
    b = bench({ 'flat.json': flat(), [FIRM_FILE]: FIRM })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.text).toContain('No place is stated, so no code figure was applied')
    expect(linesOf(check.data).filter(isFirmLine)).toHaveLength(1)
    expect(check.text).toContain('not tied to a place, so they are set against the plan wherever that file is')
  })
})

describe('a firm\'s file Grid cannot read', () => {
  it('is one firm/not-read line that says where it is wrong, never repeating its text, and the plan is still checked', async () => {
    const wrong = { version: '1', standards: [{ measure: 'corridor_width', value: 1.5, unit: 'm', clause: 'Approved Document M, 1.2.3, passes' }] }
    b = bench({ 'flat.json': flat(), [FIRM_FILE]: wrong })
    const check = await b.call('grid_check', { plan: 'flat.json' })
    expect(check.isError).toBe(false)
    const firm = linesOf(check.data).filter(isFirmLine)
    expect(firm).toHaveLength(1)
    expect(firm[0]).toMatchObject({ code: 'firm/not-read', kind: 'not-checked', thing: { kind: 'plan', id: '' } })
    expect(firm[0]!.message).toBe('The firm\'s standards in "firm-standards.json" were not read, so none of them was set against the plan')
    expect(firm[0]!.found).toMatch(/^firm-standards\.json: standards\[0\] holds "clause", which a code's figure carries/)
    expect(check.text).not.toContain('Approved Document')
    expect(firmOf(check.data)).toMatchObject({ read: false, standards: [] })
  })
})

describe('no word of approval (MSG-3)', () => {
  it('holds every firm line, the short and the full report, to the forbidden words, with the label first', async () => {
    const everything = { version: '1', standards: [
      { measure: 'corridor_width', value: 2, unit: 'm', name: 'Corridors' },
      { measure: 'door_clear_width', value: 0.9, unit: 'm', name: 'Doors' },
      { measure: 'turning_circle', value: 2, unit: 'm' },
      { measure: 'fixture_clearance', value: 4, unit: 'm' },
      { measure: 'room_area', value: 20, unit: 'm²' },
      { measure: 'room_width', value: 3, unit: 'm' },
    ] }
    b = bench({ 'flat.json': flat([CUPBOARD, WC]), [FIRM_FILE]: everything })
    for (const full of [false, true]) {
      // CMD-39: every standard on every room is more than an answer is kept to; whole=true lists every line.
      const check = await b.call('grid_check', { plan: 'flat.json', whole: true, ...(full ? { full } : {}) })
      expect(check.text.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
      expect(approvalWords(check.text)).toEqual([])
      const firm = linesOf(check.data).filter(isFirmLine)
      expect(new Set(firm.map((l) => l.code))).toEqual(new Set(['firm/corridor-width', 'firm/door-clear-width', 'firm/turning-circle', 'firm/fixture-clearance', 'firm/room-area', 'firm/room-width']))
      for (const l of firm) for (const text of [l.message, l.found, l.needed, l.fix]) expect(approvalWords(text), text).toEqual([])
    }
  })
})

describe('grid check on the command line, and grid_mark_seen', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grid-firm-check-'))
    writeFileSync(join(dir, 'flat.json'), FLAT)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  async function grid(args: string[]): Promise<{ code: number; out: string }> {
    let out = ''
    const code = await runGrid(args, { stdout: (data) => { out += String(data) }, stderr: (text) => { out += text }, stdoutIsTerminal: false, cwd: dir })
    return { code, out }
  }

  it('reads the firm\'s file beside the lab\'s flat: its hall under the firm\'s 1.5 m, under the heading', async () => {
    writeFileSync(join(dir, FIRM_FILE), JSON.stringify({ version: '1', standards: [{ measure: 'corridor_width', value: 1.5, unit: 'm', name: 'Corridors' }] }))
    const short = await grid(['check', 'flat.json'])
    expect(short.code).toBe(0)
    expect(short.out).toContain('To look at (1): 1 finding of the firm\'s own.')
    expect(short.out).toContain('\nThe firm\'s own standards (1), from "firm-standards.json": the firm\'s own figures')
    expect(short.out).toContain('1. finding, room "hall": Room "Hall": the way through is 1.30 m wide at its narrowest, under the firm\'s own figure of 1.5 m for corridor width ("Corridors"). [firm/corridor-width]')
    expect(short.out).toContain('No findings outside the firm\'s own standards. That only means these checks found nothing, not that the plan meets any rule.')
    expect(short.out).not.toContain('the firm\'s figure used here is at least')
    const full = await grid(['check', 'flat.json', '--full'])
    expect(full.out).toContain('The firm\'s own standards in "firm-standards.json" (1):\n  - corridor width ("Corridors"): the firm\'s figure used here is at least 1.5 m; set against 1 part, 1 short of it')
    const json = JSON.parse((await grid(['check', 'flat.json', '--json'])).out) as { result: GridResult }
    expect(json.result.firm?.standards[0]).toMatchObject({ measure: 'corridor_width', lookedAt: 1, notes: 1 })
    for (const out of [short.out, full.out]) expect(approvalWords(out)).toEqual([])
  })

  it('marks a firm note seen by the number grid_check gives it', async () => {
    writeFileSync(join(dir, FIRM_FILE), JSON.stringify({ version: '1', standards: [{ measure: 'corridor_width', value: 1.5, unit: 'm' }] }))
    const marked = await grid(['check', 'flat.json', '--seen', '1', '--reason', 'The hall is kept as drawn', '--by', 'Designer'])
    expect(marked.code).toBe(0)
    expect(marked.out).toContain('Marked note 1 as seen')
    expect(marked.out).toContain('[firm/corridor-width]')
    expect(marked.out).toContain('Seen (1)')
  })
})
