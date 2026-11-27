/**
 * COD-8: the firm's standards file, `firm-standards.json` beside the plan: its schema, and its
 * refusals, which name the place and the limit and never repeat the text (MSG-9).
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FIRM_MEASURE_NAMES } from '@ongrid/rules'
import { itemKinds } from '@ongrid/floorplan/geometry'
import { openProject, PathRefused, type Project } from '../../fs/projectFiles'
import { FIRM_FILE, firmFileOf, FirmRefused, parseFirmStandards, readFirm, STANDARDS_MAX } from '../standards'

const SECRET = 'Our secret client brief passes nothing'

function refusal(raw: unknown): string {
  try {
    parseFirmStandards(raw)
  } catch (error) {
    expect(error).toBeInstanceOf(FirmRefused)
    return (error as Error).message
  }
  throw new Error('not refused')
}

const one = (standard: Record<string, unknown>): unknown => ({ version: '1', standards: [standard] })

describe('the firm\'s standards file (COD-8)', () => {
  it('reads every measure, each a least size in its unit, with the firm\'s own name and note', () => {
    const standards = parseFirmStandards({
      version: '1',
      heading: "The firm's own standards: the firm's figures, not from any code or standard.",
      standards: [
        { measure: 'corridor_width', value: 1.5, unit: 'm', name: 'Corridors', note: 'Office guide, part 3' },
        { measure: 'door_clear_width', value: 850, unit: 'mm' },
        { measure: 'turning_circle', value: 1.5, unit: 'm', uses: ['bathroom', 'toilet'] },
        { measure: 'fixture_clearance', value: 0.8, unit: 'm', kinds: ['toilet'] },
        { measure: 'room_area', value: 9, unit: 'm²', uses: ['office'] },
        { measure: 'room_width', value: 2.4, unit: 'm' },
        { measure: 'room_area', value: 12, unit: 'm2', uses: ['meeting'] },
      ],
    })
    expect(standards.map((s) => s.measure)).toEqual(['corridor_width', 'door_clear_width', 'turning_circle', 'fixture_clearance', 'room_area', 'room_width', 'room_area'])
    expect(standards[0]).toEqual({ measure: 'corridor_width', value: 1.5, written: 'm', name: 'Corridors', note: 'Office guide, part 3', uses: [], kinds: [] })
    // Millimetres are read as metres; m2 as m².
    expect(standards[1]).toMatchObject({ value: 0.85, written: 'mm' })
    expect(standards[6]).toMatchObject({ value: 12, written: 'm²', uses: ['meeting'] })
    expect(standards[3]!.kinds).toEqual(['toilet'])
    expect(new Set(standards.map((s) => s.measure))).toEqual(new Set(FIRM_MEASURE_NAMES))
  })

  it('refuses a measure Grid does not know, with the ones it knows', () => {
    expect(refusal(one({ measure: 'desk_width', value: 1.6, unit: 'm' }))).toBe(
      'standards[0].measure names a measure Grid does not know "desk_width". The measures it knows: corridor_width, door_clear_width, turning_circle, fixture_clearance, room_area and room_width'
    )
    // A measure that is not a plain key is not repeated.
    expect(refusal(one({ measure: SECRET, value: 1, unit: 'm' }))).not.toContain(SECRET)
  })

  it('refuses a field a code\'s figure carries: a firm\'s standard cites no code and has no status', () => {
    for (const field of ['document', 'edition', 'clause', 'status', 'source', 'readOn']) {
      const message = refusal(one({ measure: 'corridor_width', value: 1.5, unit: 'm', [field]: SECRET }))
      expect(message).toContain(`standards[0] holds "${field}", which a code's figure carries: a firm's standard is the firm's own and cites no code`)
      expect(message).not.toContain(SECRET)
    }
    expect(refusal(one({ measure: 'corridor_width', value: 1.5, unit: 'm', status: 'ai-found' }))).not.toContain('ai-found')
  })

  it('refuses a field Grid does not know, naming it only when it is a plain key', () => {
    expect(refusal(one({ measure: 'room_width', value: 2, unit: 'm', colour: 'red' }))).toBe('standards[0] holds a field Grid does not know ("colour"): it may hold only measure, value, unit, name, note and uses')
    expect(refusal(one({ measure: 'room_width', value: 2, unit: 'm', [SECRET]: 1 }))).not.toContain(SECRET)
    // uses is for the measures about rooms, kinds for the floor in front of a fixture.
    expect(refusal(one({ measure: 'door_clear_width', value: 0.8, unit: 'm', uses: ['office'] }))).toContain('("uses"): it may hold only measure, value, unit, name and note')
    expect(refusal(one({ measure: 'room_area', value: 9, unit: 'm²', kinds: ['toilet'] }))).toContain('("kinds")')
  })

  it('refuses a unit, a value, a use or a kind out of bounds, naming the place and the limit', () => {
    expect(refusal(one({ measure: 'corridor_width', value: 1.5, unit: 'cm' }))).toBe('standards[0].unit must be m or mm: a length is in metres or millimetres')
    expect(refusal(one({ measure: 'room_area', value: 9, unit: 'm' }))).toBe('standards[0].unit must be m² (or m2): a room area is in square metres')
    expect(refusal(one({ measure: 'corridor_width', value: 0, unit: 'm' }))).toBe('standards[0].value must be a number of metres above 0 and at most 100')
    expect(refusal(one({ measure: 'corridor_width', value: '1.5', unit: 'm' }))).toBe('standards[0].value must be a number of metres above 0 and at most 100')
    expect(refusal(one({ measure: 'door_clear_width', value: 200_000, unit: 'mm' }))).toBe('standards[0].value must be a number of millimetres above 0 and at most 100,000')
    expect(refusal(one({ measure: 'room_area', value: 9, unit: 'm²', uses: ['ballroom'] }))).toMatch(/^standards\[0\]\.uses\[0\] must be one of the room uses: bedroom, /)
    expect(refusal(one({ measure: 'room_area', value: 9, unit: 'm²', uses: [] }))).toBe('standards[0].uses must be a list of room uses, with at least one')
    expect(refusal(one({ measure: 'fixture_clearance', value: 0.8, unit: 'm', kinds: ['desk'] }))).toBe(`standards[0].kinds[0] must be one of the fixture kinds: ${itemKinds('fixture').join(', ')}`)
  })

  it('ARE-73: reads a fixture clearance\'s width in its unit, any fixture kind the registry holds, and refuses a width elsewhere', () => {
    const [zone] = parseFirmStandards(one({ measure: 'fixture_clearance', value: 700, width: 800, unit: 'mm', kinds: ['toilet', 'rack'] }))
    expect(zone).toMatchObject({ value: 0.7, width: 0.8, kinds: ['toilet', 'rack'] })
    const [plain] = parseFirmStandards(one({ measure: 'fixture_clearance', value: 0.7, unit: 'm' }))
    expect(plain!.width).toBeUndefined()
    expect(refusal(one({ measure: 'fixture_clearance', value: 0.7, width: 0, unit: 'm' }))).toBe("standards[0].width must be a number of metres above 0 and at most 100: the width of the zone on the fixture's centre line")
    expect(refusal(one({ measure: 'corridor_width', value: 1.5, width: 1, unit: 'm' }))).toMatch(/^standards\[0\] holds a field Grid does not know \("width"\)/)
  })

  it('refuses a name or a note it would not keep, never repeating it', () => {
    const long = 'x'.repeat(301)
    expect(refusal(one({ measure: 'room_width', value: 2, unit: 'm', note: long }))).toBe('standards[0].note is 301 characters long; it may have at most 300')
    const twoLines = refusal(one({ measure: 'room_width', value: 2, unit: 'm', name: `${SECRET}\nsecond line` }))
    expect(twoLines).toMatch(/^standards\[0\]\.name /)
    expect(twoLines).not.toContain(SECRET)
    expect(refusal(one({ measure: 'room_width', value: 2, unit: 'm', name: 3 }))).toBe('standards[0].name must be text')
  })

  it('refuses a file that is not a list of standards', () => {
    expect(refusal([])).toBe('it must be a JSON object with version and standards')
    expect(refusal({ standards: [] })).toBe('version must be "1"')
    expect(refusal({ version: '1' })).toBe('standards must be a list')
    expect(refusal({ version: '1', standards: [] })).toBe('standards holds none: give at least one')
    expect(refusal({ version: '1', standards: [{ measure: 'room_width', value: 2, unit: 'm' }], firm: SECRET })).toBe('the file holds a field Grid does not know ("firm"): it may hold only version, heading and standards')
    const many = { version: '1', standards: Array.from({ length: STANDARDS_MAX + 1 }, () => ({ measure: 'room_width', value: 2, unit: 'm' })) }
    expect(refusal(many)).toBe(`standards holds ${STANDARDS_MAX + 1} items; it may hold at most ${STANDARDS_MAX}`)
  })
})

describe('the firm\'s file beside the plan, read through the project', () => {
  let dir: string
  let project: Project
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'grid-firm-'))
    project = openProject(dir, dir)
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('is firm-standards.json in the plan\'s folder, for every plan there', () => {
    expect(FIRM_FILE).toBe('firm-standards.json')
    expect(firmFileOf('plan.json')).toBe('firm-standards.json')
    expect(firmFileOf(join('options', 'b.json'))).toBe(join('options', 'firm-standards.json'))
  })

  it('is none when there is no file, and says why a file it cannot read is not read, never repeating its text', () => {
    expect(readFirm(project, 'plan.json')).toBeNull()
    writeFileSync(join(dir, FIRM_FILE), `{ "version": "1", "standards": [ ${SECRET} ] }`)
    expect(readFirm(project, 'plan.json')).toEqual({ file: FIRM_FILE, standards: [], problem: 'firm-standards.json is not JSON' })
    writeFileSync(join(dir, FIRM_FILE), JSON.stringify(one({ measure: 'corridor_width', value: 1.5, unit: 'm', clause: SECRET })))
    const read = readFirm(project, 'plan.json')!
    expect(read.problem).toMatch(/^firm-standards\.json: standards\[0\] holds "clause"/)
    expect(read.problem).not.toContain(SECRET)
    rmSync(join(dir, FIRM_FILE))
    mkdirSync(join(dir, FIRM_FILE))
    expect(readFirm(project, 'plan.json')!.problem).toBe("firm-standards.json is a folder, not a firm's standards file")
  })

  it('refuses a firm\'s file that is a link out of the project, as the seen marks beside the plan', () => {
    const outside = mkdtempSync(join(tmpdir(), 'grid-firm-outside-'))
    try {
      writeFileSync(join(outside, FIRM_FILE), JSON.stringify(one({ measure: 'room_width', value: 2, unit: 'm' })))
      symlinkSync(join(outside, FIRM_FILE), join(dir, FIRM_FILE))
      expect(() => readFirm(project, 'plan.json')).toThrow(PathRefused)
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  })
})
