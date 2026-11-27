/**
 * CNT-51: `setFinishes`, the change behind grid_set_finishes, and what the take-off and the
 * finishes schedule then measure: many rooms in one call, all rooms but the wet ones, a band
 * behind the kitchen run less the window in it, a band all round, a feature wall, no skirting.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { planFinishes } from '../../quantities/finishes'
import { askPlan, select } from '../../quantities/query'
import { surveyPlan } from '../../quantities/survey'
import { planTakeoff } from '../../quantities/takeoff'
import { planAfter } from '../after'
import { setFinishes, type FinishesRequest } from '../finishes'
import { EditRefused } from '../refused'

const TEXT = [
  'walls outside 0.3 inside 0.1 height 2.5',
  'room kitchen "Kitchen" kitchen 4 x 3',
  'room bath "Bathroom" bathroom 2 x 3 east of kitchen',
  'room bed "Bedroom" bedroom 3 x 3 east of bath',
  'room plant "Plant" plant 2 x 3 east of bed',
  'door d1 between kitchen and bath, centred, 0.8 wide, opens into bath',
  'door d2 between bath and bed, centred, 0.8 wide, opens into bed',
  'door d3 between bed and plant, centred, 0.8 wide, opens into plant',
  'door front in kitchen south, centred, 0.9 wide, opens in',
  'window w1 in kitchen north, centred, 1 wide, sill 1.1, height 1',
  'item k-run kitchen-run-2400 in kitchen against north',
  '',
].join('\n')

function base(): FloorPlan {
  const result = compileRoomsText(TEXT)
  expect(result.problems).toEqual([])
  return parseFloorPlan(JSON.parse(JSON.stringify(result.plan)))
}

function after(plan: FloorPlan, request: FinishesRequest): { plan: FloorPlan; said: readonly string[] } {
  const patch = setFinishes(surveyPlan(plan), request)
  return { plan: parseFloorPlan(JSON.parse(JSON.stringify(planAfter(plan, patch)))), said: patch.said }
}

const near = (a: number, b: number): void => expect(Math.abs(a - b)).toBeLessThan(1e-6)

describe('setFinishes (CNT-51)', () => {
  it('finishes every room but the wet ones in one call', () => {
    const { plan, said } = after(base(), { rooms: ['all'], except: ['wet'], surfaces: { floor: 'Oak boards', walls: 'Painted plaster' } })
    const floors = Object.fromEntries(plan.rooms.map((r) => [r.id, r.finishes?.floor ?? null]))
    expect(floors).toEqual({ kitchen: 'Oak boards', bath: null, bed: 'Oak boards', plant: 'Oak boards' })
    expect(said.join('\n')).toMatch(/floor finish is "Oak boards" now in/)
  })

  it('picks rooms by use, and keeps a room left out by id', () => {
    const { plan } = after(base(), { uses: ['bathroom', 'kitchen'], except: ['kitchen'], surfaces: { floor: 'Porcelain tile' } })
    expect(plan.rooms.filter((r) => r.finishes !== undefined).map((r) => r.id)).toEqual(['bath'])
  })

  it('measures a splashback behind the kitchen run as its back times its height, less the window in it', () => {
    const { plan, said } = after(base(), { rooms: ['kitchen'], surfaces: { walls: 'Painted plaster' }, band: { finish: 'Ceramic tile', height: 0.6, behind: 'k-run' } })
    expect(plan.rooms.find((r) => r.id === 'kitchen')!.finishes!.bands).toEqual([{ finish: 'Ceramic tile', height: 0.6, behind: 'k-run' }])
    // 2.4 m of back, from the run's top at 0.9 m to 1.5 m, less the window's 1 m from its sill at 1.1 m.
    const expected = 2.4 * 0.6 - 1 * 0.4
    expect(said.join('\n')).toMatch(/band of "Ceramic tile" from 0\.90 m to 1\.50 m above the floor, behind "k-run", 2\.40 m long: 1\.04 m²/)
    const survey = surveyPlan(plan)
    const finishes = planFinishes(survey)
    const kitchen = finishes.rows.find((r) => r.id === 'kitchen')!
    expect(kitchen.bands).toHaveLength(1)
    near(kitchen.bands[0]!.area, expected)
    // The walls shares add up to the take-off's wall face: the band comes off the plaster.
    const wallFace = planTakeoff(survey).rooms.find((r) => r.id === 'kitchen')!.wallFace
    near(kitchen.surfaces.walls.quantity + kitchen.bands[0]!.area, wallFace)
    const tile = finishes.totals.find((t) => t.surface === 'walls' && t.finish === 'Ceramic tile')!
    near(tile.quantity, expected)
  })

  it('lays a band all round a room and a feature wall, each off the walls finish', () => {
    const tiled = after(base(), { rooms: ['bath'], surfaces: { walls: 'Paint' }, band: { finish: 'Porcelain tile', height: 1.2 } }).plan
    const bed = after(tiled, { rooms: ['bed'], surfaces: { walls: 'Paint' }, faces: [{ wall: (() => { const s = surveyPlan(tiled).rooms.find((r) => r.facts.id === 'bed')!; return s.edges.find((e) => e.wall !== null && e.wall.virtual !== true)!.wall!.id })(), finish: 'Feature green' }] }).plan
    const survey = surveyPlan(bed)
    const rows = planFinishes(survey).rows
    const takeoff = planTakeoff(survey).rooms
    for (const id of ['bath', 'bed']) {
      const row = rows.find((r) => r.id === id)!
      const apart = row.bands.reduce((sum, b) => sum + b.area, 0) + row.faces.reduce((sum, f) => sum + f.area, 0)
      expect(apart).toBeGreaterThan(0)
      near(row.surfaces.walls.quantity + apart, takeoff.find((t) => t.id === id)!.wallFace)
    }
  })

  it('measures no skirting where a room has none, in the take-off and the schedule', () => {
    const before = planTakeoff(surveyPlan(base())).rooms.find((r) => r.id === 'plant')!.skirting
    expect(before).toBeGreaterThan(0)
    const { plan, said } = after(base(), { rooms: ['plant'], surfaces: { skirting: 'none' } })
    expect(plan.rooms.find((r) => r.id === 'plant')!.finishes).toEqual({ skirting: false })
    expect(said.join('\n')).toMatch(/no skirting now, and none is measured/)
    const survey = surveyPlan(plan)
    expect(planTakeoff(survey).rooms.find((r) => r.id === 'plant')!.skirting).toBe(0)
    const row = planFinishes(survey).rows.find((r) => r.id === 'plant')!
    expect(row.noSkirting).toBe(true)
    expect(row.surfaces.skirting.quantity).toBe(0)
  })

  it('takes a finish out with unset, and keeps the bands when another surface changes', () => {
    const banded = after(base(), { rooms: ['kitchen'], surfaces: { floor: 'Tile' }, band: { finish: 'Ceramic tile', height: 0.6, behind: 'k-run' } }).plan
    const { plan } = after(banded, { rooms: ['kitchen'], surfaces: { floor: 'unset' } })
    expect(plan.rooms.find((r) => r.id === 'kitchen')!.finishes).toEqual({ bands: [{ finish: 'Ceramic tile', height: 0.6, behind: 'k-run' }] })
    const cleared = after(plan, { rooms: ['kitchen'], clearBands: true }).plan
    expect(cleared.rooms.find((r) => r.id === 'kitchen')!.finishes).toBeUndefined()
  })

  it('lets grid_find ask by finish', () => {
    const { plan } = after(base(), { rooms: ['all'], except: ['wet'], surfaces: { floor: 'Oak boards', skirting: 'none' } })
    const asked = askPlan(surveyPlan(plan))
    expect(select(asked, { kinds: ['room'], where: ['floor finish = oak boards'] }).map((p) => p.id)).toEqual(['bed', 'kitchen', 'plant'])
    expect(select(asked, { kinds: ['room'], where: ['skirting finish = none'] }).map((p) => p.id)).toEqual(['bed', 'kitchen', 'plant'])
  })

  it('refuses what it cannot do, saying why', () => {
    const plan = base()
    const survey = surveyPlan(plan)
    const refused = (request: FinishesRequest): string => {
      try {
        setFinishes(survey, request)
      } catch (error) {
        expect(error).toBeInstanceOf(EditRefused)
        return (error as Error).message
      }
      throw new Error('not refused')
    }
    expect(refused({ surfaces: { floor: 'Oak' } })).toMatch(/Name the rooms/)
    expect(refused({ rooms: ['kitchn'], surfaces: { floor: 'Oak' } })).toMatch(/Did you mean "kitchen"\?/)
    expect(refused({ rooms: ['kitchen'] })).toMatch(/Pass a finish/)
    expect(refused({ rooms: ['kitchen'], surfaces: { floor: 'none' } })).toMatch(/none is for skirting only/)
    expect(refused({ rooms: ['kitchen'], except: ['dry'], surfaces: { floor: 'Oak' } })).toMatch(/not a room's id, a room use or wet/)
    expect(refused({ rooms: ['bath'], band: { finish: 'Tile', height: 0.6, behind: 'k-run' } })).toMatch(/does not stand with its back against/)
    expect(refused({ rooms: ['kitchen'], band: { finish: 'Tile', height: 0.6, behind: 'k-rn' } })).toMatch(/Did you mean "k-run"\?/)
    expect(refused({ rooms: ['bath'], except: ['bath'], surfaces: { floor: 'Oak' } })).toMatch(/No room is left/)
    const done = after(plan, { rooms: ['kitchen'], surfaces: { floor: 'Oak' } }).plan
    expect(() => setFinishes(surveyPlan(done), { rooms: ['kitchen'], surfaces: { floor: 'Oak' } })).toThrow(/nothing to change/)
  })
})
