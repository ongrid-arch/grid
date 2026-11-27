import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { bench } from './replay/harness'

/**
 * CMD-49: a curved side is one side, and a room turned on the drawing has its own sides, in
 * grid_measure and grid_describe: a round room 35.4 m across, the half band round it, a studio
 * turned 7 degrees and a hall with a bowed east side, written from rooms text.
 */
const TEXT =
  'plan "Curves"\n' +
  'room pav "Pavilion" - circle 35.4 at 20,20\n' +
  'room ring "Ring" - band 17.8 to 21 from 0 sweep 180 at 20,20\n' +
  'room st "Studio" - polygon 50,0 54.963,0.609 54.598,3.587 49.634,2.977\n' +
  'room hall "Hall" - 10 x 6 at 70,0\n' +
  'wall hall east curve radius 4 0.4 exterior\n' +
  'door d1 in pav south, centred, 1 wide\n'

describe('a curved or angled side read as one side (CMD-49)', () => {
  const written = compileRoomsText(TEXT)
  const b = bench({ 'plan.json': written.plan })
  afterAll(() => b.close())
  const measure = async (room: string) => b.call('grid_measure', { plan: 'plan.json', what: 'room', room })

  it('writes the plan', () => {
    expect(written.problems).toEqual([])
  })

  it('measures a round room by its curve, not by the 144 pieces it is traced by', async () => {
    const reply = await measure('pav')
    expect(reply.text).toContain('"Pavilion": round, 35.40 m across')
    expect(reply.text).toContain('perimeter 111.21 m')
    // Half of it on the wall to the band and half on the outside wall: one curved side on each.
    const sides = (reply.data!['answer'] as { sides: { curve: { radius: number; sweep: number } | null; wall: string | null; length: number }[] }).sides
    expect(sides).toHaveLength(2)
    expect(sides.every((side) => side.curve !== null && Math.abs(side.curve.radius - 17.7) < 0.005 && side.wall !== null)).toBe(true)
    expect(sides.reduce((sum, side) => sum + side.length, 0)).toBeCloseTo(Math.PI * 35.4, 2)
    expect(reply.text).toMatch(/Sides, going round: [NS] a curved side, radius 17\.70 m, 5\d\.\d\d m long, [NS] a curved side, radius 17\.70 m, 5\d\.\d\d m long\./)
  })

  it('says a round room on one wall is one curved side all the way round', async () => {
    const alone = bench({ 'plan.json': compileRoomsText('room pav "Pavilion" - circle 35.4 at 20,20\n').plan })
    try {
      const reply = await alone.call('grid_measure', { plan: 'plan.json', what: 'room', room: 'pav' })
      expect(reply.text).toContain('Sides, going round: a curved side all the way round, radius 17.70 m, 111.21 m long.')
    } finally {
      alone.close()
    }
  })

  it('measures a band by its length along its middle and its width, its two curves one side each', async () => {
    const reply = await measure('ring')
    expect(reply.text).toContain('"Ring": a curved band 60.95 m long along its middle and 3.20 m wide')
    expect(reply.text).toContain('Sides, going round: S 3.20 m, S a curved side, radius 17.80 m, 55.92 m long, S 3.20 m, N a curved side, radius 21.00 m, 65.97 m long.')
  })

  it('gives a studio turned 7 degrees its own sides, not the box round it', async () => {
    const reply = await measure('st')
    expect(reply.text).toContain('"Studio": 5.00 m × 3.00 m, turned 7° on the drawing')
    expect(reply.text).not.toContain('up the drawing at most')
  })

  it('lists a bowed side as one curve beside the straight sides', async () => {
    const reply = await measure('hall')
    expect(reply.text).toContain('Sides, going round: E a curved side, radius 4.00 m, 6.78 m long, N 10.00 m, W 6.00 m, S 10.00 m.')
  })

  it('describes each room by its shape, with the unit on every length', async () => {
    const person = (await b.call('grid_describe', { plan: 'plan.json', for: 'person' })).text
    expect(person).toContain('Pavilion: round, 35.4 m across, 984.2 m²')
    expect(person).toContain('Ring: a curved band, 60.95 m long along its middle and 3.2 m wide, 195.0 m²')
    expect(person).toContain('Studio: 5 m × 3 m, turned 7° on the drawing, 15.0 m²')
    expect(person).toContain('Hall: not a rectangle, 11.35 × 6 at its widest, with a curved side of radius 4 m, 6.78 m long, 65.6 m²')
    const agent = (await b.call('grid_describe', { plan: 'plan.json', for: 'agent' })).text
    expect(agent).toContain('pav "Pavilion" - ~35.4x35.4 round:35.4 @')
    expect(agent).toContain('ring "Ring" - ~42x21 band:60.95x3.2 @')
    expect(agent).toContain('st "Studio" - ~5.33x3.59 turned:7:5x3 @')
    expect(agent).toContain('hall "Hall" - ~11.35x6 curves:r4/6.78 @')
  })

  it('walks into a round room and says it is round', async () => {
    const person = (await b.call('grid_describe', { plan: 'plan.json', for: 'person', length: 'walk' })).text
    expect(person).toContain('1. Pavilion, in from outside through a door 1 m wide. Facing N; it is round, 35.4 m across, 984.2 m².')
    const agent = (await b.call('grid_describe', { plan: 'plan.json', for: 'agent', length: 'walk' })).text
    expect(agent).toContain('1 pav <OUT d1 d1 | N 35.4x35.39 round:35.4 984.16 |')
  })
})
