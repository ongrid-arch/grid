/** CNT-40: room uses and building kinds beyond homes and offices. */
import { describe, expect, it } from 'vitest'
import { BUILDING_TYPES, FloorPlanSchema, OLD_USE_WORDS, readBuilding, readUse, ROOM_USES, USE_WORDS } from '../../types/floorplan'
import { say } from '../say'
import { labelOfUse, roomUseOfLabel, USE_LABELS } from '../uses'

describe('uses past homes and offices', () => {
  it('has a label in every language for each use, and reads the label back as the use', () => {
    for (const use of ROOM_USES) {
      for (const labels of Object.values(USE_LABELS)) expect(roomUseOfLabel(labels[use]), `${use}`).toBe(use)
    }
    expect(labelOfUse('es', 'ward')).toBe('sala de hospitalización')
  })

  it('reads the stations, hospitals, galleries, labs and cells people write', () => {
    const cases: Array<[string, string]> = [
      ['Platform', 'platform'], ['Ticket hall', 'ticketing'], ['Check-in', 'checkin'], ['gate', 'gate'],
      ['Ward', 'ward'], ['bed bay', 'ward'], ['Operating theatre', 'operating'], ['Ante room', 'anteroom'],
      ['Gallery', 'gallery'], ['Café', 'cafe'], ['Reading room', 'library'], ['Break-out', 'breakout'],
      ['Phone booth', 'phonebooth'], ['Server room', 'comms'], ['Clean room', 'cleanroom'], ['Laboratory', 'lab'],
      ['Cells', 'cell'], ['Buffet', 'bar'], ['Food prep', 'prep'],
    ]
    for (const [word, use] of cases) expect(readUse(word), word).toBe(use)
  })

  it('reads old and regional words as a use, and nothing else of its kind', () => {
    expect(readUse('Parlour')).toBe('living')
    expect(readUse('Box room')).toBe('bedroom')
    for (const [word, use] of Object.entries(USE_WORDS)) {
      if (['bedroom', 'living', 'dining'].includes(use)) expect(OLD_USE_WORDS, word).toContain(word)
    }
    for (const word of ['lounge', 'hall', 'studio']) expect(readUse(word), word).toBe(word)
  })
})

describe('building kinds past homes and offices', () => {
  it('has a sentence for each kind in every language', () => {
    for (const kind of BUILDING_TYPES) for (const language of ['en', 'es'] as const) expect(say(language, `check.building.${kind}` as never), kind).not.toBe('')
  })

  it('reads a word for a kind as the kind', () => {
    const cases: Array<[string, string]> = [['hospital', 'health'], ['Apartments', 'flats'], ['airport', 'transport'], ['Museum', 'culture'], ['prison', 'custody'], ['laboratory', 'lab'], ['office', 'office']]
    for (const [word, kind] of cases) expect(readBuilding(word), word).toBe(kind)
    expect(readBuilding('spaceship')).toBe('spaceship')
  })

  it('reads a plan that says its building is a hospital', () => {
    const plan = FloorPlanSchema.parse({ version: '1', units: 'm', building: 'hospital', walls: [], rooms: [] })
    expect(plan.building).toBe('health')
  })
})
