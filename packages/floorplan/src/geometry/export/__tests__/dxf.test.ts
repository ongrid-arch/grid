import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../plan'
import { buildFloorPlan } from '../../floorplan'
import { DXF_LAYERS, DXF_ROOM_TAG, toDxf } from '../dxf'
import { parseFloorPlan } from '../../../types/floorplan'
import { attributesOf, modelEntities, readDxf, valueOf as fieldOf, worldShapes } from './dxf-reader'

/**
 * DXF export.
 *
 * A DXF is a flat list of (group code, value) pairs, two lines each. Parsing it
 * back into pairs is both how these assertions read the file and the cheapest
 * proof that it is well formed at all — an odd line count means a value was
 * written without its code, which no reader recovers from. HND-1: the structure as a whole is
 * checked in `dxf.structure.test.ts`; `dxf-reader.ts` reads it into its parts.
 */

/** A 4×4 room with a door, one interior partition and one virtual divider. */
function samplePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w3', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.5, kind: 'exterior' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.5, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [
      { id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 }
    ]
  }
}

const dxfOf = (plan: FloorPlan): string => toDxf(buildFloorPlan(plan))

interface Pair {
  readonly code: number
  readonly value: string
}

/** The file as the (code, value) pairs a reader consumes. Throws if malformed. */
function pairs(dxf: string): Pair[] {
  const lines = dxf.split('\r\n')
  // A DXF ends with a trailing newline after EOF, so the split leaves one blank.
  if (lines[lines.length - 1] === '') lines.pop()

  expect(lines.length % 2).toBe(0)

  const out: Pair[] = []
  for (let i = 0; i < lines.length; i += 2) {
    const code = Number(lines[i]!.trim())
    expect(Number.isInteger(code)).toBe(true)
    out.push({ code, value: lines[i + 1]! })
  }
  return out
}

const valuesOf = (dxf: string, code: number): string[] =>
  pairs(dxf)
    .filter((p) => p.code === code)
    .map((p) => p.value)

describe('the file a reader actually sees', () => {
  it('is a well-formed sequence of code/value pairs', () => {
    expect(() => pairs(dxfOf(samplePlan()))).not.toThrow()
  })

  it('opens and closes every section, and ends at EOF', () => {
    const structural = pairs(dxfOf(samplePlan()))
      .filter((p) => p.code === 0)
      .map((p) => p.value)

    expect(structural.filter((v) => v === 'SECTION')).toHaveLength(
      structural.filter((v) => v === 'ENDSEC').length
    )
    expect(structural[structural.length - 1]).toBe('EOF')
  })

  it('declares the version it claims to be, and that it is in metres (HND-1, lab EX-1)', () => {
    // AutoCAD 2013's: UTF-8 text and a units field, where R12 (AC1009) had neither. A version
    // that new is a whole document, so it has every section, not only a header and entities.
    const doc = readDxf(dxfOf(samplePlan()))
    expect(doc.header.get('$ACADVER')).toEqual([{ code: 1, value: 'AC1027' }])
    expect(doc.header.get('$INSUNITS')).toEqual([{ code: 70, value: '6' }])
    expect(doc.header.get('$MEASUREMENT')).toEqual([{ code: 70, value: '1' }])
    expect(doc.sections).toEqual(['HEADER', 'CLASSES', 'TABLES', 'BLOCKS', 'ENTITIES', 'OBJECTS'])
  })

  it('uses CRLF, the line ending the format is written with', () => {
    expect(dxfOf(samplePlan())).toContain('\r\n')
  })
})

describe('layers', () => {
  it('declares every layer any entity puts itself on', () => {
    // The invariant that matters: an entity on an undeclared layer either fails
    // to import or lands somewhere invisible, and the drawing looks empty.
    const doc = readDxf(dxfOf(samplePlan()))
    const declared = new Set(doc.tables.get('LAYER')!.records.map((r) => fieldOf(r, 2)))
    const used = new Set([...doc.entities, ...doc.blocks.flatMap((b) => b.entities)].map((e) => e.layer))

    expect(used.size).toBeGreaterThan(0)
    for (const layer of used) expect(declared).toContain(layer)
  })

  it('separates walls, their fill, rooms, doors, tags, dimensions and labels', () => {
    // HND-1: a door is a block on the doors layer; the doorless openings have a layer of their own.
    const used = new Set(valuesOf(dxfOf(samplePlan()), 8))

    for (const layer of [DXF_LAYERS.wallExterior, DXF_LAYERS.wallFill, DXF_LAYERS.rooms, DXF_LAYERS.doors, DXF_LAYERS.roomTags, DXF_LAYERS.dimensions, DXF_LAYERS.labels]) {
      expect(used).toContain(layer)
    }
  })

  it('lists only the layers something is drawn on', () => {
    const declared = readDxf(dxfOf(samplePlan())).tables.get('LAYER')!.records.map((r) => fieldOf(r, 2))
    expect(declared).not.toContain(DXF_LAYERS.windows)
    expect(declared).not.toContain(DXF_LAYERS.doorSwings)
    expect(declared[0]).toBe('0')
  })
})

describe('coordinates (C4)', () => {
  /** The corners of the wall outlines, in model space. */
  const wallPoints = (dxf: string) =>
    worldShapes(dxf).filter((s) => s.layer === DXF_LAYERS.wallExterior || s.layer === DXF_LAYERS.wallInterior).flatMap((s) => s.points)

  it('writes meters, unscaled', () => {
    const xs = wallPoints(dxfOf(samplePlan())).map((p) => p.x)

    // The plan spans x 0..4. Wall thickness pushes the outer face to 4.1.
    expect(Math.max(...xs)).toBeCloseTo(4.1, 6)
    expect(Math.min(...xs)).toBeCloseTo(-0.1, 6)
  })

  it('does not flip Y', () => {
    // A mirrored basis passes every length and area test and still exports the
    // plan upside down. +Y forward in the plan is +Y up in the DXF (C4).
    const ys = wallPoints(dxfOf(samplePlan())).map((p) => p.y)

    expect(Math.max(...ys)).toBeCloseTo(3.1, 6)
    expect(ys.every((y) => y >= -0.2)).toBe(true)
  })

  it('reports an extent round everything it drew in the model', () => {
    // HND-1: the dimensions outside the walls and the label above them are drawn too.
    const dxf = toDxf(buildFloorPlan(samplePlan()))
    const doc = readDxf(dxf)
    const [min, max] = (['$EXTMIN', '$EXTMAX'] as const).map((name) => {
      const at = doc.header.get(name)!
      return { x: Number(at[0]!.value), y: Number(at[1]!.value) }
    }) as [{ x: number; y: number }, { x: number; y: number }]
    const points = worldShapes(dxf).flatMap((s) => s.points)

    expect(points.length).toBeGreaterThan(15)
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(min.x - 1e-6)
      expect(p.y).toBeGreaterThanOrEqual(min.y - 1e-6)
      expect(p.x).toBeLessThanOrEqual(max.x + 1e-6)
      expect(p.y).toBeLessThanOrEqual(max.y + 1e-6)
    }
    expect(min.x).toBeLessThan(-0.1)
    expect(max.y).toBeGreaterThan(3.1)
  })
})

describe('shapes', () => {
  it('closes wall and room outlines', () => {
    // An open outline hatches and fills wrong in every CAD tool downstream.
    const outlines = modelEntities(dxfOf(samplePlan()), 'LWPOLYLINE').filter((e) => e.layer !== DXF_LAYERS.fixtures)

    expect(outlines.length).toBeGreaterThan(0)
    expect(outlines.every((e) => fieldOf(e, 70) === '1')).toBe(true)
  })

  it('fills each wall with a solid hatch bounded by its outlines (HND-1)', () => {
    const dxf = dxfOf(samplePlan())
    const hatches = modelEntities(dxf, 'HATCH')
    const walls = modelEntities(dxf, 'LWPOLYLINE').filter((e) => e.layer === DXF_LAYERS.wallExterior)

    expect(hatches).toHaveLength(1)
    expect(hatches.every((h) => h.layer === DXF_LAYERS.wallFill && fieldOf(h, 2) === 'SOLID')).toBe(true)
    // VEW-54: one loop per outline, and the four walls round the door's gap are one outline.
    expect(hatches.reduce((sum, h) => sum + Number(fieldOf(h, 91)), 0)).toBe(walls.length)
    expect(walls).toHaveLength(1)
  })

  it('tags the room with its name and its area', () => {
    const [tag] = attributesOf(dxfOf(samplePlan()), DXF_ROOM_TAG.block)

    expect(tag?.[DXF_ROOM_TAG.name]).toBe('Living room')
    expect(tag?.[DXF_ROOM_TAG.area]).toMatch(/^\d+\.\d+ m²$/)
  })

  it('marks the opening left in the wall with a block', () => {
    const withDoor = dxfOf(samplePlan())
    const plan = samplePlan()
    plan.openings = []

    expect(modelEntities(withDoor, 'INSERT').filter((e) => e.layer === DXF_LAYERS.doors)).toHaveLength(1)
    expect(modelEntities(dxfOf(plan), 'INSERT').filter((e) => e.layer === DXF_LAYERS.doors)).toHaveLength(0)
  })
})

const withName = (name: string): FloorPlan => {
  const plan = samplePlan()
  plan.rooms[0]!.name = name
  return plan
}

/** What a CAD reader sees for a room name: the value of the name in its tag (HND-1). */
const nameValue = (name: string): string => attributesOf(dxfOf(withName(name)), DXF_ROOM_TAG.block)[0]![DXF_ROOM_TAG.name]!

describe('text a CAD tool has to read back', () => {
  // HND-1 (lab EX-1): from AutoCAD 2007's version on, a DXF's text is UTF-8, so a name is
  // written as it is. Before, the file was R12, plain ASCII with `\U+00F1` codes that three of
  // the lab's four readers showed as codes. Spanish and German names are the normal case here,
  // not the edge.
  it('writes every name as it is, in UTF-8', () => {
    // Spanish, German, French, Japanese, and an emoji (a surrogate pair).
    const names = ['Ba\u00f1o', 'K\u00fcche', 'Salle \u00e0 manger', '\u5bdd\u5ba4', 'Cocina \ud83c\udf73']

    for (const name of names) {
      expect(nameValue(name)).toBe(name)
      expect(Buffer.from(dxfOf(withName(name)), 'utf8').includes(Buffer.from(name, 'utf8'))).toBe(true)
    }
  })

  // Pinned (Z-6), changed on purpose by HND-1 for EX-1: it was "escapes an accented letter as
  // \U+XXXX, which CAD tools decode", and three of the lab's four readers did not.
  it('writes an accented letter as itself, which every reader shows', () => {
    expect(nameValue('Ba\u00f1o')).toBe('Ba\u00f1o')
    expect(nameValue('K\u00fcche')).toBe('K\u00fcche')
    expect(dxfOf(withName('Ba\u00f1o'))).not.toContain('\\U+00F1')
  })

  it('declares the code page the file is written in', () => {
    const all = pairs(dxfOf(samplePlan()))
    const at = all.findIndex((p) => p.code === 9 && p.value === '$DWGCODEPAGE')

    expect(at).toBeGreaterThan(-1)
    expect(all[at + 1]).toEqual({ code: 3, value: 'ANSI_1252' })
  })

  it('does not let a backslash in a name forge an escape', () => {
    // `\U+0041` typed into a name would otherwise read back as "A".
    const value = nameValue('Sala\\U+0041')

    expect(value).toBe('Sala\\U+005CU+0041')
    expect(value).not.toContain('\\U+0041')
  })

  it('keeps a character made of two units whole, and replaces half of one', () => {
    // An emoji is one character made of two UTF-16 units; slicing by units can
    // cut it in half and leave a lone surrogate that no encoder can write.
    expect(nameValue('Cocina \ud83c\udf73')).toBe('Cocina \ud83c\udf73')
    expect(nameValue('a\ud83cb')).toBe('a?b')
  })

  it('caps a value at 250 characters', () => {
    // AutoCAD's single-line text holds 256 characters; the letters are no longer seven bytes each.
    expect([...nameValue('\u00f1'.repeat(300))]).toHaveLength(250)
    expect(nameValue('\u00f1'.repeat(100))).toBe('\u00f1'.repeat(100))
  })

  it('never cuts an escape in half when it hits the cap', () => {
    for (const length of [34, 35, 36, 37, 300]) {
      const value = nameValue(`a${'\\'.repeat(length)}`)

      expect(value).toMatch(/^a(?:\\U\+005C)*$/)
    }
  })

  it('keeps the codes a CAD program reads in text from reading as codes', () => {
    // A caret starts a control character in the file, and `%%d` is a degree sign in AutoCAD.
    expect(nameValue('A^J')).toBe('A^ J')
    expect(nameValue('50%%d')).toBe('50%%%%%%d')
    expect(nameValue('100%')).toBe('100%')
  })
})

describe('labels sit where the 2D plan draws them', () => {
  // The canvas centres each label on the room (text-anchor: middle). A TEXT
  // without a horizontal alignment starts at its point and runs to the right,
  // so in a narrow room the name crosses the wall into the next one.
  /** The model's texts and the tags' attributes: what is placed on the plan. */
  const placed = (dxf: string): Pair[][] => [...modelEntities(dxf, 'TEXT'), ...modelEntities(dxf, 'ATTRIB')].map((e) => [...e.pairs])

  it('centres every label and tag on its point', () => {
    const texts = placed(dxfOf(samplePlan()))

    expect(texts.length).toBe(4)
    for (const text of texts) {
      expect(text.find((p) => p.code === 72)?.value.trim()).toBe('1')
    }
  })

  it('repeats the point as the alignment point, the one a reader uses', () => {
    // With a non-left alignment a reader ignores 10/20 and places the text at
    // 11/21/31, so the two have to agree.
    for (const text of placed(dxfOf(samplePlan()))) {
      const at = (codes: readonly number[]): number[] =>
        codes.map((c) => Number(text.find((p) => p.code === c)?.value))

      expect(at([11, 21, 31])).toEqual(at([10, 20, 30]))
      expect(at([11, 21]).every(Number.isFinite)).toBe(true)
    }
  })
})

describe('what a bad plan does to the file', () => {
  it('cannot be broken by a room name carrying newlines', () => {
    // A value in a DXF is one line. A name straight from the plan file with a
    // newline in it would split into a bogus group code and corrupt everything
    // after it.
    const plan = samplePlan()
    plan.rooms[0]!.name = 'Kitchen\r\n0\r\nSECTION\r\ninjected'

    const dxf = dxfOf(plan)

    expect(() => pairs(dxf)).not.toThrow()
    expect(valuesOf(dxf, 1).some((t) => t.includes('injected'))).toBe(true)
    expect(valuesOf(dxf, 0).filter((v) => v === 'SECTION')).toHaveLength(
      valuesOf(dxfOf(samplePlan()), 0).filter((v) => v === 'SECTION').length
    )
  })

  it('still exports whatever is valid when part of the plan is not', () => {
    const plan = samplePlan()
    plan.walls.push({
      id: 'bad',
      start: [9, 9],
      end: [9, 9],
      thickness: 0.2,
      height: 2.5,
      kind: 'interior'
    })

    const dxf = dxfOf(plan)

    expect(() => pairs(dxf)).not.toThrow()
    expect(valuesOf(dxf, 1).some((t) => t.includes('Living room'))).toBe(true)
  })

  it('produces a valid, empty drawing for an empty plan', () => {
    const empty: FloorPlan = { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
    const dxf = dxfOf(empty)

    expect(() => pairs(dxf)).not.toThrow()
    expect(valuesOf(dxf, 0)).toContain('EOF')
  })

  it('never throws, whatever the plan holds', () => {
    const plan = samplePlan()
    plan.rooms[0]!.boundary = ['nope']

    expect(() => dxfOf(plan)).not.toThrow()
  })
})

/** The ENTITIES section as one list of pairs per entity, keyed by its type. */
function entitiesOf(dxf: string): { type: string; layer: string; pairs: Pair[] }[] {
  const all = pairs(dxf)
  const start = all.findIndex((p) => p.code === 2 && p.value === 'ENTITIES')
  const out: { type: string; layer: string; pairs: Pair[] }[] = []
  for (let i = start + 1; i < all.length; i++) {
    const p = all[i]!
    if (p.code !== 0) {
      out[out.length - 1]?.pairs.push(p)
      continue
    }
    if (p.value === 'ENDSEC') break
    out.push({ type: p.value, layer: '', pairs: [] })
  }
  for (const e of out) e.layer = e.pairs.find((p) => p.code === 8)?.value ?? ''
  return out
}

const num = (e: { pairs: Pair[] }, code: number): number => Number(e.pairs.find((p) => p.code === code)!.value)

/** One wall from the origin at angle `theta`, with a 0.9 m door at offset 1.0 that states `handing`. */
function swingPlan(handing: Record<string, string>, theta = 0, type: 'door' | 'window' | 'opening' = 'door'): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4 * Math.cos(theta), 4 * Math.sin(theta)], thickness: 0.2, height: 2.5, kind: 'interior' }
    ],
    rooms: [],
    openings: [
      { id: 'o1', wall: 'w1', type, offset: 1.0, width: 0.9, sill: type === 'window' ? 0.9 : 0, height: 1.2, ...handing } as FloorPlan['openings'][number]
    ]
  }
}

describe('door swings (door-swing-export)', () => {
  it('lists the door-swing layer in the layer table when a door has a swing', () => {
    expect(DXF_LAYERS.doorSwings).toBe('GRID-DOOR-SWINGS')
    expect(valuesOf(dxfOf(swingPlan({ hinge: 'start', swing: 'left' })), 2)).toContain('GRID-DOOR-SWINGS')
  })

  it('draws the open leaf and a quarter arc for a door hung from its start jamb opening left', () => {
    // HND-1: inside the door's block, placed where its insert puts it.
    const swing = worldShapes(dxfOf(swingPlan({ hinge: 'start', swing: 'left' }))).filter((s) => s.layer === DXF_LAYERS.doorSwings)
    expect(swing.map((s) => s.type)).toEqual(['LINE', 'ARC'])
    const [leaf, arc] = swing as [(typeof swing)[number], (typeof swing)[number]]

    // Hung from the left face of the 0.2 m wall, y = 0.1, not from its axis (SHT-2).
    expect([leaf.points[0]!.x, leaf.points[0]!.y, leaf.points[1]!.x, leaf.points[1]!.y]).toEqual([1, 0.1, 1, 1])
    expect([arc.arc!.center.x, arc.arc!.center.y, arc.arc!.radius, arc.arc!.start, arc.arc!.end]).toEqual([1, 0.1, 0.9, 0, 90])
  })

  it('still marks the opening line across the gap', () => {
    const lines = worldShapes(dxfOf(swingPlan({ hinge: 'start', swing: 'left' }))).filter((s) => s.layer === DXF_LAYERS.doors)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.points).toEqual([{ x: 1, y: 0 }, { x: 1.9, y: 0 }])
  })

  it('is one block per size and hand, however many doors use it (HND-1)', () => {
    // Four doors of one size: two hung from the start jamb, two from the end, opening either way.
    // A door hung from its end jamb is the other hand's block turned half round.
    const plan = swingPlan({ hinge: 'start', swing: 'left' })
    const door = plan.openings[0]!
    plan.walls[0]!.end = [9, 0]
    plan.openings = [
      door,
      { ...door, id: 'o2', offset: 3, hinge: 'end', swing: 'right' },
      { ...door, id: 'o3', offset: 5, hinge: 'start', swing: 'right' },
      { ...door, id: 'o4', offset: 7, hinge: 'end', swing: 'left' }
    ]
    const dxf = dxfOf(plan)
    const inserts = modelEntities(dxf, 'INSERT').filter((e) => e.layer === DXF_LAYERS.doors)
    expect(inserts.map((e) => [fieldOf(e, 2), Number(fieldOf(e, 50) ?? 0)])).toEqual([
      ['GRID-DOOR-900x200-L', 0],
      ['GRID-DOOR-900x200-L', 180],
      ['GRID-DOOR-900x200-R', 0],
      ['GRID-DOOR-900x200-R', 180]
    ])
    expect(readDxf(dxf).blocks.map((b) => b.name).filter((name) => name.startsWith('GRID-DOOR'))).toEqual(['GRID-DOOR-900x200-L', 'GRID-DOOR-900x200-R'])
  })

  it.each([
    ['a door that states only its hinge', swingPlan({ hinge: 'start' })],
    ['a door that states only its swing', swingPlan({ swing: 'left' })],
    ['a window that states both', swingPlan({ hinge: 'start', swing: 'left' }, 0, 'window')],
    ['a doorless opening that states both', swingPlan({ hinge: 'end', swing: 'right' }, 0, 'opening')]
  ])('exports %s exactly as before', (_label, plan) => {
    const stripped: FloorPlan = {
      ...plan,
      openings: plan.openings.map((o) => {
        const rest = { ...o }
        delete rest.hinge
        delete rest.swing
        return rest
      })
    }
    const dxf = dxfOf(plan)
    expect(entitiesOf(dxf).some((e) => e.layer === DXF_LAYERS.doorSwings)).toBe(false)
    expect(dxf).toBe(dxfOf(stripped))
  })

  // A mirrored basis passes every value test on an axis-aligned wall and still draws the
  // door into the wrong room, so the side is checked against the wall normal at many angles.
  const angles = [0, 37, 90, 180, 233, 300]
  const cases = angles.flatMap((deg) =>
    (['start', 'end'] as const).flatMap((hinge) => (['left', 'right'] as const).map((side) => [deg, hinge, side] as const))
  )
  it.each(cases)('at %d°, hinge %s, swing %s: the arc and the leaf are on the face the swing names', (deg, hinge, side) => {
    const theta = (deg * Math.PI) / 180
    const swing = worldShapes(dxfOf(swingPlan({ hinge, swing: side }, theta))).filter((s) => s.layer === DXF_LAYERS.doorSwings)
    const leaf = swing.find((s) => s.type === 'LINE')!
    const arc = swing.find((s) => s.type === 'ARC')!.arc!
    const normal = { x: -Math.sin(theta), y: Math.cos(theta) }
    const facing = side === 'left' ? 1 : -1

    const sweep = (((arc.end - arc.start) % 360) + 360) % 360
    expect(sweep).toBeCloseTo(90, 5)
    expect(arc.radius).toBeCloseTo(0.9, 6)

    const mid = ((arc.start + 45) * Math.PI) / 180
    const midDir = { x: Math.cos(mid), y: Math.sin(mid) }
    expect(Math.sign(midDir.x * normal.x + midDir.y * normal.y)).toBe(facing)

    const [from, to] = leaf.points as [{ x: number; y: number }, { x: number; y: number }]
    const tip = { x: to.x - from.x, y: to.y - from.y }
    expect(Math.sign(tip.x * normal.x + tip.y * normal.y)).toBe(facing)
    // The leaf starts at the hinge jamb, which is the arc's centre.
    expect(from.x).toBeCloseTo(arc.center.x, 6)
    expect(from.y).toBeCloseTo(arc.center.y, 6)
    // The hinge jamb, on the face the door opens to: half the 0.2 m wall off the axis (SHT-2).
    // HND-1: placed by the block's insert, so to 5 places: the insert's point and the block's
    // own lines are each written to 6.
    const hingeAt = hinge === 'start' ? 1.0 : 1.9
    expect(arc.center.x).toBeCloseTo(hingeAt * Math.cos(theta) + normal.x * 0.1 * facing, 5)
    expect(arc.center.y).toBeCloseTo(hingeAt * Math.sin(theta) + normal.y * 0.1 * facing, 5)
  })
})

/** ARE-2: an 8 × 4 room split at x = 4 by a dividing line that states no thickness or height. */
function openPlan(): FloorPlan {
  const solid = (id: string, start: [number, number], end: [number, number]) => ({ id, start, end, thickness: 0.2, kind: 'exterior' })
  return parseFloorPlan({
    walls: [
      solid('s1', [0, 0], [4, 0]),
      solid('s2', [4, 0], [8, 0]),
      solid('e', [8, 0], [8, 4]),
      solid('n2', [8, 4], [4, 4]),
      solid('n1', [4, 4], [0, 4]),
      solid('w', [0, 4], [0, 0]),
      { id: 'line', start: [4, 0], end: [4, 4], virtual: true }
    ],
    rooms: [
      { id: 'kitchen', name: 'Kitchen', boundary: ['s1', 'line', 'n1', 'w'] },
      { id: 'living', name: 'Living', boundary: ['s2', 'e', 'n2', 'line'] }
    ]
  })
}

describe('a dividing line (ARE-2)', () => {
  const dxf = dxfOf(openPlan())
  const all = pairs(dxf)
  const tables = all.slice(
    all.findIndex((p) => p.code === 2 && p.value === 'TABLES'),
    all.findIndex((p, i) => i > 0 && p.code === 0 && p.value === 'ENDSEC' && all.slice(0, i).some((q) => q.value === 'TABLES'))
  )

  it('is one dashed line on its own layer, over the two room outlines that meet on it', () => {
    const entities = entitiesOf(dxf)
    const line = entities.filter((e) => e.layer === DXF_LAYERS.wallVirtual)
    const rooms = entities.filter((e) => e.layer === DXF_LAYERS.rooms)
    const vertices = (e: (typeof entities)[number]): string[] => {
      const ys = e.pairs.filter((p) => p.code === 20).map((p) => Number(p.value))
      return e.pairs.filter((p) => p.code === 10).map((p, i) => `${Number(p.value)},${ys[i]}`)
    }
    // HND-1: the line types and layers, without the handles, which the structure test checks.
    const doc = readDxf(dxf)
    const records = (table: string): string[] =>
      doc.tables.get(table)!.records.map((r) => r.pairs.filter((p) => ![5, 330, 100].includes(p.code)).map((p) => `${p.code} ${p.value}`).join(' | '))
    expect({
      line: line.map((e) => ({ type: e.type, from: [num(e, 10), num(e, 20)], to: [num(e, 11), num(e, 21)] })),
      rooms: rooms.filter((e) => e.type === 'LWPOLYLINE').map(vertices),
      tables: { LTYPE: records('LTYPE'), LAYER: records('LAYER') }
    }).toMatchSnapshot()
  })

  it('declares the dashed line type before the layer that uses it', () => {
    const ltype = tables.findIndex((p) => p.code === 2 && p.value === 'DASHED')
    const layer = tables.findIndex((p) => p.code === 2 && p.value === DXF_LAYERS.wallVirtual)
    expect(ltype).toBeGreaterThan(-1)
    expect(layer).toBeGreaterThan(ltype)
    expect(tables[layer + 3]).toEqual({ code: 6, value: 'DASHED' })
  })

  it('declares every line type a layer names', () => {
    // HND-1: `Continuous` as AutoCAD spells it, beside `ByBlock` and `ByLayer`.
    const doc = readDxf(dxf)
    const declared = new Set(doc.tables.get('LTYPE')!.records.map((r) => fieldOf(r, 2)))
    const named = new Set(doc.tables.get('LAYER')!.records.map((r) => fieldOf(r, 6)))
    expect([...named].sort()).toEqual(['Continuous', 'DASHED'])
    for (const type of named) expect(declared).toContain(type)
  })

  it('keeps solid walls and their outlines on continuous layers', () => {
    const layerType = (name: string): string | undefined => tables[tables.findIndex((p) => p.code === 2 && p.value === name) + 3]?.value
    expect(layerType(DXF_LAYERS.wallExterior)).toBe('Continuous')
    expect(layerType(DXF_LAYERS.rooms)).toBe('Continuous')
  })
})
