/**
 * The lab's five replayed conversations (homeowner, architect, estate agent, builder,
 * wheelchair user: 43 turns), answered with the real tools of `grid serve`.
 *
 * Marks follow the lab's replay rule: F when calls to the tools alone answer the turn, with no
 * code or arithmetic by the agent; S for a part answer, an answer the tool flags as a
 * stand-in, or one that still needs the agent's own script, arithmetic or hand-written plan;
 * N when nothing answers it. Each turn makes its calls and checks that the answer holds what
 * the person asked for, so a mark can't be claimed for a call that does not give it.
 *
 * The requests are the people's, said in our own words; the buildings are in `plans.ts`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './harness'
import { agentFlat, houseNow, optionA, optionB, optionC, twoBedFlat, twoBedFlatRefurbished } from './plans'

type Mark = 'F' | 'S' | 'N'

interface Turn {
  readonly who: string
  readonly n: number
  readonly asked: string
  readonly mark: Mark
  /** Why the mark, in a line: what answers it, or what is missing. */
  readonly why: string
  readonly run: (b: Bench) => Promise<void>
}

async function ok(b: Bench, tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, `${tool}: ${reply.text}`).toBe(false)
  return reply
}

const TURNS: Turn[] = [
  // 1. Homeowner, kitchen extension
  {
    who: 'homeowner', n: 1, asked: 'Go out 3 m at the back, full width.', mark: 'F', why: 'one grid_move_room_side call; the answer gives the kitchen 19.38 → 36.48 m²',
    run: async (b) => {
      const r = await ok(b, 'grid_move_room_side', { plan: 'now.json', room: 'kitchen', side: 'north', by: 3, out: 'extended.json' })
      expect(r.text).toContain('42.90 m² → 60.00 m²')
      expect((await ok(b, 'grid_compare', { plans: ['now.json', 'extended.json'] })).text).toContain('"Kitchen" 19.38 → 36.48')
    },
  },
  {
    who: 'homeowner', n: 2, asked: 'Will a 1.8 × 0.9 m table and six chairs fit?', mark: 'S', why: 'grid_measure fit says a 3.3 × 2.4 m box fits, but the agent adds the room for chairs itself and nothing is drawn',
    run: async (b) => {
      expect((await ok(b, 'grid_measure', { plan: 'extended.json', what: 'fit', room: 'kitchen', width: 3.3, depth: 2.4 })).text).toMatch(/fits in "Kitchen"/)
    },
  },
  {
    who: 'homeowner', n: 3, asked: 'Can I see it?', mark: 'F', why: 'grid_view plan and 3d from above return the pictures',
    run: async (b) => {
      expect((await ok(b, 'grid_view', { plan: 'extended.json', kind: 'plan' })).image).toBe(true)
      expect((await ok(b, 'grid_view', { plan: 'extended.json', kind: '3d', from: 'above' })).image).toBe(true)
    },
  },
  {
    who: 'homeowner', n: 4, asked: 'What are the dotted lines and numbers? Which side is the garden?', mark: 'N', why: 'no key on a drawing, and the plan holds no garden or north',
    run: async (b) => {
      expect((await ok(b, 'grid_view', { plan: 'extended.json', kind: 'plan' })).text).toMatch(/holds no real north/)
    },
  },
  {
    who: 'homeowner', n: 5, asked: 'Stand me in the kitchen looking at the garden.', mark: 'F', why: 'grid_view eye in the kitchen toward the back door',
    run: async (b) => {
      const r = await ok(b, 'grid_view', { plan: 'extended.json', kind: 'eye', room: 'kitchen', toward: 'back-door' })
      expect(r.image).toBe(true)
      expect(r.text).toContain('Standing in "Kitchen"')
    },
  },
  {
    who: 'homeowner', n: 6, asked: 'Bifold doors 4 m wide and a roof lantern.', mark: 'N', why: 'Grid has no bifold doors or roof windows; a 4 m opening is refused with the free stretches of the wall',
    run: async (b) => {
      const r = await b.call('grid_change_opening', { plan: 'extended.json', opening: 'back-door', width: 4 })
      expect(r.isError).toBe(true)
      expect(r.text).toMatch(/Free stretches/)
    },
  },
  {
    who: 'homeowner', n: 7, asked: 'How much bigger than now?', mark: 'F', why: 'grid_compare: net 42.90 → 60.00 m², +17.10',
    run: async (b) => {
      expect((await ok(b, 'grid_compare', { plans: ['now.json', 'extended.json'], labels: ['Now', 'Extended'] })).text).toContain('(+17.10)')
    },
  },
  {
    who: 'homeowner', n: 8, asked: 'Is it allowed?', mark: 'N', why: 'grid_check gives general guidance and never says a plan is allowed',
    run: async (b) => {
      expect((await ok(b, 'grid_check', { plan: 'extended.json' })).text).toContain('General guidance, not your local rules')
    },
  },
  {
    who: 'homeowner', n: 9, asked: 'A PDF with sizes for my builder.', mark: 'S', why: 'a PNG plan with inside sizes and a DXF; no PDF',
    run: async (b) => {
      expect((await ok(b, 'grid_view', { plan: 'extended.json', kind: 'plan' })).text).toContain('with inside sizes')
      expect((await ok(b, 'grid_export', { plan: 'extended.json', format: 'dxf' })).text).toContain('.dxf')
    },
  },

  // 2. Architect, three options
  {
    who: 'architect', n: 1, asked: '12 × 8 m, three bedrooms, three layouts.', mark: 'S', why: 'the agent writes the three plans by hand; grid_check and grid_describe only read them back',
    run: async (b) => {
      for (const plan of ['a.json', 'b.json', 'c.json']) {
        // MSG-1: one list; a plan drawn right has no line left out and none worth a look.
        expect((await ok(b, 'grid_check', { plan })).text).not.toMatch(/left out|worth a look|refused/)
        expect((await ok(b, 'grid_describe', { plan, length: 'line' })).text).toMatch(/3 bedrooms/)
      }
    },
  },
  {
    who: 'architect', n: 2, asked: 'Side by side on one sheet, same scale.', mark: 'F', why: 'grid_compare with picture: one sheet at one scale',
    run: async (b) => {
      const r = await ok(b, 'grid_compare', { plans: ['a.json', 'b.json', 'c.json'], picture: true })
      expect(r.image).toBe(true)
      expect(r.text).toMatch(/side by side, all at 1 m = /)
    },
  },
  {
    who: 'architect', n: 3, asked: 'Areas of each: total, living, bedrooms, circulation %, gross.', mark: 'F', why: 'grid_compare: one table with net, gross, circulation % and area by use',
    run: async (b) => {
      const r = await ok(b, 'grid_compare', { plans: ['a.json', 'b.json', 'c.json'] })
      for (const word of ['gross internal', 'circulation', 'of gross internal', 'bedroom', 'living']) expect(r.text).toContain(word)
    },
  },
  {
    who: 'architect', n: 4, asked: 'What differs between A and B?', mark: 'F', why: 'grid_compare: rooms by name, walls out and new, openings',
    run: async (b) => {
      const r = await ok(b, 'grid_compare', { plans: ['a.json', 'b.json'] })
      expect(r.text).toContain('"Living and kitchen" none → 36.96')
      expect(r.text).toContain('Walls out')
    },
  },
  {
    who: 'architect', n: 5, asked: 'A clean drawing: no inside dimensions, a title, a scale bar, north.', mark: 'S', why: 'grid_view draws without sizes; no title, scale bar or north',
    run: async (b) => {
      expect((await ok(b, 'grid_view', { plan: 'b.json', kind: 'plan', dimensions: false })).text).toContain('without sizes')
    },
  },
  {
    who: 'architect', n: 6, asked: 'B, but with A\'s separate kitchen.', mark: 'S', why: 'no call splits a room: the agent edits the plan by hand, then grid_compare says what changed',
    run: async (b) => {
      expect((await ok(b, 'grid_describe', { plan: 'b.json', for: 'agent' })).text.length).toBeGreaterThan(0)
    },
  },
  {
    who: 'architect', n: 7, asked: '3D of each from the garden, with a roof.', mark: 'F', why: 'grid_view 3d from the south of each, drawn with its roof',
    run: async (b) => {
      for (const plan of ['a.json', 'b.json', 'c.json']) {
        const text = (await ok(b, 'grid_view', { plan, kind: '3d', from: 'south' })).text
        expect(text).toContain('a flat roof over every part with nothing above it')
        expect(text).not.toContain('no roof')
      }
    },
  },
  {
    who: 'architect', n: 8, asked: 'PDF and DWG tonight.', mark: 'S', why: 'DXF, the nearest to DWG; no PDF',
    run: async (b) => {
      expect((await ok(b, 'grid_export', { plan: 'b.json', format: 'dxf' })).text).toContain('.dxf')
    },
  },

  // 3. Estate agent, marketing plan
  {
    who: 'estate agent', n: 1, asked: 'Lounge 4.60 × 3.60, bedroom 3.70 × 3.60, kitchen 3.00 × 2.40…', mark: 'S', why: 'the agent turns the room sizes into walls by hand; grid_areas confirms every size',
    run: async (b) => {
      const r = await ok(b, 'grid_areas', { plan: 'flat.json' })
      for (const size of ['"Lounge" (living): 4.60 m × 3.60 m', '"Kitchen" (kitchen): 3.00 m × 2.40 m']) expect(r.text).toContain(size)
    },
  },
  {
    who: 'estate agent', n: 2, asked: 'The lounge is on the right as you come in. Flip it.', mark: 'F', why: 'grid_mirror, and grid_compare says the flat was mirrored',
    run: async (b) => {
      await ok(b, 'grid_mirror', { plan: 'flat.json', how: 'left-right', out: 'flipped.json' })
      expect((await ok(b, 'grid_compare', { plans: ['flat.json', 'flipped.json'] })).text).toContain('mirrored left to right')
    },
  },
  {
    who: 'estate agent', n: 3, asked: 'Total in m² and sq ft, as gross internal area.', mark: 'F', why: 'grid_areas in feet: gross internal 660 sq ft (61.32 m²), rule stated',
    run: async (b) => {
      const r = await ok(b, 'grid_areas', { plan: 'flipped.json', units: 'ft' })
      expect(r.text).toContain('Gross internal: 660 sq ft (61.32 m²)')
      expect(r.text).toContain('Gross internal area is the floor inside the inside face of the walls that face outside')
      // ARE-9: asked for the UK, the inside face comes first and alone, its rule beside it.
      const gb = await ok(b, 'grid_areas', { plan: 'flipped.json', units: 'ft', country: 'GB' })
      expect(gb.text).toContain('Gross internal: 660 sq ft (61.32 m²)')
      expect(gb.text).not.toContain('Gross external:')
    },
  },
  {
    who: 'estate agent', n: 4, asked: 'Our logo, the address and the floor on it.', mark: 'N', why: 'nothing writes a title or a logo on a drawing',
    run: async () => {},
  },
  {
    who: 'estate agent', n: 5, asked: 'Sizes in feet and inches; no m² under the names.', mark: 'S', why: 'grid_areas lists every room in feet and inches; the drawing\'s labels stay in metres',
    run: async (b) => {
      expect((await ok(b, 'grid_areas', { plan: 'flipped.json', units: 'ft' })).text).toContain('15\'-1" × 11\'-10"')
    },
  },
  {
    who: 'estate agent', n: 6, asked: 'Show the bath, WC, units and the balcony.', mark: 'N', why: 'the plan holds no fixtures; the balcony can only be counted apart',
    run: async (b) => {
      expect((await ok(b, 'grid_areas', { plan: 'balcony.json', outside_rooms: ['balcony'] })).text).toContain('Outside, listed apart: 5.64 m²')
    },
  },
  {
    who: 'estate agent', n: 7, asked: 'Black and white, or our colours.', mark: 'F', why: 'grid_view look mono',
    run: async (b) => {
      const r = await ok(b, 'grid_view', { plan: 'flipped.json', kind: 'plan', look: 'mono' })
      expect(r.image).toBe(true)
      expect(r.text).toContain('mono')
    },
  },
  {
    who: 'estate agent', n: 8, asked: 'A JPG and an A4 PDF.', mark: 'S', why: 'a PNG only; the agent converts it',
    run: async (b) => {
      expect((await ok(b, 'grid_view', { plan: 'flipped.json', kind: 'plan' })).image).toBe(true)
    },
  },

  // 4. Builder, pricing a refurbishment
  {
    who: 'builder', n: 1, asked: 'Floor areas by room.', mark: 'F', why: 'grid_areas',
    run: async (b) => {
      expect((await ok(b, 'grid_areas', { plan: 'existing.json' })).text).toContain('"Living room" (living): 4.40 m × 4.20 m, 18.48 m²')
    },
  },
  {
    who: 'builder', n: 2, asked: 'Metres of wall, outside and partitions.', mark: 'F', why: 'grid_takeoff: wall lengths by kind, rule stated',
    run: async (b) => {
      const r = await ok(b, 'grid_takeoff', { plan: 'existing.json' })
      expect(r.text).toContain('exterior 33.60 m')
      expect(r.text).toContain('interior 24.30 m')
      expect(r.text).toContain('Wall length is the length of each solid wall along its centre line')
    },
  },
  {
    who: 'builder', n: 3, asked: 'Plaster area per room, less openings.', mark: 'F', why: 'grid_takeoff: wall face per room less openings',
    run: async (b) => {
      expect((await ok(b, 'grid_takeoff', { plan: 'existing.json' })).text).toMatch(/"Kitchen": .*wall face 32\.96 m²/)
    },
  },
  {
    who: 'builder', n: 4, asked: 'Ceilings.', mark: 'F', why: 'grid_takeoff: ceiling per room, rule stated',
    run: async (b) => {
      expect((await ok(b, 'grid_takeoff', { plan: 'existing.json' })).text).toContain('ceiling 62.65 m²')
    },
  },
  {
    who: 'builder', n: 5, asked: 'Doors and windows by size.', mark: 'F', why: 'grid_schedule: one schedule by type and size',
    run: async (b) => {
      const r = await ok(b, 'grid_schedule', { plan: 'existing.json' })
      expect(r.text).toContain('4 × door 0.80 m wide')
      expect(r.text).toContain('In all: 6 doors, 6 windows, 1 doorless openings.')
    },
  },
  {
    who: 'builder', n: 6, asked: 'Skirting.', mark: 'F', why: 'grid_takeoff: skirting per room less doors',
    run: async (b) => {
      expect((await ok(b, 'grid_takeoff', { plan: 'existing.json' })).text).toContain('skirting 66.70 m')
    },
  },
  {
    who: 'builder', n: 7, asked: 'Wall out, door blocked, bathroom door to 800: what comes out, what is new?', mark: 'F', why: 'grid_compare: the wall out with length and face area, openings out with sizes, the door 0.70 → 0.80',
    run: async (b) => {
      const r = await ok(b, 'grid_compare', { plans: ['existing.json', 'refurb.json'], labels: ['Existing', 'Refurbished'] })
      expect(r.text).toContain('"living-north" interior 4.60 m long, 2.60 m high (11.96 m² a side)')
      expect(r.text).toContain('door "door-kitchen" 0.80 × 2.10 m')
      expect(r.text).toContain('width 0.70 → 0.80 m')
    },
  },
  {
    who: 'builder', n: 8, asked: 'As a spreadsheet.', mark: 'F', why: 'grid_takeoff and grid_schedule as CSV',
    run: async (b) => {
      // MSG-3, VEW-83: the table's header is the first row; the label is the last, in one cell.
      expect((await ok(b, 'grid_takeoff', { plan: 'existing.json', format: 'csv' })).text).toMatch(/^row,what,floor m2[^]*\n"General guidance, not your local rules"\n$/)
      expect((await ok(b, 'grid_schedule', { plan: 'existing.json', format: 'csv' })).text).toMatch(/^type,id,width m[^]*\n"General guidance, not your local rules"\n$/)
    },
  },
  {
    who: 'builder', n: 9, asked: 'Mark demolition red and new work green.', mark: 'N', why: 'no colours for removed and new on a drawing',
    run: async () => {},
  },

  // 7. Wheelchair user
  {
    who: 'wheelchair user', n: 1, asked: 'Can I get in the front door? Any step?', mark: 'N', why: 'the plan holds no steps or thresholds',
    run: async () => {},
  },
  {
    who: 'wheelchair user', n: 2, asked: 'Which doors are under 80 cm clear?', mark: 'F', why: 'grid_measure narrow under 0.8: the bathroom door, 0.70 m, flagged as the hole not the clear width',
    run: async (b) => {
      const r = await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'narrow', under: 0.8 })
      expect(r.text).toContain('door "door-bath" 0.70 m')
      expect(r.text).toContain('the clear width past a door leaf is less')
    },
  },
  {
    who: 'wheelchair user', n: 3, asked: 'Can I turn in the hall and the bathroom?', mark: 'S', why: 'hall no (1.30 m); the bathroom holds 1.5 m only because the plan draws it empty',
    run: async (b) => {
      expect((await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'fit', room: 'hall', diameter: 1.5 })).text).toMatch(/does not fit.*1\.30 m across/)
      expect((await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'fit', room: 'bath', diameter: 1.5 })).text).toMatch(/fits/)
    },
  },
  {
    who: 'wheelchair user', n: 4, asked: 'Show me the bathroom larger, with the circle.', mark: 'S', why: 'the whole floor only; no crop and no circle drawn',
    run: async (b) => {
      expect((await ok(b, 'grid_view', { plan: 'wheel.json', kind: 'plan' })).image).toBe(true)
    },
  },
  {
    who: 'wheelchair user', n: 5, asked: 'Is the way to the bedroom and the bathroom wide enough all along?', mark: 'F', why: 'grid_measure route: every door passed and the narrowest, and each room\'s widest circle',
    run: async (b) => {
      const bed = await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'route', room: 'hall', to: 'bed1' })
      expect(bed.text).toContain('Narrowest door or opening on the way: "door-bed1", 0.80 m.')
      const bath = await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'route', room: 'hall', to: 'bath' })
      expect(bath.text).toContain('"Hall" 1.30 m')
    },
  },
  {
    who: 'wheelchair user', n: 6, asked: 'It says 0 notes, so the flat suits me?', mark: 'S', why: 'grid_check says nothing found is not suitable; her own figures go through grid_measure, which knows no fixtures',
    run: async (b) => {
      expect((await ok(b, 'grid_check', { plan: 'wheel.json' })).text).toContain('not that the plan meets any rule')
      expect((await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'narrow', under: 1.5 })).text).toContain('"Hall" 1.30 m')
    },
  },
  {
    who: 'wheelchair user', n: 7, asked: 'Bathroom door 90 cm, opening outwards?', mark: 'F', why: 'one grid_change_opening call; the answer says what changed and that it opens into the hall',
    run: async (b) => {
      const r = await ok(b, 'grid_change_opening', { plan: 'wheel.json', opening: 'door-bath', width: 0.9, opens_into: 'hall', out: 'wheel-door.json' })
      expect(r.text).toContain('width 0.70 → 0.90 m')
      expect(r.text).toContain('now opens into "Hall"')
    },
  },
  {
    who: 'wheelchair user', n: 8, asked: 'Can I see out sitting down?', mark: 'F', why: 'grid_view eye at 1.2 m in the living room, with every sill against the eye',
    run: async (b) => {
      const r = await ok(b, 'grid_view', { plan: 'wheel.json', kind: 'eye', room: 'living', eye_height: 1.2 })
      expect(r.image).toBe(true)
      expect(r.text).toContain('"win-living-south" sill 0.60')
    },
  },
  {
    who: 'wheelchair user', n: 9, asked: 'Knee space under the worktop, and 1.5 m in the kitchen?', mark: 'S', why: 'a 1.5 m circle fits the empty kitchen; no fixtures, so no knee space',
    run: async (b) => {
      expect((await ok(b, 'grid_measure', { plan: 'wheel.json', what: 'fit', room: 'kitchen', diameter: 1.5 })).text).toMatch(/fits/)
    },
  },
]

describe('the lab\'s five conversations, replayed against the real tools', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({
      'now.json': houseNow(),
      'a.json': optionA(),
      'b.json': optionB(),
      'c.json': optionC(),
      'flat.json': agentFlat(),
      'balcony.json': agentFlat(true),
      'existing.json': twoBedFlat(),
      'refurb.json': twoBedFlatRefurbished(),
      'wheel.json': twoBedFlat(),
    })
  })
  afterAll(() => b.close())

  it('has the 43 turns of the five conversations', () => {
    const per = (who: string): number => TURNS.filter((turn) => turn.who === who).length
    expect([per('homeowner'), per('architect'), per('estate agent'), per('builder'), per('wheelchair user')]).toEqual([9, 8, 8, 9, 9])
  })

  // In order: a later turn reads what an earlier one wrote, as in the conversation.
  for (const turn of TURNS) {
    it(`${turn.who} ${turn.n} (${turn.mark}): ${turn.asked}`, async () => {
      await turn.run(b)
    }, 30_000)
  }

  it('answers at least 21 of the 43 turns fully', () => {
    const count = (mark: Mark): number => TURNS.filter((turn) => turn.mark === mark).length
    // With the lab's own command the same turns scored 21 fully, 14 in part, 8 not at all.
    expect({ F: count('F'), S: count('S'), N: count('N') }).toEqual({ F: 23, S: 13, N: 7 })
    expect(count('F')).toBeGreaterThanOrEqual(21)
  })
})
