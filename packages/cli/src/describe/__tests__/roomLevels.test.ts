/**
 * LVL-26: a room of its own height or floor says its floor's level and its height, for a person
 * and for an agent; a room of its storey's says nothing more than before.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { describeText } from '../card'
import { planFacts } from '../facts'

const plan = parseFloorPlan(
  compileRoomsText(
    [
      'walls outside 0.3 inside 0.1',
      'floor g "Ground" level 0 height 4.25',
      'room foyer "Foyer" - 12 x 10 at 0,0',
      'room tower "Fly tower" - 14 x 10 east of foyer height 26',
      'room stage "Stage" - 12 x 4 north of foyer align west floor 1.1',
    ].join('\n')
  ).plan
)

describe("a room's floor level and height, described (LVL-26)", () => {
  it('says them for a person on the rooms of their own', () => {
    const lines = describeText(planFacts(plan), 'rooms', 'person').split('\n')
    expect(lines.find((l) => l.startsWith('Fly tower:'))).toContain('Its floor is at 0 m and it is 26 m high to its ceiling.')
    expect(lines.find((l) => l.startsWith('Stage:'))).toContain('Its floor is at 1.1 m and it is 3.15 m high to its ceiling.')
    expect(lines.find((l) => l.startsWith('Foyer:'))).not.toContain('Its floor is at')
  })

  it('gives an agent the same as a token', () => {
    const text = describeText(planFacts(plan), 'rooms', 'agent')
    expect(text).toMatch(/tower "Fly tower" .* floor@0 h26/)
    expect(text).toMatch(/stage "Stage" .* floor@1\.1 h3\.15/)
  })
})
