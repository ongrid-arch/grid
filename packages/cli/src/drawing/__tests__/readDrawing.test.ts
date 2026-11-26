/**
 * CMD-43: DXF and IFC drawings read into rooms text, and the text checked by compiling it. The
 * drawings are invented (`drawings.ts`), or plans Grid writes and exports itself.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { exportPlan } from '@ongrid/floorplan/export'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { readDxf } from '../dxf'
import { readIfc } from '../ifc'
import { readStep, stepString } from '../step'
import { roomsTextOf } from '../toRooms'
import { DrawingRefused } from '../model'
import { DOOR_BLOCK, dxfText, smallIfc, surveyFlat, type DxfEntity } from './drawings'

const roomLines = (text: string): string[] => text.split('\n').filter((l) => /^(room|door|window|opening|raw|floor|walls) /.test(l))

describe('a survey drawn as wall lines, in millimetres', () => {
  const drawing = readDxf(surveyFlat())
  const read = roomsTextOf(drawing, 'survey.dxf')

  it('reads its unit, its layers and its rooms from the regions the faces close round', () => {
    expect(drawing.unit).toEqual({ name: 'millimetres', scale: 0.001, from: 'file' })
    expect(drawing.layers.map((l) => [l.layer, l.readAs])).toEqual([['A-DOOR', 'doors'], ['A-ROOM-IDEN', 'names'], ['A-WALL', 'walls'], ['A-WIND', 'windows']])
    expect(drawing.rooms.map((r) => [r.name, r.from])).toEqual([['Living room', 'faces'], ['Kitchen', 'faces'], ['Bath', 'faces']])
    expect(drawing.outside.get('')).toBe(0.3)
  })

  it('writes rooms text that compiles, each room as drawn and its label checked', () => {
    expect(read.result.problems).toEqual([])
    expect(read.rooms.map((r) => [r.id, Number(r.area.toFixed(4)), r.stated])).toEqual([['living-room', 16, 16], ['kitchen', 10, 10], ['bath', 8, null]])
    expect(roomLines(read.text)).toEqual([
      'walls outside 0.3 inside 0.1',
      'room living-room "Living room" living polygon 4.3,0.3 4.3,4.3 0.3,4.3 0.3,0.3 facts handle="125"',
      'room kitchen "Kitchen" kitchen polygon 6.9,0.3 6.9,4.3 4.4,4.3 4.4,0.3 facts handle="127"',
      'room bath "Bath" - polygon 7,0.3 9,0.3 9,4.3 7,4.3 facts handle="128"',
      'window window-1 in living-room south, 0.7 from west, 1.8 wide',
      'door door-1 in kitchen south, 0.6 from west, 0.9 wide',
      'door door-2 between living-room and kitchen, 0.7 from south, 0.9 wide',
      'opening opening-1 between kitchen and bath, 1.7 from south, 0.8 wide',
    ])
  })

  it('places each door and window where the drawing has it, and keeps its handle', () => {
    expect(read.openings.map((o) => [o.id, o.written, o.wall, o.source])).toEqual([
      ['window-1', 'line', 'ext-south', '122'],
      ['door-1', 'line', 'ext-south', '123'],
      ['door-2', 'line', 'w-living-room-kitchen', '124'],
      ['opening-1', 'line', 'w-kitchen-bath', null],
    ])
    for (const o of read.openings) expect(o.off!).toBeLessThan(0.0005)
    expect(read.facts.openings['door-2']).toEqual({ handle: '124' })
    // The wall between living room and kitchen is drawn by the lines of its two faces.
    expect(read.facts.walls['w-living-room-kitchen']!['handle']!.split(' ').length).toBeGreaterThanOrEqual(2)
  })

  it('says what it assumed: a gap with no block is a doorless opening, the heights are Grid\'s', () => {
    expect(read.assumed.some((a) => a.startsWith('1 gap in the walls with no door or window block'))).toBe(true)
    expect(read.assumed.some((a) => a.includes('Grid\'s defaults are written'))).toBe(true)
    expect(read.assumed.some((a) => a.includes('Grid\'s usual 2.7 m high'))).toBe(true)
  })

  it('guesses millimetres from the size when the file states no unit, and says so', () => {
    const guessed = readDxf(surveyFlat({ insunits: null }))
    expect(guessed.unit).toEqual({ name: 'millimetres', scale: 0.001, from: 'guessed' })
    expect(guessed.assumed[0]).toContain('it is 9,300 units across, so it is read in millimetres')
    expect(readDxf(surveyFlat({ insunits: null }), { units: 'cm' }).unit.from).toBe('asked')
    expect(() => readDxf(surveyFlat(), { units: 'yards' })).toThrow(/units is "yards"/)
  })

  it('reads a layer named for nothing as the layers option says', () => {
    const plain = surveyFlat({ layer: 'L1' })
    // With no layer named for walls, the lines are read as walls by what they are, and said.
    const byContent = readDxf(plain)
    expect(byContent.layers.find((l) => l.layer === 'L1')).toMatchObject({ readAs: 'walls', why: 'content' })
    const asked = readDxf(plain, { layers: 'walls=l1;windows=A-WIND' })
    expect(asked.layers.find((l) => l.layer === 'L1')).toMatchObject({ readAs: 'walls', why: 'asked' })
    expect(roomsTextOf(asked, 'x.dxf').result.problems).toEqual([])
    expect(() => readDxf(plain, { layers: 'walls=NOPE' })).toThrow(/a layer the drawing holds nothing on/)
    expect(() => readDxf(plain, { layers: 'furniture=L1' })).toThrow(/names no part/)
  })
})

describe('curves, outlines and refusals', () => {
  it('reads closed room outlines with a bulged side, cut into straight pieces, and says so', () => {
    // A room with a bay: its south side bowed out by a half circle of 1 m radius, in metres.
    const ents: DxfEntity[] = [
      { type: 'LWPOLYLINE', layer: 'ROOMS', points: [[1, 0], [3, 0], [4, 0], [4, 3], [0, 3], [0, 0]], bulges: [1, 0, 0, 0, 0, 0], closed: true },
      { type: 'TEXT', layer: 'ROOMS', at: [2, 1.5], text: 'Lounge' },
    ]
    const d = readDxf(dxfText(ents, { insunits: 6 }))
    expect(d.rooms).toHaveLength(1)
    expect(d.rooms[0]!.from).toBe('outline')
    expect(d.rooms[0]!.outline.length).toBeGreaterThan(10)
    expect(d.assumed.some((a) => a.startsWith('1 curved wall face'))).toBe(true)
    const read = roomsTextOf(d, 'x.dxf')
    expect(read.result.problems).toEqual([])
    // 4 x 3 and half a circle of 1 m radius, its chords within a centimetre of the arc.
    expect(read.rooms[0]!.area).toBeGreaterThan(12 + Math.PI / 2 - 0.03)
    expect(read.rooms[0]!.area).toBeLessThan(12 + Math.PI / 2)
    expect(read.text).toContain('room lounge "Lounge" - polygon')
  })

  it('reads an ARC face of a round room', () => {
    const r = 3
    const ents: DxfEntity[] = [
      { type: 'ARC', layer: 'WALLS', c: [0, 0], r, from: 0, to: 180 },
      { type: 'LINE', layer: 'WALLS', a: [-r, 0], b: [r, 0] },
      { type: 'ARC', layer: 'WALLS', c: [0, 0], r: r + 0.3, from: 0, to: 180 },
      { type: 'LINE', layer: 'WALLS', a: [-r - 0.3, -0.3], b: [r + 0.3, -0.3] },
      { type: 'LINE', layer: 'WALLS', a: [-r - 0.3, -0.3], b: [-r - 0.3, 0] },
      { type: 'LINE', layer: 'WALLS', a: [r + 0.3, -0.3], b: [r + 0.3, 0] },
      { type: 'LINE', layer: 'WALLS', a: [-r - 0.3, 0], b: [-r, 0] },
      { type: 'LINE', layer: 'WALLS', a: [r, 0], b: [r + 0.3, 0] },
      { type: 'TEXT', layer: 'TEXT', at: [0, 1], text: 'Apse' },
    ]
    const d = readDxf(dxfText(ents, { insunits: 6 }))
    expect(d.rooms.map((x) => x.name)).toEqual(['Apse'])
    expect(Math.abs(d.rooms[0]!.outline.reduce((s, p, i, a) => s + (p[0] * a[(i + 1) % a.length]![1] - a[(i + 1) % a.length]![0] * p[1]) / 2, 0) - (Math.PI * r * r) / 2)).toBeLessThan(0.1)
  })

  it('refuses a binary DXF, a text that is not one, and a drawing with no room', () => {
    expect(() => readDxf('AutoCAD Binary DXF\r\n\u001a\u0000')).toThrow(DrawingRefused)
    expect(() => readDxf('hello\nworld\n')).toThrow(/not a DXF/)
    expect(() => readDxf(dxfText([{ type: 'TEXT', layer: 'NOTES', at: [0, 0], text: 'Nothing here' }]))).toThrow(/No room was read/)
  })

  it('places a door block standing in no gap where it is inserted', () => {
    const ents: DxfEntity[] = [
      { type: 'LWPOLYLINE', layer: 'A-AREA', points: [[0, 0], [4, 0], [4, 3], [0, 3]], closed: true },
      { type: 'LWPOLYLINE', layer: 'A-AREA', points: [[4.1, 0], [7, 0], [7, 3], [4.1, 3]], closed: true },
      { type: 'TEXT', layer: 'A-AREA-IDEN', at: [2, 1.5], text: 'Bedroom' },
      { type: 'TEXT', layer: 'A-AREA-IDEN', at: [5, 1.5], text: 'Study' },
      { type: 'INSERT', layer: 'A-DOOR', block: 'DOOR-900', at: [4.05, 1], rotation: 90 },
    ]
    const blocks = [{ name: 'DOOR-900', entities: DOOR_BLOCK.entities.map((e) => (e.type === 'LINE' ? { ...e, a: [0, 0] as const, b: [0, 0.9] as const } : e.type === 'ARC' ? { ...e, r: 0.9 } : e)) }]
    const d = readDxf(dxfText(ents, { insunits: 6, blocks }))
    expect(d.openings).toHaveLength(1)
    expect(d.openings[0]).toMatchObject({ kind: 'door', how: 'insert' })
    const read = roomsTextOf(d, 'x.dxf')
    expect(read.result.problems).toEqual([])
    expect(read.text).toContain('door door-1 between bedroom and study, 1 from south, 0.9 wide')
  })
})

describe('Grid\'s own DXF read back', () => {
  const SOURCE = [
    'walls outside 0.3 inside 0.1 height 2.6',
    'room living "Living room" living 4.4 x 4.2 at 0,0',
    'room kitchen "Kitchen" kitchen 4.4 x 3.0 north of living',
    'room hall "Hall" corridor 1.3 x * east of living until kitchen',
    'door d1 between hall and living, 0.1 from south, 0.8 wide, opens into living',
    'door front in hall north, centred, 0.9 wide, opens in, hinged east',
    'window w1 in living south, centred, 1.8 wide, sill 0.6, height 1.5',
    'opening o1 between living and kitchen, 0.5 from west, 1.0 wide',
  ].join('\n')

  it('gives the same rooms, areas and openings', () => {
    const original = compileRoomsText(SOURCE)
    const plan = parseFloorPlan(original.plan)
    const dxf = exportPlan(plan, 'dxf', { projectId: 'p', projectName: 'p', now: new Date(0) }).data as string
    const read = roomsTextOf(readDxf(dxf), 'p.dxf')
    expect(read.result.problems).toEqual([])
    const areas = (rooms: readonly { name: string; area: number }[]): [string, number][] => rooms.map((r) => [r.name, Number(r.area.toFixed(4))] as [string, number]).sort()
    expect(areas(read.rooms)).toEqual(areas(original.rooms))
    expect(read.openings.map((o) => o.kind).sort()).toEqual(['door', 'door', 'opening', 'window'])
    for (const o of read.openings) expect(o.off!).toBeLessThan(0.0005)
  })
})

describe('the STEP reader', () => {
  it('reads strings with their codes, lists, typed values, unset and derived', () => {
    expect(stepString("it''s")).toBe("it's")
    expect(stepString('Ba\\X2\\00F1\\X0\\o')).toBe('Baño')
    expect(stepString('\\X\\E9t\\X\\E9')).toBe('été')
    const records = readStep("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n/* a comment */\n#1=IFCTHING('a',(1.,-2.5E1,#2),$,*,.T.,IFCLABEL('x'));\n#2=IFCOTHER(());\nENDSEC;\nEND-ISO-10303-21;\n")
    expect(records.get(1)).toEqual({
      id: 1,
      type: 'IFCTHING',
      args: [
        { kind: 'string', value: 'a' },
        { kind: 'list', value: [{ kind: 'number', value: 1 }, { kind: 'number', value: -25 }, { kind: 'ref', value: 2 }] },
        { kind: 'unset' },
        { kind: 'derived' },
        { kind: 'enum', value: 'T' },
        { kind: 'typed', type: 'IFCLABEL', value: [{ kind: 'string', value: 'x' }] },
      ],
    })
    expect(records.get(2)!.args).toEqual([{ kind: 'list', value: [] }])
    expect(() => readStep('not step')).toThrow(/ISO-10303-21/)
    expect(() => readStep("ISO-10303-21;\nDATA;\n#1=IFCX('open);\n")).toThrow(/string is not closed/)
  })
})

describe('an IFC model of two storeys, in millimetres', () => {
  const drawing = readIfc(smallIfc())
  const read = roomsTextOf(drawing, 'office.ifc')

  it('reads its storeys with their elevations, its spaces, walls, doors and window', () => {
    expect(drawing.unit).toMatchObject({ name: 'millimetres', scale: 0.001 })
    expect(drawing.floors.map((f) => [f.name, f.elevation, f.height])).toEqual([['Ground floor', 0, 2.7], ['First floor', 3, 2.7]])
    expect(drawing.rooms.map((r) => [r.name, r.number])).toEqual([['Hall', 'G0.01'], ['Office', 'G0.02'], ['Hall', 'G1.01'], ['Office', 'G1.02']])
    expect(drawing.openings.map((o) => o.kind)).toEqual(['door', 'door', 'window'])
    expect(drawing.walls).toHaveLength(10)
  })

  it('writes two floors that compile, the slab between them from the elevations, and every source kept', () => {
    expect(read.result.problems).toEqual([])
    expect(read.result.warnings).toEqual([])
    expect(roomLines(read.text)).toContain('floor ground-floor "Ground floor" level 0 elevation 0 height 2.7')
    expect(roomLines(read.text)).toContain('floor first-floor "First floor" level 1 elevation 3 height 2.7 slab 0.3')
    expect(read.text).toContain('window window-1 in office-2 south, 1.4 from west, 1.5 wide, sill 0.9, height 1.2')
    expect(read.text).toMatch(/room hall "Hall" - polygon 0,0 3,0 3,4 0,4 number "G0.01" facts guid="[^"]+"/)
    expect(read.openings.every((o) => o.written === 'line' && o.source !== null)).toBe(true)
    // Every wall the compile worked out is matched to the IFC wall it stands in.
    expect(Object.keys(read.facts.walls).sort()).toEqual(read.result.plan!.walls.map((w) => w.id).sort())
  })

  it('reads Grid\'s own IFC back to the same rooms on the same floors', () => {
    const SOURCE = [
      'floor ground "Ground floor" level 0 elevation 0 height 2.75',
      'walls outside 0.3 inside 0.1',
      'room hall "Hall" corridor 2.0 x 4.0 at 0,0',
      'room stair "Stair" stair 1.2 x 4.0 east of hall through first',
      'room flat "Flat" living 3.3 x 4.0 north of hall align west',
      'door front in hall south, centred, 0.9 wide, opens in',
      'door d-flat between hall and flat, centred, 0.9 wide, opens into flat',
      'floor first "First floor" level 1 elevation 3.0 height 2.75 copy ground with openings',
    ].join('\n')
    const original = compileRoomsText(SOURCE)
    const ifc = exportPlan(parseFloorPlan(original.plan), 'ifc', { projectId: 'p', projectName: 'p', now: new Date(0) }).data as string
    const back = roomsTextOf(readIfc(ifc), 'p.ifc')
    expect(back.result.problems).toEqual([])
    const sum = (rooms: readonly { area: number }[]): number => Number(rooms.reduce((s, r) => s + r.area, 0).toFixed(4))
    expect(sum(back.rooms)).toBe(sum(original.rooms))
    expect(back.rooms.map((r) => r.floor)).toEqual(['ground-floor', 'ground-floor', 'ground-floor', 'first-floor', 'first-floor', 'first-floor'])
    // Grid's IFC states each space's use.
    expect(back.text).toContain('"Hall" corridor polygon')
    expect(back.openings.filter((o) => o.kind === 'door' && o.written === 'line')).toHaveLength(4)
  })

  it('refuses a STEP file that is not an IFC model', () => {
    expect(() => readIfc("ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\n#1=CARTESIAN_POINT('',(0.,0.,0.));\nENDSEC;\n")).toThrow(/no IFCPROJECT/)
  })
})
