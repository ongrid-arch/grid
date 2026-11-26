/**
 * MSG-2: what each check looked at, and the state of every area, on the lab's own plans (read
 * from the scoreboard's data). CH-1: a report with nothing relevant checked no longer looks
 * clean. CH-4: the bedrooms above the third storey are named as not checked for escape. AC-9: a
 * total that left a room out names it. CNT-5 (lab EL-2): a plan that says what kind of building it
 * is, or a floor that does, runs the home figures only where it is a home.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { planFloors, planForFloor, validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { GENERAL_GUIDANCE_LABEL, NUMBER_STATES } from '@ongrid/rules'
import { checkPlan, checkText } from '../check'
import type { LoadedPlan } from '../plan'
import { planAreas } from '../../quantities/areas'
import { stateText } from '../../quantities/state'
import { surveyPlan } from '../../quantities/survey'

const OFFICE = 'C/scenarios/office-known-uses.json'
const WORST = 'M/scenarios/worst-1-sleeping-floor-level4.json'
const WALLS_ONLY = 'M/scenarios/worst-2-walls-only.json'
const BLOCK = 'D/scenarios/d2-block-g+5.json'
const FAULTS = ['E/scenarios/faults/f05-boundary-missing-wall.json', 'E/scenarios/faults/f06-boundary-wrong-order.json', 'E/scenarios/faults/f07-room-two-walls.json']
/** CH-2: the café whose seating is marked "dining" for want of a better word. */
const CAFE = 'C/scenarios/cafe.json'
/** The hotel whose twelve rooms on the ground floor each got a sill note from a home's figure. */
const HOTEL = 'AU1/scenarios/MS-14/hotel-ground-fixed-glazing.json'
const SOUND = ['A/scenarios/townhouse.json', 'A/scenarios/basement-flat.json', 'AU2/scenarios/H-h06-lift-four-floors/plan.json']

function labPlans(names: readonly string[]): Map<string, LoadedPlan> {
  const repo = resolve(__dirname, '../../../../..')
  const lines = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz'))).toString('utf8').split('\n')
  const found = new Map<string, LoadedPlan>()
  for (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line) as { name: string; text: string }
    if (!names.includes(row.name)) continue
    const plan = FloorPlanSchema.parse(JSON.parse(row.text))
    const { issues, broken } = validatePlan(plan)
    found.set(row.name, { file: row.name, plan, issues, broken })
  }
  expect([...found.keys()].sort()).toEqual([...names].sort())
  return found
}

const plans = labPlans([OFFICE, WORST, WALLS_ONLY, BLOCK, CAFE, HOTEL, ...FAULTS, ...SOUND])
const plan = (name: string): LoadedPlan => plans.get(name)!
const key = (floor: string, id: string): string => `${floor}/${id}`

describe('every check says what it looked at (CH-1)', () => {
  it.each([OFFICE, WORST, BLOCK, ...SOUND])('%s: every room is under each room check, looked at or skipped with a reason, and the counts add up', (name) => {
    const loaded = plan(name)
    const rooms = planFloors(loaded.plan).flatMap((f) => planForFloor(loaded.plan, f.id).rooms.map((r) => key(f.id, r.id))).sort()
    const result = checkPlan(loaded, { country: 'US' })
    expect(result.result.coverage.map((c) => c.ruleId)).toEqual([
      // LVL-3: 'stairs-line-up' looks at the rooms used as a stair or a lift. LVL-4:
      // 'openings-above-ground' looks at the doors and windows, once the site states its ground.
      // BRF-3: 'site-boundary' looks at the edges of the plot, once the site states one.
      'floor-has-exit', 'room-has-door', 'room-reaches-exit', 'door-leads-somewhere', 'stairs-line-up', 'openings-above-ground', 'site-boundary', 'habitable-room-area', 'escape-opening',
    ])
    for (const check of result.result.coverage) {
      const looked = check.lookedAt.flatMap((g) => g.ids.map((id) => key(g.floor, id)))
      const skipped = check.skipped.flatMap((g) => g.ids.map((id) => key(g.floor, id)))
      expect(check.lookedAtCount).toBe(looked.length)
      expect(check.skippedCount).toBe(skipped.length)
      for (const skip of check.skipped) expect(skip.why.length, `${check.ruleId} ${skip.reason}`).toBeGreaterThan(0)
      if (check.looksAt === 'room') expect([...looked, ...skipped].sort(), check.ruleId).toEqual(rooms)
    }
    // A check is listed as run only when it looked at something.
    expect(result.report.rules.map((r) => r.id)).toEqual(result.result.coverage.filter((c) => c.lookedAtCount > 0).map((c) => c.ruleId))
  })

  it('the office whose rooms are "other": the size and escape checks looked at no room, said room by room, and are not listed as run', () => {
    const result = checkPlan(plan(OFFICE), { country: 'US' })
    const size = result.result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(size.lookedAtCount).toBe(0)
    expect(size.skipped.map((s) => [s.reason, s.ids.length])).toEqual([['use_not_covered', 7]])
    expect(result.report.rules.map((r) => r.id)).not.toContain('habitable-room-area')
    expect(result.report.rules.map((r) => r.id)).not.toContain('escape-opening')
    expect(result.report.figures).toEqual([])
    // MSG-10: the skipped rooms, one by one, are in the full report.
    const text = checkText(result, 1, { full: true })
    expect(text).toContain('Looked at by at least one check: 7 of 7 rooms.')
    expect(text).toContain('  - Nothing was checked for "Rooms people live or sleep in have a minimum floor area": it looked at no rooms.')
    expect(text).toContain('      not looked at, 7 rooms: the figure is for bedrooms, living rooms and dining rooms only: ')
    expect(text).toContain('      not looked at, 7 rooms: only bedrooms are checked: ')
  })

  it('the fifth-storey floor of eight windowless bedrooms: a line names them as not checked for escape, and the count is not 0 for it', () => {
    const result = checkPlan(plan(WORST), { country: 'US' })
    const lines = result.result.lines.filter((l) => l.code === 'floor/not-checked-above-escape-storeys')
    expect(lines).toHaveLength(1)
    expect(lines[0]!.message).toBe('On "Fourth floor", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: 8')
    expect(lines[0]!.also).toHaveLength(8)
    const escape = result.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(escape.lookedAtCount).toBe(0)
    expect(escape.skipped.map((s) => [s.reason, s.ids.length])).toEqual([['above_escape_storeys', 8], ['use_not_covered', 1]])
  })

  it('counts each reason a check left parts out for, and words a single reason as before (ARE-58)', () => {
    const result = checkPlan(plan(WORST), { country: 'US' })
    const escape = result.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    const stairs = escape.skipped.find((s) => s.reason === 'above_escape_storeys')!
    expect(checkText(result, 1)).toContain(`; not looked at 8: ${stairs.why}.`)
    const drawn = { ...stairs, reason: 'cannot_be_drawn' as const, why: 'could not be drawn', said: undefined, ids: ['w1'] }
    const mixed = { ...result, result: { ...result.result, coverage: result.result.coverage.map((c) => (c === escape ? { ...c, skipped: [...c.skipped, drawn] } : c)) } }
    expect(checkText(mixed, 1)).toContain(`; not looked at 9, by reason: 8, ${stairs.why}; 1, could not be drawn.`)
  })

  it('the same walls with no rooms: one line says no check that looks at rooms ran, and no check is listed as run', () => {
    const result = checkPlan(plan(WALLS_ONLY), { country: 'US' })
    // CNT-14: its doors state no swing, and the door check says so first, on a line of its own.
    expect(result.result.lines.filter((l) => l.kind === 'not-checked').map((l) => l.code)).toEqual(['floor/not-checked-door-swings', 'plan/not-checked-no-rooms'])
    expect(result.report.rules).toEqual([])
    expect(result.result.coverage.every((c) => c.lookedAtCount === 0)).toBe(true)
    expect(checkText(result, 1)).toContain('Looked at by at least one check: no rooms: there are none to look at.')
    // The two plans no longer give the same report (CH-1).
    expect(checkText(result, 1)).not.toBe(checkText(checkPlan(plan(WORST), { country: 'US' }), 1))
  })
})

describe('the ground-plus-five block (CH-4)', () => {
  const result = checkPlan(plan(BLOCK), { country: 'US' })
  const bedroomsAbove = planFloors(plan(BLOCK).plan)
    .filter((f) => f.level > 2)
    .flatMap((f) => planForFloor(plan(BLOCK).plan, f.id).rooms.filter((r) => r.use === 'bedroom').map((r) => key(f.id, r.id)))
    .sort()

  it('has 18 bedrooms on floors 3 to 5', () => {
    expect(bedroomsAbove).toHaveLength(18)
  })

  it('lists the 18 as not checked for escape, floor by floor, with the reason and a count', () => {
    const escape = result.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    const above = escape.skipped.filter((s) => s.reason === 'above_escape_storeys')
    expect(above.map((s) => [s.floor, s.ids.length])).toEqual([['L3', 6], ['L4', 6], ['L5', 6]])
    expect(above.flatMap((s) => s.ids.map((id) => key(s.floor, id))).sort()).toEqual(bedroomsAbove)
    // The bedrooms of floors 1 and 2 are looked at.
    expect(escape.lookedAt.map((g) => [g.floor, g.ids.length])).toEqual([['L1', 6], ['L2', 6]])
  })

  it('gives one "not checked" line on each of floors 3 to 5, 18 bedrooms in all', () => {
    const lines = result.result.lines.filter((l) => l.code === 'floor/not-checked-above-escape-storeys')
    expect(lines.map((l) => l.floor)).toEqual(['L3', 'L4', 'L5'])
    expect(lines.map((l) => l.message)).toEqual(['Floor 3', 'Floor 4', 'Floor 5'].map((f) => `On "${f}", escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: 6`))
    expect(lines.flatMap((l) => l.also.map((id) => key(l.floor!, id))).sort()).toEqual(bedroomsAbove)
  })

  it('shows a floor alone with its own lines and coverage', () => {
    const one = checkPlan(plan(BLOCK), { country: 'US', floor: 'L4' })
    expect(one.result.lines.filter((l) => l.code === 'floor/not-checked-above-escape-storeys').map((l) => l.floor)).toEqual(['L4'])
    const escape = one.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(escape.skipped.filter((s) => s.reason === 'above_escape_storeys').map((s) => s.floor)).toEqual(['L4'])
    expect(escape.lookedAtCount).toBe(0)
  })
})

describe('every area and total carries a state (AC-9, AA-12)', () => {
  it.each([...FAULTS, ...SOUND, WORST, BLOCK])('%s: each room, each floor figure and each total has a state, and a proven one names no room', (name) => {
    const areas = planAreas(surveyPlan(plan(name).plan))
    const states = [
      ...Object.values(areas.states),
      ...areas.floors.flatMap((f) => [f.states.net, f.states.circulation, f.states.grossInternal, f.states.grossExternal, ...Object.values(f.states.byUse)]),
    ]
    for (const s of states) {
      expect(NUMBER_STATES).toContain(s.state)
      if (s.state === 'proven') expect([...s.leftOut, ...s.notProven]).toEqual([])
      else expect(stateText(s, true)).not.toBe('')
    }
    for (const floor of areas.floors) {
      expect(Object.keys(floor.states.byUse).sort()).toEqual(Object.keys(floor.byUse).sort())
      for (const room of floor.rooms) {
        expect(NUMBER_STATES).toContain(room.state)
        expect(room.net === null).toBe(room.state === 'not-looked-at')
        expect(room.state === 'not-proven').toBe(room.doubts.length > 0)
      }
    }
  })

  it.each([
    [FAULTS[0]!, 'kitchen'],
    [FAULTS[1]!, 'living'],
    [FAULTS[2]!, 'kitchen'],
  ])('%s: the totals are not proven and name the room left out (%s)', (name, left) => {
    const areas = planAreas(surveyPlan(plan(name).plan))
    const room = areas.floors.flatMap((f) => f.rooms).find((r) => r.id === left)!
    expect(room.net).toBeNull()
    expect(room.state).toBe('not-looked-at')
    expect(areas.states.net.state).toBe('not-proven')
    expect(areas.states.net.leftOut.map((r) => r.id)).toEqual([left])
    const floor = areas.floors.find((f) => f.floor === room.floor)!
    expect(floor.states.net.leftOut.map((r) => r.id)).toEqual([left])
    const use = room.use ?? 'not said'
    expect(floor.states.byUse[use]!.leftOut.map((r) => r.id)).toEqual([left])
    expect(areas.notes.some((n) => n.includes('Every total here leaves out a room that could not be measured') && n.includes(JSON.stringify(room.name)))).toBe(true)
    expect(stateText(areas.states.net, false)).toBe(`; not proven: leaves out ${JSON.stringify(room.name)}, which could not be measured`)
  })

  it('the same flat with its fault repaired: every total is proven', () => {
    const repaired = labPlans(['E/scenarios/faults/repairs/f05-r1.json']).get('E/scenarios/faults/repairs/f05-r1.json')!
    const areas = planAreas(surveyPlan(repaired.plan))
    expect(areas.states.net).toEqual({ state: 'proven', leftOut: [], notProven: [] })
    expect(areas.floors.every((f) => f.rooms.every((r) => r.state === 'proven'))).toBe(true)
  })
})

/** COD-2: the sentence on every pass and every note that used a figure. */
const HOMES = 'homes (houses and flats people live in)'

describe('a figure says which kind of building it was read for (COD-2)', () => {
  it('the café\'s seating, measured against a home\'s figure, is never passed without a line (CH-2)', () => {
    const result = checkPlan(plan(CAFE), { country: 'US' })
    const size = result.result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(size.lookedAt.flatMap((g) => g.ids)).toEqual(['seating'])
    expect(size.findings).toBe(0)
    expect(size.readFor).toEqual(['homes'])
    // MSG-10: the short report says it once; COD-3: in the place line, right after the label.
    const short = checkText(result, 1)
    // CNT-5 reads the servery's "servery" as `retail`, a use the check is not about, so the short report names no gap.
    expect(short).toContain('  - Rooms people live or sleep in have a minimum floor area: 1 room.\n')
    expect(short.split('\n')[1]).toBe('Place: United States, from --country; figures from US model codes, read for homes.')
    expect(short).not.toContain('read them for')
    const text = checkText(result, 1, { full: true })
    expect(text).toContain(`  - Rooms people live or sleep in have a minimum floor area: looked at 1 room; 0 findings; its figures were read for ${HOMES}.`)
    // MSG-3: given as the figure used here, with its basis, the kind of building, and its status.
    expect(text).toContain(`is 6.5 m² (habitableRoomMinArea). Basis: US model codes, IBC 2024 1208.4; IRC 2024 R312.1, read 2026-11-14 for ${HOMES}. Status ai-found`)
  })

  it('a check that looked at nothing used no figure, and says nothing of one', () => {
    const result = checkPlan(plan(OFFICE), { country: 'US' })
    for (const check of result.result.coverage) expect(check.readFor, check.ruleId).toBeUndefined()
  })

  it('the hotel: its twelve sill notes, one line since MSG-5, say the figure was read for homes', () => {
    const result = checkPlan(plan(HOTEL), { country: 'US' })
    const sills = result.result.lines.filter((line) => line.code === 'room/escape-window-too-high')
    // MSG-5 (lab MS-14): the twelve identical notes are one line, which lists the twelve rooms.
    expect(sills).toHaveLength(1)
    expect(sills[0]!.each).toHaveLength(12)
    for (const line of sills) expect(line.needed).toBe(`the figure used here, a sill at most 1.118 m above the floor (US model codes, IBC 2024 1031.3.3; IRC 2024 R319.2.3, status ai-found); this check's figures were read for ${HOMES}`)
    // Every line that used a figure says it; no other line does.
    for (const line of result.result.lines) {
      expect(line.needed.includes('were read for'), line.code).toBe(line.code.startsWith('room/escape-') || line.code === 'room/too-small')
    }
  })
})

/** CNT-5: the plan, or a floor of it, says what kind of building it is. */
function withBuilding(loaded: LoadedPlan, building: FloorPlan['building'], floors: Readonly<Record<string, NonNullable<FloorPlan['building']>>> = {}): LoadedPlan {
  const plan = FloorPlanSchema.parse({
    ...loaded.plan,
    ...(building === undefined ? {} : { building }),
    floors: planFloors(loaded.plan).map((f) => ({ ...f, ...(Object.hasOwn(floors, f.id) ? { building: floors[f.id] } : {}) })),
  })
  const { issues, broken } = validatePlan(plan)
  return { file: loaded.file, plan, issues, broken }
}

describe('what kind of building it is (CNT-5)', () => {
  // The lab's office (EL-2) says it is an office: written by hand on a copy, as an author now can.
  it('the office applies no home figure, and says which checks do not apply to an office (EL-2)', () => {
    const result = checkPlan(withBuilding(plan(OFFICE), 'office'), { country: 'US' })
    for (const ruleId of ['habitable-room-area', 'escape-opening']) {
      const check = result.result.coverage.find((c) => c.ruleId === ruleId)!
      expect(check.lookedAtCount, ruleId).toBe(0)
      expect(check.skipped.map((s) => [s.reason, s.ids.length]), ruleId).toEqual([['not_for_building', 7]])
      expect(check.readFor, ruleId).toBeUndefined()
      expect(check.buildings, ruleId).toEqual(['home', 'flats'])
    }
    expect(result.report.figures).toEqual([])
    expect(result.report.rules.map((r) => r.id)).not.toContain('habitable-room-area')
    const notChecked = result.result.lines.filter((l) => l.code.endsWith('-for-building'))
    expect(notChecked.map((l) => [l.code, l.thing.kind, l.message])).toEqual([
      ['plan/not-checked-sizes-for-building', 'plan', `Room sizes were not checked: the figures here were read for ${HOMES}, and the plan says this is an office`],
      ['plan/not-checked-escapes-for-building', 'plan', `Escape openings were not checked: the figures here were read for ${HOMES}, and the plan says this is an office`],
    ])
    // MSG-10: the short report counts what was not looked at and why; the full one lists the rooms.
    const short = checkText(result, 1)
    expect(short).toContain(`Room sizes were not checked: the figures here were read for ${HOMES}, and the plan says this is an office.`)
    expect(short).toContain(`  - Nothing was checked for "Rooms people live or sleep in have a minimum floor area": it looked at no rooms; not looked at 7: the figures were read for ${HOMES}, and the plan says this is an office.`)
    const text = checkText(result, 1, { full: true })
    expect(text).toContain(`Room sizes were not checked: the figures here were read for ${HOMES}, and the plan says this is an office.`)
    expect(text).toContain(`      not looked at, 7 rooms: the figures were read for ${HOMES}, and the plan says this is an office: `)
    for (const report of [short, text]) {
      expect(report).toContain(GENERAL_GUIDANCE_LABEL)
      // No line says anything was approved or complies.
      expect(report).not.toMatch(/complies|approved/i)
    }
  })

  it('the office with no kind stated is checked as before, with COD-2\'s sentence', () => {
    const result = checkPlan(plan(OFFICE), { country: 'US' })
    expect(result.result.lines.filter((l) => l.code.endsWith('-for-building'))).toEqual([])
    const size = result.result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(size.skipped.map((s) => s.reason)).toEqual(['use_not_covered'])
  })

  it('the café that says it is a café no longer measures its seating against a home\'s figure (CH-2)', () => {
    const result = checkPlan(withBuilding(plan(CAFE), 'food'), { country: 'US' })
    const size = result.result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(size.lookedAtCount).toBe(0)
    expect(size.skipped.map((s) => s.reason)).toEqual(['not_for_building'])
    expect(result.report.figures).toEqual([])
    expect(result.result.lines.map((l) => l.code)).toContain('plan/not-checked-sizes-for-building')
  })

  it('the hotel that says it is a hotel gets none of its twelve sill notes from a home\'s figure', () => {
    const result = checkPlan(withBuilding(plan(HOTEL), 'hotel'), { country: 'US' })
    expect(result.result.lines.filter((l) => l.code === 'room/escape-window-too-high')).toEqual([])
    expect(result.result.lines.find((l) => l.code === 'plan/not-checked-escapes-for-building')!.message).toBe(
      `Escape openings were not checked: the figures here were read for ${HOMES}, and the plan says this is a hotel or hostel`
    )
  })

  it('a plan that says it is a home runs the home figures, and says the plan says so', () => {
    const result = checkPlan(withBuilding(plan(HOTEL), 'home'), { country: 'US' })
    // MSG-5 (lab MS-14): the twelve identical sill notes are one line that lists the twelve rooms.
    const sills = result.result.lines.filter((l) => l.code === 'room/escape-window-too-high')
    expect(sills).toHaveLength(1)
    expect(sills[0]!.each).toHaveLength(12)
    expect(result.result.lines.filter((l) => l.code.endsWith('-for-building'))).toEqual([])
  })
})

describe('a kind of building on a part of the building (CNT-5)', () => {
  // The lab's block (D/scenarios/d2-block-g+5.json) has two shops on its ground floor.
  const block = withBuilding(plan(BLOCK), 'home', { ground: 'shop' })
  const result = checkPlan(block, { country: 'US' })

  it('the ground floor is a shop and the floors above are homes', () => {
    expect(block.plan.building).toBe('home')
    expect(block.plan.floors!.find((f) => f.id === 'ground')!.building).toBe('shop')
    expect(block.plan.floors!.filter((f) => f.building !== undefined).map((f) => f.id)).toEqual(['ground'])
  })

  it('skips the shop floor\'s rooms for the home figures, with one line for that floor, and checks the homes above', () => {
    const groundRooms = planForFloor(block.plan, 'ground').rooms.map((r) => r.id).sort()
    for (const ruleId of ['habitable-room-area', 'escape-opening']) {
      const check = result.result.coverage.find((c) => c.ruleId === ruleId)!
      const shop = check.skipped.filter((s) => s.reason === 'not_for_building')
      expect(shop.map((s) => s.floor), ruleId).toEqual(['ground'])
      expect(shop[0]!.ids, ruleId).toEqual(groundRooms)
      expect(shop[0]!.why, ruleId).toBe(`the figures were read for ${HOMES}, and the plan says this is a shop`)
      expect(check.lookedAt.map((g) => g.floor), ruleId).not.toContain('ground')
    }
    const escape = result.result.coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(escape.lookedAt.map((g) => [g.floor, g.ids.length])).toEqual([['L1', 6], ['L2', 6]])
    const lines = result.result.lines.filter((l) => l.code.endsWith('-for-building'))
    expect(lines.map((l) => [l.code, l.floor])).toEqual([
      ['floor/not-checked-sizes-for-building', 'ground'],
      ['floor/not-checked-escapes-for-building', 'ground'],
    ])
    expect(lines[0]!.message).toBe(`On "Ground floor", room sizes were not checked: the figures here were read for ${HOMES}, and the plan says this floor is a shop`)
  })

  it('the same without the plan\'s kind: the floors above, which say nothing, are checked as before', () => {
    const shopOnly = checkPlan(withBuilding(plan(BLOCK), undefined, { ground: 'shop' }), { country: 'US' })
    const before = checkPlan(plan(BLOCK), { country: 'US' })
    const above = (r: typeof result) => r.result.lines.filter((l) => l.floor !== 'ground' && l.floor !== null).map((l) => `${l.code} ${l.thing.id}`)
    expect(above(shopOnly)).toEqual(above(before))
    expect(shopOnly.result.lines.filter((l) => l.code.endsWith('-for-building')).map((l) => l.floor)).toEqual(['ground', 'ground'])
  })
})
