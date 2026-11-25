/**
 * WRT-17: what rooms text writes passes the drawing's own check. The walls the writer works out
 * close every corner they make, join only where walls meet, and are never noted by the check;
 * what the check would leave out or note is refused, or said in the answer.
 */
import { describe, expect, it } from 'vitest'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText, type RoomsResult } from '../compile'
import { checkWritten } from '../selfCheck'

/** Written with no problem, and nothing for the check to note. */
function clean(text: string): { plan: FloorPlan; result: RoomsResult } {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const plan = parseFloorPlan(result.plan)
  expect(validatePlan(plan).issues.map((i) => `${i.code}: ${i.message}`)).toEqual([])
  return { plan, result }
}

function refused(text: string, code: string): RoomsResult {
  const result = compileRoomsText(text)
  expect(result.plan).toBeNull()
  expect(result.problems.map((p) => p.code)).toContain(code)
  return result
}

describe('the corners the writer makes are closed (WRT-17)', () => {
  const walls = 'walls outside 0.3 inside 0.15 height 2.6\n'
  it('carries the wall between two rooms to the corner of the wider one', () => {
    for (const width of ['4.5', '4.55']) {
      const { plan } = clean(`${walls}room r0 "R0" - 4.3 x 3.5 at 0,0\nroom r1 "R1" - ${width} x 3.7 south of r0 align west\n`)
      const between = plan.walls.find((w) => w.id === 'w-r0-r1')!
      // The east end reaches the centre line of the wider room's east wall.
      expect(Math.max(between.start[0], between.end[0])).toBeCloseTo(Number(width) + 0.15, 4)
    }
  })

  it('leaves a corner the check reads as reached where it is', () => {
    clean(`${walls}room r0 "R0" - 4.3 x 3.5 at 0,0\nroom r1 "R1" - 4.4 x 3.7 south of r0 align west\n`)
  })

  it('carries it to both corners when the room below is wider at both ends', () => {
    clean(`${walls}room r0 "R0" - 4.3 x 3.5 at 0,0\nroom r1 "R1" - 4.8 x 3.7 south of r0 align centre\n`)
  })

  it('keeps the walls of two lifts in the corners of one lobby apart across the floor between them', () => {
    for (const width of ['3.8', '3.9', '4.0']) {
      const { plan } = clean(
        `walls outside 0.3 inside 0.1 height 2.6\nroom lobby "Lobby" circulation ${width} x 4 at 0,0\n` +
          'room lift1 "Lift 1" lift 1.6 x 1.6 inside lobby corner ne wall 0.2\nroom lift2 "Lift 2" lift 1.6 x 1.6 inside lobby corner nw wall 0.2\n'
      )
      const lobby = plan.rooms.find((r) => r.id === 'lobby')!
      expect(new Set(lobby.boundary).size).toBe(lobby.boundary.length)
    }
  })

  it('leaves no gap beside a 45 degree wall', () => {
    for (const depth of ['3.5', '4', '6']) {
      clean(
        'walls outside 0.3 inside 0.1 height 2.6\nroom a "Hall" corridor polygon 0,0 6,0 6,3 3,6 0,6\n' +
          `room b "Side" - 3 x ${depth} at 6.1,0\nroom c "Top" - 3 x 2 at 0,6.1\n`
      )
    }
  })

  it('reads the walls of honeycomb cells as what they are', () => {
    clean(
      'walls outside 0.2 inside 0.1 height 2.6\n' +
        'room a "A" office polygon 0,0 2,0 3,1.732 2,3.464 0,3.464 -1,1.732\n' +
        'room b "B" office polygon 3.0866,1.782 5.0866,1.782 6.0866,3.514 5.0866,5.246 3.0866,5.246 2.0866,3.514\n' +
        'room c "C" office polygon 0,3.564 2,3.564 3,5.296 2,7.028 0,7.028 -1,5.296\n'
    )
  })
})

describe('what the check would note is refused or said (WRT-17)', () => {
  it('says when rooms ring floor no room claims, where it is and how to write it', () => {
    const result = compileRoomsText(
      'walls outside 0.3 inside 0.15 height 2.6\n' +
        'room n "North office" office 4 x 5 at 6,10.15\nroom s "South office" office 4 x 5 at 6,0.85\n' +
        'room ne "NE office" office 5 x 5 east of n\nroom nw "NW office" office 5 x 5 west of n\n' +
        'room se "SE office" office 5 x 5 east of s\nroom sw "SW office" office 5 x 5 west of s\n' +
        'room ee "East office" office 5 x 4 at 10.15,6\nroom ww "West office" office 5 x 4 at 0.85,6\n'
    )
    expect(result.problems).toEqual([])
    const hole = result.warnings.filter((w) => w.code === 'rooms/hole')
    expect(hole).toHaveLength(1)
    expect(hole[0]!.message).toContain('(8.00, 8.00)')
    expect(hole[0]!.message).toContain('outdoor courtyard')
    // Said once, in the writer's own words, not again as the check's note.
    expect(result.warnings.filter((w) => w.message.includes('floor/unclaimed'))).toEqual([])
  })

  it('keeps a raw part the person wrote that the check would leave out, and says so', () => {
    const result = compileRoomsText(
      'walls outside 0.3 inside 0.1 height 2.6\nroom a "A" - 4 x 4 at 0,0\n' +
        'raw opening {"id": "ghost", "wall": "nope", "type": "window", "offset": 0, "width": 1, "sill": 0.9, "height": 1.2}\n'
    )
    expect(result.problems).toEqual([])
    expect(result.warnings.map((w) => w.code)).toContain('rooms/check')
    expect(result.warnings.find((w) => w.code === 'rooms/check')!.message).toContain('opening/missing-wall')
  })

  it('refuses, in the check\'s words, an error on a part it worked out itself', () => {
    const plan = compileRoomsText('walls outside 0.3 inside 0.1 height 2.6\nroom a "A" - 4 x 4 at 0,0\nwindow w1 in a south, centred, 1 wide\n').plan!
    const runOff = { ...plan, openings: plan.openings.map((o) => ({ ...o, offset: 3.9 })) }
    const worked = checkWritten(runOff, [], new Set())
    expect(worked.problems.map((p) => p.code)).toEqual(['rooms/check'])
    expect(worked.problems[0]!.message).toContain('opening/out-of-wall')
    const raw = checkWritten(runOff, [], new Set(['w1']))
    expect(raw.problems).toEqual([])
    expect(raw.warnings.map((w) => w.code)).toEqual(['rooms/check'])
  })

  it('writes the same floor with its core as a room', () => {
    clean(
      'walls outside 0.3 inside 0.15 height 2.6\n' +
        'room core "Core" circulation 4 x 4 at 6,6\n' +
        'room n "North office" office 4 x 5 north of core\nroom s "South office" office 4 x 5 south of core\n' +
        'room ne "NE office" office 5 x 5 east of n\nroom nw "NW office" office 5 x 5 west of n\n' +
        'room se "SE office" office 5 x 5 east of s\nroom sw "SW office" office 5 x 5 west of s\n' +
        'room ee "East office" office 5 x 4 east of core\nroom ww "West office" office 5 x 4 west of core\n'
    )
  })

  it('refuses a window over the front door, by the check\'s own rule', () => {
    const result = refused(
      'walls outside 0.3 inside 0.1 height 2.6\nroom hall "Hall" corridor 2 x 4 at 0,0\n' +
        'door front in hall south, centred, 0.9 wide, opens in, hinged east\nwindow w1 in hall south, centred, 1.2 wide\n',
      'rooms/openings-overlap'
    )
    // The check keeps the opening that starts first along the wall and leaves the next one out.
    expect(result.problems[0]!.line).toBe(3)
    expect(result.problems[0]!.message).toContain("door 'front'")
    expect(result.problems[0]!.message).toContain("window 'w1' (line 4)")
  })

  it('refuses a window that would run off its wall', () => {
    refused('walls outside 0.3 inside 0.1 height 2.6\nroom living "Living room" living 4.4 x 4.2 at 0,0\nwindow w1 in living south, 3.9 from west, 1.0 wide\n', 'rooms/opening-fit')
  })

  it('says when a wall takes a thickness no line states, from the gap the rooms leave', () => {
    const { result } = clean('walls outside 0.3 inside 0.1 height 2.6\nroom a "A" - 4 x 4 at 0,0\nroom b "B" - 4 x 4 at 4.6,0\n')
    const said = result.warnings.filter((w) => w.code === 'rooms/wall-from-gap')
    expect(said).toHaveLength(1)
    expect(said[0]!.message).toContain('0.60 m')
  })

  it('says nothing of a thickness the text states', () => {
    const { result } = clean('walls outside 0.3 inside 0.1 height 2.6\nroom a "A" - 4 x 4 at 0,0\nroom b "B" - 4 x 4 east of a walls 0.2\n')
    expect(result.warnings.filter((w) => w.code === 'rooms/wall-from-gap')).toEqual([])
  })
})

describe('generated layouts pass the check (WRT-17)', () => {
  let seed = 7
  const rnd = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!
  const size = (): string => (1 + Math.round(rnd() * 40) / 10).toFixed(1)
  const SIDES = ['north', 'south', 'east', 'west'] as const
  function layout(): string {
    const lines = [`walls outside ${pick(['0.3', '0.25', '0.35'])} inside ${pick(['0.1', '0.12', '0.15'])} height 2.6`]
    const ids: string[] = []
    const n = 2 + Math.floor(rnd() * 6)
    for (let i = 0; i < n; i++) {
      if (i === 0) lines.push(`room r0 "R0" - ${size()} x ${size()} at 0,0`)
      else if (rnd() < 0.15) lines.push(`room r${i} "R${i}" - ${(0.8 + rnd()).toFixed(1)} x ${(0.8 + rnd()).toFixed(1)} inside ${pick(ids)} corner ${pick(['ne', 'nw', 'se', 'sw'])}${rnd() < 0.5 ? ' wall 0.2' : ''}`)
      else lines.push(`room r${i} "R${i}" - ${size()} x ${size()} ${pick(SIDES)} of ${pick(ids)}${rnd() < 0.5 ? ` align ${pick(['north', 'south', 'east', 'west', 'centre'])}` : ''}`)
      ids.push(`r${i}`)
    }
    const m = Math.floor(rnd() * 5)
    for (let j = 0; j < m; j++) {
      const place = rnd() < 0.5 ? 'centred' : `${(rnd() * 3).toFixed(1)} from ${pick(SIDES)}`
      lines.push(`${pick(['door', 'window'])} o${j} in ${pick(ids)} ${pick(SIDES)}, ${place}, ${(0.6 + rnd() * 1.2).toFixed(1)} wide`)
    }
    return `${lines.join('\n')}\n`
  }

  it('writes no plan the check notes, and says every note it leaves', () => {
    let written = 0
    const noted: string[] = []
    for (let k = 0; k < 1500; k++) {
      const text = layout()
      const result = compileRoomsText(text)
      if (result.plan === null) continue
      written++
      const issues = validatePlan(parseFloorPlan(result.plan)).issues
      // Nothing the check would leave out, and nothing it notes on the walls worked out here.
      for (const i of issues) if (i.severity === 'error' || i.code.startsWith('wall/') || i.code.startsWith('room/')) noted.push(`${i.message}\n${text}`)
      // Every note the check makes is said in the answer.
      expect(result.warnings.length).toBeGreaterThanOrEqual(issues.length > 0 ? 1 : 0)
    }
    expect(noted.slice(0, 3)).toEqual([])
    expect(written).toBeGreaterThan(100)
  })
})
