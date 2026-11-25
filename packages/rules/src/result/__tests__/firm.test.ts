/**
 * COD-8: the firm's own standards in the one list. The caller measures the plan for each of the
 * firm's standards; the front door words each part short of the firm's figure as a `firm/`
 * finding, after the code figures' findings, never with a code's figures, and the record says
 * what each standard looked at. A file that could not be read is one `firm/not-read` line.
 */
import { describe, expect, it } from 'vitest'
import { flat } from '@ongrid/floorplan/test-support/plans'
import { approvalWords, CODES, FIRM_HEADING, FIRM_MEASURE_NAMES, FIRM_MEASURES, inspectPlan, isFirmLine, type FirmInput, type FirmStandard } from '../..'

const standard = (measure: FirmStandard['measure'], value: number, name: string | null = null): FirmStandard => ({ measure, value, written: FIRM_MEASURES[measure].unit === 'm²' ? 'm²' : 'm', name, note: null, uses: [], kinds: [] })

function input(standards: FirmStandard[], measured: FirmInput['measured']): FirmInput {
  return { file: 'firm-standards.json', problem: null, standards, measured }
}

const PLAN = flat()
const room = PLAN.rooms[0]!.id

describe('the firm\'s lines in the record (COD-8)', () => {
  it('words a part short of the firm\'s figure as a firm/ finding, with the firm\'s figure and no code figure', () => {
    const firm = input([standard('corridor_width', 1.5, 'Corridors')], [{ standard: 0, thing: { kind: 'room', id: room }, floor: null, measured: 1.2, precision: 0, said: 'from "d1" to "d2"', also: [] }])
    const result = inspectPlan(PLAN, { firm })
    const line = result.lines.find(isFirmLine)!
    expect(line).toMatchObject({ code: 'firm/corridor-width', kind: 'finding', thing: { kind: 'room', id: room } })
    expect(line.message).toMatch(/: the way through is 1\.20 m wide at its narrowest, under the firm's own figure of 1\.5 m for corridor width \("Corridors"\)$/)
    expect(line.found).toMatch(/^1\.20 m, from "d1" to "d2"; measured as /)
    expect(line.needed).toBe('at least 1.5 m: the firm\'s figure used here ("Corridors"), from "firm-standards.json", the firm\'s own and not from any code or standard')
    expect(line.fix).toContain("The figure is the firm's own")
    expect(line.firm).toEqual({ standard: 0, measure: 'corridor_width', value: 1.5, unit: 'm', name: 'Corridors', note: null, file: 'firm-standards.json' })
    expect(line.figures).toBeUndefined()
    expect(result.figures.some((f) => JSON.stringify(f).includes('firm'))).toBe(false)
    expect(result.firm).toEqual({
      heading: FIRM_HEADING,
      file: 'firm-standards.json',
      read: true,
      standards: [{ measure: 'corridor_width', value: 1.5, unit: 'm', name: 'Corridors', note: null, uses: [], kinds: [], lookedAt: 1, notes: 1 }],
    })
    // One list, one count: the firm's line is a finding like any other.
    expect(result.count).toBe(inspectPlan(PLAN).count + 1)
    expect(result.counts.finding).toBe(inspectPlan(PLAN).counts.finding + 1)
  })

  it('gives no line for a part at the figure, or within the measure\'s precision of it', () => {
    const firm = input([standard('corridor_width', 1.5), standard('room_area', 9)], [
      { standard: 0, thing: { kind: 'room', id: room }, floor: null, measured: 1.5, precision: 0, said: '', also: [] },
      { standard: 0, thing: { kind: 'room', id: room }, floor: null, measured: 1.49, precision: 0.02, said: '', also: [] },
      { standard: 1, thing: { kind: 'room', id: room }, floor: null, measured: 9, precision: 0, said: '', also: [] },
    ])
    const result = inspectPlan(PLAN, { firm })
    expect(result.lines.filter(isFirmLine)).toEqual([])
    expect(result.firm?.standards.map((s) => [s.lookedAt, s.notes])).toEqual([[2, 0], [1, 0]])
  })

  it('says a way through that is not there at all', () => {
    const firm = input([standard('corridor_width', 1.5)], [{ standard: 0, thing: { kind: 'room', id: room }, floor: null, measured: null, precision: 0, said: 'from "d1" to "d2", no way through clear of its fixtures', also: [] }])
    const line = inspectPlan(PLAN, { firm }).lines.find(isFirmLine)!
    expect(line.message).toMatch(/: there is no way through clear of its fixtures, against the firm's own figure of 1\.5 m for corridor width$/)
    expect(line.found).toMatch(/^no way through, from "d1" to "d2"/)
  })

  it('has one wording for every measure, none with a word of approval', () => {
    for (const measure of FIRM_MEASURE_NAMES) {
      expect(Object.hasOwn(CODES, FIRM_MEASURES[measure].code)).toBe(true)
      const firm = input([standard(measure, 50, 'Ours')], [{ standard: 0, thing: { kind: 'room', id: room }, floor: null, measured: 1, precision: 0, said: 'measured here', also: [] }])
      const line = inspectPlan(PLAN, { firm }).lines.find(isFirmLine)!
      expect(line.code).toBe(FIRM_MEASURES[measure].code)
      for (const text of [line.message, line.found, line.needed, line.fix]) expect(approvalWords(text), text).toEqual([])
      expect(line.needed).toContain('the firm\'s own and not from any code or standard')
    }
  })

  it('makes a file that could not be read one firm/not-read line, and nothing else of the firm\'s', () => {
    const firm: FirmInput = { file: 'firm-standards.json', problem: 'firm-standards.json is not JSON', standards: [], measured: [] }
    const result = inspectPlan(PLAN, { firm })
    const lines = result.lines.filter(isFirmLine)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ code: 'firm/not-read', kind: 'not-checked', thing: { kind: 'plan', id: '' }, found: 'firm-standards.json is not JSON' })
    expect(lines[0]!.message).toBe('The firm\'s standards in "firm-standards.json" were not read, so none of them was set against the plan')
    expect(result.firm).toEqual({ heading: FIRM_HEADING, file: 'firm-standards.json', read: false, standards: [] })
  })

  it('leaves a record with no firm\'s file as it was: no firm field, no firm line', () => {
    const result = inspectPlan(PLAN)
    expect(result.firm).toBeUndefined()
    expect(result.lines.some(isFirmLine)).toBe(false)
    expect(JSON.stringify(result)).not.toMatch(/"firm"|firm\//)
  })
})
