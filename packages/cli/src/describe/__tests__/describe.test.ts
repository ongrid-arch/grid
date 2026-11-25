import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { FloorPlanSchema, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { DESCRIBE_LENGTHS, describeText, type DescribeAudience, type DescribeLength } from '../card'
import { planFacts } from '../facts'
import { stairHouse, twoFloorHouse } from '@ongrid/floorplan/test-support/plans'

/**
 * VEW-5: `grid describe` in three lengths, for a person and for an agent. The plans are the
 * sample flat and two plans rebuilt from the lab: Y-6, where narrowing the hall put the front
 * door in Bedroom 2, and AU2-5, where both bathrooms open off the study. The six-storey
 * block is the lab's, kept in the scoreboard's data.
 */

const cli = resolve(__dirname, '../../..')
const repo = resolve(cli, '../..')

function fixtureText(name: string): string {
  return readFileSync(resolve(cli, 'fixtures', name), 'utf8')
}

function parse(text: string): FloorPlan {
  return FloorPlanSchema.parse(JSON.parse(text))
}

/** The block's file as the lab wrote it, from the scoreboard's lab plans. */
function blockText(): string {
  const lines = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz'))).toString('utf8').split('\n')
  for (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line) as { name: string; text: string }
    if (row.name === 'D/scenarios/d2-block-g+5.json') return row.text
  }
  throw new Error('the six-storey block is missing from the scoreboard data')
}

const flatText = fixtureText('two-bed-flat.json')
const frontDoorText = fixtureText('front-door-into-bedroom.json')
const studyText = fixtureText('bathrooms-through-study.json')
const block = blockText()

const plans: Record<string, FloorPlan> = {
  flat: parse(flatText),
  frontDoor: parse(frontDoorText),
  study: parse(studyText),
  block: parse(block),
}

function card(plan: FloorPlan, length: DescribeLength, audience: DescribeAudience): string {
  return describeText(planFacts(plan), length, audience)
}

/** Every id in a plan replaced by a made-up word that no sentence holds, consistently. */
function withTokenIds(plan: FloorPlan): { plan: FloorPlan; tokens: string[] } {
  const ids = new Map<string, string>()
  const token = (id: string): string => {
    if (!ids.has(id)) ids.set(id, `qzx${ids.size}vj`)
    return ids.get(id)!
  }
  const renamed: FloorPlan = {
    ...plan,
    floors: plan.floors?.map((floor) => ({ ...floor, id: token(floor.id) })),
    walls: plan.walls.map((wall) => ({ ...wall, id: token(wall.id), ...(wall.floor === undefined ? {} : { floor: token(wall.floor) }) })),
    rooms: plan.rooms.map((room) => ({
      ...room,
      id: token(room.id),
      boundary: room.boundary.map(token),
      ...(room.floor === undefined ? {} : { floor: token(room.floor) }),
    })),
    openings: plan.openings.map((opening) => ({ ...opening, id: token(opening.id), wall: token(opening.wall) })),
  }
  return { plan: renamed, tokens: [...ids.values()] }
}

describe('the three lengths', () => {
  it.each(Object.keys(plans))('%s: the line is one line, and each card starts with it', (name) => {
    const plan = plans[name]!
    for (const audience of ['person', 'agent'] as const) {
      const line = card(plan, 'line', audience)
      expect(line.trimEnd().split('\n')).toHaveLength(1)
      expect(card(plan, 'rooms', audience).startsWith(line)).toBe(true)
      expect(card(plan, 'walls', audience).startsWith(line)).toBe(true)
    }
  })

  it('the rooms card of the sample flat is about 1.6 kB', () => {
    for (const audience of ['person', 'agent'] as const) {
      const bytes = Buffer.byteLength(card(plans.flat!, 'rooms', audience))
      expect(bytes).toBeGreaterThan(1200)
      expect(bytes).toBeLessThan(2000)
    }
  })

  it("the agent's card with walls of the six-storey block is under 9% of its file", () => {
    const bytes = Buffer.byteLength(card(plans.block!, 'walls', 'agent'))
    expect(Buffer.byteLength(block)).toBe(90842)
    expect(bytes / Buffer.byteLength(block)).toBeLessThan(0.09)
  })

  it('a floor laid out like an earlier one is said once', () => {
    const person = card(plans.block!, 'walls', 'person')
    expect(person.match(/laid out like Floor 1/g)).toHaveLength(2) // the line and the card
    expect(person).toContain('Floor 2, Floor 3, Floor 4 and Floor 5: laid out like Floor 1.')
    const agent = card(plans.block!, 'walls', 'agent')
    expect(agent).toContain('FLOORS L2 "Floor 2", L3 "Floor 3", L4 "Floor 4", L5 "Floor 5": as L1, ids with its own prefix (L2, L3, L4, L5) for L1')
    expect(agent).not.toMatch(/^FLOOR L[2-5]/m)
    expect(agent).not.toContain('L2-corridor')
  })
})

describe('what each opening joins', () => {
  it('every opening of the sample flat names two sides and the gaps to both corners', () => {
    const facts = planFacts(plans.flat!)
    expect(facts.openings.size).toBe(plans.flat!.openings.length)
    for (const opening of facts.openings.values()) {
      for (const side of opening.sides) {
        if (typeof side === 'string') {
          expect(side).toBe('outside')
          continue
        }
        expect(side.corners).not.toBeNull()
      }
      // A door between rooms lists them both, a window or the front door one room and outside.
      expect(opening.sides.filter((side) => typeof side !== 'string').length).toBe(
        opening.type === 'window' || opening.id === 'front' ? 1 : 2)
    }
  })

  it('the rooms card prints every opening once for each room it is in, with its corners', () => {
    const facts = planFacts(plans.flat!)
    const rooms = [...facts.openings.values()].reduce((sum, o) => sum + o.sides.filter((side) => typeof side !== 'string').length, 0)
    const person = card(plans.flat!, 'rooms', 'person')
    const openingLines = person.split('\n').filter((line) => /^ {2}(Door|Window|Opening) /.test(line))
    expect(openingLines).toHaveLength(rooms)
    for (const line of openingLines) expect(line).toMatch(/ from [NESW]{1,2} corner, -?[\d.]+ from [NESW]{1,2}\.$/)
  })

  it('measures a door from the inside corners of the room', () => {
    // Bedroom 2 is 0.125 to 3.7 up the spine; its door starts 2.85 along it and is 0.8 wide.
    expect(card(plans.flat!, 'rooms', 'person')).toContain('  Door 0.8 to Living room, E side, 2.73 from S corner, 0.05 from N.')
    expect(card(plans.flat!, 'rooms', 'agent')).toContain('bed2-door d0.8>lounge E S2.73/N0.05')
    expect(card(plans.flat!, 'walls', 'agent')).toContain('bed2-door d 2.85+0.8 bed2 2.73/0.05|lounge')
  })

  it('Y-6: the front door that ended up in Bedroom 2 is in the line and in the card', () => {
    const person = card(plans.frontDoor!, 'rooms', 'person')
    expect(person.split('\n')[0]).toContain('from outside, a door leads into Bedroom 2.')
    const bedroom = person.slice(person.indexOf('\nBedroom 2:'))
    expect(bedroom).toContain('  Door 0.55 to outside, N side,')
    expect(person).toContain('door sills at the floor, except the door from outside into Bedroom 2 at 0.18 m')
    const agent = card(plans.frontDoor!, 'rooms', 'agent')
    expect(agent).toMatch(/^bed2 "Bedroom 2" bedroom .*door-entrance d0\.55>OUT N /m)
    expect(card(plans.frontDoor!, 'walls', 'agent')).toContain('door-entrance d 3.45+0.55 bed2 ')
  })

  it('AU2-5: both bathrooms open only off the study', () => {
    const person = card(plans.study!, 'rooms', 'person')
    const section = (name: string): string[] => {
      const lines = person.split('\n')
      const start = lines.findIndex((line) => line.startsWith(`${name}:`))
      const end = lines.findIndex((line, i) => i > start && !line.startsWith('  '))
      return lines.slice(start + 1, end).filter((line) => line.startsWith('  Door') || line.startsWith('  Opening'))
    }
    expect(section('Bathroom')).toEqual(['  Door 0.7 to Study, N side, 0.25 from W corner, 2.35 from E.'])
    expect(section('Bathroom 2')).toEqual(['  Door 0.7 to Study, W side, 1.35 from S corner, 0.35 from N.'])
    const agent = card(plans.study!, 'rooms', 'agent')
    expect(agent).toMatch(/^bath "Bathroom" bathroom .*\| win-bath w0\.6 E S0\.45\/N0\.55; door-bath d0\.7>bed2 N /m)
    expect(agent).toMatch(/^bath2 "Bathroom 2" bathroom .*door-bath2 d0\.7>bed2 W /m)
  })
})

describe("a person's form", () => {
  it.each(Object.keys(plans))('%s: no length a person reads holds an id', (name) => {
    const { plan, tokens } = withTokenIds(plans[name]!)
    for (const length of DESCRIBE_LENGTHS) {
      const text = card(plan, length, 'person')
      for (const token of tokens) expect(text).not.toContain(token)
    }
    // The agent's card does carry them: the ids were really there to leak.
    const agent = card(plan, 'rooms', 'agent')
    for (const room of plan.rooms) expect(agent).toContain(room.id)
  })

  it('a floor the plan does not name is not called by its id', () => {
    const plan: FloorPlan = {
      ...plans.flat!,
      walls: plans.flat!.walls.map((wall) => ({ ...wall, floor: 'qzxfloorvj' })),
      rooms: plans.flat!.rooms.map((room) => ({ ...room, floor: 'qzxfloorvj' })),
    }
    const text = card(plan, 'walls', 'person')
    expect(text).not.toContain('qzxfloorvj')
    expect(text).toContain('Unnamed floor 1: 5 rooms')
  })
})

describe('what a card says and never says', () => {
  // MSG-3: the label leads every description (`describePlan`); the card itself says it checks nothing.
  it.each(Object.keys(plans))('%s: every card says it checks nothing, and no plan complies', (name) => {
    for (const audience of ['person', 'agent'] as const) {
      for (const length of DESCRIBE_LENGTHS) {
        const text = card(plans[name]!, length, audience)
        if (length !== 'line') expect(text).toMatch(audience === 'person' ? /checks nothing: grid check runs the checks\.\n$/ : /CHECKS none here: grid check\.\n$/)
        expect(text).not.toMatch(/\b(compl(y|ies|iant|iance)|approved|passes)\b/i)
      }
    }
  })

  it('says what the plan cannot say', () => {
    expect(card(plans.flat!, 'rooms', 'person')).toContain('Not in the plan: where north is and what kind of building it is.')
    // LVL-3: the block's six stair rooms lie one over the other, so its floors are joined.
    const block = card(plans.block!, 'rooms', 'person')
    expect(block).toContain('Not in the plan: where north is, what kind of building it is and which rooms make up each flat or home.')
    expect(block).toContain('Stairs: the stair rooms lie one over the other from Ground floor to Floor 5.')
    expect(block).toContain('which rooms make up each flat or home')
    expect(card(plans.block!, 'rooms', 'agent')).toContain('NOT IN PLAN north; kind of building; which rooms make each flat')
    expect(card(plans.block!, 'rooms', 'agent')).toContain('STAIRS stair rooms ground->L1->L2->L3->L4->L5')
  })

  it('leaves out the unsaid line when nothing is unsaid, in every length (VEW-40)', () => {
    const said: FloorPlan = { ...plans.flat!, north: 0, building: 'home' }
    expect(planFacts(said).northStated).toBe(true)
    for (const audience of ['person', 'agent'] as const) {
      for (const length of DESCRIBE_LENGTHS) {
        const text = card(said, length, audience)
        expect(text).not.toMatch(/not in the plan|NOT IN PLAN/i)
        expect(text).not.toMatch(/: \.$/m)
      }
    }
    expect(card(plans.flat!, 'rooms', 'person')).toContain('Not in the plan:')
    expect(card(plans.flat!, 'rooms', 'agent')).toContain('NOT IN PLAN')
  })

  it('says the stairs a plan states, with what Grid works out, and the floors no stair joins (LVL-3)', () => {
    expect(card(twoFloorHouse(), 'rooms', 'person')).toContain('how its floors connect (no stair joins them)')
    expect(card(twoFloorHouse(), 'rooms', 'agent')).toContain('how floors connect (no stair joins ground first)')
    const person = card(stairHouse(), 'rooms', 'person')
    expect(person).not.toContain('how its floors connect')
    expect(person).toContain('Stairs: "Main stair" from Ground floor up to First floor, 14 risers of 0.21 m, going 0.22 m, 0.9 m wide.')
    expect(card(stairHouse(), 'rooms', 'agent')).toContain('STAIRS s1 ground->first 14x0.21 going 0.22 width 0.9')
  })

  it('puts wall and sill heights in one line of exceptions', () => {
    const block = card(plans.block!, 'rooms', 'person')
    expect(block.split('\n').filter((line) => line.startsWith('Heights: '))).toEqual([
      'Heights: walls 2.8 m high, except 3.5 m on Ground floor; window sills 0.9 m, except 6 windows on Ground floor at 0.3 m and 4 windows on Floor 1 at 1 m; door sills at the floor.',
    ])
    expect(card(plans.block!, 'walls', 'agent')).toContain('HEIGHTS walls 2.8, ground 3.5; window sills 0.9 except 6 on ground 0.3, 4 on L1 1; door sills 0\n')
    expect(card(plans.frontDoor!, 'rooms', 'agent')).toContain('HEIGHTS walls 2.6; window sills 0.9 except win-living-south 0.6, win-kitchen 1, win-bath 1.4; door sills 0 except door-entrance 0.18\n')
  })

  it('counts bedrooms only by the use a room states', () => {
    expect(card(plans.flat!, 'line', 'person')).toBe('A plan of one floor with 5 rooms (none says what it is for), 68.8 m² inside; from outside, a door leads into Living room.\n')
    expect(card(plans.frontDoor!, 'line', 'person')).toContain('with 6 rooms (2 bedrooms, 1 bathroom)')
  })
})
