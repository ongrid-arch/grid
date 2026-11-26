/** ARE-67: a plan with desks, chairs, a table and a sofa in two zones and a cafe, for the seat count's tests. */
const wall = (id: string, start: number[], end: number[], kind = 'exterior') => ({ id, start, end, thickness: 0.2, height: 2.7, kind })

/** A 10 × 6 m box: an open office (0 to 6) with two zones split at x = 3, and a cafe (6 to 10). */
export function seatingPlan(items: unknown[]): unknown {
  return {
    version: '1',
    units: 'm',
    walls: [
      wall('s1a', [0, 0], [3, 0]),
      wall('s1b', [3, 0], [6, 0]),
      wall('s2', [6, 0], [10, 0]),
      wall('e', [10, 0], [10, 6]),
      wall('n2', [10, 6], [6, 6]),
      wall('n1b', [6, 6], [3, 6]),
      wall('n1a', [3, 6], [0, 6]),
      wall('w', [0, 6], [0, 0]),
      wall('mid', [6, 0], [6, 6], 'interior'),
      { id: 'team-line', start: [3, 0], end: [3, 6], thickness: 0, height: 2.7, kind: 'interior', virtual: true },
    ],
    rooms: [
      { id: 'open', name: 'Open office', use: 'office', boundary: ['s1a', 's1b', 'mid', 'n1b', 'n1a', 'w'] },
      { id: 'team-a', name: 'Team A', use: 'office', partOf: 'open', boundary: ['s1a', 'team-line', 'n1a', 'w'] },
      { id: 'team-b', name: 'Team B', use: 'office', partOf: 'open', boundary: ['s1b', 'mid', 'n1b', 'team-line'] },
      { id: 'cafe', name: 'Cafe', use: 'dining', boundary: ['s2', 'e', 'n2', 'mid'] },
    ],
    openings: [
      { id: 'front', wall: 's1a', type: 'door', offset: 0.5, width: 0.9, height: 2.1 },
      { id: 'd', wall: 'mid', type: 'door', offset: 2.5, width: 0.9, height: 2.1 },
    ],
    items,
  }
}

const desk = (id: string, x: number, y: number) => ({ id, kind: 'desk', at: [x, y], size: [1.4, 0.7], height: 0.75 })
export const chair = (id: string, x: number, y: number) => ({ id, kind: 'chair', at: [x, y], size: [0.5, 0.5], height: 0.9 })

/** Three desks with chairs in team A, two in team B; in the cafe a table with four chairs, a sofa and a lone stool. */
export const SEATING_ITEMS = [
  desk('a1', 1, 1), chair('ca1', 1, 1.7),
  desk('a2', 1, 3), chair('ca2', 1, 3.7),
  desk('a3', 2, 5), chair('ca3', 2, 4.3),
  desk('b1', 4.5, 1), chair('cb1', 4.5, 1.7),
  desk('b2', 4.5, 3), chair('cb2', 4.5, 3.7),
  { id: 't1', kind: 'table', at: [8, 2], size: [1.2, 0.8], height: 0.75 },
  chair('t1-n', 8, 2.7), chair('t1-s', 8, 1.3), chair('t1-e', 8.9, 2), chair('t1-w', 7.1, 2),
  { id: 'sofa', kind: 'sofa', at: [8, 5.5], size: [1.8, 0.8], height: 0.8 },
  { id: 'stool', kind: 'stool', at: [9.5, 4.2], size: [0.4, 0.4], height: 0.7 },
]
