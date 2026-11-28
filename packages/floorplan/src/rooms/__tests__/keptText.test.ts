/**
 * WRT-87: a plan written from rooms text reads back as that text, units, repeats, copied floors,
 * rooms through floors and the person's own lengths kept, while the text still writes the plan;
 * what a tool added since is one line more at its end; the name and the language are written on
 * their lines; and what no text holds is named at the top.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { safeParseFloorPlan, statedItem, statedOpening, statedWall, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { languageOfText } from '../language'
import { readRoomsText } from '../read'
import { planRevision, stampFor } from '../stamp'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')

/** The plan file `grid write` writes from `text`, read as a plan file is read. */
function written(text: string, change: (file: Record<string, unknown>) => Record<string, unknown> = (file) => file): FloorPlan {
  const spoken = languageOfText(text)
  const result = compileRoomsText(spoken.text)
  expect(result.problems).toEqual([])
  const plan = safeParseFloorPlan(result.plan)!
  const file = {
    ...plan,
    walls: plan.walls.map(statedWall),
    openings: plan.openings.map(statedOpening),
    ...(plan.items === undefined ? {} : { items: plan.items.map(statedItem) }),
    ...(result.name === null ? {} : { name: result.name }),
    ...(spoken.language === null ? {} : { display: { ...plan.display, language: spoken.language } }),
    written: stampFor(plan, text),
  }
  const read = safeParseFloorPlan(change(JSON.parse(JSON.stringify(file)) as Record<string, unknown>))
  expect(read).not.toBeNull()
  return read!
}

/** The parts the text writes again, each list by id, to compare plans by. */
function parts(text: string): unknown {
  const plan = safeParseFloorPlan(compileRoomsText(languageOfText(text).text).plan)!
  const byId = <T extends { id: string }>(list: readonly T[] | undefined): T[] | undefined => (list === undefined ? undefined : [...list].sort((a, b) => (a.id < b.id ? -1 : 1)))
  return { walls: byId(plan.walls), rooms: byId(plan.rooms), openings: byId(plan.openings), floors: plan.floors, items: byId(plan.items), columns: byId(plan.columns) }
}

const read = (plan: FloorPlan) => readRoomsText(plan, plan.name === undefined ? {} : { name: plan.name })

const TOWER = [
  'plan "Tower"',
  'display mm numbers mm',
  'walls outside 300 inside 150 height 2800',
  'floor f00 "Ground floor" level 0',
  'unit flat w=4800',
  '  room liv "Living {n}" living $w x 3600',
  'end',
  'repeat flat 3 east as 1 at 0,0',
  'room core "Core" stair * x 3000 north of liv-1 until liv-3 through f03',
  'door d1 between core and liv-1, centred, 900 wide',
  'repeat floors 3 from f00 with openings rise 3000',
  '',
].join('\n')

describe('the text a plan was written from (WRT-87)', () => {
  it('reads the hotel floor back as its unit and two repeats, based on the plan as it is', () => {
    const text = readFileSync(resolve(FIXTURES, 'hotel.rooms'), 'utf8')
    const plan = written(text)
    const back = read(plan)
    expect(back.kept).toBe(true)
    expect(back.text).toContain('unit guest w=3.45')
    expect(back.text.match(/^repeat guest 6 east/gm)).toHaveLength(2)
    expect(back.text).toContain(`based on ${planRevision(plan)}`)
    // Only the based on line is new.
    expect(back.text.split('\n').filter((line) => !text.split('\n').includes(line))).toEqual([`based on ${planRevision(plan)}`])
    expect(parts(back.text)).toEqual(parts(text))
  })

  it('keeps copied floors, a room through floors and the lengths in millimetres as written', () => {
    const plan = written(TOWER)
    expect(plan.floors).toHaveLength(4)
    const back = read(plan)
    expect(back.kept).toBe(true)
    expect(back.text).toContain('display mm numbers mm')
    expect(back.text).toContain('room core "Core" stair * x 3000 north of liv-1 until liv-3 through f03')
    expect(back.text).toContain('repeat floors 3 from f00 with openings rise 3000')
    expect(back.text).not.toMatch(/\b1\.4\b|\b4\.8\b/)
    expect(back.text.split('\n').length).toBeLessThan(TOWER.split('\n').length + 3)
    expect(parts(back.text)).toEqual(parts(TOWER))
  })

  it('adds the line of an item and a column a tool placed after the write, and nothing else', () => {
    const text = readFileSync(resolve(FIXTURES, 'flat.rooms'), 'utf8')
    const room = /^room (\S+) /m.exec(text)![1]!
    const more = `${text}\nitem bed double-bed in ${room} against north\ncolumn k1 0.3 at 1,1\n`
    const later = safeParseFloorPlan(compileRoomsText(more).plan)!
    const plan = written(text, (file) => ({ ...file, items: later.items!.map(statedItem), columns: later.columns }))
    const back = read(plan)
    expect(back.kept).toBe(true)
    const added = back.text.split('\n').filter((line) => line.trim() !== '' && !text.split('\n').includes(line) && !line.startsWith('based on'))
    expect(added).toHaveLength(2)
    expect(added.some((line) => line.startsWith('item bed'))).toBe(true)
    expect(added.some((line) => /column k1\b/.test(line))).toBe(true)
    expect(parts(back.text)).toEqual(parts(more))
  })

  it('writes a name changed since on the plan line and the language on the display line', () => {
    const plan = written(TOWER, (file) => ({ ...file, name: 'Tower B', display: { length: 'mm', language: 'es' } }))
    const back = read(plan)
    expect(back.kept).toBe(true)
    expect(back.text).toContain('plan "Tower B"')
    expect(back.text).not.toContain('plan "Tower"\n')
    expect(back.text).toContain('display mm numbers mm language es')
    expect(languageOfText(back.text).language).toBe('es')
  })

  it('states a language with no length as a display line of its own, which the writing takes', () => {
    const text = readFileSync(resolve(FIXTURES, 'l-house.rooms'), 'utf8')
    const plan = written(text, (file) => ({ ...file, display: { language: 'es' } }))
    const back = read(plan)
    expect(back.kept).toBe(true)
    expect(back.text).toMatch(/^display language es$/m)
    const again = languageOfText(back.text)
    expect(again.language).toBe('es')
    expect(again.text.split('\n')).toHaveLength(back.text.split('\n').length)
    expect(compileRoomsText(again.text).plan).not.toBeNull()
  })

  it('works the plan out again when the text no longer writes it, and still states its language', () => {
    const text = readFileSync(resolve(FIXTURES, 'l-house.rooms'), 'utf8')
    const plan = written(text, (file) => {
      const walls = file['walls'] as Array<{ start: [number, number] }>
      walls[0]!.start = [walls[0]!.start[0] - 0.5, walls[0]!.start[1]]
      return { ...file, display: { language: 'es' } }
    })
    const back = read(plan)
    expect(back.kept).toBe(false)
    expect(back.text).toMatch(/^display language es$/m)
  })

  it('names the facts on walls the text does not hold, kept only over the same file', () => {
    const text = readFileSync(resolve(FIXTURES, 'l-house.rooms'), 'utf8')
    const plan = written(text, (file) => {
      const walls = file['walls'] as Array<Record<string, unknown>>
      walls[0]!['properties'] = { handle: '2F' }
      return file
    })
    const back = read(plan)
    expect(back.kept).toBe(true)
    expect(back.notHeld).toEqual(['walls facts'])
    expect(back.text.split('\n')[0]).toBe('# Not in this text, and kept by grid write only when the text is written over this plan file: walls facts.')
  })

  it('writes its own comment lines once when the kept text was a read-back written back', () => {
    const text = readFileSync(resolve(FIXTURES, 'l-house.rooms'), 'utf8')
    const note = '# Not in this text, and kept by grid write only when the text is written over this plan file: walls facts.'
    const plan = written(`# General guidance, not your local rules\n${note}\n# my own note\n${text}`, (file) => {
      const walls = file['walls'] as Array<Record<string, unknown>>
      walls[0]!['properties'] = { handle: '2F' }
      return file
    })
    const back = read(plan)
    expect(back.kept).toBe(true)
    expect(back.text.split('\n').filter((line) => line === note)).toHaveLength(1)
    expect(back.text).not.toContain('General guidance')
    expect(back.text).toContain('# my own note')
  })

  it('reads a plan written before the text was kept as before', () => {
    const text = readFileSync(resolve(FIXTURES, 'hotel.rooms'), 'utf8')
    const plan = written(text, (file) => ({ ...file, written: { ...(file['written'] as object), text: undefined } }))
    const back = read(plan)
    expect(back.kept).toBe(false)
    expect(back.text).not.toContain('unit guest')
    expect(parts(back.text)).toEqual(parts(text))
  })
})

describe('the language words of a display line (WRT-87)', () => {
  it('takes them out, keeping every line in its place', () => {
    expect(languageOfText('display mm language es numbers mm # mine\nroom a "A" - 1 x 1 at 0,0')).toEqual({ text: 'display mm numbers mm # mine\nroom a "A" - 1 x 1 at 0,0', language: 'es' })
    expect(languageOfText('display language pt-BR\nroom a "A" - 1 x 1 at 0,0')).toEqual({ text: '\nroom a "A" - 1 x 1 at 0,0', language: 'pt' })
    expect(languageOfText('display mm\n')).toEqual({ text: 'display mm\n', language: null })
  })

  it('leaves a word that is no language on the line, for the writing to refuse', () => {
    const text = 'display mm language 42\n'
    expect(languageOfText(text)).toEqual({ text, language: null })
  })
})
