import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Pair, Polygon } from 'polygon-clipping'
import { ringArea, union } from '../../polygons'
import type { Floor, FloorPlan, Opening, Room, Wall } from '../../plan'
import { floorElevations, SLAB_THICKNESS } from '../../elevations'
import { createGuidIssuer, ifcGuid, ifcString, toIfc } from '../ifc'
import { indexPlan } from '../../plan'
import { wallExposure } from '../../exposure'
import { parseFloorPlan } from '../../../types/floorplan'
import { ballroomWithStage, genkanFlat } from '../../../test-support/plans'
import {
  en,
  entity,
  items,
  num,
  nums,
  ofType,
  only,
  parseArgs,
  parseDoc,
  ref,
  refs,
  str,
  walk,
  type Doc,
  type Entity
} from './step-reader'

/**
 * IFC export.
 *
 * The file is read back through a strict STEP parser written for these tests,
 * never through the writer's own helpers: a writer that mis-escapes a string
 * and a reader that mis-unescapes it the same way would agree with each other
 * and with nobody else. The parser rejects anything the standard does not
 * allow (an unescaped quote, a raw non-ASCII byte, a dangling reference), so a
 * malformed file fails here instead of in an architect's import dialog. It is
 * in `step-reader.ts`, which the structural test (`ifc.structure.test.ts`) reads
 * files with too.
 */

// ---------------------------------------------------------------------------
// Placements, composed by hand
// ---------------------------------------------------------------------------

type V3 = [number, number, number]

/** A right-handed frame: where its origin is and where its three axes point. */
interface Frame {
  readonly o: V3
  readonly x: V3
  readonly y: V3
  readonly z: V3
}

const dot3 = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
]
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k]
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const norm3 = (a: V3): V3 => scale3(a, 1 / Math.hypot(...a))

const WORLD: Frame = { o: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }

const point3 = (doc: Doc, id: number): V3 => {
  const p = entity(doc, id)
  expect(p.type).toBe('IFCCARTESIANPOINT')
  const coords = nums(p.args[0])
  return [coords[0]!, coords[1]!, coords[2] ?? 0]
}

const direction3 = (doc: Doc, id: number): V3 => {
  const d = entity(doc, id)
  expect(d.type).toBe('IFCDIRECTION')
  const coords = nums(d.args[0])
  return [coords[0]!, coords[1]!, coords[2] ?? 0]
}

/** IfcAxis2Placement3D(Location, Axis, RefDirection), as the standard defines its frame. */
function axisFrame(doc: Doc, id: number): Frame {
  const placement = entity(doc, id)
  expect(placement.type).toBe('IFCAXIS2PLACEMENT3D')

  const z = placement.args[1]?.t === 'ref' ? norm3(direction3(doc, ref(placement.args[1]))) : WORLD.z
  const rawX: V3 =
    placement.args[2]?.t === 'ref' ? direction3(doc, ref(placement.args[2])) : WORLD.x
  const x = norm3(sub3(rawX, scale3(z, dot3(rawX, z))))
  return { o: point3(doc, ref(placement.args[0])), x, y: cross3(z, x), z }
}

const toWorld = (frame: Frame, p: V3): V3 =>
  add3(frame.o, add3(scale3(frame.x, p[0]), add3(scale3(frame.y, p[1]), scale3(frame.z, p[2]))))

const rotate = (frame: Frame, v: V3): V3 =>
  add3(scale3(frame.x, v[0]), add3(scale3(frame.y, v[1]), scale3(frame.z, v[2])))

/** IfcLocalPlacement(PlacementRelTo, RelativePlacement), followed to the world. */
function placementFrame(doc: Doc, id: number): Frame {
  const local = entity(doc, id)
  expect(local.type).toBe('IFCLOCALPLACEMENT')

  const relative = axisFrame(doc, ref(local.args[1]))
  if (local.args[0]?.t === 'null') return relative

  const parent = placementFrame(doc, ref(local.args[0]))
  return {
    o: toWorld(parent, relative.o),
    x: rotate(parent, relative.x),
    y: rotate(parent, relative.y),
    z: rotate(parent, relative.z)
  }
}

// ---------------------------------------------------------------------------
// Solids, evaluated by hand
// ---------------------------------------------------------------------------

interface WorldSolid {
  /** The profile's corners, placed in the world at the foot of the extrusion. */
  readonly base: V3[]
  /** The same corners, moved along the extrusion. */
  readonly top: V3[]
  /** Unit direction the profile is swept along, in the world. */
  readonly direction: V3
  readonly depth: number
}

/** The 2D profile outline, in the coordinates of the solid that sweeps it. */
function profileOutline(doc: Doc, id: number): [number, number][] {
  const profile = entity(doc, id)

  if (profile.type === 'IFCRECTANGLEPROFILEDEF') {
    // IfcRectangleProfileDef(ProfileType, ProfileName, Position, XDim, YDim)
    const position = entity(doc, ref(profile.args[2]))
    expect(position.type).toBe('IFCAXIS2PLACEMENT2D')
    const origin = nums(entity(doc, ref(position.args[0])).args[0])
    const along =
      position.args[1]?.t === 'ref'
        ? nums(entity(doc, ref(position.args[1])).args[0])
        : [1, 0]
    const length = Math.hypot(along[0]!, along[1]!)
    const u = [along[0]! / length, along[1]! / length]
    const hx = num(profile.args[3]) / 2
    const hy = num(profile.args[4]) / 2
    return [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy]
    ].map(([x, y]) => [
      origin[0]! + u[0]! * x! - u[1]! * y!,
      origin[1]! + u[1]! * x! + u[0]! * y!
    ])
  }

  // IfcArbitraryClosedProfileDef(ProfileType, ProfileName, OuterCurve)
  expect(profile.type).toBe('IFCARBITRARYCLOSEDPROFILEDEF')
  const curve = entity(doc, ref(profile.args[2]))
  expect(curve.type).toBe('IFCPOLYLINE')
  const points = refs(curve.args[0]).map((p) => {
    const coords = nums(entity(doc, p).args[0])
    return [coords[0]!, coords[1]!] as [number, number]
  })
  // A closed polyline repeats its first point; the outline does not.
  expect(points.length).toBeGreaterThan(3)
  expect(points[0]).toEqual(points[points.length - 1])
  return points.slice(0, -1)
}

/** The Body representation's solid of a product, placed in the world. */
function bodyOf(doc: Doc, product: Entity): WorldSolid {
  // IfcProduct: ..., ObjectPlacement (5), Representation (6)
  const shape = entity(doc, ref(product.args[6]))
  expect(shape.type).toBe('IFCPRODUCTDEFINITIONSHAPE')
  const bodies = refs(shape.args[2])
    .map((id) => entity(doc, id))
    .filter((r) => str(r.args[1]) === 'Body')
  expect(bodies).toHaveLength(1)
  const solids = refs(bodies[0]!.args[3]).map((id) => entity(doc, id))
  expect(solids).toHaveLength(1)

  // IfcExtrudedAreaSolid(SweptArea, Position, ExtrudedDirection, Depth)
  const solid = solids[0]!
  expect(solid.type).toBe('IFCEXTRUDEDAREASOLID')
  const object = placementFrame(doc, ref(product.args[5]))
  const position = axisFrame(doc, ref(solid.args[1]))

  const base = profileOutline(doc, ref(solid.args[0])).map(([x, y]) =>
    toWorld(object, toWorld(position, [x, y, 0]))
  )
  const direction = norm3(
    rotate(object, rotate(position, direction3(doc, ref(solid.args[2]))))
  )
  const depth = num(solid.args[3])
  return { base, top: base.map((p) => add3(p, scale3(direction, depth))), direction, depth }
}

/** CNT-14: every solid of a product's Body representation, placed in the world (a door's frame, leaves and glass). */
function bodiesOf(doc: Doc, product: Entity): WorldSolid[] {
  const shape = entity(doc, ref(product.args[6]))
  const bodies = refs(shape.args[2])
    .map((id) => entity(doc, id))
    .filter((r) => str(r.args[1]) === 'Body')
  expect(bodies).toHaveLength(1)
  const object = placementFrame(doc, ref(product.args[5]))
  return refs(bodies[0]!.args[3]).map((id) => {
    const solid = entity(doc, id)
    expect(solid.type).toBe('IFCEXTRUDEDAREASOLID')
    const position = axisFrame(doc, ref(solid.args[1]))
    const base = profileOutline(doc, ref(solid.args[0])).map(([x, y]) => toWorld(object, toWorld(position, [x, y, 0])))
    const direction = norm3(rotate(object, rotate(position, direction3(doc, ref(solid.args[2])))))
    const depth = num(solid.args[3])
    return { base, top: base.map((p) => add3(p, scale3(direction, depth))), direction, depth }
  })
}

/** Shoelace over x and y: a signed area, positive when counter-clockwise from above. */
function signedAreaXY(points: readonly V3[]): number {
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    sum += a[0] * b[1] - b[0] * a[1]
  }
  return sum / 2
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STAMP = new Date('2026-03-04T05:06:07.890Z')

function emptyPlan(): FloorPlan {
  return { version: '1', units: 'm', walls: [], rooms: [], openings: [] }
}

/** A 4 x 3 room: four exterior walls, one room, one door. */
function samplePlan(): FloorPlan {
  return {
    version: '1',
    units: 'm',
    walls: [
      { id: 'w1', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w2', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w3', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.7, kind: 'exterior' },
      { id: 'w4', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.7, kind: 'exterior' }
    ],
    rooms: [{ id: 'r1', name: 'Living room', boundary: ['w1', 'w2', 'w3', 'w4'] }],
    openings: [{ id: 'o1', wall: 'w1', type: 'door', offset: 1.5, width: 0.9, sill: 0, height: 2.1 }]
  }
}

const exported = (plan: FloorPlan, options = {}): Doc =>
  parseDoc(toIfc(plan, { projectId: 'proj', timestamp: STAMP, ...options }))

// ---------------------------------------------------------------------------
// 1. Document skeleton
// ---------------------------------------------------------------------------

describe('document skeleton', () => {
  it('is an ISO 10303-21 file that names IFC2x3 and the Coordination View', () => {
    const text = toIfc(emptyPlan(), { projectId: 'proj', timestamp: STAMP })
    const doc = parseDoc(text)

    expect(text.startsWith('ISO-10303-21;\nHEADER;\n')).toBe(true)
    expect(text.endsWith('ENDSEC;\nEND-ISO-10303-21;\n')).toBe(true)

    const description = doc.header.get('FILE_DESCRIPTION')!
    // MSG-3: the label follows the view definition.
    expect(items(description[0]).map(str)).toEqual(['ViewDefinition [CoordinationView_V2.0]', 'General guidance, not your local rules'])
    expect(str(description[1])).toBe('2;1')

    const schema = doc.header.get('FILE_SCHEMA')!
    expect(items(schema[0]).map(str)).toEqual(['IFC2X3'])
    expect(doc.header.has('FILE_NAME')).toBe(true)
  })

  it('numbers entities from #1 in the order they are written', () => {
    const doc = exported(samplePlan())
    expect(doc.order.map((e) => e.id)).toEqual(doc.order.map((_, i) => i + 1))
  })

  it('resolves every reference to an entity defined in the file', () => {
    for (const plan of [emptyPlan(), samplePlan()]) {
      const doc = exported(plan)
      for (const e of doc.order) {
        for (const arg of e.args) {
          for (const v of walk(arg)) {
            if (v.t === 'ref') expect(doc.entities.has(v.v), `#${e.id} -> #${v.v}`).toBe(true)
          }
        }
      }
    }
  })

  it('has one project, one site, one building and a ground storey, linked in a chain', () => {
    const doc = exported(emptyPlan())

    const project = only(doc, 'IFCPROJECT')
    const site = only(doc, 'IFCSITE')
    const building = only(doc, 'IFCBUILDING')
    const storey = only(doc, 'IFCBUILDINGSTOREY')

    // IfcRelAggregates(GlobalId, OwnerHistory, Name, Description, RelatingObject, RelatedObjects)
    const aggregates = ofType(doc, 'IFCRELAGGREGATES').map((r) => ({
      parent: ref(r.args[4]),
      children: refs(r.args[5])
    }))

    expect(aggregates).toContainEqual({ parent: project.id, children: [site.id] })
    expect(aggregates).toContainEqual({ parent: site.id, children: [building.id] })
    expect(aggregates).toContainEqual({ parent: building.id, children: [storey.id] })
    expect(ofType(doc, 'IFCSITE')).toHaveLength(1)
  })

  it('declares metres, square metres, cubic metres and radians', () => {
    const doc = exported(emptyPlan())
    const project = only(doc, 'IFCPROJECT')

    // IfcProject(..., Phase, RepresentationContexts, UnitsInContext)
    const assignment = entity(doc, ref(project.args[8]))
    expect(assignment.type).toBe('IFCUNITASSIGNMENT')

    // IfcSIUnit(Dimensions, UnitType, Prefix, Name)
    const units = refs(assignment.args[0]).map((id) => {
      const unit = entity(doc, id)
      expect(unit.type).toBe('IFCSIUNIT')
      expect(unit.args[2]?.t).toBe('null')
      return `${en(unit.args[1])}:${en(unit.args[3])}`
    })

    expect(units.sort()).toEqual([
      'AREAUNIT:SQUARE_METRE',
      'LENGTHUNIT:METRE',
      'PLANEANGLEUNIT:RADIAN',
      'VOLUMEUNIT:CUBIC_METRE'
    ])
  })

  it('gives the project a 3D model context', () => {
    const doc = exported(emptyPlan())
    const project = only(doc, 'IFCPROJECT')

    const contexts = refs(project.args[7]).map((id) => entity(doc, id))
    expect(contexts).toHaveLength(1)

    // IfcGeometricRepresentationContext(ContextIdentifier, ContextType, CoordinateSpaceDimension, ...)
    const context = contexts[0]!
    expect(context.type).toBe('IFCGEOMETRICREPRESENTATIONCONTEXT')
    expect(str(context.args[1])).toBe('Model')
    expect(num(context.args[2])).toBe(3)
  })

  it('writes the project name it is given', () => {
    const doc = exported(emptyPlan(), { projectName: 'House on the hill' })
    expect(str(only(doc, 'IFCPROJECT').args[2])).toBe('House on the hill')
  })
})

describe('determinism and purity', () => {
  it('gives byte-identical output for the same plan, project and timestamp', () => {
    const a = toIfc(samplePlan(), { projectId: 'proj', timestamp: STAMP })
    const b = toIfc(samplePlan(), { projectId: 'proj', timestamp: STAMP })
    expect(a).toBe(b)
  })

  it('carries the given timestamp in the header and the owner history', () => {
    const doc = exported(samplePlan())

    // FILE_NAME(name, time_stamp, author, organization, preprocessor, originating_system, authorization)
    expect(str(doc.header.get('FILE_NAME')![1])).toBe('2026-03-04T05:06:07')

    // IfcOwnerHistory(..., CreationDate): seconds since the epoch.
    const history = only(doc, 'IFCOWNERHISTORY')
    expect(num(history.args[7])).toBe(Math.floor(STAMP.getTime() / 1000))
  })

  it('reads no clock: the default timestamp is a fixed constant', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2031-07-08T09:10:11Z'))
      const first = toIfc(samplePlan(), { projectId: 'proj' })
      vi.setSystemTime(new Date('2032-01-02T03:04:05Z'))
      const second = toIfc(samplePlan(), { projectId: 'proj' })

      expect(first).toBe(second)
      expect(first).not.toContain('2031')
      expect(first).not.toContain('2032')
    } finally {
      vi.useRealTimers()
    }
  })

  it('survives an invalid timestamp by falling back to the default', () => {
    const fallback = toIfc(samplePlan(), { projectId: 'proj' })
    expect(toIfc(samplePlan(), { projectId: 'proj', timestamp: new Date(NaN) })).toBe(fallback)
  })

  it('never writes a negative zero', () => {
    // Walls pointing every way: a left normal built as (-dy, dx) is -0 for a
    // wall along x, and a room corner can land on -0 after an intersection.
    const plan: FloorPlan = {
      version: '1',
      units: 'm',
      walls: [
        { id: 'a', start: [0, 0], end: [-4, 0], thickness: 0.2, height: 2.7, kind: 'interior' },
        { id: 'b', start: [0, 0], end: [0, -3], thickness: 0.2, height: 2.7, kind: 'interior' },
        { id: 'c', start: [-4, -3], end: [0, -3], thickness: 0.2, height: 2.7, kind: 'interior' },
        { id: 'd', start: [-4, 0], end: [-4, -3], thickness: 0.2, height: 2.7, kind: 'interior' }
      ],
      rooms: [{ id: 'r', name: 'Cell', boundary: ['a', 'b', 'c', 'd'] }],
      openings: []
    }

    const text = toIfc(plan, { projectId: 'proj', timestamp: STAMP })
    const doc = parseDoc(text)
    for (const e of doc.order) {
      for (const arg of e.args) {
        for (const v of walk(arg)) {
          if (v.t === 'num') {
            expect(Object.is(v.v, -0), `#${e.id} ${v.raw}`).toBe(false)
            expect(/^-0\.?0*$/.test(v.raw), `#${e.id} ${v.raw}`).toBe(false)
          }
        }
      }
    }
  })
})

// ---------------------------------------------------------------------------
// 2. Identifiers and strings
// ---------------------------------------------------------------------------

const GUID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

describe('GlobalId', () => {
  it('is 22 characters from the IFC alphabet, the first one in 0-3', () => {
    for (const seed of ['', 'a', 'proj:wall:w1', 'proj:room:r\u00f1', 'x'.repeat(500)]) {
      const guid = ifcGuid(seed)
      expect(guid).toHaveLength(22)
      for (const char of guid) expect(GUID_ALPHABET).toContain(char)
      expect('0123').toContain(guid[0]!)
    }
  })

  it('is the same for the same input and different for different inputs', () => {
    expect(ifcGuid('proj:wall:w1')).toBe(ifcGuid('proj:wall:w1'))
    expect(ifcGuid('proj-a:wall:w1')).not.toBe(ifcGuid('proj-b:wall:w1'))
    expect(ifcGuid('proj:wall:w1')).not.toBe(ifcGuid('proj:room:w1'))
  })

  it('does not repeat over 10 000 generated ids, and uses all four first characters', () => {
    const seen = new Set<string>()
    const firsts = new Set<string>()
    for (let i = 0; i < 10_000; i++) {
      const guid = ifcGuid(`proj:wall:w${i}`)
      seen.add(guid)
      firsts.add(guid[0]!)
    }
    expect(seen.size).toBe(10_000)
    expect([...firsts].sort().join('')).toBe('0123')
  })

  it('is pinned: re-exports only stay recognisable while this value never changes', () => {
    expect(ifcGuid('proj:wall:w1')).toBe('082dWZMHF$uj3iBDrXAcV6')
  })

  it('stays unique inside one document even when the seed repeats', () => {
    const issuer = createGuidIssuer('proj')
    const issued = Array.from({ length: 50 }, () => issuer.issue('wall', 'w1'))
    expect(new Set(issued).size).toBe(50)
    for (const guid of issued) expect(guid).toHaveLength(22)
    // The first one is the plain hash: the counter only appears on a collision.
    // QAR-5: the seed is the project, the kind, the floor and the id, as one JSON array.
    expect(issued[0]).toBe(ifcGuid(JSON.stringify(['proj', 'wall', null, 'w1'])))
  })

  it('QAR-5 depends on the floor, and reads no two seeds as one text', () => {
    const issuer = createGuidIssuer('proj')
    expect(issuer.issue('wall', 'w1', 'ground')).toBe(ifcGuid(JSON.stringify(['proj', 'wall', 'ground', 'w1'])))
    expect(issuer.issue('wall', 'w1', 'first')).not.toBe(issuer.issue('wall', 'w1', 'ground'))
    // With the parts joined by colons these two would hash the same text.
    expect(createGuidIssuer('a:b').issue('wall', 'c')).not.toBe(createGuidIssuer('a').issue('b:wall', 'c'))
  })

  it('depends on the project identity', () => {
    expect(createGuidIssuer('a').issue('wall', 'w1')).not.toBe(
      createGuidIssuer('b').issue('wall', 'w1')
    )
  })

  it('gives every rooted entity in a file its own valid id, seeded by the project', () => {
    const a = exported(samplePlan(), { projectId: 'a' })
    const b = exported(samplePlan(), { projectId: 'b' })
    const rootedIds = (doc: Doc): string[] =>
      doc.order
        .filter((e) => e.args[0]?.t === 'str' && e.args[1]?.t === 'ref')
        .map((e) => str(e.args[0]))

    const idsA = rootedIds(a)
    expect(idsA.length).toBeGreaterThan(5)
    expect(new Set(idsA).size).toBe(idsA.length)
    for (const id of idsA) expect(id).toMatch(/^[0-3][0-9A-Za-z_$]{21}$/)

    expect(rootedIds(exported(samplePlan(), { projectId: 'a' }))).toEqual(idsA)
    expect(rootedIds(b).some((id) => idsA.includes(id))).toBe(false)
  })

  it('falls back to a fixed project identity when none is given', () => {
    const first = toIfc(samplePlan(), { timestamp: STAMP })
    expect(toIfc(samplePlan(), { timestamp: STAMP })).toBe(first)
  })
})

describe('STEP strings', () => {
  /** What a conforming reader makes of one written value. */
  const decode = (written: string): string => {
    const [value] = parseArgs(written)
    return str(value)
  }

  it('wraps a plain value in single quotes', () => {
    expect(ifcString('Kitchen')).toBe("'Kitchen'")
  })

  it('doubles a quote and a backslash, so no value can end early', () => {
    expect(ifcString("it's")).toBe("'it''s'")
    expect(ifcString('a\\b')).toBe("'a\\\\b'")
    expect(decode(ifcString("''\\'"))).toBe("''\\'")
  })

  it('writes anything outside printable ASCII as \\X2\\ UTF-16 units', () => {
    expect(ifcString('Ba\u00f1o')).toBe("'Ba\\X2\\00F1\\X0\\o'")
    // Consecutive characters share one block.
    expect(ifcString('\u00f1\u00fc')).toBe("'\\X2\\00F100FC\\X0\\'")
    // A character outside the BMP is one code point of eight digits (CMD-26).
    expect(ifcString('\u{1F600}')).toBe("'\\X4\\0001F600\\X0\\'")
    expect(ifcString('a\u00f1\u{1F600}\u00fc')).toBe("'a\\X2\\00F1\\X0\\\\X4\\0001F600\\X0\\\\X2\\00FC\\X0\\'")
  })

  it('drops control characters', () => {
    expect(ifcString('a\nb\rc\td\u0000e\u007ff\u0085g')).toBe("'abcdefg'")
  })

  it('reads back exactly as typed, for every awkward input', () => {
    const typed = [
      'Ba\u00f1o \'B\'',
      'C:\\temp\\new',
      '\\X2\\0041\\X0\\',
      'caf\u00e9 \u2014 \u65e5\u672c\u8a9e',
      '\u{1F600} emoji',
      '\ud800 lone surrogate',
      "'",
      '\\',
      ''
    ]
    for (const text of typed) expect(decode(ifcString(text))).toBe(text)
  })

  it('writes only printable ASCII, whatever the input', () => {
    const written = ifcString('\u00f1\u2603\u{1F600}\u0000\n')
    expect(written).toMatch(/^[\x20-\x7e]*$/)
  })

  it('cannot forge an entity through a name', () => {
    const plain = exported(emptyPlan(), { projectName: 'x' })
    const hostile = exported(emptyPlan(), {
      projectName: "x\n#999=IFCWALL($);\r\n'),#998=IFCWALL($);"
    })

    expect(hostile.order).toHaveLength(plain.order.length)
    expect(hostile.entities.has(998)).toBe(false)
    expect(hostile.entities.has(999)).toBe(false)

    const name = str(only(hostile, 'IFCPROJECT').args[2])
    expect(name).not.toContain('\n')
    expect(name).not.toContain('\r')
  })

  it('carries the project name through the header and the project, decoded as typed', () => {
    const doc = exported(emptyPlan(), { projectName: "Ba\u00f1o 'B'" })
    expect(str(only(doc, 'IFCPROJECT').args[2])).toBe("Ba\u00f1o 'B'")
    expect(str(doc.header.get('FILE_NAME')![0])).toBe("Ba\u00f1o 'B'")
  })
})

// ---------------------------------------------------------------------------
// 3. Storeys
// ---------------------------------------------------------------------------

const wallOn = (id: string, floor: string | undefined, height: number, extra: Partial<Wall> = {}): Wall => ({
  id,
  start: [0, 0],
  end: [4, 0],
  thickness: 0.2,
  height,
  kind: 'interior',
  ...(floor === undefined ? {} : { floor }),
  ...extra
})

const planOf = (floors: Floor[] | undefined, walls: Wall[]): FloorPlan => ({
  version: '1',
  units: 'm',
  walls,
  rooms: [],
  openings: [],
  ...(floors ? { floors } : {})
})

interface StoreyView {
  readonly name: string
  readonly elevation: number
  /** Where its placement puts it in the world, composed by hand. */
  readonly z: number
}

/** Storeys in the order the building aggregates them. */
function storeysOf(doc: Doc): StoreyView[] {
  const building = only(doc, 'IFCBUILDING')
  const link = ofType(doc, 'IFCRELAGGREGATES').find((r) => ref(r.args[4]) === building.id)!
  return refs(link.args[5]).map((id) => {
    const storey = entity(doc, id)
    expect(storey.type).toBe('IFCBUILDINGSTOREY')
    return {
      name: str(storey.args[2]),
      elevation: num(storey.args[9]),
      z: placementFrame(doc, ref(storey.args[5])).o[2]
    }
  })
}

const elevations = (doc: Doc): Record<string, number> =>
  Object.fromEntries(storeysOf(doc).map((s) => [s.name, s.elevation]))

describe('storeys', () => {
  const ground: Floor = { id: 'ground', name: 'Ground', level: 0 }
  const first: Floor = { id: 'first', name: 'First', level: 1 }
  const basement: Floor = { id: 'cellar', name: 'Cellar', level: -1 }

  it('writes one storey per floor, named after it, in the order planFloors gives', () => {
    const plan = planOf(
      [first, ground, basement],
      [wallOn('a', 'ground', 2.7), wallOn('b', 'first', 2.7), wallOn('c', 'cellar', 2.7), wallOn('d', 'attic', 2.7)]
    )

    // Registry floors by level, then a floor only a wall names, appended last.
    expect(storeysOf(exported(plan)).map((s) => s.name)).toEqual([
      'Cellar',
      'Ground',
      'First',
      'attic'
    ])
  })

  it('puts the ground storey at elevation 0, and the placement agrees with the attribute', () => {
    const doc = exported(planOf([ground], [wallOn('a', 'ground', 2.7)]))
    expect(storeysOf(doc)).toEqual([{ name: 'Ground', elevation: 0, z: 0 }])
  })

  it('stands the first floor on its slab, on the tallest wall of the ground floor', () => {
    const plan = planOf([ground, first], [wallOn('a', 'ground', 2.7), wallOn('b', 'ground', 3.0)])
    const doc = exported(plan)

    expect(elevations(doc)).toEqual({ Ground: 0, First: 3.25 })
    for (const s of storeysOf(doc)) expect(s.z).toBeCloseTo(s.elevation, 9)
  })

  it('sinks a basement by its own tallest wall, under the ground floor slab', () => {
    const plan = planOf([basement, ground], [wallOn('a', 'cellar', 2.4), wallOn('b', 'ground', 3.0)])
    const doc = exported(plan)

    expect(elevations(doc)).toEqual({ Cellar: -2.65, Ground: 0 })
    for (const s of storeysOf(doc)) expect(s.z).toBeCloseTo(s.elevation, 9)
  })

  it('stacks several basements downward, each by its own height', () => {
    const deep: Floor = { id: 'deep', name: 'Deep', level: -2 }
    const plan = planOf(
      [deep, basement, ground],
      [wallOn('a', 'deep', 2.0), wallOn('b', 'cellar', 2.4), wallOn('c', 'ground', 3.0)]
    )

    expect(elevations(exported(plan))).toEqual({ Deep: -4.9, Cellar: -2.65, Ground: 0 })
  })

  it('puts a plan with only basements at or below 0', () => {
    expect(elevations(exported(planOf([basement], [wallOn('a', 'cellar', 2.4)])))).toEqual({
      Cellar: -2.65
    })
  })

  it('lets floors that share a level share an elevation', () => {
    const wing: Floor = { id: 'wing', name: 'Wing', level: 0 }
    const plan = planOf(
      [ground, wing, first],
      [wallOn('a', 'ground', 2.5), wallOn('b', 'wing', 3.2), wallOn('c', 'first', 2.7)]
    )

    // The level is as tall as its tallest wall on any of its floors.
    expect(elevations(exported(plan))).toEqual({ Ground: 0, Wing: 0, First: 3.45 })
  })

  it('counts a level with no walls as 2.7 m', () => {
    expect(elevations(exported(planOf([ground, first], [])))).toEqual({ Ground: 0, First: 2.95 })
  })

  it('ignores gaps in the level numbering: levels are an order, not positions', () => {
    const attic: Floor = { id: 'attic', name: 'Attic', level: 5 }
    const sub: Floor = { id: 'sub', name: 'Sub', level: -4 }
    const plan = planOf(
      [sub, basement, ground, attic],
      [wallOn('a', 'sub', 2.0), wallOn('b', 'cellar', 2.4), wallOn('c', 'ground', 3.0)]
    )

    expect(elevations(exported(plan))).toEqual({ Sub: -4.9, Cellar: -2.65, Ground: 0, Attic: 3.25 })
  })

  it('R-12 stands a third-floor flat at its stated elevation (LVL-1)', () => {
    const third: Floor = { id: 'third', name: 'Third', level: 3, elevation: 8.85 }
    const doc = exported(planOf([third], [wallOn('a', 'third', 2.7)]))
    expect(elevations(doc)).toEqual({ Third: 8.85 })
    expect(storeysOf(doc)[0]!.elevation).toBe(floorElevations(planOf([third], [wallOn('a', 'third', 2.7)])).floors.get('third')!.floorLevel)
  })

  it('stacks a stated loft and its slab as the 3D view does (LVL-1)', () => {
    const loft: Floor = { id: 'loft', name: 'Loft', level: 1, elevation: 2.55, slab: 0.15 }
    const plan = planOf([ground, loft], [wallOn('a', 'ground', 3.6), wallOn('b', 'loft', 1.2)])
    expect(elevations(exported(plan))).toEqual({ Ground: 0, Loft: 2.55 })
  })

  it('starts the stack at 0 when the lowest level at or above 0 is not 0', () => {
    const plan = planOf([first], [wallOn('a', 'first', 2.9)])
    expect(elevations(exported(plan))).toEqual({ First: 0 })
  })

  it('does not let a virtual or broken wall set the height of a level', () => {
    const plan = planOf(
      [ground, first],
      [
        wallOn('a', 'ground', 2.7),
        wallOn('virtual', 'ground', 9, { virtual: true }),
        wallOn('zero', 'ground', 8, { start: [1, 1], end: [1, 1] }),
        wallOn('b', 'first', 2.7)
      ]
    )

    expect(elevations(exported(plan))).toEqual({ Ground: 0, First: 2.95 })
  })

  it('gives every storey the floor level the 3D view draws it at', () => {
    const deep: Floor = { id: 'deep', name: 'Deep', level: -2 }
    const wing: Floor = { id: 'wing', name: 'Wing', level: 0 }
    const plan = planOf(
      [deep, basement, ground, wing, first],
      [
        wallOn('a', 'deep', 2.2),
        wallOn('b', 'cellar', 2.5),
        wallOn('c', 'ground', 3.0),
        wallOn('d', 'wing', 3.4),
        wallOn('e', 'first', 2.8),
        wallOn('v', 'first', 7, { virtual: true })
      ]
    )
    const { floors } = floorElevations(plan)
    const byName = elevations(exported(plan))

    for (const floor of plan.floors!) {
      expect(byName[floor.name], floor.name).toBeCloseTo(floors.get(floor.id)!.floorLevel, 9)
    }
  })

  it('writes a single ground storey when no floors are declared', () => {
    // No registry and walls that name none: one ground storey holds everything.
    const doc = exported(samplePlan())
    expect(storeysOf(doc)).toEqual([{ name: 'Ground floor', elevation: 0, z: 0 }])
  })

  it('gives every storey its own GlobalId', () => {
    const doc = exported(planOf([ground, first, basement], []))
    const ids = ofType(doc, 'IFCBUILDINGSTOREY').map((e) => str(e.args[0]))
    expect(new Set(ids).size).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// 4. Walls
// ---------------------------------------------------------------------------

/** A wall of `length` leaving `start` at `degrees`, so its direction is known independently. */
function wallAt(
  id: string,
  start: [number, number],
  degrees: number,
  length: number,
  extra: Partial<Wall> = {}
): Wall {
  const angle = (degrees * Math.PI) / 180
  return {
    id,
    start,
    end: [start[0] + length * Math.cos(angle), start[1] + length * Math.sin(angle)],
    thickness: 0.2,
    height: 2.7,
    kind: 'interior',
    ...extra
  }
}

const ANGLES = [0, 30, 90, 135, 217, -45, 180]

const wallsOf = (doc: Doc): Entity[] => ofType(doc, 'IFCWALLSTANDARDCASE')

function wallByName(doc: Doc, name: string): Entity {
  const found = wallsOf(doc).filter((e) => str(e.args[2]) === name)
  expect(found, name).toHaveLength(1)
  return found[0]!
}

/** Which storey (by name) contains each element (by name), from the containment relations. */
function containment(doc: Doc): Map<string, string> {
  const out = new Map<string, string>()
  for (const rel of ofType(doc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE')) {
    const storey = entity(doc, ref(rel.args[5]))
    expect(storey.type).toBe('IFCBUILDINGSTOREY')
    for (const id of refs(rel.args[4])) {
      const name = str(entity(doc, id).args[2])
      expect(out.has(name), `${name} is contained twice`).toBe(false)
      out.set(name, str(storey.args[2]))
    }
  }
  return out
}

describe('wall solids', () => {
  for (const degrees of ANGLES) {
    describe(`a wall leaving at ${degrees} degrees`, () => {
      const wall = wallAt('w', [1.5, -2.25], degrees, 4, { thickness: 0.3, height: 2.9 })
      const dx = wall.end[0] - wall.start[0]
      const dy = wall.end[1] - wall.start[1]
      const length = Math.hypot(dx, dy)
      const dir: V3 = [dx / length, dy / length, 0]

      const setup = (): { doc: Doc; element: Entity } => {
        const doc = exported(planOf(undefined, [wall]))
        return { doc, element: wallByName(doc, 'w') }
      }

      it('extrudes a volume of length x thickness x height', () => {
        const { doc, element } = setup()
        const solid = bodyOf(doc, element)
        const volume = Math.abs(signedAreaXY(solid.base)) * solid.depth * Math.abs(solid.direction[2])
        expect(volume).toBeCloseTo(length * 0.3 * 2.9, 8)
        expect(solid.depth).toBeCloseTo(2.9, 9)
      })

      it('sweeps straight up from the storey', () => {
        const { doc, element } = setup()
        const solid = bodyOf(doc, element)
        expect(solid.direction[0]).toBeCloseTo(0, 9)
        expect(solid.direction[1]).toBeCloseTo(0, 9)
        expect(solid.direction[2]).toBeCloseTo(1, 9)
        for (const p of solid.base) expect(p[2]).toBeCloseTo(0, 9)
        for (const p of solid.top) expect(p[2]).toBeCloseTo(2.9, 9)
      })

      it('has both faces half the thickness from the axis, and spans start to end', () => {
        const { doc, element } = setup()
        // Each corner, read against the plan's own start and direction.
        const corners = bodyOf(doc, element).base.map((p) => {
          const d = sub3(p, [wall.start[0], wall.start[1], 0])
          return {
            along: dot3(d, dir),
            across: cross3(dir, d)[2]
          }
        })

        expect(corners).toHaveLength(4)
        for (const corner of corners) {
          expect(Math.abs(corner.across)).toBeCloseTo(0.15, 8)
          const atEnd = Math.abs(corner.along - length) < 1e-8
          const atStart = Math.abs(corner.along) < 1e-8
          expect(atStart || atEnd).toBe(true)
        }
        // Both faces are there: the thickness grows on each side of the axis (C1).
        expect(Math.max(...corners.map((c) => c.across))).toBeCloseTo(0.15, 8)
        expect(Math.min(...corners.map((c) => c.across))).toBeCloseTo(-0.15, 8)
      })

      it('has its local X along start to end, Z up, and X x Y = Z', () => {
        const { doc, element } = setup()
        const frame = placementFrame(doc, ref(element.args[5]))

        expect(frame.o[0]).toBeCloseTo(wall.start[0], 9)
        expect(frame.o[1]).toBeCloseTo(wall.start[1], 9)
        expect(frame.o[2]).toBeCloseTo(0, 9)

        for (let i = 0; i < 3; i++) expect(frame.x[i]).toBeCloseTo(dir[i]!, 9)
        expect(frame.z).toEqual([0, 0, 1])

        const handed = cross3(frame.x, frame.y)
        for (let i = 0; i < 3; i++) expect(handed[i]).toBeCloseTo(frame.z[i]!, 9)
        // Y is the left normal of the wall, the side C1 calls `left`.
        expect(frame.y[0]).toBeCloseTo(-dir[1]!, 9)
        expect(frame.y[1]).toBeCloseTo(dir[0]!, 9)
      })

      it('draws its axis from start to end', () => {
        const { doc, element } = setup()
        const shape = entity(doc, ref(element.args[6]))
        const axis = refs(shape.args[2])
          .map((id) => entity(doc, id))
          .filter((r) => str(r.args[1]) === 'Axis')
        expect(axis).toHaveLength(1)

        const curve = entity(doc, refs(axis[0]!.args[3])[0]!)
        expect(curve.type).toBe('IFCPOLYLINE')
        const frame = placementFrame(doc, ref(element.args[5]))
        const ends = refs(curve.args[0]).map((id) => {
          const p = nums(entity(doc, id).args[0])
          return toWorld(frame, [p[0]!, p[1]!, 0])
        })

        expect(ends).toHaveLength(2)
        expect(ends[0]![0]).toBeCloseTo(wall.start[0], 8)
        expect(ends[0]![1]).toBeCloseTo(wall.start[1], 8)
        expect(ends[1]![0]).toBeCloseTo(wall.end[0], 8)
        expect(ends[1]![1]).toBeCloseTo(wall.end[1], 8)
      })
    })
  }

  it('writes a 4 m wall as 4 in the document length unit, which is metres', () => {
    const doc = exported(planOf(undefined, [wallAt('w', [0, 0], 0, 4, { thickness: 0.2, height: 2.7 })]))
    const solid = bodyOf(doc, wallByName(doc, 'w'))
    const xs = solid.base.map((p) => p[0])
    const ys = solid.base.map((p) => p[1])

    expect(Math.min(...xs)).toBeCloseTo(0, 9)
    expect(Math.max(...xs)).toBeCloseTo(4, 9)
    expect(Math.min(...ys)).toBeCloseTo(-0.1, 9)
    expect(Math.max(...ys)).toBeCloseTo(0.1, 9)
    expect(solid.depth).toBeCloseTo(2.7, 9)
    expect(Math.abs(signedAreaXY(solid.base)) * solid.depth).toBeCloseTo(2.16, 9)
  })

  it('names the wall after its id and gives it its own GlobalId', () => {
    const doc = exported(
      planOf(undefined, [wallAt('a', [0, 0], 0, 2), wallAt('b', [0, 1], 0, 2)])
    )
    const walls = wallsOf(doc)
    expect(walls.map((e) => str(e.args[2]))).toEqual(['a', 'b'])
    expect(new Set(walls.map((e) => str(e.args[0]))).size).toBe(2)
  })
})

describe('wall placement in the building', () => {
  const floors: Floor[] = [
    { id: 'ground', name: 'Ground', level: 0 },
    { id: 'first', name: 'First', level: 1 }
  ]
  const plan = planOf(floors, [
    wallAt('low', [0, 0], 0, 4, { floor: 'ground', height: 3.0 }),
    wallAt('high', [0, 0], 0, 4, { floor: 'first', height: 2.5 }),
    wallAt('divider', [0, 2], 0, 4, { floor: 'ground', virtual: true })
  ])

  it('contains each wall in its own storey, and in only one', () => {
    const doc = exported(plan)
    expect(containment(doc)).toEqual(
      new Map([
        ['low', 'Ground'],
        ['high', 'First']
      ])
    )
  })

  it('does not export a virtual wall', () => {
    const doc = exported(plan)
    expect(wallsOf(doc).map((e) => str(e.args[2]))).toEqual(['low', 'high'])
  })

  it('lifts a wall on a higher storey to that storey elevation', () => {
    const doc = exported(plan)
    const solid = bodyOf(doc, wallByName(doc, 'high'))

    for (const p of solid.base) expect(p[2]).toBeCloseTo(3.25, 9)
    for (const p of solid.top) expect(p[2]).toBeCloseTo(5.75, 9)
  })

  it('references no wall that is not contained', () => {
    const doc = exported(plan)
    const contained = new Set(
      ofType(doc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE').flatMap((r) => refs(r.args[4]))
    )
    for (const wall of wallsOf(doc)) expect(contained.has(wall.id)).toBe(true)
  })
})

describe('Pset_WallCommon', () => {
  /** IsExternal as a reader sees it: through the property set attached to the wall. */
  function isExternal(doc: Doc, wall: Entity): boolean {
    // HND-2 gives the wall its base quantities too: Pset_WallCommon is one of its sets.
    const defining = ofType(doc, 'IFCRELDEFINESBYPROPERTIES').filter(
      (r) => refs(r.args[4]).includes(wall.id) && str(entity(doc, ref(r.args[5])).args[2]) === 'Pset_WallCommon'
    )
    expect(defining).toHaveLength(1)

    const set = entity(doc, ref(defining[0]!.args[5]))
    expect(set.type).toBe('IFCPROPERTYSET')
    expect(str(set.args[2])).toBe('Pset_WallCommon')

    const props = refs(set.args[4]).map((id) => entity(doc, id))
    const flag = props.filter((p) => str(p.args[0]) === 'IsExternal')
    expect(flag).toHaveLength(1)

    const value = flag[0]!.args[2]
    if (value?.t !== 'typed') throw new Error('IsExternal must be a typed value')
    expect(value.name).toBe('IFCBOOLEAN')
    return en(value.v) === 'T'
  }

  it('marks exactly the exterior walls as external', () => {
    const doc = exported(
      planOf(undefined, [
        wallAt('ext', [0, 0], 0, 4, { kind: 'exterior' }),
        wallAt('int', [0, 1], 0, 4, { kind: 'interior' }),
        wallAt('par', [0, 2], 0, 4, { kind: 'partition' })
      ])
    )

    expect(isExternal(doc, wallByName(doc, 'ext'))).toBe(true)
    expect(isExternal(doc, wallByName(doc, 'int'))).toBe(false)
    expect(isExternal(doc, wallByName(doc, 'par'))).toBe(false)
  })

  // MSG-13 (lab MS-11): `IsExternal` is the answer the drawing and the DXF give, worked out from
  // the rooms on each wall's sides. Until then it followed the declared kind, and a plan that left
  // the kind out (which reads as `interior`) had every wall not external while the DXF put them all
  // on the exterior layer.
  it('follows how exposed the wall is, as the drawing and the DXF do, when no kind says exterior', () => {
    // Every wall of the sample's rooms with a room on one side only faces outside.
    const plan = samplePlan()
    const interior: FloorPlan = {
      ...plan,
      walls: plan.walls.map((wall) => ({ ...wall, kind: 'interior' as const }))
    }
    const index = indexPlan(interior)
    const doc = exported(interior)
    for (const wall of wallsOf(doc)) {
      const id = str(wall.args[2])
      expect(isExternal(doc, wall), id).toBe(wallExposure(index, id) === 'exterior')
    }
    expect(wallsOf(doc).some((wall) => isExternal(doc, wall))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 5. Openings, doors and windows
// ---------------------------------------------------------------------------

const openingOn = (
  id: string,
  wall: string,
  type: Opening['type'],
  offset: number,
  width: number,
  sill: number,
  height: number
): Opening => ({ id, wall, type, offset, width, sill, height })

const openingsIn = (doc: Doc): Entity[] => ofType(doc, 'IFCOPENINGELEMENT')

function openingByName(doc: Doc, name: string): Entity {
  const found = openingsIn(doc).filter((e) => str(e.args[2]) === name)
  expect(found, name).toHaveLength(1)
  return found[0]!
}

/** The wall elements each opening element voids, from IfcRelVoidsElement. */
function voidedWalls(doc: Doc, opening: Entity): Entity[] {
  // IfcRelVoidsElement(GlobalId, OwnerHistory, Name, Description, RelatingBuildingElement, RelatedOpeningElement)
  return ofType(doc, 'IFCRELVOIDSELEMENT')
    .filter((r) => ref(r.args[5]) === opening.id)
    .map((r) => entity(doc, ref(r.args[4])))
}

/** The fillers of an opening, from IfcRelFillsElement(…, RelatingOpeningElement, RelatedBuildingElement). */
function fillersOf(doc: Doc, opening: Entity): Entity[] {
  return ofType(doc, 'IFCRELFILLSELEMENT')
    .filter((r) => ref(r.args[4]) === opening.id)
    .map((r) => entity(doc, ref(r.args[5])))
}

/**
 * A solid's corners read against the plan's own wall: how far along the wall
 * from `start`, how far across its axis (positive to the left), and how high.
 */
function inWallTerms(solid: WorldSolid, wall: Wall): { along: number[]; across: number[]; z: number[] } {
  const dx = wall.end[0] - wall.start[0]
  const dy = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dy)
  const dir: V3 = [dx / length, dy / length, 0]
  const all = [...solid.base, ...solid.top].map((p) => {
    const d = sub3(p, [wall.start[0], wall.start[1], 0])
    return { along: dot3(d, dir), across: cross3(dir, d)[2], z: p[2] }
  })
  return {
    along: all.map((p) => p.along),
    across: all.map((p) => p.across),
    z: all.map((p) => p.z)
  }
}

const span = (values: readonly number[]): [number, number] => [
  Math.min(...values),
  Math.max(...values)
]

describe('opening voids', () => {
  for (const degrees of ANGLES) {
    describe(`in a wall leaving at ${degrees} degrees`, () => {
      const wall = wallAt('w', [-1.25, 0.75], degrees, 4, { thickness: 0.3, height: 2.7 })
      const window = openingOn('win', 'w', 'window', 1.0, 1.2, 0.9, 1.2)
      const setup = (): { doc: Doc; opening: Entity } => {
        const doc = exported({ ...planOf(undefined, [wall]), openings: [window] })
        return { doc, opening: openingByName(doc, 'win') }
      }

      it('sits inside its wall along the axis, from offset to offset + width', () => {
        const { doc, opening } = setup()
        const [from, to] = span(inWallTerms(bodyOf(doc, opening), wall).along)

        expect(from).toBeCloseTo(1.0, 8)
        expect(to).toBeCloseTo(2.2, 8)
        expect(from).toBeGreaterThanOrEqual(0)
        expect(to).toBeLessThanOrEqual(4 + 1e-8)
      })

      it('rises from the sill to the head, inside the wall height', () => {
        const { doc, opening } = setup()
        const [low, high] = span(inWallTerms(bodyOf(doc, opening), wall).z)

        expect(low).toBeCloseTo(0.9, 8)
        expect(high).toBeCloseTo(2.1, 8)
        expect(low).toBeGreaterThanOrEqual(0)
        expect(high).toBeLessThanOrEqual(2.7 + 1e-8)
      })

      it('passes through both faces of the wall', () => {
        const { doc, opening } = setup()
        const [left, right] = span(inWallTerms(bodyOf(doc, opening), wall).across)

        // The faces are at +-0.15; a void that stopped there would leave a skin.
        expect(left).toBeLessThan(-0.15)
        expect(right).toBeGreaterThan(0.15)
        // ...and it is centred on the axis, so it overshoots both faces equally.
        expect(left + right).toBeCloseTo(0, 8)
      })

      it('is a right prism swept straight up', () => {
        const { doc, opening } = setup()
        const solid = bodyOf(doc, opening)
        expect(solid.direction[2]).toBeCloseTo(1, 9)
        expect(solid.depth).toBeCloseTo(1.2, 9)
        expect(Math.abs(signedAreaXY(solid.base))).toBeCloseTo(1.2 * (0.3 + 0.02), 8)
      })
    })
  }

  it('voids exactly one wall, the one it hangs on', () => {
    const doc = exported({
      ...planOf(undefined, [wallAt('a', [0, 0], 0, 4), wallAt('b', [0, 3], 0, 4)]),
      openings: [
        openingOn('oa', 'a', 'door', 0.5, 0.9, 0, 2.1),
        openingOn('ob1', 'b', 'window', 0.5, 1.0, 0.9, 1.2),
        openingOn('ob2', 'b', 'opening', 2.5, 1.0, 0, 2.1)
      ]
    })

    const wallNamed = (opening: string): string[] =>
      voidedWalls(doc, openingByName(doc, opening)).map((e) => str(e.args[2]))

    expect(wallNamed('oa')).toEqual(['a'])
    expect(wallNamed('ob1')).toEqual(['b'])
    expect(wallNamed('ob2')).toEqual(['b'])
    expect(openingsIn(doc)).toHaveLength(3)
  })

  it('places the void relative to its wall, at the offset and the sill', () => {
    const wall = wallAt('w', [2, 1], 0, 4)
    const doc = exported({
      ...planOf(undefined, [wall]),
      openings: [openingOn('win', 'w', 'window', 1.0, 1.2, 0.9, 1.2)]
    })

    const element = wallByName(doc, 'w')
    const opening = openingByName(doc, 'win')
    const local = entity(doc, ref(opening.args[5]))

    expect(ref(local.args[0])).toBe(ref(element.args[5]))
    const frame = placementFrame(doc, ref(opening.args[5]))
    expect(frame.o[0]).toBeCloseTo(2 + 1.0, 9)
    expect(frame.o[1]).toBeCloseTo(1, 9)
    expect(frame.o[2]).toBeCloseTo(0.9, 9)
  })

  it('lifts a void on a higher storey with its storey', () => {
    const floors: Floor[] = [
      { id: 'ground', name: 'Ground', level: 0 },
      { id: 'first', name: 'First', level: 1 }
    ]
    const wall = wallAt('up', [0, 0], 0, 4, { floor: 'first' })
    const doc = exported({
      ...planOf(floors, [wallAt('low', [0, 5], 0, 4, { floor: 'ground', height: 3.0 }), wall]),
      openings: [openingOn('win', 'up', 'window', 1.0, 1.2, 0.9, 1.2)]
    })

    const [low, high] = span(inWallTerms(bodyOf(doc, openingByName(doc, 'win')), wall).z)
    expect(low).toBeCloseTo(3.25 + 0.9, 8)
    expect(high).toBeCloseTo(3.25 + 2.1, 8)
  })

  it('writes every void of a wall, in the order along it', () => {
    const doc = exported({
      ...planOf(undefined, [wallAt('w', [0, 0], 0, 6)]),
      openings: [
        openingOn('far', 'w', 'window', 4, 1, 0.9, 1.2),
        openingOn('near', 'w', 'door', 0.5, 0.9, 0, 2.1)
      ]
    })
    expect(openingsIn(doc).map((e) => str(e.args[2]))).toEqual(['near', 'far'])
  })
})

describe('doors and windows fill their void', () => {
  const plan: FloorPlan = {
    ...planOf(undefined, [wallAt('w', [0, 0], 30, 5, { thickness: 0.25 })]),
    openings: [
      openingOn('d', 'w', 'door', 0.5, 0.9, 0, 2.1),
      openingOn('win', 'w', 'window', 2.0, 1.4, 0.9, 1.2),
      openingOn('gap', 'w', 'opening', 3.8, 1.0, 0, 2.2)
    ]
  }
  const wall = plan.walls[0]!

  it('fills a door void with exactly one IfcDoor of the opening size', () => {
    const doc = exported(plan)
    const fillers = fillersOf(doc, openingByName(doc, 'd'))

    expect(fillers).toHaveLength(1)
    expect(fillers[0]!.type).toBe('IFCDOOR')
    // IfcDoor(..., Tag, OverallHeight, OverallWidth)
    expect(num(fillers[0]!.args[8])).toBeCloseTo(2.1, 9)
    expect(num(fillers[0]!.args[9])).toBeCloseTo(0.9, 9)
    expect(str(fillers[0]!.args[2])).toBe('d')
  })

  it('fills a window void with exactly one IfcWindow of the opening size', () => {
    const doc = exported(plan)
    const fillers = fillersOf(doc, openingByName(doc, 'win'))

    expect(fillers).toHaveLength(1)
    expect(fillers[0]!.type).toBe('IFCWINDOW')
    expect(num(fillers[0]!.args[8])).toBeCloseTo(1.2, 9)
    expect(num(fillers[0]!.args[9])).toBeCloseTo(1.4, 9)
  })

  it('leaves a plain opening as a void with no filler', () => {
    const doc = exported(plan)

    expect(fillersOf(doc, openingByName(doc, 'gap'))).toHaveLength(0)
    expect(ofType(doc, 'IFCDOOR')).toHaveLength(1)
    expect(ofType(doc, 'IFCWINDOW')).toHaveLength(1)
    expect(ofType(doc, 'IFCRELFILLSELEMENT')).toHaveLength(2)
    // Still voids the wall.
    expect(voidedWalls(doc, openingByName(doc, 'gap'))).toHaveLength(1)
  })

  it('fills each void with something that has its own GlobalId', () => {
    const doc = exported(plan)
    const rooted = [...openingsIn(doc), ...ofType(doc, 'IFCDOOR'), ...ofType(doc, 'IFCWINDOW')]
    expect(new Set(rooted.map((e) => str(e.args[0]))).size).toBe(rooted.length)
  })

  it('CNT-14 fills the void with a frame and a leaf: the frame lines the wall, the leaf of a door with no swing sits in its middle', () => {
    const doc = exported(plan)
    const door = fillersOf(doc, openingByName(doc, 'd'))[0]!
    const solids = bodiesOf(doc, door).map((solid) => inWallTerms(solid, wall))
    // Together they fill the void: along the opening, through the wall, from the floor to the head.
    const [from, to] = span(solids.flatMap((t) => t.along))
    expect(from).toBeCloseTo(0.5, 8)
    expect(to).toBeCloseTo(1.4, 8)
    const [low, high] = span(solids.flatMap((t) => t.z))
    expect(low).toBeCloseTo(0, 8)
    expect(high).toBeCloseTo(2.1, 8)
    // Two jambs and a head (a door has no sill), then the leaf, `leafThickness` thick, centred.
    expect(solids).toHaveLength(4)
    const leaf = solids[3]!
    const [left, right] = span(leaf.across)
    expect(right - left).toBeCloseTo(0.04, 8)
    expect(left + right).toBeCloseTo(0, 8)
    for (const jamb of solids.slice(0, 2)) expect(span(jamb.across)[1] - span(jamb.across)[0]).toBeCloseTo(wall.thickness, 8)
  })

  it('places the filler relative to the void it fills', () => {
    const doc = exported(plan)
    const opening = openingByName(doc, 'win')
    const window = fillersOf(doc, opening)[0]!
    expect(ref(entity(doc, ref(window.args[5])).args[0])).toBe(ref(opening.args[5]))
  })

  it('contains doors and windows in their wall storey, and the void only through its wall', () => {
    const floors: Floor[] = [
      { id: 'ground', name: 'Ground', level: 0 },
      { id: 'first', name: 'First', level: 1 }
    ]
    const doc = exported({
      ...planOf(floors, [
        wallAt('low', [0, 0], 0, 4, { floor: 'ground' }),
        wallAt('high', [0, 0], 0, 4, { floor: 'first' })
      ]),
      openings: [
        openingOn('dLow', 'low', 'door', 0.5, 0.9, 0, 2.1),
        openingOn('wHigh', 'high', 'window', 1, 1, 0.9, 1.2),
        openingOn('gHigh', 'high', 'opening', 2.5, 1, 0, 2.1)
      ]
    })

    expect(containment(doc)).toEqual(
      new Map([
        ['low', 'Ground'],
        ['dLow', 'Ground'],
        ['high', 'First'],
        ['wHigh', 'First']
      ])
    )
  })
})

// ---------------------------------------------------------------------------
// 6. Spaces
// ---------------------------------------------------------------------------

/**
 * Four walls whose axes make a rectangle `width` x `depth` from (x0, y0),
 * counter-clockwise, all `thickness` thick, with the given ids prefixed.
 */
function boxWalls(
  prefix: string,
  x0: number,
  y0: number,
  width: number,
  depth: number,
  extra: Partial<Wall> = {}
): Wall[] {
  const corners: [number, number][] = [
    [x0, y0],
    [x0 + width, y0],
    [x0 + width, y0 + depth],
    [x0, y0 + depth]
  ]
  return corners.map((start, i) => ({
    id: `${prefix}${i + 1}`,
    start,
    end: corners[(i + 1) % 4]!,
    thickness: 0.2,
    height: 2.7,
    kind: 'interior' as const,
    ...extra
  }))
}

const roomOf = (id: string, name: string, boundary: string[], floor?: string): Room => ({
  id,
  name,
  boundary,
  ...(floor === undefined ? {} : { floor })
})

const spacesOf = (doc: Doc): Entity[] => ofType(doc, 'IFCSPACE')

/** HND-2: by the room's name, its LongName; its Name is its number. */
function spaceByName(doc: Doc, name: string): Entity {
  const found = spacesOf(doc).filter((e) => str(e.args[7]) === name)
  expect(found, name).toHaveLength(1)
  return found[0]!
}

/** The storeys (by name) that aggregate each space (by name), from IfcRelAggregates. */
function spaceStoreys(doc: Doc): Map<string, string> {
  const out = new Map<string, string>()
  for (const rel of ofType(doc, 'IFCRELAGGREGATES')) {
    const parent = entity(doc, ref(rel.args[4]))
    if (parent.type !== 'IFCBUILDINGSTOREY') continue
    for (const id of refs(rel.args[5])) {
      const child = entity(doc, id)
      expect(child.type).toBe('IFCSPACE')
      expect(out.has(str(child.args[7]))).toBe(false)
      out.set(str(child.args[7]), str(parent.args[2]))
    }
  }
  return out
}

describe('spaces', () => {
  /** A 4 x 3 room inside walls on a 4.2 x 3.2 axis rectangle, 0.2 thick. */
  const kitchenPlan = (boundary = ['k1', 'k2', 'k3', 'k4']): FloorPlan => ({
    ...planOf(undefined, boxWalls('k', 0, 0, 4.2, 3.2)),
    rooms: [roomOf('kitchen', 'Kitchen', boundary)]
  })

  it('exports each room as a space numbered and named after it, under its storey', () => {
    const doc = exported(kitchenPlan())
    const space = spaceByName(doc, 'Kitchen')

    expect(spacesOf(doc)).toHaveLength(1)
    // IfcSpace(..., Name, ..., LongName): HND-2 makes the Name the room's number.
    expect(str(space.args[2])).toBe('1')
    expect(str(space.args[7])).toBe('Kitchen')
    expect(spaceStoreys(doc)).toEqual(new Map([['Kitchen', 'Ground floor']]))
  })

  it('gives the footprint of the inner faces: 12 m2 for a 4 m by 3 m room (C3)', () => {
    const doc = exported(kitchenPlan())
    const solid = bodyOf(doc, spaceByName(doc, 'Kitchen'))

    expect(Math.abs(signedAreaXY(solid.base))).toBeCloseTo(12, 8)

    // The corners are where the inner faces meet, not where the axes do.
    const corners = solid.base.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).sort()
    expect(corners).toEqual(['0.100000,0.100000', '0.100000,3.100000', '4.100000,0.100000', '4.100000,3.100000'])
  })

  it('measures from the inner faces even when walls differ in thickness', () => {
    const walls = boxWalls('t', 0, 0, 5, 4)
    walls[0]!.thickness = 0.3
    walls[2]!.thickness = 0.3
    const doc = exported({
      ...planOf(undefined, walls),
      rooms: [roomOf('r', 'Studio', ['t1', 't2', 't3', 't4'])]
    })

    // Inner width 5 - 0.1 - 0.1, inner depth 4 - 0.15 - 0.15.
    expect(Math.abs(signedAreaXY(bodyOf(doc, spaceByName(doc, 'Studio')).base))).toBeCloseTo(
      4.8 * 3.7,
      8
    )
  })

  it('winds the footprint counter-clockwise, whichever way the boundary is listed', () => {
    for (const boundary of [
      ['k1', 'k2', 'k3', 'k4'],
      ['k4', 'k3', 'k2', 'k1'],
      ['k3', 'k4', 'k1', 'k2']
    ]) {
      const doc = exported(kitchenPlan(boundary))
      expect(signedAreaXY(bodyOf(doc, spaceByName(doc, 'Kitchen')).base)).toBeGreaterThan(0)
    }
  })

  it('closes the profile outline with its first point repeated', () => {
    // profileOutline() asserts this while it reads the polyline back.
    const doc = exported(kitchenPlan())
    expect(() => bodyOf(doc, spaceByName(doc, 'Kitchen'))).not.toThrow()
  })

  it('extrudes up to the storey height, from the storey elevation', () => {
    const floors: Floor[] = [
      { id: 'ground', name: 'Ground', level: 0 },
      { id: 'first', name: 'First', level: 1 }
    ]
    const doc = exported({
      ...planOf(floors, [
        ...boxWalls('g', 0, 0, 4.2, 3.2, { floor: 'ground', height: 3.1 }),
        ...boxWalls('f', 0, 0, 4.2, 3.2, { floor: 'first', height: 2.5 })
      ]),
      rooms: [
        roomOf('low', 'Lower', ['g1', 'g2', 'g3', 'g4'], 'ground'),
        roomOf('up', 'Upper', ['f1', 'f2', 'f3', 'f4'], 'first')
      ]
    })

    const lower = bodyOf(doc, spaceByName(doc, 'Lower'))
    expect(lower.direction[2]).toBeCloseTo(1, 9)
    expect(lower.depth).toBeCloseTo(3.1, 9)
    for (const p of lower.base) expect(p[2]).toBeCloseTo(0, 9)

    const upper = bodyOf(doc, spaceByName(doc, 'Upper'))
    expect(upper.depth).toBeCloseTo(2.5, 9)
    for (const p of upper.base) expect(p[2]).toBeCloseTo(3.35, 9)
    for (const p of upper.top) expect(p[2]).toBeCloseTo(5.85, 9)

    expect(spaceStoreys(doc)).toEqual(
      new Map([
        ['Lower', 'Ground'],
        ['Upper', 'First']
      ])
    )
  })

  it('extrudes a room on a wall-less level to the default 2.7 m', () => {
    // The level's only walls are virtual, so nothing sets its height.
    const doc = exported({
      ...planOf(undefined, boxWalls('v', 0, 0, 4.2, 3.2, { virtual: true })),
      rooms: [roomOf('r', 'Void', ['v1', 'v2', 'v3', 'v4'])]
    })
    expect(bodyOf(doc, spaceByName(doc, 'Void')).depth).toBeCloseTo(2.7, 9)
  })

  it('exports a room bounded by a virtual wall, and not the wall', () => {
    const walls = boxWalls('o', 0, 0, 4.2, 3.2)
    walls[3] = { ...walls[3]!, thickness: 0.1, virtual: true }
    const doc = exported({
      ...planOf(undefined, walls),
      rooms: [roomOf('open', 'Open plan', ['o1', 'o2', 'o3', 'o4'])]
    })

    expect(wallsOf(doc).map((e) => str(e.args[2]))).toEqual(['o1', 'o2', 'o3'])
    // The divider is a line with no width: the room runs to it, at x = 0.
    expect(Math.abs(signedAreaXY(bodyOf(doc, spaceByName(doc, 'Open plan')).base))).toBeCloseTo(
      4.1 * 3.0,
      8
    )
  })

  it('does not put a space in the spatial containment, only aggregates it', () => {
    const doc = exported(kitchenPlan())
    const space = spaceByName(doc, 'Kitchen')
    const contained = ofType(doc, 'IFCRELCONTAINEDINSPATIALSTRUCTURE').flatMap((r) => refs(r.args[4]))
    expect(contained).not.toContain(space.id)
  })

  it('gives each space its own GlobalId and places it on the storey', () => {
    const plan: FloorPlan = {
      ...planOf(undefined, [...boxWalls('a', 0, 0, 4.2, 3.2), ...boxWalls('b', 10, 0, 4.2, 3.2)]),
      rooms: [roomOf('ra', 'A', ['a1', 'a2', 'a3', 'a4']), roomOf('rb', 'B', ['b1', 'b2', 'b3', 'b4'])]
    }
    const doc = exported(plan)
    const spaces = spacesOf(doc)

    expect(new Set(spaces.map((e) => str(e.args[0]))).size).toBe(2)
    const storey = only(doc, 'IFCBUILDINGSTOREY')
    for (const space of spaces) {
      expect(ref(entity(doc, ref(space.args[5])).args[0])).toBe(ref(storey.args[5]))
    }
  })
})

describe('names cannot corrupt the document', () => {
  const named = (name: string, floorName = 'Ground'): FloorPlan => ({
    ...planOf([{ id: 'ground', name: floorName, level: 0 }], boxWalls('k', 0, 0, 4.2, 3.2)),
    rooms: [roomOf('r', name, ['k1', 'k2', 'k3', 'k4'])]
  })

  it('reads a room name back exactly as typed: quote, backslash, accent', () => {
    for (const name of ["Ba\u00f1o 'B'", 'C:\\Kitchen', 'caf\u00e9 \u65e5\u672c \u{1F600}']) {
      const doc = exported(named(name))
      const space = spacesOf(doc)[0]!
      expect(str(space.args[2])).toBe('1')
      expect(str(space.args[7])).toBe(name)
    }
  })

  it('leaves the rest of the document unchanged by a name', () => {
    const plain = exported(named('Bath'))
    const odd = exported(named("Ba\u00f1o 'B'"))

    expect(odd.order.map((e) => e.type)).toEqual(plain.order.map((e) => e.type))
  })

  it('writes a newline followed by an entity-shaped payload as an ordinary name', () => {
    const plain = exported(named('Bath'))
    const hostile = exported(named("Bath\n#900=IFCWALL($,$);\n#901=IFCSPACE('x');"))

    expect(hostile.order).toHaveLength(plain.order.length)
    expect(hostile.entities.has(900)).toBe(false)
    expect(hostile.entities.has(901)).toBe(false)

    const name = str(spacesOf(hostile)[0]!.args[7])
    expect(name).not.toContain('\n')
    expect(name).toBe("Bath#900=IFCWALL($,$);#901=IFCSPACE('x');")
  })

  it('reads a floor name back exactly as typed, too', () => {
    const doc = exported(named('Bath', "Pl\u00e1nta 'baja'"))
    expect(str(only(doc, 'IFCBUILDINGSTOREY').args[2])).toBe("Pl\u00e1nta 'baja'")
  })
})

// ---------------------------------------------------------------------------
// 7. Graceful degradation
// ---------------------------------------------------------------------------

/** Every reference resolves and every id is unique: the file is still well formed. */
function expectWellFormed(text: string): Doc {
  const doc = parseDoc(text)
  for (const e of doc.order) {
    for (const arg of e.args) {
      for (const v of walk(arg)) {
        if (v.t === 'ref') expect(doc.entities.has(v.v), `#${e.id} -> #${v.v}`).toBe(true)
      }
    }
  }
  const guids = doc.order
    .filter((e) => e.args[0]?.t === 'str' && e.args[1]?.t === 'ref')
    .map((e) => str(e.args[0]))
  expect(new Set(guids).size).toBe(guids.length)
  return doc
}

const namesOf = (entities: readonly Entity[]): string[] => entities.map((e) => str(e.args[2]))
/** HND-2: a space's Name is its room number, and its LongName the room's name. */
const roomNamesOf = (spaces: readonly Entity[]): string[] => spaces.map((e) => str(e.args[7]))

describe('broken geometry degrades instead of failing', () => {
  /** A sound 4 x 3 room (k*), and a second sound room (m*) to prove the rest still exports. */
  const sound = (): FloorPlan => ({
    ...planOf(undefined, [...boxWalls('k', 0, 0, 4.2, 3.2), ...boxWalls('m', 10, 0, 4.2, 3.2)]),
    rooms: [
      roomOf('kitchen', 'Kitchen', ['k1', 'k2', 'k3', 'k4']),
      roomOf('main', 'Main', ['m1', 'm2', 'm3', 'm4'])
    ],
    openings: [openingOn('door', 'k1', 'door', 1, 0.9, 0, 2.1)]
  })

  const exportOf = (plan: FloorPlan): Doc =>
    expectWellFormed(toIfc(plan, { projectId: 'proj', timestamp: STAMP }))

  it('exports the sound plan completely, as the baseline', () => {
    const doc = exportOf(sound())
    expect(wallsOf(doc)).toHaveLength(8)
    expect(roomNamesOf(spacesOf(doc))).toEqual(['Kitchen', 'Main'])
    expect(namesOf(openingsIn(doc))).toEqual(['door'])
  })

  it('leaves out a room whose boundary names a missing wall, and keeps everything else', () => {
    const plan = sound()
    plan.rooms.push(roomOf('ghost', 'Ghost', ['k1', 'k2', 'nowhere', 'k4']))
    const doc = exportOf(plan)

    expect(roomNamesOf(spacesOf(doc))).toEqual(['Kitchen', 'Main'])
    expect(wallsOf(doc)).toHaveLength(8)
  })

  it('leaves out a zero-length wall, the rooms on it, and its openings', () => {
    const plan = sound()
    plan.walls[0] = { ...plan.walls[0]!, end: [...plan.walls[0]!.start] as [number, number] }
    const doc = exportOf(plan)

    expect(namesOf(wallsOf(doc))).toEqual(['k2', 'k3', 'k4', 'm1', 'm2', 'm3', 'm4'])
    // The kitchen rests on the broken wall; the door hangs on it.
    expect(roomNamesOf(spacesOf(doc))).toEqual(['Main'])
    expect(openingsIn(doc)).toHaveLength(0)
    expect(ofType(doc, 'IFCDOOR')).toHaveLength(0)
  })

  it('leaves out an opening that runs past the end of its wall, and keeps the others', () => {
    const plan = sound()
    plan.openings = [
      openingOn('inside', 'k1', 'window', 0.5, 1, 0.9, 1.2),
      openingOn('outside', 'k1', 'door', 3.8, 0.9, 0, 2.1),
      openingOn('fine', 'm1', 'door', 1, 0.9, 0, 2.1)
    ]
    const doc = exportOf(plan)

    expect(namesOf(openingsIn(doc))).toEqual(['inside', 'fine'])
    expect(ofType(doc, 'IFCRELVOIDSELEMENT')).toHaveLength(2)
    expect(ofType(doc, 'IFCRELFILLSELEMENT')).toHaveLength(2)
  })

  it('leaves out an opening taller than its wall, or with a sill below the floor', () => {
    const plan = sound()
    plan.openings = [
      openingOn('tall', 'k1', 'door', 0.5, 0.9, 0, 3.5),
      openingOn('sunk', 'k2', 'window', 0.5, 1, -0.5, 1.2),
      openingOn('fine', 'k3', 'door', 0.5, 0.9, 0, 2.1)
    ]
    expect(namesOf(openingsIn(exportOf(plan)))).toEqual(['fine'])
  })

  it('leaves out openings on a broken wall, a missing wall, and a virtual wall', () => {
    const plan = sound()
    plan.walls[1] = { ...plan.walls[1]!, end: [...plan.walls[1]!.start] as [number, number] }
    plan.walls[2] = { ...plan.walls[2]!, virtual: true }
    plan.openings = [
      openingOn('onBroken', 'k2', 'door', 0.5, 0.9, 0, 2.1),
      openingOn('onVirtual', 'k3', 'opening', 0.5, 0.9, 0, 2.1),
      openingOn('onMissing', 'nowhere', 'window', 0.5, 1, 0.9, 1.2),
      openingOn('fine', 'm1', 'window', 0.5, 1, 0.9, 1.2)
    ]
    const doc = exportOf(plan)

    expect(namesOf(openingsIn(doc))).toEqual(['fine'])
    expect(namesOf(ofType(doc, 'IFCWINDOW'))).toEqual(['fine'])
  })

  it('leaves out every holder of a duplicated id, and still gives unique GlobalIds', () => {
    const plan = sound()
    plan.walls.push({ ...plan.walls[0]!, start: [0, 9], end: [4, 9] })
    const doc = exportOf(plan)

    expect(namesOf(wallsOf(doc))).toEqual(['k2', 'k3', 'k4', 'm1', 'm2', 'm3', 'm4'])
  })

  it('skips a wall, opening or room made of numbers that are not numbers', () => {
    const plan = sound()
    plan.walls.push(
      { ...boxWalls('n', 20, 0, 4.2, 3.2)[0]!, end: [Number.NaN, 0] },
      { ...boxWalls('i', 30, 0, 4.2, 3.2)[0]!, height: Number.POSITIVE_INFINITY },
      { ...boxWalls('t', 40, 0, 4.2, 3.2)[0]!, thickness: Number.NaN }
    )
    plan.openings.push(
      openingOn('nan-offset', 'm1', 'door', Number.NaN, 0.9, 0, 2.1),
      openingOn('inf-width', 'm2', 'window', 0.5, Number.POSITIVE_INFINITY, 0.9, 1.2)
    )
    plan.rooms.push(roomOf('bad', 'Bad', ['n1', 'k2', 'k3', 'k4']))

    const text = toIfc(plan, { projectId: 'proj', timestamp: STAMP })
    expect(text).not.toMatch(/NaN|Infinity/)
    const doc = expectWellFormed(text)

    expect(namesOf(wallsOf(doc))).toEqual(['k1', 'k2', 'k3', 'k4', 'm1', 'm2', 'm3', 'm4'])
    expect(roomNamesOf(spacesOf(doc))).toEqual(['Kitchen', 'Main'])
    expect(namesOf(openingsIn(doc))).toEqual(['door'])
  })

  it('never throws, whatever is wrong at once, and exports what is left', () => {
    const plan = sound()
    plan.walls[0] = { ...plan.walls[0]!, end: [...plan.walls[0]!.start] as [number, number] }
    plan.rooms.push(
      roomOf('none', 'Nothing', []),
      roomOf('one', 'One', ['m1']),
      roomOf('missing', 'Missing', ['x', 'y', 'z'])
    )
    plan.openings.push(
      openingOn('far', 'm1', 'door', 99, 0.9, 0, 2.1),
      openingOn('flat', 'm2', 'window', 0.5, 0.5, 0, 2.1)
    )
    plan.floors = [
      { id: 'ground', name: 'Ground', level: 0 },
      { id: 'ground', name: 'Duplicate', level: 4 }
    ]

    let text = ''
    expect(() => {
      text = toIfc(plan, { projectId: 'proj', timestamp: STAMP })
    }).not.toThrow()

    const doc = expectWellFormed(text)
    expect(roomNamesOf(spacesOf(doc))).toEqual(['Main'])
    expect(wallsOf(doc).length).toBe(7)
  })

  it('still gives a valid document when the plan cannot be read at all', () => {
    const hostile = { version: '1', units: 'm', walls: null, rooms: undefined, openings: 7 }

    let text = ''
    expect(() => {
      text = toIfc(hostile as unknown as FloorPlan, { projectId: 'proj', timestamp: STAMP })
    }).not.toThrow()

    const doc = expectWellFormed(text)
    expect(ofType(doc, 'IFCBUILDINGSTOREY')).toHaveLength(1)
    expect(wallsOf(doc)).toHaveLength(0)
  })

  it('exports an empty plan as a valid document with one ground storey and no elements', () => {
    const doc = exportOf(emptyPlan())

    expect(storeysOf(doc)).toEqual([{ name: 'Ground floor', elevation: 0, z: 0 }])
    for (const type of [
      'IFCWALLSTANDARDCASE',
      'IFCOPENINGELEMENT',
      'IFCDOOR',
      'IFCWINDOW',
      'IFCSPACE',
      'IFCRELCONTAINEDINSPATIALSTRUCTURE',
      'IFCRELVOIDSELEMENT'
    ]) {
      expect(ofType(doc, type), type).toHaveLength(0)
    }
  })

  it('exports rooms with no walls at all as nothing', () => {
    const doc = exportOf({ ...emptyPlan(), rooms: [roomOf('r', 'Room', ['a', 'b', 'c'])] })
    expect(spacesOf(doc)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// IFC2x3 WHERE rules (found by IfcOpenShell's express rules)
// ---------------------------------------------------------------------------

describe('owner person', () => {
  it('has a FamilyName or a GivenName, as IfcPerson WR1 requires, and no personal data', () => {
    const doc = exported(emptyPlan())
    const person = only(doc, 'IFCPERSON')

    // IfcPerson(Id, FamilyName, GivenName, ...)
    expect(person.args[1]?.t === 'str' || person.args[2]?.t === 'str').toBe(true)
    for (const v of [person.args[1], person.args[2]]) {
      if (v?.t === 'str') expect(v.v).toBe('')
    }
  })
})

describe('wall material layer set usage', () => {
  const plan = (): FloorPlan => ({
    ...planOf(undefined, [
      wallAt('a', [0, 0], 0, 4, { thickness: 0.2 }),
      wallAt('b', [0, 1], 30, 4, { thickness: 0.3 }),
      wallAt('c', [0, 2], 90, 4, { thickness: 0.2 }),
      wallAt('virtual', [0, 3], 0, 4, { thickness: 0.2, virtual: true })
    ])
  })

  /** The layer set usage each wall (by name) is associated with, through IfcRelAssociatesMaterial. */
  function usages(doc: Doc): Map<string, Entity[]> {
    const out = new Map<string, Entity[]>()
    // IfcRelAssociatesMaterial(GlobalId, OwnerHistory, Name, Description, RelatedObjects, RelatingMaterial)
    // HND-2 associates each wall type with its layer set too; only the walls are read here.
    for (const rel of ofType(doc, 'IFCRELASSOCIATESMATERIAL')) {
      const material = entity(doc, ref(rel.args[5]))
      for (const id of refs(rel.args[4])) {
        if (entity(doc, id).type !== 'IFCWALLSTANDARDCASE') continue
        const name = str(entity(doc, id).args[2])
        out.set(name, [...(out.get(name) ?? []), material])
      }
    }
    return out
  }

  it('associates every exported wall with exactly one layer set usage', () => {
    const doc = exported(plan())
    const byWall = usages(doc)

    for (const wall of wallsOf(doc)) {
      const found = byWall.get(str(wall.args[2]))
      expect(found, str(wall.args[2])).toHaveLength(1)
      expect(found![0]!.type).toBe('IFCMATERIALLAYERSETUSAGE')
    }
    expect([...byWall.keys()].sort()).toEqual(['a', 'b', 'c'])
  })

  it('gives the layers the wall thickness, centred on the axis like the body profile', () => {
    const doc = exported(plan())
    const byWall = usages(doc)

    for (const wall of wallsOf(doc)) {
      const name = str(wall.args[2])
      const thickness = name === 'b' ? 0.3 : 0.2

      // IfcMaterialLayerSetUsage(ForLayerSet, LayerSetDirection, DirectionSense, OffsetFromReferenceLine)
      const usage = byWall.get(name)![0]!
      const set = entity(doc, ref(usage.args[0]))
      expect(set.type).toBe('IFCMATERIALLAYERSET')

      // IfcMaterialLayer(Material, LayerThickness, IsVentilated)
      const layers = refs(set.args[0]).map((id) => entity(doc, id))
      const total = layers.reduce((sum, layer) => sum + num(layer.args[1]), 0)
      expect(total).toBeCloseTo(thickness, 9)

      // Direction is local Y (across the wall), so the offset places the band.
      expect(en(usage.args[1])).toBe('AXIS2')
      expect(en(usage.args[2])).toBe('POSITIVE')
      const offset = num(usage.args[3])
      expect(offset).toBeCloseTo(-thickness / 2, 9)

      // The same band the Body profile covers across the axis.
      const frame = placementFrame(doc, ref(wall.args[5]))
      const across = bodyOf(doc, wall).base.map((p) => dot3(sub3(p, frame.o), frame.y))
      expect(Math.min(...across)).toBeCloseTo(offset, 8)
      expect(Math.max(...across)).toBeCloseTo(offset + total, 8)
    }
  })

  it('shares one usage between walls of the same kind and thickness, and none for virtual walls', () => {
    const doc = exported(plan())
    const byWall = usages(doc)

    expect(byWall.get('a')![0]!.id).toBe(byWall.get('c')![0]!.id)
    expect(byWall.get('a')![0]!.id).not.toBe(byWall.get('b')![0]!.id)
    expect(ofType(doc, 'IFCMATERIALLAYERSETUSAGE')).toHaveLength(2)
    expect(ofType(doc, 'IFCMATERIALLAYERSET')).toHaveLength(2)
    expect(ofType(doc, 'IFCMATERIALLAYER')).toHaveLength(2)
    // HND-2: one material for the walls. CNT-15 (lab AU3-4): the plan states none, so it is "Not stated".
    expect(ofType(doc, 'IFCMATERIAL')).toHaveLength(1)
    expect(str(only(doc, 'IFCMATERIAL').args[0])).toBe('Not stated')
    expect(byWall.has('virtual')).toBe(false)
  })

  it('names the layer set after the kind and the thickness', () => {
    const names = ofType(exported(plan()), 'IFCMATERIALLAYERSET').map((e) => str(e.args[1]))
    expect(names).toEqual(['Interior wall 0.2 m', 'Interior wall 0.3 m'])
  })

  it('HND-2 types the walls by kind and thickness, each type carrying its layer set and material', () => {
    const doc = exported({
      ...plan(),
      walls: [...plan().walls, wallAt('e', [0, 4], 0, 4, { thickness: 0.2, kind: 'exterior' })]
    })
    const types = ofType(doc, 'IFCWALLTYPE')
    // IfcWallType(..., Name (2), Description, ApplicableOccurrence, HasPropertySets, RepresentationMaps, Tag (7), ElementType, PredefinedType)
    expect(types.map((t) => [str(t.args[2]), str(t.args[7]), en(t.args[9])])).toEqual([
      ['Interior wall 0.2 m', 'wall:interior:0.2', 'STANDARD'],
      ['Interior wall 0.3 m', 'wall:interior:0.3', 'STANDARD'],
      ['Exterior wall 0.2 m', 'wall:exterior:0.2', 'STANDARD']
    ])
    // CNT-15 (lab AU3-4): no material is stated, so one material says so, for every kind.
    expect(ofType(doc, 'IFCMATERIAL').map((m) => str(m.args[0]))).toEqual(['Not stated'])

    const typed = new Map<string, string>()
    for (const rel of ofType(doc, 'IFCRELDEFINESBYTYPE')) {
      const type = entity(doc, ref(rel.args[5]))
      if (type.type !== 'IFCWALLTYPE') continue
      for (const id of refs(rel.args[4])) typed.set(str(entity(doc, id).args[2]), str(type.args[2]))
    }
    expect(Object.fromEntries(typed)).toEqual({ a: 'Interior wall 0.2 m', b: 'Interior wall 0.3 m', c: 'Interior wall 0.2 m', e: 'Exterior wall 0.2 m' })

    for (const type of types) {
      const rel = ofType(doc, 'IFCRELASSOCIATESMATERIAL').filter((r) => refs(r.args[4]).includes(type.id))
      expect(rel, str(type.args[2])).toHaveLength(1)
      const set = entity(doc, ref(rel[0]!.args[5]))
      expect(set.type).toBe('IFCMATERIALLAYERSET')
      expect(str(set.args[1])).toBe(str(type.args[2]))
      // The usage its walls carry is of the same set.
      const wallUsage = usages(doc).get([...typed].find(([, name]) => name === str(type.args[2]))![0])![0]!
      expect(ref(wallUsage.args[0])).toBe(set.id)
    }
  })

  it('writes nothing when there is no wall', () => {
    const doc = exported(emptyPlan())
    for (const type of ['IFCMATERIAL', 'IFCRELASSOCIATESMATERIAL', 'IFCMATERIALLAYERSETUSAGE', 'IFCWALLTYPE']) {
      expect(ofType(doc, type), type).toHaveLength(0)
    }
  })
})

// ---------------------------------------------------------------------------
// Slabs
// ---------------------------------------------------------------------------

describe('slabs', () => {
  const cellar: Floor = { id: 'cellar', name: 'Cellar', level: -1 }
  const ground: Floor = { id: 'ground', name: 'Ground', level: 0 }
  const first: Floor = { id: 'first', name: 'First', level: 1 }

  /** A basement, a ground floor and a first floor, one 4 m by 3 m room each. */
  const house = (): FloorPlan => ({
    ...planOf(
      [cellar, ground, first],
      [
        ...boxWalls('c', 0, 0, 4.2, 3.2, { floor: 'cellar', height: 2.5 }),
        ...boxWalls('g', 0, 0, 4.2, 3.2, { floor: 'ground', height: 3.0 }),
        ...boxWalls('f', 0, 0, 4.2, 3.2, { floor: 'first', height: 2.8 })
      ]
    ),
    rooms: [
      roomOf('store', 'Store', ['c1', 'c2', 'c3', 'c4'], 'cellar'),
      roomOf('hall', 'Hall', ['g1', 'g2', 'g3', 'g4'], 'ground'),
      roomOf('bed', 'Bedroom', ['f1', 'f2', 'f3', 'f4'], 'first')
    ]
  })

  const slabsOf = (doc: Doc): Entity[] => ofType(doc, 'IFCSLAB')
  // IfcSlab(GlobalId, OwnerHistory, Name, Description, ObjectType, ObjectPlacement,
  //         Representation, Tag, PredefinedType)
  const kind = (slab: Entity): string => {
    const v = slab.args[8]
    expect(v?.t).toBe('enum')
    return (v as { v: string }).v
  }
  const slabFor = (doc: Doc, name: string): Entity => {
    const found = slabsOf(doc).filter((e) => str(e.args[2]) === name)
    expect(found, name).toHaveLength(1)
    return found[0]!
  }
  const zs = (solid: WorldSolid): number[] => [...solid.base, ...solid.top].map((p) => p[2])

  it('is 0.25 m thick', () => {
    expect(SLAB_THICKNESS).toBe(0.25)
  })

  // LVL-4: one slab per floor, from its outline, and a roof over every part with nothing above.
  // Before, a slab per room (its inner faces) and a roof over every room of the top level.
  it('writes one slab per floor, a base slab on the lowest level, and a roof over the part with nothing above', () => {
    const doc = exported(house())
    const kinds = Object.fromEntries(slabsOf(doc).map((e) => [str(e.args[2]), kind(e)]))

    expect(kinds).toEqual({
      'Cellar slab': 'BASESLAB',
      'Ground slab': 'FLOOR',
      'First slab': 'FLOOR',
      'First roof slab': 'ROOF'
    })
    // IfcRoof(..., ShapeType): a flat roof, made of its slab.
    const roof = only(doc, 'IFCROOF')
    expect(str(roof.args[2])).toBe('First roof')
    expect((roof.args[8] as { v: string }).v).toBe('FLAT_ROOF')
    const parts = ofType(doc, 'IFCRELAGGREGATES').filter((rel) => ref(rel.args[4]) === roof.id)
    expect(parts.flatMap((rel) => refs(rel.args[5])).map((id) => str(entity(doc, id).args[2]))).toEqual(['First roof slab'])
  })

  it('contains each slab in its own storey, and the roof in the storey it covers', () => {
    const map = containment(exported(house()))
    expect(map.get('Cellar slab')).toBe('Cellar')
    expect(map.get('Ground slab')).toBe('Ground')
    expect(map.get('First slab')).toBe('First')
    expect(map.get('First roof')).toBe('First')
    // The roof's slab is part of the roof, not contained apart.
    expect(map.has('First roof slab')).toBe(false)
  })

  it('lays each floor slab 0.25 m under its storey floor level, and the roof 0.25 m on its walls', () => {
    const plan = house()
    const doc = exported(plan)
    const { floors, roof } = floorElevations(plan)

    const expectations: Array<[string, number, number]> = [
      ['Cellar slab', floors.get('cellar')!.floorLevel - 0.25, floors.get('cellar')!.floorLevel],
      ['Ground slab', -0.25, 0],
      ['First slab', 3.0, 3.25],
      ['First roof slab', roof.bottom, roof.top]
    ]
    expect(roof.bottom).toBeCloseTo(6.05, 9)

    for (const [name, low, high] of expectations) {
      const solid = bodyOf(doc, slabFor(doc, name))
      expect(solid.direction[2], name).toBeCloseTo(1, 9)
      expect(solid.depth, name).toBeCloseTo(SLAB_THICKNESS, 9)
      expect(Math.min(...zs(solid)), name).toBeCloseTo(low, 9)
      expect(Math.max(...zs(solid)), name).toBeCloseTo(high, 9)
    }
  })

  it('gives every slab the floor\'s outline, to the outside faces of its walls (VE-4: none under walls before)', () => {
    const doc = exported(house())
    for (const name of ['Cellar slab', 'Ground slab', 'First slab', 'First roof slab']) {
      const solid = bodyOf(doc, slabFor(doc, name))
      // 4.2 × 3.2 m between wall axes, 0.2 m walls: 4.4 × 3.4 m outside, where the room is 4.0 × 3.0.
      expect(Math.abs(signedAreaXY(solid.base)), name).toBeCloseTo(4.4 * 3.4, 8)
      const xs = solid.base.map((p) => p[0])
      expect(Math.min(...xs), name).toBeCloseTo(-0.1, 9)
      expect(Math.max(...xs), name).toBeCloseTo(4.3, 9)
    }
  })

  it('still extrudes spaces to the clear height, from the floor level', () => {
    const doc = exported(house())
    const bedroom = bodyOf(doc, spaceByName(doc, 'Bedroom'))
    expect(bedroom.depth).toBeCloseTo(2.8, 9)
    for (const p of bedroom.base) expect(p[2]).toBeCloseTo(3.25, 9)
  })

  it('gives a one-storey plan its base slab below ±0.00 and its roof on its walls', () => {
    const doc = exported({
      ...planOf(undefined, boxWalls('k', 0, 0, 4.2, 3.2)),
      rooms: [roomOf('kitchen', 'Kitchen', ['k1', 'k2', 'k3', 'k4'])]
    })

    const base = bodyOf(doc, slabFor(doc, 'Ground floor slab'))
    expect(kind(slabFor(doc, 'Ground floor slab'))).toBe('BASESLAB')
    expect(Math.min(...zs(base))).toBeCloseTo(-0.25, 9)
    expect(Math.max(...zs(base))).toBeCloseTo(0, 9)

    const roof = bodyOf(doc, slabFor(doc, 'Ground floor roof slab'))
    expect(Math.min(...zs(roof))).toBeCloseTo(2.7, 9)
    expect(Math.max(...zs(roof))).toBeCloseTo(2.95, 9)
  })

  it('roofs and base-slabs every floor that shares the top or bottom level', () => {
    const wing: Floor = { id: 'wing', name: 'Wing', level: 0 }
    const doc = exported({
      ...planOf(
        [ground, wing],
        [
          ...boxWalls('g', 0, 0, 4.2, 3.2, { floor: 'ground' }),
          ...boxWalls('w', 10, 0, 4.2, 3.2, { floor: 'wing' })
        ]
      ),
      rooms: [
        roomOf('a', 'A', ['g1', 'g2', 'g3', 'g4'], 'ground'),
        roomOf('b', 'B', ['w1', 'w2', 'w3', 'w4'], 'wing')
      ]
    })

    expect(slabsOf(doc).map((e) => `${str(e.args[2])}:${kind(e)}`).sort()).toEqual([
      'Ground roof slab:ROOF',
      'Ground slab:BASESLAB',
      'Wing roof slab:ROOF',
      'Wing slab:BASESLAB'
    ])
  })

  it('writes a slab wherever the walls close a floor, whatever the rooms, and none where they close none', () => {
    const doc = exported({
      ...planOf(undefined, [...boxWalls('k', 0, 0, 4.2, 3.2), wallAt('nan', [20, 0], 0, 4, { height: Number.NaN })]),
      // A room that does not close is no slab of its own: the walls round it carry one.
      rooms: [roomOf('open', 'Open', ['k1', 'k2', 'k3'])]
    })
    const slab = bodyOf(doc, slabFor(doc, 'Ground floor slab'))
    expect(Math.abs(signedAreaXY(slab.base))).toBeCloseTo(4.4 * 3.4, 8)
    // A lone wall closes nothing, and one that is not a number is left out.
    expect(slabsOf(exported(planOf(undefined, [wallAt('lone', [0, 0], 0, 4)])))).toHaveLength(0)
  })

  it('gives every slab its own GlobalId, the same on every export', () => {
    const a = slabsOf(exported(house())).map((e) => str(e.args[0]))
    const b = slabsOf(exported(house())).map((e) => str(e.args[0]))

    expect(new Set(a).size).toBe(a.length)
    expect(a).toEqual(b)
    const all = exported(house()).order.flatMap((e) => (e.args[0]?.t === 'str' && /^[0-3]/.test(str(e.args[0])) && str(e.args[0]).length === 22 ? [str(e.args[0])] : []))
    expect(new Set(all).size).toBe(all.length)
  })

  it('writes no slab for a plan with no rooms', () => {
    expect(slabsOf(exported(planOf([ground, first], [])))).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Door swing
// ---------------------------------------------------------------------------

describe('door swing', () => {
  type Handing = { hinge?: 'start' | 'end'; swing?: 'left' | 'right' }

  /** One exterior wall at `theta`, with a 0.9 m door per handing, 1.5 m apart. */
  function doorsPlan(handings: readonly Handing[], theta = 0): FloorPlan {
    const len = 1 + handings.length * 1.5
    return {
      version: '1',
      units: 'm',
      walls: [
        { id: 'w1', start: [0, 0], end: [len * Math.cos(theta), len * Math.sin(theta)], thickness: 0.2, height: 2.7, kind: 'exterior' }
      ],
      rooms: [],
      openings: handings.map((h, i) => ({
        id: `d${i + 1}`,
        wall: 'w1',
        type: 'door' as const,
        offset: 0.5 + i * 1.5,
        width: 0.9,
        sill: 0,
        height: 2.1,
        ...h
      }))
    }
  }

  const doorNamed = (doc: Doc, name: string): Entity => ofType(doc, 'IFCDOOR').find((d) => str(d.args[2]) === name)!

  /** The style each door is typed by, by door name: its OperationType, or null. */
  function stylesByDoor(doc: Doc): Map<string, string | null> {
    const out = new Map<string, string | null>(ofType(doc, 'IFCDOOR').map((d) => [str(d.args[2]), null]))
    for (const rel of ofType(doc, 'IFCRELDEFINESBYTYPE')) {
      const style = entity(doc, ref(rel.args[5]))
      // HND-2 types the walls too.
      if (style.type === 'IFCWALLTYPE') continue
      expect(style.type).toBe('IFCDOORSTYLE')
      for (const id of refs(rel.args[4])) out.set(str(entity(doc, id).args[2]), en(style.args[8]))
    }
    return out
  }

  const table = [
    [{ hinge: 'start', swing: 'left' }, 'SINGLE_SWING_LEFT'],
    [{ hinge: 'end', swing: 'left' }, 'SINGLE_SWING_RIGHT'],
    [{ hinge: 'start', swing: 'right' }, 'SINGLE_SWING_RIGHT'],
    [{ hinge: 'end', swing: 'right' }, 'SINGLE_SWING_LEFT']
  ] as const

  it.each(table)('types a door stating %o as %s', (handing, operation) => {
    const doc = exported(doorsPlan([handing]))
    expect(stylesByDoor(doc).get('d1')).toBe(operation)
  })

  it('turns a door exactly when it opens to the right face', () => {
    const doc = exported(doorsPlan(table.map(([h]) => h)))
    table.forEach(([handing], i) => {
      const door = doorNamed(doc, `d${i + 1}`)
      const local = entity(doc, ref(door.args[5]))
      const axes = axisFrame(doc, ref(local.args[1]))
      if (handing.swing === 'right') {
        expect(axes.o[0]).toBeCloseTo(0.9, 9)
        expect(axes.x[0]).toBeCloseTo(-1, 9)
      } else {
        expect(axes.o).toEqual([0, 0, 0])
        expect(axes.x[0]).toBeCloseTo(1, 9)
      }
    })
  })

  it('shares one style per handing across floors', () => {
    const plan = doorsPlan([
      { hinge: 'start', swing: 'left' },
      { hinge: 'end', swing: 'right' },
      { hinge: 'end', swing: 'left' }
    ])
    const upstairs = doorsPlan([{ hinge: 'start', swing: 'left' }])
    const twoFloors: FloorPlan = {
      ...plan,
      floors: [
        { id: 'ground', name: 'Ground', level: 0 },
        { id: 'first', name: 'First', level: 1 }
      ],
      walls: [...plan.walls, ...upstairs.walls.map((w) => ({ ...w, id: 'w2', floor: 'first' }))],
      openings: [...plan.openings, ...upstairs.openings.map((o) => ({ ...o, id: 'd9', wall: 'w2' }))]
    }
    const doc = exported(twoFloors)
    const styles = ofType(doc, 'IFCDOORSTYLE')
    expect(styles.map((s) => en(s.args[8])).sort()).toEqual(['SINGLE_SWING_LEFT', 'SINGLE_SWING_RIGHT'])
    const related = ofType(doc, 'IFCRELDEFINESBYTYPE')
      .filter((r) => entity(doc, ref(r.args[5])).type === 'IFCDOORSTYLE')
      .map((r) => [en(entity(doc, ref(r.args[5])).args[8]), refs(r.args[4]).length])
    expect(Object.fromEntries(related)).toEqual({ SINGLE_SWING_LEFT: 3, SINGLE_SWING_RIGHT: 1 })
  })

  it('HND-2 types an undecided door by its size with no handing, and leaves it unturned', () => {
    const doc = exported(doorsPlan([{ hinge: 'start' }, { swing: 'left' }, {}, { hinge: 'end', swing: 'right' }]))
    const styles = stylesByDoor(doc)
    expect([styles.get('d1'), styles.get('d2'), styles.get('d3')]).toEqual(['NOTDEFINED', 'NOTDEFINED', 'NOTDEFINED'])
    for (const name of ['d1', 'd2', 'd3']) {
      const local = entity(doc, ref(doorNamed(doc, name).args[5]))
      expect(axisFrame(doc, ref(local.args[1])).o).toEqual([0, 0, 0])
    }
  })

  it('HND-2 writes one door style with no handing for a plan with no stated swing', () => {
    const styles = ofType(exported(samplePlan()), 'IFCDOORSTYLE')
    expect(styles.map((s) => [str(s.args[2]), str(s.args[7]), en(s.args[8])])).toEqual([['Door 0.9 x 2.1 m, swing not stated', 'door:0.9x2.1', 'NOTDEFINED']])
  })

  it('names the styles by size and handing in plain words, and keeps their GUIDs stable', () => {
    const plan = doorsPlan(table.map(([h]) => h))
    const a = ofType(exported(plan), 'IFCDOORSTYLE')
    const b = ofType(exported(plan), 'IFCDOORSTYLE')
    expect(a.map((s) => str(s.args[2]))).toEqual(['Door 0.9 x 2.1 m, single swing, left', 'Door 0.9 x 2.1 m, single swing, right'])
    expect(a.map((s) => str(s.args[0]))).toEqual(b.map((s) => str(s.args[0])))
  })

  it('HND-2 gives doors of another size a style of their own, and windows styles by size', () => {
    const plan = doorsPlan([{ hinge: 'start', swing: 'left' }, { hinge: 'start', swing: 'left' }])
    plan.openings[1] = { ...plan.openings[1]!, width: 0.8 }
    plan.openings.push({ id: 'win1', wall: 'w1', type: 'window', offset: 3.2, width: 0.6, sill: 0.9, height: 1.2 })
    const doc = exported(plan)
    expect(ofType(doc, 'IFCDOORSTYLE').map((s) => str(s.args[2]))).toEqual(['Door 0.8 x 2.1 m, single swing, left', 'Door 0.9 x 2.1 m, single swing, left'])
    const windows = ofType(doc, 'IFCWINDOWSTYLE')
    expect(windows.map((s) => [str(s.args[2]), str(s.args[7])])).toEqual([['Window 0.6 x 1.2 m', 'window:0.6x1.2']])
    const typed = ofType(doc, 'IFCRELDEFINESBYTYPE').filter((r) => ref(r.args[5]) === windows[0]!.id)
    expect(typed.flatMap((r) => refs(r.args[4]).map((id) => str(entity(doc, id).args[2])))).toEqual(['win1'])
  })

  // IFC opens a door toward its own +y and puts a LEFT door's hinge at local x = 0. Checked in
  // the world, at many wall angles, so a mirrored basis can't pass on an axis-aligned wall.
  const cases = [0, 37, 90, 180, 233, 300].flatMap((deg) => table.map(([h, op]) => [deg, h.hinge, h.swing, op] as const))
  it.each(cases)('at %d°, hinge %s, swing %s (%s): opens to the stated face, hinged at the stated jamb', (deg, hinge, swing, op) => {
    const theta = (deg * Math.PI) / 180
    const doc = exported(doorsPlan([{ hinge, swing }], theta))
    const door = doorNamed(doc, 'd1')
    const frame = placementFrame(doc, ref(door.args[5]))
    const dir: V3 = [Math.cos(theta), Math.sin(theta), 0]
    const normal: V3 = [-Math.sin(theta), Math.cos(theta), 0]

    expect(Math.sign(dot3(frame.y, normal))).toBe(swing === 'left' ? 1 : -1)
    expect(frame.z[2]).toBeCloseTo(1, 9)

    const hingeLocal: V3 = op === 'SINGLE_SWING_LEFT' ? [0, 0, 0] : [0.9, 0, 0]
    const hingeWorld = toWorld(frame, hingeLocal)
    const along = hinge === 'start' ? 0.5 : 1.4
    expect(hingeWorld[0]).toBeCloseTo(along * dir[0], 9)
    expect(hingeWorld[1]).toBeCloseTo(along * dir[1], 9)

    // Turning the door doesn't move it: its frame and leaf still fill the opening's span along the wall.
    const span = bodiesOf(doc, door).flatMap((solid) => solid.base.map((p) => dot3(p, dir)))
    expect(Math.min(...span)).toBeCloseTo(0.5, 9)
    expect(Math.max(...span)).toBeCloseTo(1.4, 9)
    // CNT-14: closed, the leaf hangs from the face of the wall it opens toward (SHT-2).
    const leaf = bodiesOf(doc, door)[3]!.base.map((p) => dot3(p, normal))
    const face = (swing === 'left' ? 1 : -1) * 0.1
    expect(swing === 'left' ? Math.max(...leaf) : Math.min(...leaf)).toBeCloseTo(face, 9)
  })
})

/**
 * SHT-2: the walls of the IFC file are joined at their corners as in the drawing (lab DR-1). Seen
 * from above, the walls of the bench's two-bedroom flat cover its whole 9.5 × 7.9 m box; before,
 * a 0.15 m square was missing at each outside corner.
 */
describe('SHT-2 joined corners in the IFC file', () => {
  const flat = (): FloorPlan =>
    JSON.parse(readFileSync(resolve(__dirname, '../../../../fixtures/two-bed-flat.json'), 'utf8')) as FloorPlan

  it('covers the flat 75.05 m² outside, with no square missing at a corner (DR-1: 74.96)', () => {
    const doc = parseDoc(toIfc(flat()))
    const shapes: Polygon[] = wallsOf(doc).map((w) => [bodyOf(doc, w).base.map((p): Pair => [p[0], p[1]])])
    const footprint = union(shapes)
    expect(footprint).toHaveLength(1)
    expect(ringArea(footprint[0]![0]!)).toBeCloseTo(75.05, 6)
  })

  it('stops each partition at the face of the wall it runs into', () => {
    const doc = parseDoc(toIfc(flat()))
    const spine = wallsOf(doc).find((w) => str(w.args[2]) === 'spine')!
    const ys = bodyOf(doc, spine).base.map((p) => p[1])
    expect(Math.min(...ys)).toBeCloseTo(0.15, 9)
    expect(Math.max(...ys)).toBeCloseTo(7.45, 9)
  })
})

// ---------------------------------------------------------------------------
// ARE-6: a room with a hole
// ---------------------------------------------------------------------------

describe('a room with a hole (ARE-6)', () => {
  const ring = (): FloorPlan =>
    parseFloorPlan(JSON.parse(readFileSync(resolve(__dirname, '../../../../fixtures/ring-gallery.json'), 'utf8')))

  /** The outer curve and the inner curves of a product's swept profile, in the profile's own plane. */
  function profileRings(doc: Doc, product: Entity): { type: string; outer: [number, number][]; inner: [number, number][][] } {
    const shape = entity(doc, ref(product.args[6]))
    const body = refs(shape.args[2])
      .map((id) => entity(doc, id))
      .find((r) => str(r.args[1]) === 'Body')!
    const solid = entity(doc, refs(body.args[3])[0]!)
    expect(solid.type).toBe('IFCEXTRUDEDAREASOLID')
    const profile = entity(doc, ref(solid.args[0]))
    const curve = (id: number): [number, number][] => {
      const polyline = entity(doc, id)
      expect(polyline.type).toBe('IFCPOLYLINE')
      const points = refs(polyline.args[0]).map((p) => nums(entity(doc, p).args[0]) as [number, number])
      expect(points[0]).toEqual(points[points.length - 1])
      return points.slice(0, -1)
    }
    // IfcArbitraryProfileDefWithVoids(ProfileType, ProfileName, OuterCurve, InnerCurves)
    const inner = profile.type === 'IFCARBITRARYPROFILEDEFWITHVOIDS' ? refs(profile.args[3]).map(curve) : []
    return { type: profile.type, outer: curve(ref(profile.args[2])), inner }
  }

  const ringArea2 = (points: readonly [number, number][]): number => ringArea(points.map(([x, y]): Pair => [x, y]))

  it('writes the space with the courtyard as a void: 94.09 less 18.49, 75.60 m²', () => {
    const doc = exported(ring())
    const space = spaceByName(doc, 'Ring gallery')
    const { type, outer, inner } = profileRings(doc, space)
    expect(type).toBe('IFCARBITRARYPROFILEDEFWITHVOIDS')
    expect(ringArea2(outer)).toBeCloseTo(94.09, 8)
    expect(inner).toHaveLength(1)
    expect(ringArea2(inner[0]!)).toBeCloseTo(18.49, 8)
    expect(ringArea2(outer) - ringArea2(inner[0]!)).toBeCloseTo(75.6, 8)
    // The void is the core to the faces of its walls that look into the gallery.
    const xs = inner[0]!.map(([x]) => x)
    expect(Math.min(...xs)).toBeCloseTo(2.85, 8)
    expect(Math.max(...xs)).toBeCloseTo(7.15, 8)
  })

  // LVL-4: the slab is the floor's outline, so the courtyard's walls stand on it, and only the floor
  // they enclose, 3.7 m square, is open: before, the slab was the gallery's own floor, open over the
  // 4.3 m square of the hole's outer faces.
  it('leaves the courtyard open in the floor slab and the roof too', () => {
    const doc = exported(ring())
    const slabs = ofType(doc, 'IFCSLAB')
    expect(slabs).toHaveLength(2)
    for (const slab of slabs) {
      const { type, outer, inner } = profileRings(doc, slab)
      expect(type).toBe('IFCARBITRARYPROFILEDEFWITHVOIDS')
      expect(ringArea2(outer)).toBeCloseTo(10.3 * 10.3, 8)
      expect(inner.map((curve) => ringArea2(curve))).toEqual([expect.closeTo(3.7 * 3.7, 8)])
    }
  })

  it('writes a room with no hole as it always did', () => {
    const doc = exported(samplePlan())
    expect(ofType(doc, 'IFCARBITRARYPROFILEDEFWITHVOIDS')).toHaveLength(0)
  })
})

/**
 * LVL-7: a room set off its storey stands at its own level in the IFC file. A genkan 0.18 m up is a
 * space and a slab 0.18 m up (lab R-4); a 0.6 m stage is a space and a slab at 0.6 m, and no wall
 * (S-17).
 */
describe('LVL-7 a step inside a floor in the IFC file', () => {
  const slabNamed = (doc: Doc, name: string): Entity => {
    const found = ofType(doc, 'IFCSLAB').filter((e) => str(e.args[2]) === name)
    expect(found, name).toHaveLength(1)
    return found[0]!
  }
  const zRange = (solid: WorldSolid): [number, number] => {
    const zs = [...solid.base, ...solid.top].map((p) => p[2])
    return [Math.min(...zs), Math.max(...zs)]
  }

  it('raises the genkan\'s space 0.18 m, up to the storey\'s ceiling, and leaves the hall on the floor', () => {
    const doc = parseDoc(toIfc(genkanFlat()))
    const [low, high] = zRange(bodyOf(doc, spaceByName(doc, 'Genkan')))
    expect(low).toBeCloseTo(0.18, 9)
    expect(high).toBeCloseTo(2.7, 9)
    expect(zRange(bodyOf(doc, spaceByName(doc, 'Hall')))[0]).toBeCloseTo(0, 9)
  })

  // LVL-4: the storey's one slab lies under every room, so the genkan's own slab rises from it.
  it('puts the top of the genkan\'s slab at 0.18 m, solid down to the storey\'s slab', () => {
    const doc = parseDoc(toIfc(genkanFlat()))
    const [low, high] = zRange(bodyOf(doc, slabNamed(doc, 'Genkan floor slab')))
    expect(high).toBeCloseTo(0.18, 9)
    expect(low).toBeCloseTo(0, 9)
    const storey = ofType(doc, 'IFCSLAB').filter((e) => (e.args[8] as { v: string }).v === 'BASESLAB')
    expect(storey).toHaveLength(1)
    expect(zRange(bodyOf(doc, storey[0]!))).toEqual([-SLAB_THICKNESS, 0])
  })

  it('lowers a sunken genkan\'s space and slab 0.18 m', () => {
    const doc = parseDoc(toIfc(genkanFlat(-0.18)))
    expect(zRange(bodyOf(doc, spaceByName(doc, 'Genkan')))[0]).toBeCloseTo(-0.18, 9)
    const [low, high] = zRange(bodyOf(doc, slabNamed(doc, 'Genkan floor slab')))
    expect(high).toBeCloseTo(-0.18, 9)
    expect(low).toBeCloseTo(-0.18 - SLAB_THICKNESS, 9)
  })

  it('writes the stage as a space 0.6 m up with its 32 m², and no wall', () => {
    const doc = parseDoc(toIfc(ballroomWithStage()))
    const stage = bodyOf(doc, spaceByName(doc, 'Stage'))
    expect(zRange(stage)).toEqual([expect.closeTo(0.6, 9), expect.closeTo(5, 9)])
    expect(Math.abs(signedAreaXY(stage.base))).toBeCloseTo(32, 9)
    expect(wallsOf(doc).map((w) => str(w.args[2])).sort()).toEqual(['hall-e', 'hall-n', 'hall-s', 'hall-w'])
    expect(zRange(bodyOf(doc, slabNamed(doc, 'Stage floor slab')))[1]).toBeCloseTo(0.6, 9)
  })
})
