/** MSG-22: rooms text writes ids every tool takes, in plain letters, and says which it changed. */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { plainId } from '../../types/planText'

const text = [
  'room salón "Salón" salón 4 x 3.5 at 0,0',
  'room baño "Baño" baño 2 x 2 east of salón',
  'room küche "Küche" Küche 3 x 2 north of salón',
  'door puerta between salón and baño, centred, 0.8 wide',
].join('\n')

describe('ids in plain letters', () => {
  it('takes the accents off an id, wherever the text names it, and keeps the names as written', () => {
    const done = compileRoomsText(text)
    expect(done.problems).toEqual([])
    const plan = done.plan!
    expect(plan.rooms.map((r) => [r.id, r.name, r.use])).toEqual([
      ['salon', 'Salón', 'living'],
      ['bano', 'Baño', 'bathroom'],
      ['kuche', 'Küche', 'kitchen'],
    ])
    expect(plan.openings.map((o) => o.id)).toEqual(['puerta'])
    const folded = done.warnings.find((w) => w.code === 'rooms/id-folded')
    expect(folded?.message).toContain("'baño' is 'bano'")
    expect(folded?.message).toContain("'salón' is 'salon'")
    expect(folded?.message).toContain("'küche' is 'kuche'")
  })

  it('says nothing when every id is plain', () => {
    const done = compileRoomsText('room living "Salón" living 4 x 3.5 at 0,0')
    expect(done.warnings.filter((w) => w.code === 'rooms/id-folded')).toEqual([])
  })

  it('refuses an id with letters that have no plain form, on its line, and writes no plan', () => {
    const done = compileRoomsText(['room living "Salón" living 4 x 3.5 at 0,0', 'room 客厅 "客厅" 客厅 4 x 3 north of living'].join('\n'))
    expect(done.plan).toBeNull()
    expect(done.problems).toHaveLength(1)
    expect(done.problems[0]).toMatchObject({ code: 'rooms/bad-id', line: 2 })
    expect(done.problems[0]!.message).toContain("'客厅'")
  })

  it('spells out the letters that have no accent to take off', () => {
    expect(plainId('Straße')).toBe('Strasse')
    expect(plainId('cœur-ø')).toBe('coeur-o')
    expect(plainId('客厅')).toBe('客厅')
    expect(plainId('plain-id_2.b')).toBe('plain-id_2.b')
  })
})
