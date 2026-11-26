/**
 * CNT-41: the plot, its streets, set-backs and north, and the site's things, written through the
 * tools and rooms text. The house is 9 × 10 m to its outside faces, from 0,0 to 9,10; a 15 × 30 m
 * plot centred on it runs from -3,-10 to 12,20: 90 m² on 450 m², 20%, and 10, 3, 10 and 3 m from
 * its south, east, north and west edges by hand.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bench, type Bench, type Reply } from './replay/harness'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']
const OUTDOOR = [...HOUSE, 'room deck "Deck" - 4 x 3 north of living outdoor terrace unroofed', 'room porch "Porch" - 3 x 2 east of living outdoor porch roofed', 'door d-deck between living and deck, centred, 1.8 wide, sliding']

let b: Bench
const file = (name: string): Record<string, unknown> => JSON.parse(readFileSync(join(b.folder, name), 'utf8')) as Record<string, unknown>
const site = (name: string): Record<string, unknown> => file(name)['site'] as Record<string, unknown>
async function ok(tool: string, args: Record<string, unknown>): Promise<Reply> {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply
}
async function write(plan: string, lines: readonly string[]): Promise<Reply> {
  return ok('grid_write_rooms', { plan, rooms: lines.join('\n') })
}

beforeAll(async () => {
  b = bench({})
  await write('house.json', HOUSE)
  await write('feet.json', ['display ft-in numbers m', ...HOUSE])
  await write('outdoor.json', OUTDOOR)
})
afterAll(() => b.close())

describe('grid_set_site', () => {
  it('writes the plot, its street, set-backs and north, and answers with the plot as measured', async () => {
    const reply = await ok('grid_set_site', { plan: 'house.json', plot_width: 15, plot_depth: 30, streets: ['south'], setbacks: ['street 5', 'all 3', 'west 40 assumed'], north_points: 'up-right', out: 'sited.json' })
    expect(site('sited.json')).toEqual({
      boundary: [[-3, -10], [12, -10], [12, 20], [-3, 20]],
      streets: [1],
      setbacks: [{ from: 'street', distance: 5 }, { from: 'all', distance: 3 }, { from: 4, distance: 40, source: 'assumed' }],
    })
    expect(file('sited.json')['north']).toBe(-45)
    expect(file('house.json')['site']).toBeUndefined()
    expect(reply.text).toContain("Guessed: the plot's place: centred on the building, its south-west corner at -3,-10.")
    expect(reply.text).toContain('North: north -45: the arrow points up and to the right of the drawing (45° clockwise from up).')
    expect(reply.text).toContain("Plot coverage: 20%, the building's 90.00 m² on the 450.00 m² plot.")
    expect(reply.text).toContain('The coverage counts the enclosed building; a roofed porch or carport would count with it, and a deck or terrace open to the sky would not. The plan has neither.')
    expect(reply.text).toMatch(/Edge 4: 3\.00 m from the [a-z-]+ boundary; 40\.00 m is assumed for you, to confirm: 37\.00 m short\./)
    expect(reply.data!['site']).toMatchObject({ coverage: { percent: '20%', covered: 90, plot: 450 }, boundary: { area: 450, acres: 0.111 } })
  })

  it('takes a boundary as corners, keeps the streets and set-backs that still fit, and takes north out', async () => {
    await ok('grid_set_site', { plan: 'house.json', boundary: ['-3,-10', '12,-10', '12,20', '-3,20'], streets: ['1'], setbacks: ['edge 4 2'], north: 90, out: 'corners.json' })
    const reply = await ok('grid_set_site', { plan: 'corners.json', boundary: ['-3,-10', '12,-10', '-3,20'], remove: ['north'] })
    expect(site('corners.json')).toEqual({ boundary: [[-3, -10], [12, -10], [-3, 20]], streets: [1] })
    expect(file('corners.json')['north']).toBeUndefined()
    expect(reply.text).toContain('Could not keep: the set-back from edge 4, which the new boundary does not have')
  })

  it('gives the plot in acres too on a plan shown in feet and inches', async () => {
    const reply = await ok('grid_set_site', { plan: 'feet.json', plot_width: '49ft', plot_depth: '98ft', plot_x: 0, plot_y: 0, out: 'feet-sited.json' })
    expect(reply.text).toMatch(/The plot: [0-9,]+ sq ft \([0-9.]+ m²\) \(0\.110 acres\) inside a boundary of 4 edges/)
  })

  it('says which outdoor space the coverage counts and which it leaves out', async () => {
    const reply = await ok('grid_set_site', { plan: 'outdoor.json', plot_width: 30, plot_depth: 40, out: 'outdoor-sited.json' })
    expect(reply.text).toContain('Counted here: "Porch". Left out here: "Deck".')
  })

  it('refuses a site it could not read, writing nothing', async () => {
    const before = readFileSync(join(b.folder, 'house.json'), 'utf8')
    const none = await b.call('grid_set_site', { plan: 'house.json', setbacks: ['all 2'] })
    expect(none.isError).toBe(true)
    expect(none.text).toContain("Streets and set-backs are measured from the plot's boundary, which the site does not state")
    const far = await b.call('grid_set_site', { plan: 'house.json', plot_width: 15, plot_depth: 30, setbacks: ['edge 9 2'] })
    expect(far.text).toContain('The site would not be read: site.setbacks[0].from names edge 9, but the boundary has 4 edges.')
    const side = await b.call('grid_set_site', { plan: 'house.json', boundary: ['0,0', '10,0', '5,8'], streets: ['north'] })
    expect(side.text).toContain('No edge of the boundary faces north: edge 1 faces south, edge 2 faces east, edge 3 faces west.')
    expect((await b.call('grid_set_site', { plan: 'house.json' })).isError).toBe(true)
    expect(readFileSync(join(b.folder, 'house.json'), 'utf8')).toBe(before)
  })
})

describe('grid_change_site', () => {
  it('adds a gate, moves a tree, widens a path and removes a pool, keeping the rest of each', async () => {
    await ok('grid_set_site', { plan: 'house.json', plot_width: 15, plot_depth: 30, out: 'things.json' })
    const raw = file('things.json')
    b.write('things.json', { ...raw, site: { ...(raw['site'] as object), things: [
      { id: 'oak', kind: 'tree', at: [10, 15], canopy: 5, label: 'Old oak' },
      { id: 'drive', kind: 'path', points: [[4.5, -10], [4.5, 0]], width: 1.2 },
      { id: 'pool', kind: 'pool', points: [[0, 12], [4, 12], [4, 18], [0, 18]] },
    ] } })
    const gate = await ok('grid_change_site', { plan: 'things.json', action: 'add', kind: 'gate', points: ['4,-10', '5,-10'] })
    expect(gate.text).toContain('Added the gate gate-1 through 4,-10 5,-10.')
    expect(gate.text).not.toContain('outside the plot')
    const moved = await ok('grid_change_site', { plan: 'things.json', action: 'move', id: 'oak', by: '-2,1' })
    expect(moved.text).toContain('Moved the tree oak 2.00 m west and 1.00 m north on the drawing, at 8,16 now.')
    const wider = await ok('grid_change_site', { plan: 'things.json', action: 'resize', id: 'drive', width: 3 })
    expect(wider.text).toContain('Changed the path drive: width 1.20 m to 3.00 m.')
    await ok('grid_change_site', { plan: 'things.json', action: 'remove', id: 'pool' })
    expect(site('things.json')['things']).toEqual([
      { id: 'oak', kind: 'tree', at: [8, 16], canopy: 5, label: 'Old oak' },
      { id: 'drive', kind: 'path', points: [[4.5, -10], [4.5, 0]], width: 3 },
      { id: 'gate-1', kind: 'gate', points: [[4, -10], [5, -10]] },
    ])
    const out = await ok('grid_change_site', { plan: 'things.json', action: 'add', kind: 'tree', id: 'far', at: '50,50' })
    expect(out.text).toContain("The tree far stands outside the plot's boundary.")
    const unknown = await b.call('grid_change_site', { plan: 'things.json', action: 'move', id: 'elm', by: '1,0' })
    expect(unknown.text).toContain('The site has no thing with the id elm. Its things: oak, drive, gate-1, far.')
    const noWidth = await b.call('grid_change_site', { plan: 'things.json', action: 'add', kind: 'path', points: ['0,0', '1,0'] })
    expect(noWidth.text).toContain('The path would not be read: width a path needs its width.')
  })
})

describe('the plot through rooms text and grid_measure', () => {
  it('says how to add a boundary when the site states none', async () => {
    const reply = await ok('grid_measure', { plan: 'house.json', what: 'site' })
    expect(reply.text).toContain("set it with grid_set_site (boundary, or plot_width and plot_depth), or write 'plot <width> x <depth>' or 'site boundary x,y ...' in rooms text.")
    const facing = await ok('grid_measure', { plan: 'house.json', what: 'facing' })
    expect(facing.text).toContain("set it with grid_set_site (north, or north_points: where the arrow points) or a 'north <degrees>' line in rooms text.")
  })

  it('writes site lines over a plan and keeps the things the text does not write', async () => {
    await ok('grid_set_site', { plan: 'house.json', plot_width: 15, plot_depth: 30, out: 'kept.json' })
    await ok('grid_change_site', { plan: 'kept.json', action: 'add', kind: 'tree', id: 'oak', at: '10,15' })
    const back = await ok('grid_describe', { plan: 'kept.json', as: 'rooms' })
    expect(back.text).toContain('site boundary -3,-10 12,-10 12,20 -3,20')
    expect(back.text).toContain('site tree oak at 10,15')
    const text = back.text.split('\n').filter((l) => !l.startsWith('site ')).concat(['plot 20 x 30 at -5,-10', 'street south', 'setback street 6', 'north 10'])
    const wrote = await write('kept.json', text)
    expect(site('kept.json')).toEqual({ boundary: [[-5, -10], [15, -10], [15, 20], [-5, 20]], streets: [1], setbacks: [{ from: 'street', distance: 6 }], things: [{ id: 'oak', kind: 'tree', at: [10, 15] }] })
    expect(file('kept.json')['north']).toBe(10)
    expect(wrote.text).toMatch(/Site: plot 600(\.00)? m², coverage 15%; nearest edge 4 \([a-z-]+\) at 5(\.00)? m/)
  })
})
