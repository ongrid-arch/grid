/**
 * VEW-24: a room set below its storey in section. Its slab is cut as one piece with the floor's, and
 * the walls round it run down to that slab, so nothing floats and no gap is left at a wall's foot.
 */
import { describe, expect, it } from 'vitest'
import { genkanFlat } from '../../test-support/plans'
import { planSection, type SectionLine } from '../section'

const ACROSS: SectionLine = { from: { x: -1, y: 2.6 }, to: { x: 5, y: 2.6 }, toward: 'left' }
const lowest = (rings: readonly (readonly { y: number }[])[]): number => Math.min(...rings.flat().map((p) => p.y))

describe('a section through a sunken room', () => {
  for (const drop of [0.18, 0.6, 1.5]) {
    const section = planSection(genkanFlat(-drop), ACROSS)

    it(`cuts the floor, the sunken slab and the walls as one piece when it is ${drop} m down`, () => {
      expect(section.cut).toHaveLength(1)
    })

    it(`runs the outside wall down to the sunken slab (${drop} m)`, () => {
      const west = section.parts.find((p) => p.kind === 'wall' && p.id === 'w')!
      const slabs = section.parts.filter((p) => p.kind === 'slab')
      expect(lowest(slabs.flatMap((p) => p.rings))).toBeCloseTo(-drop - 0.25, 2)
      expect(lowest(west.rings)).toBeCloseTo(-drop, 6)
    })
  }
})
