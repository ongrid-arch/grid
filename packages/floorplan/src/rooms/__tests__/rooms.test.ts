/**
 * WRT-2: sizes with their basis, refusals in plain words naming both rooms, the read-back that
 * loses nothing, and a hand edit to a derived part refused with its own code.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { diffPlans } from '../../geometry/diff'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan, type FloorPlan, type Wall } from '../../types/floorplan'
import { roomsAnswer } from '../answer'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { stampFor } from '../stamp'

const FIXTURES = resolve(__dirname, '../../../fixtures/rooms')
const read = (name: string): string => readFileSync(join(FIXTURES, name), 'utf8')
const BUILDINGS = ['flat', 'l-house', 'two-storey', 'office', 'odd-house', 'courtyard', 'hotel', 'four-flats'] as const

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  return parseFloorPlan(result.plan)
}

/** The outside faces of the walls: the box their bodies cover. */
function outsideBox(walls: readonly Wall[]): [number, number] {
  const xs: number[] = []
  const ys: number[] = []
  for (const w of walls) {
    const vertical = w.start[0] === w.end[0]
    for (const p of [w.start, w.end]) {
      xs.push(p[0] + (vertical ? w.thickness / 2 : 0), p[0] - (vertical ? w.thickness / 2 : 0))
      ys.push(p[1] + (vertical ? 0 : w.thickness / 2), p[1] - (vertical ? 0 : w.thickness / 2))
    }
  }
  return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]
}

describe('sizes and what they measure to', () => {
  it('makes a "3 x 4 inside" room 3.00 x 4.00 m between its faces, and says so', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nroom ext "Extension" living 3 x 4 inside\n')
    expect(result.problems).toEqual([])
    expect(result.rooms[0]).toMatchObject({ width: 3, depth: 4, basis: 'inside' })
    expect(result.rooms[0]!.area).toBeCloseTo(12, 9)
    const answer = roomsAnswer(result).join('\n')
    expect(answer).toContain('3.00 x 4.00 m, 12.00 m² inside (written 3.00 x 4.00 to the inside faces)')
    expect(answer).toContain('Sizes are to the inside faces unless a room says otherwise (the default).')
  })

  it('makes an "8 x 10 outside" footprint 8.00 x 10.00 m to its outside faces, and says so', () => {
    const result = compileRoomsText('walls outside 0.3 inside 0.1 height 2.7\nroom house "House" living 8 x 10 outside\n')
    expect(result.problems).toEqual([])
    const [w, d] = outsideBox(parseFloorPlan(result.plan).walls)
    expect(w).toBeCloseTo(8, 9)
    expect(d).toBeCloseTo(10, 9)
    expect(result.rooms[0]).toMatchObject({ basis: 'outside' })
    expect(result.rooms[0]!.width).toBeCloseTo(7.4, 9)
    expect(roomsAnswer(result).join('\n')).toContain('7.40 x 9.40 m, 69.56 m² inside (written 8.00 x 10.00 to the outside faces)')
  })

  it('measures a size to the centre lines from the walls the room ends up with', () => {
    const plan = written('walls outside 0.3 inside 0.1 height 2.7\nsizes centre\nroom a "A" living 3 x 4\nroom b "B" bedroom 3 x 4 east of a\n')
    const xs = plan.walls.filter((w) => w.start[0] === w.end[0]).map((w) => w.start[0]).sort((p, q) => p - q)
    // Centre lines 3 m apart: the outside wall, the wall between the rooms, the outside wall.
    expect(xs).toHaveLength(3)
    expect(xs[1]! - xs[0]!).toBeCloseTo(3, 9)
    expect(xs[2]! - xs[1]!).toBeCloseTo(3, 9)
  })
})

describe('refusals in plain words', () => {
  const base = 'walls outside 0.3 inside 0.1 height 2.7\nroom living "Living" living 4 x 4\n'

  it('refuses overlapping rooms, naming both and how far', () => {
    const result = compileRoomsText(`${base}room bed "Bed" bedroom 3 x 4 at 3.6,0\n`)
    expect(result.plan).toBeNull()
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatchObject({ code: 'rooms/overlap', line: 3 })
    expect(result.problems[0]!.message).toMatch(/^Rooms 'living' \(line 2\) and 'bed' \(line 3\) overlap: they share an area about 0\.40 m east-west by 4\.00 m north-south/)
  })

  it('refuses a gap that is neither a wall nor a room, naming both', () => {
    const result = compileRoomsText(`${base}room bed "Bed" bedroom 3 x 4 at 4.8,0\n`)
    expect(result.plan).toBeNull()
    expect(result.problems[0]).toMatchObject({ code: 'rooms/gap' })
    expect(result.problems[0]!.message).toMatch(/^Rooms 'living' \(line 2\) and 'bed' \(line 3\) leave a gap of 0\.80 m between them/)
  })

  it('refuses rooms that touch with no wall, unless they are open to each other', () => {
    const touching = compileRoomsText(`${base}room bed "Bed" bedroom 3 x 4 at 4,0\n`)
    expect(touching.problems[0]).toMatchObject({ code: 'rooms/touching' })
    expect(touching.problems[0]!.message).toContain("Rooms 'living' (line 2) and 'bed' (line 3) touch")
    const open = written(`${base}room dining "Dining" dining 3 x 4 east of living open\n`)
    expect(open.walls.filter((w) => w.virtual === true)).toHaveLength(1)
  })
})

describe('the wall between two rooms, seen end on, is no gap (WRT-10)', () => {
  const walls = 'walls outside 0.3 inside 0.1\n'
  /** Written, clean in the drawing's own check, and the same when read back and written again. */
  function clean(text: string): FloorPlan {
    const plan = written(text)
    expect(validatePlan(plan).issues.filter((i) => i.severity === 'error')).toEqual([])
    const again = written(readRoomsText(plan).text)
    expect(diffPlans(plan, again).changes).toEqual([])
    return plan
  }
  it('writes two small rooms stacked between two larger ones, with the wall between the two', () => {
    const plan = clean(
      `${walls}room a "A" bedroom 3 x 3.1 at 0,0\n` +
        'room b "B" toilet 1 x 1.5 east of a align north\n' +
        'room c "C" storage 1 x 1.5 south of b align west\n' +
        'room d "D" living 3 x 3.1 east of b align north\n'
    )
    expect(plan.rooms.map((r) => r.id).sort()).toEqual(['a', 'b', 'c', 'd'])
    const partition = plan.walls.find((w) => w.id === 'w-b-c')
    expect(partition?.thickness).toBeCloseTo(0.1, 9)
    // It runs from the wall along A to the wall along D, across the stack.
    expect(partition?.start[1]).toBeCloseTo(1.55, 9)
    expect(Math.abs(partition!.end[0] - partition!.start[0])).toBeCloseTo(1.1, 9)
  })

  it('writes a WC cut out of a hall corner, with another room along that side of the hall', () => {
    clean(`${walls}room garage "Garage" garage 3 x 5 at 0,0\nroom hall "Hall" corridor 2 x 5 east of garage align north\nroom wc "WC" toilet 0.9 x 1.5 inside hall corner nw\n`)
    clean(`${walls}room garage "Garage" garage 3 x 5 at 0,0\nroom hall "Hall" corridor polygon 3.1,0 5.1,0 5.1,5 4.1,5 4.1,3.4 3.1,3.4\nroom wc "WC" toilet 0.9 x 1.5 at 3.1,3.5\n`)
  })

  it('still refuses a gap beside a stack that is shorter than the rooms either side', () => {
    const result = compileRoomsText(
      `${walls}room a "A" bedroom 3 x 3.6 at 0,0\n` +
        'room b "B" toilet 1 x 1.5 east of a align north\n' +
        'room c "C" storage 1 x 1.5 south of b align west\n' +
        'room d "D" living 3 x 3.6 east of b align north\n'
    )
    expect(result.plan).toBeNull()
    expect(result.problems.map((p) => p.code)).toEqual(['rooms/gap'])
    expect(result.problems[0]!.message).toMatch(/^Rooms 'a' \(line 2\) and 'd' \(line 5\) leave a gap of 1\.20 m between them, along 0\.50 m/)
  })
})

describe('reading a plan back as rooms text', () => {
  for (const name of BUILDINGS) {
    it(`${name}: rooms text to plan to rooms text to plan changes nothing`, () => {
      const first = written(read(`${name}.rooms`))
      const reading = readRoomsText(first)
      expect(reading.rawFloors).toEqual([])
      const second = written(reading.text)
      expect(diffPlans(first, second).changes).toEqual([])
      // The read-back says what it was read from.
      expect(reading.text).toContain('based on ')
    })
  }

  it('keeps the school plan\'s walls at 3.00 m, read back and written again (AB-2)', () => {
    const school = parseFloorPlan(JSON.parse(read('school.plan.json')))
    expect(new Set(school.walls.map((w) => w.height))).toEqual(new Set([3]))
    const reading = readRoomsText(school)
    expect(reading.text).toMatch(/^walls outside 0\.3 inside 0\.15 height 3$/m)
    // Written rooms first, not as raw lines.
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toMatch(/^room corr "Corridor" corridor /m)
    const again = written(reading.text)
    expect(new Set(again.walls.map((w) => w.height))).toEqual(new Set([3]))
    expect(diffPlans(school, again).changes).toEqual([])
  })

  it('writes every hand-drawn original back without a change, raw where rooms text cannot say it', () => {
    for (const name of [...BUILDINGS, 'school']) {
      const original = parseFloorPlan(JSON.parse(read(`${name}.plan.json`)))
      const again = written(readRoomsText(original).text)
      expect(diffPlans(original, again).changes, name).toEqual([])
      // The checks the comparison does not look at: a room's use, a door's hinge and swing.
      expect(again.rooms.map((r) => [r.id, r.use]), name).toEqual(original.rooms.map((r) => [r.id, r.use]))
      const hung = (p: FloorPlan) => p.openings.map((o) => [o.id, o.hinge, o.swing]).sort()
      expect(hung(again), name).toEqual(hung(original))
    }
  })

  it('writes and reads what kind of building it is, a floor\'s own kind, a room\'s tenure and the firm\'s room type (CNT-5)', () => {
    const text = [
      'building home',
      'walls outside 0.3 inside 0.1 height 2.7',
      'floor ground "Ground floor" level 0 building shop',
      'room shop "Shop 1" shop 6 x 5 tenure commercial type "Unit A"',
      'room bins "Bin store" store 2 x 5 east of shop tenure common',
      'floor first "First floor" level 1',
      'room pooja "Pooja room" "pooja room" 2 x 2',
      'room wc "WC" WC 2 x 1.5 north of pooja tenure private',
    ].join('\n')
    const plan = written(text)
    expect(plan.building).toBe('home')
    expect(plan.floors!.map((f) => [f.id, f.building])).toEqual([['ground', 'shop'], ['first', undefined]])
    // The person's own word is the room's name; the use is the one it plainly means.
    expect(plan.rooms.map((r) => [r.id, r.name, r.use, r.tenure, r.roomType])).toEqual([
      ['shop', 'Shop 1', 'retail', 'commercial', 'Unit A'],
      ['bins', 'Bin store', 'storage', 'common', undefined],
      ['pooja', 'Pooja room', 'worship', undefined, undefined],
      ['wc', 'WC', 'toilet', 'private', undefined],
    ])
    const reading = readRoomsText(plan)
    expect(reading.rawFloors).toEqual([])
    expect(reading.text).toMatch(/^building home$/m)
    expect(reading.text).toMatch(/^floor ground "Ground floor" level 0 building shop$/m)
    expect(reading.text).toMatch(/^room shop "Shop 1" retail .* tenure commercial type "Unit A"$/m)
    const again = written(reading.text)
    expect(again.building).toBe('home')
    expect(again.floors).toEqual(plan.floors)
    expect(again.rooms.map((r) => [r.id, r.use, r.tenure, r.roomType])).toEqual(plan.rooms.map((r) => [r.id, r.use, r.tenure, r.roomType]))
  })

  it('refuses a kind of building or a tenure it does not know, naming the ones it does', () => {
    expect(compileRoomsText('building mall\nroom a "A" - 3 x 3').problems[0]!.message).toMatch(/write 'building <kind>': one of home, office, shop/)
    expect(compileRoomsText('room a "A" - 3 x 3 tenure mine').problems[0]!.message).toMatch(/'mine' is not a tenure Grid knows\. Use one of: private, shared, common, commercial/)
    expect(compileRoomsText('room a "A" lounge 3 x 3').problems[0]!.code).toBe('rooms/unknown-use')
  })

  it('writes and reads a room\'s floor above or below its storey (LVL-7), and keeps a key it cannot say', () => {
    const plan = written('walls outside 0.3 inside 0.1 height 2.7\nroom genkan "Genkan" corridor 2 x 1.5 floor -0.15\nroom hall "Hall" corridor 2 x 3 north of genkan\n')
    expect(plan.rooms.find((r) => r.id === 'genkan')).toMatchObject({ floorOffset: -0.15 })
    const reading = readRoomsText(plan)
    expect(reading.text).toMatch(/^room genkan "Genkan" corridor 2 x 1\.5 at 0,0 floor -0\.15$/m)
    expect(diffPlans(plan, written(reading.text)).changes).toEqual([])
    // A key rooms text does not write is kept by giving the floor in the plan's own terms.
    const unknown = { ...plan, rooms: plan.rooms.map((r) => (r.id === 'hall' ? { ...r, note: 'kept' } : r)) } as unknown as FloorPlan
    const raw = readRoomsText(unknown)
    expect(raw.rawFloors.map((f) => f.floor)).toEqual(['ground'])
    expect(raw.text).toContain('"note":"kept"')
  })

  it('gives a wall height or thickness exception, so a changed wall is never lost', () => {
    const plan = written('walls outside 0.3 inside 0.1 height 2.7\nroom a "A" living 3 x 4\nroom b "B" bedroom 3 x 4 east of a\n')
    const higher = { ...plan, walls: plan.walls.map((w) => (w.id === 'w-a-b' ? { ...w, height: 3.1 } : w)) }
    const reading = readRoomsText(higher)
    expect(reading.text).toContain('wall between a and b height 3.1')
    expect(diffPlans(higher, written(reading.text)).changes).toEqual([])
  })
})

describe('the parts Grid derives', () => {
  it('refuses a room boundary edited by hand, with its own code', () => {
    const plan = written(read('flat.rooms'))
    const stamped = parseFloorPlan({ ...plan, written: stampFor(plan) })
    expect(validatePlan(stamped).issues.filter((i) => i.code === 'room/derived-edited')).toEqual([])
    const edited = { ...stamped, rooms: stamped.rooms.map((r) => (r.id === 'hall' ? { ...r, boundary: [...r.boundary].reverse() } : r)) }
    const issues = validatePlan(edited).issues.filter((i) => i.code === 'room/derived-edited')
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ id: 'hall', severity: 'error' })
    expect(issues[0]!.message).toContain('written rooms first')
    // A plan with no stamp is a hand-written one: its boundaries are its own.
    const unstamped: FloorPlan = { ...edited }
    delete unstamped.written
    expect(validatePlan(unstamped).issues.filter((i) => i.code === 'room/derived-edited')).toEqual([])
  })

  it('keeps each room\'s id through an edit of its size', () => {
    const before = written(read('flat.rooms'))
    const after = written(read('flat.rooms').replace('room kitchen "Kitchen"     kitchen  4.4 x 3.0', 'room kitchen "Kitchen"     kitchen  4.4 x 3.4'))
    const rooms = diffPlans(before, after).changes.filter((c) => c.entity.type === 'room')
    expect(rooms.length).toBeGreaterThan(0)
    expect(rooms.every((c) => c.kind === 'modified')).toBe(true)
    expect(after.rooms.map((r) => r.id)).toEqual(before.rooms.map((r) => r.id))
  })
})

describe('ids on several floors (MSG-6, lab AB-7)', () => {
  const text = [
    'walls outside 0.3 inside 0.1 height 2.7',
    'floor ground "Ground floor" level 0',
    'room hall "Hall" corridor 2 x 3 at 0,0',
    'room bath "Bath" bathroom 2 x 3 east of hall',
    'floor first "First floor" level 1',
    'room study "Study" other 2 x 3 at 0,0',
    'room bath "Bath" bathroom 2 x 3 east of study',
  ].join('\n')

  it('keeps an id written once as written, and names each one it had to change', () => {
    const result = compileRoomsText(text)
    expect(result.problems).toEqual([])
    // LVL-16: the floor that writes an id first keeps it; the others take their floor's id in front.
    expect(result.plan!.rooms.map((r) => r.id)).toEqual(['hall', 'bath', 'study', 'first-bath'])
    expect(result.warnings.filter((w) => w.code === 'rooms/id-changed').map((w) => w.message)).toEqual([
      "Ids are unique across the whole plan, and this one was written on more than one floor, so the first floor that writes it keeps it and every other floor takes its floor's id in front: 'bath' is kept on floor 'ground' and is 'first-bath' on floor 'first'. Every other id is kept as written. Use these ids in later calls.",
    ])
  })
})
