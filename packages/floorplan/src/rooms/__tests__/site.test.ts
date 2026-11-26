/**
 * CNT-41: the site in rooms text. A 9 × 10 m house, its outside faces from 0,0 to 9,10 with
 * 0.3 m outside walls round inside faces from 0.3,0.3. A 15 × 30 m plot centred on it has its
 * south-west corner at -3,-10.
 */
import { describe, expect, it } from 'vitest'
import { safeParseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { edgesFacing, northOfWords, northWordsOf, writtenSite } from '../site'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HOUSE, ...lines].join('\n'))

describe('the site in rooms text', () => {
  it('writes a plot, its street, set-backs and north from their lines', () => {
    const result = write('plot 15 x 30 at -3,-10', 'street south', 'setback all 3', 'setback street 5', 'setback west 40 assumed', 'north 30 clockwise')
    expect(result.problems).toEqual([])
    expect(result.plan!.north).toBe(-30)
    expect(result.plan!.site).toEqual({
      boundary: [[-3, -10], [12, -10], [12, 20], [-3, 20]],
      streets: [1],
      setbacks: [{ from: 'all', distance: 3 }, { from: 'street', distance: 5 }, { from: 4, distance: 40, source: 'assumed' }],
    })
    expect(safeParseFloorPlan(result.plan)).not.toBeNull()
  })

  it('centres a plot with no place on the building, and says where it put it', () => {
    const result = write('plot 15 x 30')
    expect(result.plan!.site!.boundary).toEqual([[-3, -10], [12, -10], [12, 20], [-3, 20]])
    expect(result.warnings.find((w) => w.code === 'rooms/plot-centred')?.message).toBe("Line 4: the plot is centred on the building, its south-west corner at -3,-10; write 'plot 15 x 30 at x,y' to place it where it is.")
  })

  it('takes a boundary at an angle, finding the edges that face a side, and the place on the earth', () => {
    const result = write('site boundary -2,-2 14,-6 16,14 -4,16', 'street edge 2', 'street north', 'setback east 2.5', 'site origin 0,0', 'site location 31.2304,121.4737', 'site elevation 4', 'site ground -0.15', 'site country "China"', 'north up-left')
    expect(result.problems).toEqual([])
    expect(result.plan!.site).toMatchObject({ streets: [2, 3], setbacks: [{ from: 2, distance: 2.5 }], origin: [0, 0], latitude: 31.2304, longitude: 121.4737, elevation: 4, ground: -0.15, country: 'China' })
    expect(result.plan!.north).toBe(45)
    expect(edgesFacing([[0, 0], [0, 10], [10, 10], [10, 0]], 'south')).toEqual([4])
  })

  it('writes the site\'s things, each with an id', () => {
    const result = write('plot 15 x 30 at -3,-10', 'site tree oak at 10,15 canopy 5 height 8 "Old oak"', 'site path 4.5,-10 4.5,0 width 1.2', 'site gate 4,-10 5,-10', 'site pool 0,12 4,12 4,18 0,18', 'site fence -3,-10 12,-10 height 1.8')
    expect(result.problems).toEqual([])
    expect(result.plan!.site!.things).toEqual([
      { kind: 'tree', id: 'oak', at: [10, 15], canopy: 5, height: 8, label: 'Old oak' },
      { kind: 'path', id: 'path-1', points: [[4.5, -10], [4.5, 0]], width: 1.2 },
      { kind: 'gate', id: 'gate-1', points: [[4, -10], [5, -10]] },
      { kind: 'pool', id: 'pool-1', points: [[0, 12], [4, 12], [4, 18], [0, 18]] },
      { kind: 'fence', id: 'fence-1', points: [[-3, -10], [12, -10]], height: 1.8 },
    ])
  })

  it('refuses a line it cannot read, naming the line and the form it takes', () => {
    const refused = (line: string): string => {
      const result = write(line)
      expect(result.plan).toBeNull()
      return result.problems[0]!.message
    }
    expect(refused('north northeast')).toMatch(/^Line 4: write 'north <degrees>'/)
    expect(refused('plot 15 by 30')).toMatch(/^Line 4: write 'plot <width> x <depth> \[at x,y\]'/)
    expect(refused('street south')).toMatch(/^Line 4: a street or set-back is measured from the plot's boundary, which this text does not write/)
    expect(write('plot 15 x 30 at -3,-10', 'setback south-east 3').problems[0]!.message).toMatch(/^Line 5: write 'setback all <m>'/)
    expect(write('site boundary 0,0 10,0 5,8', 'street north').problems[0]!.message).toBe('Line 5: no edge of the boundary faces north: edge 1 faces south, edge 2 faces east, edge 3 faces west.')
    expect(write('plot 15 x 30 at -3,-10', 'site tree at 1,1', 'site tree oak').problems[0]!.message).toBe("Line 6: the site's things[1].at a tree needs at, where its trunk stands.")
    expect(write('north 0', 'north 90').problems[0]!.message).toBe('Line 5: north is written on line 4 already: write it once.')
  })

  it('reads a plan\'s site back as these lines, and writing them again gives the same site', () => {
    const first = write('plot 15 x 30 at -3,-10', 'street south', 'setback all 3', 'setback west 40 assumed', 'north -30', 'site location 36.7213,-4.4214', 'site country "Spain"', 'site tree Oak at 10,15 canopy 5 "Old oak"', 'site path 4.5,-10 4.5,0 width 1.2')
    expect(first.problems).toEqual([])
    const plan = safeParseFloorPlan({ ...first.plan, site: { ...first.plan!.site, things: [...first.plan!.site!.things!, { id: 'Gate A', kind: 'gate', points: [[4, -10], [5, -10]] }] } })!
    const back = readRoomsText(plan)
    expect(back.text).toContain('north -30\nsite boundary -3,-10 12,-10 12,20 -3,20\nstreet edge 1\nsetback all 3\nsetback edge 4 40 assumed\nsite location 36.7213,-4.4214\nsite country "Spain"\nsite tree at 10,15 canopy 5 id "Oak" "Old oak"\nsite path path-1 4.5,-10 4.5,0 width 1.2\nsite gate 4,-10 5,-10 id "Gate A"')
    const again = compileRoomsText(back.text)
    expect(again.problems).toEqual([])
    expect(again.plan!.site).toEqual(plan.site)
    expect(again.plan!.north).toBe(-30)
  })

  it('keeps what the text does not write, and takes the file\'s streets and set-backs with a new boundary', () => {
    const file = { boundary: [[0, 0], [10, 0], [10, 10]], streets: [1], setbacks: [{ from: 'all', distance: 2 }], country: 'GB', things: [{ id: 't', kind: 'tree', at: [1, 1] }], extra: 1 }
    expect(writtenSite(file, { country: 'IE' })).toEqual({ ...file, country: 'IE' })
    expect(writtenSite(file, { boundary: [[0, 0], [20, 0], [20, 20], [0, 20]] })).toEqual({ boundary: [[0, 0], [20, 0], [20, 20], [0, 20]], country: 'GB', things: file.things, extra: 1 })
    expect(writtenSite(file, undefined)).toBe(file)
  })

  it('says north in words and reads it from words', () => {
    expect(northOfWords(['up-right'])).toBe(-45)
    expect(northOfWords(['135'])).toBe(135)
    expect(northOfWords(['270'])).toBe(-90)
    expect(northWordsOf(90)).toBe('north 90: the arrow points to the left of the drawing (90° counter-clockwise from up)')
    expect(northWordsOf(-30)).toBe('north -30: the arrow turned 30° clockwise from up the drawing')
    expect(northWordsOf(0)).toBe('north 0: the arrow points up the drawing')
  })
})
