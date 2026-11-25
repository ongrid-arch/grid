/**
 * MSG-28: a door or window moved from one wall to another says so, with what lies on each side of
 * both walls, and never reads as a distance along its wall: the two walls are not one line, so a
 * distance along them means nothing, and neither does a hinge or a swing compared across them.
 *
 * The flat is the lab's two-bedroom flat (`fixtures/rooms/flat.plan.json`).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compareBuildings, diffPlans } from '../diff'
import { withOpening } from './diff-fixtures'

const FLAT = resolve(__dirname, '../../../fixtures/rooms/flat.plan.json')
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(FLAT, 'utf8')))

const lineOf = (before: FloorPlan, after: FloorPlan, id: string): string => {
  const lines = compareBuildings(before, after).changes.filter((line) => line.entities.some((e) => e.type === 'opening' && e.id === id))
  expect(lines).toHaveLength(1)
  return lines[0]!.text
}

describe('an opening moved to another wall', () => {
  it('a window taken from an outside wall to an inside one names both walls and their sides', () => {
    const before = flat()
    // From the south wall of the bedroom to its north wall, which it shares with the bathroom.
    const after = withOpening(before, 'win-bed1', { wall: 'bed1-north', offset: 2 })
    const text = lineOf(before, after, 'win-bed1')
    expect(text).toBe('Window "win-bed1" moved from wall "ext-south", between "Bedroom 1" and outside, to wall "bed1-north", between "Bathroom" and "Bedroom 1"')
    expect(text).not.toMatch(/along its wall/)
  })

  it('its line is about the rooms on both walls', () => {
    const before = flat()
    const after = withOpening(before, 'win-bed1', { wall: 'bed1-north', offset: 2 })
    const line = compareBuildings(before, after).changes.find((l) => l.entities.some((e) => e.id === 'win-bed1'))!
    expect([...line.rooms].sort()).toEqual(['bath', 'bed1'])
  })

  it('a door moved to another wall says so, and compares no hinge or swing across the two walls', () => {
    const before = flat()
    const after = withOpening(before, 'door-bed1', { wall: 'spine', offset: 1.5 })
    const text = lineOf(before, after, 'door-bed1')
    expect(text).toBe('Door "door-bed1" moved from wall "bed1-north", between "Bedroom 1" and "Hall", to wall "spine", between "Bedroom 1" and "Living room"')
    expect(text).not.toMatch(/jamb|other side|along its wall/)
  })

  it('its other changes come first', () => {
    const before = flat()
    const after = withOpening(before, 'win-bed1', { wall: 'ext-east', offset: 1, width: 1.2 })
    expect(lineOf(before, after, 'win-bed1')).toBe('Window "win-bed1" width 1.40 → 1.20 m; moved from wall "ext-south", between "Bedroom 1" and outside, to wall "ext-east", between "Bedroom 1" and outside')
  })

  it('a window that slid along its own wall still reads as a distance along it', () => {
    const before = flat()
    const after = withOpening(before, 'win-bed1', { offset: 7 })
    expect(lineOf(before, after, 'win-bed1')).toBe('Window "win-bed1" moved 0.80 m along its wall, in "Bedroom 1"')
  })

  it('the id comparison says it moved to another wall with no distance along it', () => {
    const before = flat()
    const after = withOpening(before, 'win-bed1', { wall: 'bed1-north', offset: 2 })
    const change = diffPlans(before, after).changes.find((c) => c.entity.type === 'opening' && c.entity.id === 'win-bed1')!
    expect(change.summary).toBe('Window moved to another wall')
  })
})
