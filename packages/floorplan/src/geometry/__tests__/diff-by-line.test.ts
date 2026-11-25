/**
 * MSG-27: two versions compared wall by wall by where each wall stands along its line. A wall
 * made longer is the wall it was with a new stretch, under any id and however the versions cut
 * it; a wall cut back lost a stretch; a wall that left its line was taken out where it stood and
 * built where it stands, even under its own id. A room that took another in is drawn with its sum.
 *
 * The terraced house is invented here, written rooms first; the other plans are built in code.
 */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../../rooms/compile'
import { stampFor } from '../../rooms/stamp'
import { alignPlans, compareBuildings } from '../diff'
import { opening, plan, room, wall } from './diff-fixtures'

function written(text: string): FloorPlan {
  const result = compileRoomsText(text)
  expect(result.problems).toEqual([])
  const compiled = parseFloorPlan(result.plan)
  return { ...compiled, written: stampFor(compiled) }
}

const HEAD = 'plan "Terrace"\nwalls outside 0.3 inside 0.1 height 2.6\n\n'
const HOUSE = HEAD + [
  'room front "Front room" living 3.6 x 4.0 at 0,0',
  'room hall "Hall" corridor 1.2 x 4.0 east of front',
  'room kitchen "Kitchen" kitchen 4.8 x 3.0 south of front',
  'window w-back in kitchen south, 1.0 from west, 1.2 wide',
  'door d-back in kitchen south, 3.2 from west, 0.9 wide'
].join('\n') + '\n'

/** The kitchen taken 4 m further back, with a utility room and a WC beside it: the walls cut otherwise. */
const EXTENDED = HEAD + [
  'room front "Front room" living 3.6 x 4.0 at 0,0',
  'room hall "Hall" corridor 1.2 x 4.0 east of front',
  'room kitchen "Kitchen" kitchen 3.6 x 7.0 south of front',
  'room utility "Utility" utility 1.2 x 3.0 south of hall',
  'room wc "WC" wc 1.2 x 4.0 south of utility',
  'window w-back in kitchen south, 1.0 from west, 2.4 wide'
].join('\n') + '\n'

/** The same kitchen taken 4 m back, nothing else: its back wall keeps its id 4 m away. */
const DEEPER = HOUSE.replace('kitchen 4.8 x 3.0', 'kitchen 4.8 x 7.0')

describe('a wall made longer', () => {
  it('is the wall it was with a new stretch, under a new id and cut otherwise', () => {
    const before = written(HOUSE)
    const after = written(EXTENDED)
    const compared = compareBuildings(before, after)
    const { marks } = compared
    // The party wall and the wall between the front room and the hall stood where they stand:
    // each gained a stretch at the back, and neither is added or removed in full.
    expect(marks.added.walls).not.toContain('ext-east')
    expect(marks.added.walls).not.toContain('w-x3.65')
    expect(marks.removed.walls).not.toContain('w-front-hall')
    expect(marks.removed.walls).not.toContain('ext-east-2')
    expect(marks.changed.walls).toEqual([])
    const stretch = (id: string) => marks.stretches.filter((s) => s.wall === id).map((s) => ({ kind: s.kind, from: s.from.map((v) => +v.toFixed(2)), to: s.to.map((v) => +v.toFixed(2)) }))
    expect(stretch('ext-east')).toEqual([{ kind: 'added', from: [5.05, -7.35], to: [5.05, -0.05] }])
    expect(stretch('ext-west')).toEqual([{ kind: 'added', from: [-0.15, -3.25], to: [-0.15, -7.25] }])
    expect(stretch('w-x3.65')).toEqual([{ kind: 'added', from: [3.65, -7.25], to: [3.65, -0.05] }])
    // The old back wall stood elsewhere: it is gone, and the new back walls are new.
    expect(marks.removed.walls).toContain('ext-south')
    expect(marks.added.walls).toEqual(expect.arrayContaining(['ext-south-1', 'ext-south-2', 'w-utility-wc']))
    expect(compared.renamed.pairs).toEqual(expect.arrayContaining([
      { type: 'wall', before: 'ext-east-2', after: 'ext-east' },
      { type: 'wall', before: 'w-front-hall', after: 'w-x3.65' }
    ]))
  })

  it('is said to be extended, by how much, when its own id changed', () => {
    const before = plan({ walls: [wall('a', [0, 0], [6, 0], { kind: 'exterior' })] })
    const after = plan({ walls: [wall('b', [0, 0], [10, 0], { kind: 'exterior' })] })
    const compared = compareBuildings(before, after)
    expect(compared.changes.map((c) => c.text)).toEqual(['Wall "b" extended 4.00 m'])
    expect(compared.marks.stretches).toEqual([{ wall: 'b', kind: 'added', from: [6, 0], to: [10, 0], thickness: 0.2 }])
    expect(compared.marks.added.walls).toEqual([])
    expect(compared.marks.removed.walls).toEqual([])
  })

  it('cut back marks only the stretch it lost, whichever way it is drawn', () => {
    const before = plan({ walls: [wall('a', [0, 0], [6, 0])] })
    const after = plan({ walls: [wall('b', [4, 0], [0, 0])] })
    const compared = compareBuildings(before, after)
    expect(compared.marks.stretches).toEqual([{ wall: 'b', kind: 'removed', from: [6, 0], to: [4, 0], thickness: 0.2 }])
    expect(compared.changes.map((c) => c.text)).toEqual(['Wall "b" shortened 2.00 m'])
  })

  it('drawn as one wall where two stood, one of them made longer, keeps both and its opening', () => {
    const before = plan({
      walls: [wall('a1', [0, 0], [3, 0]), wall('a2', [3, 0], [6, 0])],
      openings: [opening('win', 'a2', 'window', 1, 1)]
    })
    const after = plan({
      walls: [wall('long', [0, 0], [9, 0])],
      openings: [opening('win', 'long', 'window', 4, 1)]
    })
    const alignment = alignPlans(before, after)
    expect(alignment.redrawn).toEqual([{ before: ['a1', 'a2'], after: ['long'] }])
    const compared = compareBuildings(before, after)
    expect(compared.marks.stretches.map((s) => [s.kind, s.from, s.to])).toEqual([['added', [6, 0], [9, 0]]])
    expect(compared.marks.added.openings).toEqual([])
    expect(compared.marks.changed.openings).toEqual([])
    expect(compared.changes.map((c) => c.text)).toEqual(['Wall "long" extended 3.00 m'])
  })

  it('cut into pieces with a stretch between them gone reads that stretch as removed', () => {
    // A wall knocked through in the middle, a nib left at each end.
    const before = plan({ walls: [wall('w', [0, 0], [5, 0])] })
    const after = plan({ walls: [wall('nib1', [0, 0], [0.5, 0]), wall('nib2', [4.5, 0], [5, 0])] })
    const compared = compareBuildings(before, after)
    expect(compared.marks.added.walls).toEqual([])
    expect(compared.marks.removed.walls).toEqual(['w'])
    const removed = compared.aligned.walls.find((x) => x.id === 'w')!
    expect([removed.start, removed.end]).toEqual([[0.5, 0], [4.5, 0]])
    expect(compared.changes.map((c) => c.text)).toEqual(['Wall "w" removed, 4.00 m'])
  })
})

describe('a wall that left its line', () => {
  it('is taken out where it stood and built where it stands, though it kept its id', () => {
    const before = written(HOUSE)
    const after = written(DEEPER)
    const { marks } = compareBuildings(before, after)
    expect(marks.removed.walls).toContain('ext-south')
    expect(marks.added.walls).toContain('ext-south')
    expect(marks.changed.walls).not.toContain('ext-south')
    // The side walls only got longer.
    expect(marks.stretches.filter((s) => s.kind === 'added').map((s) => s.wall).sort()).toEqual(['ext-east-1', 'ext-west'])
  })

  it('moved across is removed and added in a plan drawn by hand, and is said to have moved', () => {
    const keep = wall('k', [0, 0], [0, 6])
    const before = plan({ walls: [keep, wall('w', [0, 0], [4, 0])] })
    const after = plan({ walls: [keep, wall('w', [0, 2], [4, 2])] })
    const compared = compareBuildings(before, after)
    expect(compared.marks.removed.walls).toEqual(['w'])
    expect(compared.marks.added.walls).toEqual(['w'])
    expect(compared.marks.changed.walls).toEqual([])
    expect(compared.changes.map((c) => c.text)).toEqual(['Wall "w" moved 2.00 m'])
  })

  it('made thicker on one face stays where it stood and is drawn changed', () => {
    const before = plan({ walls: [wall('w', [0, 0], [4, 0], { thickness: 0.1 })] })
    const after = plan({ walls: [wall('w', [0, 0.05], [4, 0.05], { thickness: 0.2 })] })
    const { marks } = compareBuildings(before, after)
    expect(marks.changed.walls).toEqual(['w'])
    expect(marks.removed.walls).toEqual([])
    expect(marks.stretches).toEqual([])
  })
})

describe('two rooms knocked into one', () => {
  it('draws the room they became with its sum, and the room taken in is not lost', () => {
    const before = plan({
      walls: [
        wall('s', [0, 0], [8, 0], { kind: 'exterior' }),
        wall('e', [8, 0], [8, 4], { kind: 'exterior' }),
        wall('n', [8, 4], [0, 4], { kind: 'exterior' }),
        wall('w', [0, 4], [0, 0], { kind: 'exterior' }),
        wall('m', [4, 0], [4, 4], { thickness: 0.1 })
      ],
      rooms: [room('kitchen', 'Kitchen', ['s', 'm', 'n', 'w']), room('dining', 'Dining', ['s', 'e', 'n', 'm'])]
    })
    const after = plan({ walls: before.walls.filter((x) => x.id !== 'm'), rooms: [room('kitchen', 'Kitchen', ['s', 'e', 'n', 'w'])] })
    const compared = compareBuildings(before, after)
    expect(compared.marks.removed.rooms).toEqual([])
    expect(compared.marks.removed.walls).toEqual(['m'])
    const label = compared.marks.changedRooms.find((r) => r.room === 'kitchen')!.label
    expect(label).toBe('Kitchen: 14.63 + 14.63 + 0.38 = 29.64 m²')
  })
})
