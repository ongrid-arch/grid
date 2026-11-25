/**
 * ARE-50: notes that said two things about one part, or said less than the plan showed.
 */
import { describe, expect, it } from 'vitest'
import { edit, flat } from '@ongrid/floorplan/test-support/plans'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { inspectPlan } from '../..'

const codesAbout = (plan: FloorPlan, id: string): string[] =>
  inspectPlan(plan)
    .lines.filter((l) => l.thing.id === id || (l.each ?? []).some((t) => t.id === id))
    .map((l) => l.code)

describe('one note per opening', () => {
  it('a door too narrow to pass is not also asked about as one that still counts as a way through', () => {
    const plan = edit(flat(), (copy) => {
      const door = copy.openings.find((o) => o.type === 'door')!
      door.width = 0.05
    })
    const door = plan.openings.find((o) => o.type === 'door')!
    const codes = codesAbout(plan, door.id)
    expect(codes).toContain('opening/too-small-to-pass')
    expect(codes).not.toContain('opening/size-question')
  })

  it('a window that is very narrow is still asked about: the check says nothing of it', () => {
    const plan = edit(flat(), (copy) => {
      const window = copy.openings.find((o) => o.type === 'window')!
      window.width = 0.05
    })
    const window = plan.openings.find((o) => o.type === 'window')!
    expect(codesAbout(plan, window.id)).toContain('opening/size-question')
  })
})

describe('no door to the outside', () => {
  it('is not said of a floor whose only outside door cannot be passed', () => {
    const plan = edit(flat(), (copy) => {
      for (const o of copy.openings) {
        const wall = copy.walls.find((w) => w.id === o.wall)
        if (o.type === 'door' && wall?.kind === 'exterior') o.width = 0.05
      }
    })
    const lines = inspectPlan(plan).lines.filter((l) => l.code === 'floor/no-exit')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.message).toBe('"Ground floor" has no door to the outside that a person can pass')
    expect(lines[0]!.found).toMatch(/cannot be passed/)
  })
})

describe('no place stated', () => {
  it('says so without naming other figures', () => {
    const record = inspectPlan(flat())
    expect(record.place).toBeNull()
    const text = JSON.stringify(record.lines) + JSON.stringify(record.coverage ?? '')
    expect(text).not.toMatch(/US figures|United States/)
  })
})
