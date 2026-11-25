/**
 * ARE-50: a wall is held to the height its floor states, and walls lower than a door
 * (balustrades, rails) are not what the typical wall is.
 */
import { describe, expect, it } from 'vitest'
import { edit, flat, wall } from '../../test-support/plans'
import { validatePlan } from '../validate'
import type { FloorPlan } from '../floorplan'

const questions = (plan: FloorPlan): string[] => validatePlan(plan).issues.filter((i) => i.code === 'wall/size-question').map((i) => i.id)

/** The flat with its walls 5 m high and twenty 1.1 m rails along them. */
const tall = (floorHeight?: number): FloorPlan =>
  edit(flat(), (copy) => {
    for (const wall of copy.walls) wall.height = 5
    for (let i = 0; i < 20; i++) copy.walls.push(wall(`rail${i}`, [20 + i, 20], [20.8 + i, 20], { height: 1.1 }))
    if (floorHeight !== undefined) copy.floors = [{ ...(copy.floors?.[0] ?? { id: 'ground', name: 'Ground floor' }), height: floorHeight }]
  })

describe('wall heights', () => {
  it('twenty balustrades do not make the real walls look too high', () => {
    expect(questions(tall())).toEqual([])
  })

  it('a wall far above the height its floor states is still asked about', () => {
    const plan = edit(tall(5), (copy) => {
      copy.walls[0]!.height = 25
    })
    expect(questions(plan)).toEqual([plan.walls[0]!.id])
  })

  it('walls at the height their floor states are not asked about', () => {
    expect(questions(tall(5))).toEqual([])
  })
})
