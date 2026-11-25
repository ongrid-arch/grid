/**
 * MSG-5 (lab MS-4, MS-14, W-6, W-7): notes traced to their cause, on the lab's own plans
 * (`scoreboard/data/lab-plans.ndjson.gz`).
 *
 * - MS-4: one corridor that could not be drawn gave its neighbours 16 false notes.
 * - W-7: E's 26 fault plans gave 67 lines in the lab, 104 before MSG-5; they read as problems
 *   with their follow-ons beneath.
 * - MS-14: twelve hotel rooms with the same window gave twelve identical notes.
 */
import { describe, expect, it } from 'vitest'
import { inspectPlan, type GridResult } from '@ongrid/rules'
import * as data from '../src/data'

const plans = new Map(data.labPlans().map((plan) => [plan.name, plan.text]))
const planText = (name: string): string => {
  const text = plans.get(name)
  expect(text, name).toBeDefined()
  return text!
}

/** The lab's co-living floor (D-13) with its corridor's walls listed out of order, so it cannot be drawn. */
function corridorNotDrawn(): unknown {
  const plan = JSON.parse(planText('D/scenarios/d4-coliving-first-try.json')) as { rooms: { id: string; boundary: string[] }[] }
  plan.rooms.find((room) => room.id === 'corridor')!.boundary = ['corr-s', 'corr-n', 'ext-e', 'corr-n-open', 'ext-w']
  return plan
}

describe('MS-4: one corridor that could not be drawn', () => {
  it('gives no note, and one "not checked because" line naming the corridor, which keeps the 19 notes it held back', () => {
    const result = inspectPlan(corridorNotDrawn())
    expect(result.counts.finding).toBe(0)
    const notChecked = result.lines.filter((line) => line.kind === 'not-checked')
    expect(notChecked).toHaveLength(1)
    const [line] = notChecked
    expect(line!.code).toBe('floor/not-checked-rooms-not-drawn')
    expect(line!.message).toBe('On "Ground floor", these rooms could not be drawn, so they and what rests on them were not checked: "Corridor"')
    // Before MSG-5 these were given: the way out of the floor, "no door" on 15 sound rooms,
    // and (since ARE-40) "no way out" on the 3 rooms that have a door.
    expect(line!.held).toHaveLength(19)
    expect(line!.held!.every((note) => note.waitsFor.includes('corridor'))).toBe(true)
    expect(line!.held!.filter((note) => note.code === 'room/no-door')).toHaveLength(15)
    expect(line!.held!.filter((note) => note.code === 'floor/no-exit')).toHaveLength(1)
    expect(line!.held!.filter((note) => note.code === 'room/no-route-out')).toHaveLength(3)
    // The one problem is the corridor itself.
    expect(result.problems).toBe(1)
    expect(result.lines[0]).toMatchObject({ code: 'room/unclosed', thing: { kind: 'room', id: 'corridor' } })
  })

  it('gives the notes back once the corridor is drawn: the plan as the lab wrote it has none', () => {
    const result = inspectPlan(planText('D/scenarios/d4-coliving-first-try.json'))
    expect(result.count).toBe(0)
  })

  it('M-9: a door on a misspelt wall holds the way out and "no door", and says it was not checked', () => {
    const result = inspectPlan(planText('M/scenarios/v-open-1-trigger-missing-wall.json'))
    expect(result.counts.finding).toBe(0)
    const line = result.lines.find((l) => l.kind === 'not-checked')!
    expect(line.code).toBe('floor/not-checked-doors-not-drawn')
    expect(line.held!.map((note) => note.code).sort()).toEqual(['floor/no-exit', 'room/no-door'])
  })
})

describe("W-7: E's 26 fault plans", () => {
  const FAULTS = [...plans.keys()].filter((name) => name.startsWith('E/scenarios/faults/f'))
  const results: [string, GridResult][] = FAULTS.map((name) => [name, inspectPlan(planText(name), { country: 'US' })])

  it('are 26 plans', () => {
    expect(FAULTS).toHaveLength(26)
  })

  // WRT-7 reads f01's millimetres and f02's feet as stated, one line each and no units question:
  // 95 lines and 48 beneath became 90 and 43; the problems stay 30. CNT-14: f01b and f02b, in
  // millimetres and feet but stating metres, read their six doors each as 800 m or 2.6 m leaves,
  // and ask about each (`opening/wide-single-leaf`), filed under the units question: 102 and 55.
  it('read as 30 problems, with 55 of their 102 lines filed under them', () => {
    const lines = results.reduce((sum, [, r]) => sum + r.count, 0)
    const problems = results.reduce((sum, [, r]) => sum + r.problems, 0)
    const following = results.reduce((sum, [, r]) => sum + r.lines.filter((l) => l.causedBy !== undefined).length, 0)
    expect({ lines, problems, following }).toEqual({ lines: 102, problems: 30, following: 55 })
  })

  it('file each follow-on right under its cause, or under a line under it', () => {
    for (const [name, result] of results) {
      result.lines.forEach((line, i) => {
        if (line.causedBy === undefined) return
        const cause = result.lines.findIndex((l) => l.code === line.causedBy!.code && (l.thing.id === line.causedBy!.id || l.also[0] === line.causedBy!.id))
        expect(cause, `${name}: ${line.code}`).toBeGreaterThanOrEqual(0)
        expect(cause, `${name}: ${line.code}`).toBeLessThan(i)
        // Everything between the cause and the line follows from something.
        for (const between of result.lines.slice(cause + 1, i)) expect(between.causedBy, `${name}: ${line.code}`).toBeDefined()
      })
    }
  })

  it('an empty walls list is one problem, with every room and opening under it', () => {
    const result = new Map(results).get('E/scenarios/faults/f18-empty-walls.json')!
    expect(result.problems).toBe(1)
    expect(result.lines[0]!.code).toBe('plan/no-walls')
    expect(result.lines.filter((l) => l.causedBy?.code === 'plan/no-walls')).toHaveLength(19)
  })

  it('a zero-length wall is one problem, with its doors, rooms and the floor they leave unclaimed under it', () => {
    const result = new Map(results).get('E/scenarios/faults/f03-zero-length-wall.json')!
    expect(result.problems).toBe(1)
    expect(result.lines.map((l) => `${l.code}${l.causedBy ? ` <- ${l.causedBy.id}` : ''}`)).toEqual([
      'wall/zero-length',
      'opening/broken-wall <- hall-east',
      'opening/broken-wall <- hall-east',
      'room/broken-wall <- hall-east',
      'floor/unclaimed <- hall',
      'room/broken-wall <- hall-east',
      'room/broken-wall <- hall-east',
      'floor/not-checked-rooms-not-drawn'
    ])
    expect(result.counts.finding).toBe(0)
  })
})

// COD-3: with no place stated no figure is applied, so the hotel states the place its figures are for.
describe('MS-14: twelve hotel rooms with the same window', () => {
  it('are one line listing the twelve rooms, with every id kept', () => {
    const result = inspectPlan(planText('C/scenarios/hotel-ground-fixed-glazing.json'), { country: 'US' })
    const findings = result.lines.filter((l) => l.kind === 'finding')
    expect(findings).toHaveLength(1)
    const [line] = findings
    const rooms = Array.from({ length: 12 }, (_, i) => `room-${301 + i}`)
    expect(line!.code).toBe('room/escape-window-too-high')
    expect(line!.each!.map((thing) => thing.id)).toEqual(rooms)
    expect(line!.thing.id).toBe('room-301')
    for (const id of rooms.slice(1)) expect(line!.also).toContain(id)
    expect(line!.message).toBe(
      `The windows of ${rooms.map((id) => `"Room ${id.slice(5)}"`).join(', ')} are too high to escape through`
    )
  })
})
