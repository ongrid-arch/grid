/**
 * ARE-43: a flat entered from the common parts only through openings with no door, or open
 * sides, is noted; one with a door is not; one with no way in keeps `flat/no-front-door`.
 */
import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { edit, flat } from '@ongrid/floorplan/test-support/plans'
import { inspectPlan } from '../inspect'

/** The core's flat with the hall a landing in no flat, and the flat's other rooms one flat of its own. */
function flatOnLanding(kinds: { d_hk: 'door' | 'opening'; d_hb: 'door' | 'opening' }): FloorPlan {
  return edit(flat(), (p) => {
    p.flats = [{ id: 'F1', name: 'Flat 1', rooms: ['kitchen', 'bedroom', 'bathroom'] }]
    for (const o of p.openings) if (o.id === 'd_hk' || o.id === 'd_hb') o.type = kinds[o.id]
  })
}

const lines = (plan: FloorPlan) => inspectPlan(plan).lines.filter((l) => l.code === 'flat/entrance-without-door' || l.code === 'flat/no-front-door')

describe('ARE-43 a flat entered only without a door', () => {
  it('notes a flat opening onto the landing through two doorless openings', () => {
    const found = lines(flatOnLanding({ d_hk: 'opening', d_hb: 'opening' }))
    expect(found.map((l) => [l.code, l.kind, l.thing])).toEqual([['flat/entrance-without-door', 'finding', { kind: 'flat', id: 'F1' }]])
    expect(found[0]!.message).toBe('The flat "Flat 1" has no front door: it opens onto the common parts only through openings with no door')
    expect(found[0]!.fix.length).toBeGreaterThan(10)
  })

  it('says nothing when one of the ways in is a door', () => {
    expect(lines(flatOnLanding({ d_hk: 'door', d_hb: 'opening' }))).toEqual([])
    expect(lines(flatOnLanding({ d_hk: 'door', d_hb: 'door' }))).toEqual([])
  })

  it('keeps the other note for a flat with no way in at all', () => {
    const plan = edit(flatOnLanding({ d_hk: 'door', d_hb: 'door' }), (p) => {
      p.openings = p.openings.filter((o) => o.id !== 'd_hk' && o.id !== 'd_hb')
    })
    expect(lines(plan).map((l) => l.code)).toEqual(['flat/no-front-door'])
  })
})
