/** ARE-68: plans for the lettable area, the core, efficiency, frontage zones and the area as written. */
const wall = (id: string, start: number[], end: number[], floor: string, kind = 'exterior', thickness = 0.2) => ({ id: `${floor}-${id}`, start, end, thickness, height: 3, kind, floor })

/**
 * Two floors of a 12 × 6 m plate on 0.2 m outer walls and 0.1 m inner ones: a main room (x 0 to 8,
 * retail on the ground floor and office above), a corridor (8 to 9), and the core, a lift (9 to 12,
 * y 0 to 2), a stair (y 2 to 4) and plant (y 4 to 6), the lift and stair one over the other.
 */
export function towerPlan(options: { mainTenure?: string; corridorTenure?: string } = {}): unknown {
  const floors = [{ id: 'g', name: 'Ground', level: 0 }, { id: 'f1', name: 'First', level: 1 }]
  const walls = floors.flatMap(({ id: f }) => [
    wall('s1', [0, 0], [8, 0], f), wall('s2', [8, 0], [9, 0], f), wall('s3', [9, 0], [12, 0], f),
    wall('e1', [12, 0], [12, 2], f), wall('e2', [12, 2], [12, 4], f), wall('e3', [12, 4], [12, 6], f),
    wall('n3', [12, 6], [9, 6], f), wall('n2', [9, 6], [8, 6], f), wall('n1', [8, 6], [0, 6], f),
    wall('w', [0, 6], [0, 0], f),
    wall('x8', [8, 0], [8, 6], f, 'interior', 0.1),
    wall('x9a', [9, 0], [9, 2], f, 'interior', 0.1), wall('x9b', [9, 2], [9, 4], f, 'interior', 0.1), wall('x9c', [9, 4], [9, 6], f, 'interior', 0.1),
    wall('y2', [9, 2], [12, 2], f, 'interior', 0.1), wall('y4', [9, 4], [12, 4], f, 'interior', 0.1),
  ])
  const rooms = floors.flatMap(({ id: f }) => [
    { id: `${f}-main`, name: f === 'g' ? 'Shop' : 'Office', use: f === 'g' ? 'retail' : 'office', floor: f, boundary: [`${f}-s1`, `${f}-x8`, `${f}-n1`, `${f}-w`], ...(options.mainTenure ? { tenure: options.mainTenure } : {}) },
    { id: `${f}-corridor`, name: 'Corridor', use: 'corridor', floor: f, boundary: [`${f}-s2`, `${f}-x9a`, `${f}-x9b`, `${f}-x9c`, `${f}-n2`, `${f}-x8`], ...(options.corridorTenure ? { tenure: options.corridorTenure } : {}) },
    { id: `${f}-lift`, name: 'Lift', use: 'lift', floor: f, boundary: [`${f}-s3`, `${f}-e1`, `${f}-y2`, `${f}-x9a`] },
    { id: `${f}-stair`, name: 'Stair', use: 'stair', floor: f, boundary: [`${f}-y2`, `${f}-e2`, `${f}-y4`, `${f}-x9b`] },
    { id: `${f}-plant`, name: 'Plant', use: 'plant', floor: f, boundary: [`${f}-y4`, `${f}-e3`, `${f}-n3`, `${f}-x9c`] },
  ])
  const door = (id: string, w: string, offset: number) => ({ id, wall: w, type: 'door', offset, width: 0.9, height: 2.1 })
  const openings = floors.flatMap(({ id: f }) => [door(`${f}-d1`, `${f}-x8`, 2), door(`${f}-d2`, `${f}-x9b`, 0.5)])
  openings.push(door('front', 'g-s1', 3))
  return { version: '1', units: 'm', floors, walls, rooms, openings }
}

/**
 * A shop 6 m wide and 20 m deep inside, on 0.2 m walls (centre lines 0 to 6.2 and 0 to 20.2), its
 * front on the south wall with a 3 m glazed door, and a 0.9 m door at the back.
 */
export function shopPlan(): unknown {
  const w = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 3, kind: 'exterior' })
  return {
    version: '1',
    units: 'm',
    walls: [w('south', [0, 0], [6.2, 0]), w('east', [6.2, 0], [6.2, 20.2]), w('north', [6.2, 20.2], [0, 20.2]), w('west', [0, 20.2], [0, 0])],
    rooms: [{ id: 'shop', name: 'Shop', use: 'retail', boundary: ['south', 'east', 'north', 'west'] }],
    openings: [
      { id: 'front', wall: 'south', type: 'door', offset: 1.5, width: 3, height: 2.4 },
      { id: 'back', wall: 'north', type: 'door', offset: 1, width: 0.9, height: 2.1 },
    ],
  }
}
