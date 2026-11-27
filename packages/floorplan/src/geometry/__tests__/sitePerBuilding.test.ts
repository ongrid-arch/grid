/**
 * CNT-56: a site of several buildings measured per building. A house, a garden studio behind it
 * and a garage beside it, each on its own floor and named as its own building, on a 40 × 30 m
 * plot. A face's tape, square to it, stops at the first other building in front of it; the
 * site's edges name the building nearest them; the buildings are measured apart; a round face is
 * one face.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../../rooms/compile'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan } from '../plan'
import { siteMeasures } from '../site'

const written = (text: string, buildings?: { id: string; name: string; floors: string[] }[]): FloorPlan => {
  const made = compileRoomsText(text)
  expect(made.problems).toEqual([])
  return parseFloorPlan({ ...(made.plan as object), ...(buildings === undefined ? {} : { buildings }) })
}

const GROUP = `plan "Garden"
plot 40 x 30 at 0,0
floor house "House" level 0
room liv "Living" living 10 x 8 at 5,4
door d1 in liv south, centred, 0.9 wide
floor studio "Studio" level 0
room stu "Studio" office 4 x 4 at 8,20
door d2 in stu south, centred, 0.9 wide
floor garage "Garage" level 0
room gar "Garage" garage 4 x 5 at 26,4
door d3 in gar south, centred, 0.9 wide
`

const named = (rest = false): FloorPlan =>
  written(GROUP, [
    { id: 'house', name: 'House', floors: ['house'] },
    ...(rest ? [] : [{ id: 'studio', name: 'Studio', floors: ['studio'] }]),
    { id: 'garage', name: 'Garage', floors: ['garage'] },
  ])

describe('CNT-56 the site measured per building', () => {
  it("stops a face's tape at the first building in front of it, and names it", () => {
    const site = siteMeasures(named())
    const house = site.buildings!.find((b) => b.id === 'house')!
    const north = house.faces.filter((f) => f.faces === 'north')
    expect(north).toHaveLength(1)
    const back = north[0]!
    // The studio stands in front of the house's north face, so the tape stops at it.
    expect(back.stops).toBe('building')
    expect(back.at).toBe('studio')
    expect(back.building).toBe('house')
    const studio = site.buildings!.find((b) => b.id === 'studio')!
    const studioSouth = studio.faces.find((f) => f.faces === 'south')!
    expect(back.distance).toBeLessThan(back.toEdge!)
    expect(back.distance).toBeCloseTo(studioSouth.from.y - back.from.y, 6)
    // A face with nothing in front reaches its edge.
    const front = house.faces.find((f) => f.faces === 'south')!
    expect(front.stops).toBe('edge')
    expect(front.at).toBeNull()
    expect(front.distance).toBeCloseTo(front.toEdge!, 9)
    // The studio's own back face reaches the north edge, past nothing.
    expect(studio.faces.find((f) => f.faces === 'north')!.stops).toBe('edge')
  })

  it("gives the site the buildings' own faces, and names the building nearest each edge", () => {
    const site = siteMeasures(named())
    expect(site.faces.map((f) => f.building)).toEqual([...new Array(4).fill('house'), ...new Array(4).fill('studio'), ...new Array(4).fill('garage')])
    const byEdge = new Map(site.edges.map((e) => [e.edge.faces, e]))
    expect(byEdge.get('north')!.building).toBe('studio')
    expect(byEdge.get('east')!.building).toBe('garage')
    expect(byEdge.get('west')!.building).toBe('house')
    expect(site.buildings!.every((b) => b.coverage !== null && b.covered !== null)).toBe(true)
  })

  it('measures each pair of buildings apart', () => {
    const site = siteMeasures(named())
    expect(site.apart!.map((p) => [p.a, p.b])).toEqual([['house', 'studio'], ['house', 'garage'], ['studio', 'garage']])
    const houseStudio = site.apart![0]!.distance
    const back = site.buildings![0]!.faces.find((f) => f.faces === 'north')!
    expect(houseStudio).toBeCloseTo(back.distance, 6)
    for (const p of site.apart!) expect(p.distance).toBeGreaterThan(0)
  })

  it('measures the floors in no building as one more building', () => {
    const site = siteMeasures(named(true))
    expect(site.buildings!.map((b) => [b.id, b.rest ?? false])).toEqual([['house', false], ['garage', false], ['', true]])
    expect(site.buildings![2]!.name).toBe('the floors in no building')
    expect(site.buildings![0]!.faces.find((f) => f.faces === 'north')!.at).toBe('')
  })

  it("reports a round building's face once, with its radius", () => {
    const site = siteMeasures(written('plan "Tower"\nplot 40 x 40 at 0,0\nroom pav "Pavilion" - circle 12 at 20,20\ndoor d1 in pav south, centred, 0.9 wide\n'))
    expect(site.faces).toHaveLength(1)
    const face = site.faces[0]!
    expect(face.curve).toMatchObject({ closed: true })
    expect(face.curve!.radius).toBeGreaterThan(6)
    expect(face.curve!.radius).toBeLessThan(6.5)
    // The tower's nearest point is its outside face's radius from each edge.
    expect(face.distance).toBeCloseTo(20 - face.curve!.radius, 1)
  })

  it('reports a bay on a curved side once, between its straight faces', () => {
    const site = siteMeasures(written('plan "Bay"\nplot 40 x 30 at 0,0\nroom hall "Hall" - 10 x 6 at 10,10\nwall hall east curve radius 4 0.3 exterior\ndoor d1 in hall south, centred, 0.9 wide\n'))
    const curved = site.faces.filter((f) => f.curve !== null)
    expect(curved).toHaveLength(1)
    const bay = curved[0]!
    expect(bay.curve!.closed).toBe(false)
    expect(bay.faces).toBe('east')
    expect(new Set([bay.curve!.from, bay.curve!.to])).not.toEqual(new Set(['east']))
    // The other three sides are straight faces, one each.
    expect(site.faces.filter((f) => f.curve === null).map((f) => f.faces).sort()).toEqual(['north', 'south', 'west'])
  })

  it('reads a plan that names no building as before', () => {
    const site = siteMeasures(written(GROUP))
    expect(site.buildings).toBeUndefined()
    expect(site.apart).toBeUndefined()
    expect(site.faces.every((f) => f.building === undefined && f.curve === null)).toBe(true)
  })
})
