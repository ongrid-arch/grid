/**
 * HND-11: a survey drawn from its own numbers. A wall placed by its face, with its thickness
 * known or not; the lengths taped on site kept beside the drawing and set against it (lab WR-14);
 * and a plan kept at survey coordinates with a stored origin (lab MS-12).
 *
 * WR-14 is the lab's tape survey (`I/scenarios/s3-tape-survey/`): `attempt-3-as-taped-fixed` is
 * the flat as taped, drawn on the walls' centre lines, and `probe-thicker-walls` the same flat with
 * every wall guessed 8 cm thicker, which moved every inside face and changed every room's size.
 * The lab stores no list of the tape's figures, so the taped lengths here are the ones the
 * as-taped drawing gives, to the millimetre, as a tape reads them.
 */
import { describe, expect, it } from 'vitest'
import { centreFromFace, faceFromCentre, parseFloorPlan, statedWall, wallWithEnds, type FloorPlan, type Taped } from '../../types/floorplan'
import { readingNotes } from '../../types/reading'
import { readPlanParts } from '../../types/readParts'
import { labPlan, labPlanText } from '../../test-support/lab'
import { indexPlan } from '../plan'
import { roomArea, roomPolygon } from '../room'
import { tapedLengths } from '../taped'
import { validatePlan } from '../validate'
import { compileRoomsText, readRoomsText } from '../../rooms'
import { buildScene } from '../scene3d'
import { toGlb, toObj } from '../export'
import { exportPlan } from '../../export/planExport'
import { parseGlb, readMeshes } from '../export/__tests__/glb-reader'

const AS_TAPED = 'I/scenarios/s3-tape-survey/attempt-3-as-taped-fixed.json'
const THICKER = 'I/scenarios/s3-tape-survey/probe-thicker-walls.json'

type Raw = Record<string, unknown>
type RawPlan = Raw & { walls: Raw[] }

const rawOf = (name: string): RawPlan => JSON.parse(labPlanText(name)) as RawPlan
const areas = (plan: FloorPlan): Record<string, number> => {
  const index = indexPlan(plan)
  return Object.fromEntries(plan.rooms.map((room) => [room.id, roomArea(room, index)]))
}
const round3 = (v: number): number => Math.round(v * 1000) / 1000

/**
 * The as-taped flat written the way a tape survey is: its outside walls by their inside faces,
 * the faces the tape ran along, with the thickness left out, since no one can tape inside a wall.
 * The inside walls keep their centre lines and the thickness measured at their door jambs.
 */
function byFaces(thickness?: number): RawPlan {
  const raw = rawOf(AS_TAPED)
  return {
    ...raw,
    walls: raw.walls.map((wall) => {
      if (wall['kind'] !== 'exterior') return wall
      const [start, end] = faceFromCentre(wall['start'] as [number, number], wall['end'] as [number, number], 'left', wall['thickness'] as number)
      const rest: Raw = { ...wall }
      delete rest['thickness']
      return { ...rest, start, end, face: 'left', ...(thickness === undefined ? {} : { thickness }) }
    })
  }
}

/** Each room's side along its outside walls and both diagonals, as the as-taped drawing gives them. */
function tapesOf(plan: FloorPlan): Taped[] {
  const taped: Taped[] = []
  for (const room of plan.rooms) {
    const [a, b, c, d] = room.boundary as [string, string, string, string]
    for (const wall of room.boundary.filter((id) => id.startsWith('ext-'))) taped.push({ room: room.id, wall, length: 1 })
    taped.push({ room: room.id, from: [d, a], to: [b, c], length: 1 }, { room: room.id, from: [a, b], to: [c, d], length: 1 })
  }
  const rows = tapedLengths({ ...plan, taped })
  return taped.map((entry, i) => ({ ...entry, length: round3(rows[i]!.drawn!) }))
}

describe('a wall placed by its face (HND-11)', () => {
  const plan = parseFloorPlan({
    version: '1',
    walls: [
      { id: 's', start: [0, 0], end: [4, 0], face: 'left', thickness: 0.3 },
      { id: 'n', start: [4, 3], end: [0, 3], face: 'left' },
      { id: 'v', start: [2, 0], end: [2, 3], face: 'right', virtual: true }
    ]
  })

  it('is read on its centre line, half its thickness away from the face, into its body', () => {
    expect(plan.walls[0]).toMatchObject({ start: [0, -0.15], end: [4, -0.15], thickness: 0.3, placedBy: 'left' })
    expect(plan.walls[0]).not.toHaveProperty('face')
  })

  it('keeps a thickness left out as not stated, drawing it 0.2 m thick away from its face', () => {
    expect(plan.walls[1]).toMatchObject({ start: [4, 3.1], end: [0, 3.1], thickness: 0.2, placedBy: 'left' })
    expect(plan.walls[1]!.unstated).toContain('thickness')
  })

  it('moves a dividing line nowhere: it has no thickness', () => {
    expect(plan.walls[2]).toMatchObject({ start: [2, 0], end: [2, 3], placedBy: 'right' })
  })

  it('is written back by its face, with no value the reading filled in', () => {
    expect(statedWall(plan.walls[0]!)).toEqual({ id: 's', start: [0, 0], end: [4, 0], face: 'left', thickness: 0.3 })
    const north = statedWall(plan.walls[1]!)
    expect(north).toMatchObject({ start: [4, 3], end: [0, 3], face: 'left' })
    expect(north).not.toHaveProperty('thickness')
    expect(north).not.toHaveProperty('placedBy')
  })

  it('stands in the same place when a plan Grid read is read again', () => {
    const again = parseFloorPlan(plan).walls.map(({ id, start, end, thickness, placedBy }) => ({ id, start, end, thickness, placedBy }))
    expect(again).toEqual(plan.walls.map(({ id, start, end, thickness, placedBy }) => ({ id, start, end, thickness, placedBy })))
  })

  it('gives the face line back from the centre line to the digit it was written with', () => {
    const [start, end] = centreFromFace([0, 3.6925], [7.35, 3.6925], 'right', 0.12)
    expect(faceFromCentre(start, end, 'right', 0.12)).toEqual([[0, 3.6925], [7.35, 3.6925]])
  })

  it('keeps its face when an edit moves an end, in the file and in the reading, and turns it over in a mirror', () => {
    const file = { id: 's', start: [0, 0], end: [4, 0], face: 'left', thickness: 0.3 }
    // The edit gives centre points; the file keeps its face line.
    expect(wallWithEnds(file, { end: [5, -0.15] })).toEqual({ ...file, start: [0, 0], end: [5, 0] })
    expect(wallWithEnds(plan.walls[0]! as unknown as Raw, { end: [5, -0.15] })).toMatchObject({ start: [0, -0.15], end: [5, -0.15], placedBy: 'left' })
    // Mirrored left to right, the wall runs the other way along its line: its face is the other one.
    const mirrored = wallWithEnds(file, { start: [4, -0.15], end: [0, -0.15] }, true)
    expect(mirrored).toEqual({ ...file, start: [4, 0], end: [0, 0], face: 'right' })
  })

  it('leaves out a wall whose face cannot be read, rather than draw it half its thickness off', () => {
    const read = readPlanParts({ version: '1', walls: [{ id: 'w', start: [0, 0], end: [4, 0], face: 'inside' }] })
    expect(read.plan?.walls).toEqual([])
    expect(read.plan === null ? [] : read.faults.map((f) => f.kind)).toContain('part-left-out')
    // A face in other capitals is read as meant.
    const meant = readPlanParts({ version: '1', walls: [{ id: 'w', start: [0, 0], end: [4, 0], face: 'Left', thickness: 0.2 }] })
    expect(meant.plan?.walls[0]).toMatchObject({ start: [0, -0.1], placedBy: 'left' })
  })

  it('is a field of the format, and placedBy is not one a file writes', () => {
    const notes = readingNotes({ version: '1', walls: [{ id: 'w', start: [0, 0], end: [4, 0], face: 'left', placedBy: 'left' }] })
    expect(notes.filter((n) => n.kind === 'unknown-field').map((n) => (n.kind === 'unknown-field' ? n.field : null))).toEqual(['placedBy'])
  })
})

describe('rooms text reads a plan whose walls are placed by their faces', () => {
  it('in Grid\'s own terms, so writing it again gives the same walls, faces and all', () => {
    const plan = parseFloorPlan(byFaces())
    const reading = readRoomsText(plan)
    expect(reading.rawFloors.map((f) => f.floor)).toEqual(['ground'])
    expect(reading.text).toContain('"face":"left"')
    expect(reading.text).not.toContain('placedBy')
    const again = parseFloorPlan(compileRoomsText(reading.text).plan!)
    const where = (p: FloorPlan) => p.walls.map(({ id, start, end, thickness, placedBy }) => ({ id, start, end, thickness, placedBy }))
    expect(where(again)).toEqual(where(plan))
  })
})

describe('lab WR-14: the tape survey, with the walls guessed 8 cm thicker', () => {
  const asTaped = labPlan(AS_TAPED)
  const tapes = tapesOf(asTaped)

  it('on centre lines, as the lab drew it, the thicker guess changed every room and every taped side', () => {
    const before = areas(asTaped)
    const after = areas(labPlan(THICKER))
    for (const room of asTaped.rooms) expect(Math.abs(after[room.id]! - before[room.id]!), room.id).toBeGreaterThan(0.1)
    const rows = tapedLengths({ ...labPlan(THICKER), taped: tapes })
    expect(rows.filter((row) => row.state === 'differs').length).toBeGreaterThan(10)
  })

  it('placed by the faces taped, with the thickness unknown, gives the inside sizes as taped', () => {
    const unknown = parseFloorPlan({ ...byFaces(), taped: tapes })
    for (const wall of unknown.walls.filter((w) => w.kind === 'exterior')) expect(wall.unstated).toContain('thickness')
    const rows = tapedLengths(unknown)
    expect(rows.map((row) => row.state)).toEqual(rows.map(() => 'agrees'))
    for (const [id, area] of Object.entries(areas(unknown))) expect(area, id).toBeCloseTo(areas(asTaped)[id]!, 9)
  })

  it('guessing the outside walls 8 cm thicker (0.40 m for 0.32) no longer changes an inside size', () => {
    const known = parseFloorPlan({ ...byFaces(0.32), taped: tapes })
    const guessed = parseFloorPlan({ ...byFaces(0.4), taped: tapes })
    const left = parseFloorPlan({ ...byFaces(), taped: tapes })
    for (const plan of [known, guessed, left]) {
      const index = indexPlan(plan)
      for (const room of plan.rooms) {
        expect(roomPolygon(room, index), room.id).toEqual(roomPolygon(room, indexPlan(known)).map((p) => expect.objectContaining({ x: expect.closeTo(p.x, 9), y: expect.closeTo(p.y, 9) })))
      }
      // The tape reads to the millimetre, so each agrees to half of one.
      expect(tapedLengths(plan).map((row) => row.state === 'agrees' && Math.abs(row.off!) <= 0.0005 + 1e-9)).toEqual(tapes.map(() => true))
    }
    // The building grows outward instead: its outside walls' centre lines moved 4 cm out.
    const south = (plan: FloorPlan): number => plan.walls.find((w) => w.id === 'ext-s')!.start[1]
    expect(south(guessed) - south(known)).toBeCloseTo(-0.04, 9)
  })

  it('names a length the drawing does not give, and one it cannot measure', () => {
    const wrong = parseFloorPlan({
      ...byFaces(),
      taped: [
        { id: 't1', room: 'hall', wall: 'ext-s', length: 1.3 },
        { room: 'hall', wall: 'ext-n', length: 1 },
        { room: 'study', wall: 'ext-s', length: 2 },
        { room: 'hall', from: ['ext-s', 'row'], to: ['row', 'bed-hall'], length: 3 }
      ]
    })
    const rows = tapedLengths(wrong)
    expect(rows[0]).toMatchObject({ id: 't1', state: 'differs', taped: 1.3, roomName: 'Hall', within: 0.01 })
    expect(rows[0]!.drawn).toBeCloseTo(1.2, 3)
    expect(rows.slice(1).map((row) => [row.state, row.missing])).toEqual([
      ['not-measured', 'not-the-rooms'],
      ['not-measured', 'no-room'],
      ['not-measured', 'no-corner']
    ])
    expect(validatePlan(wrong).issues.filter((i) => i.severity === 'error')).toEqual([])
  })
})

describe('lab MS-12: a plan at survey coordinates with a stored origin', () => {
  const survey = labPlan('AU1/scenarios/MS-12/f16-survey-coordinates.json')
  const codes = (plan: FloorPlan): string[] => validatePlan(plan).issues.map((i) => i.code)

  it('is far from the origin with none stated', () => {
    expect(codes(survey)).toContain('plan/far-from-origin')
  })

  it('raises no unit error once it states an origin near the building, and is measured from it', () => {
    const kept = { ...survey, site: { origin: [432000, 4580000] as [number, number] } }
    expect(codes(kept)).not.toContain('plan/far-from-origin')
    expect(codes(kept)).not.toContain('plan/units-question')
    // An origin stated far from the building is still a question.
    const far = validatePlan({ ...survey, site: { origin: [0, 0] } }).issues.find((i) => i.code === 'plan/far-from-origin')
    expect(far?.message).toMatch(/from its site's origin \(0\.00, 0\.00\)/)
  })
})

describe('lab MS-12: the GLB of a plan at survey coordinates', () => {
  const ids = { projectId: 'p', projectName: 'Survey', now: new Date(0) }
  const survey = labPlan('AU1/scenarios/MS-12/f16-survey-coordinates.json')
  const kept: FloorPlan = { ...survey, site: { origin: [432000, 4580000] } }
  /** Every corner of the 3D model, in plan metres, as exact as doubles hold them. */
  const exact = (plan: FloorPlan): { x: number; y: number; z: number }[] =>
    toObj(buildScene(plan))
      .split('\n')
      .filter((line) => line.startsWith('v '))
      .map((line) => line.split(' ').slice(1).map(Number))
      .map(([x, y, z]) => ({ x: x!, y: y!, z: z! }))
  /**
   * The GLB's points, back in plan metres: glTF x is plan x, glTF -z plan y. CMD-55: the rooms'
   * linings and ceilings stand a hair off the model's faces on purpose (`liningOffset`), so only
   * the model's own parts are held to its corners.
   */
  const pointsOf = (bytes: Uint8Array): { x: number; y: number; z: number }[] =>
    readMeshes(parseGlb(bytes))
      .filter((mesh) => !mesh.name.startsWith('lining_') && !mesh.name.startsWith('ceiling_'))
      .flatMap((mesh) => mesh.points.map((p) => ({ x: p.x, y: 0 - p.z, z: p.y })))
  /** The farthest any GLB point lies from the nearest corner of the exact model. */
  const worst = (bytes: Uint8Array, plan: FloorPlan): number => {
    const model = exact(plan)
    let most = 0
    for (const p of pointsOf(bytes)) {
      let near = Infinity
      for (const q of model) near = Math.min(near, Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z))
      most = Math.max(most, near)
    }
    return most
  }

  it('is within 1 mm of the plan: built from the site\'s origin, the offset in the node that holds it', () => {
    const bytes = exportPlan(kept, 'glb', ids).data as Uint8Array
    const glb = parseGlb(bytes)
    // VEW-64: the building's root node holds the floors, and the offset.
    const holder = glb.json.nodes!.find((node) => node.name === 'building')!
    expect(holder.translation).toEqual([432000, 0, -4580000])
    expect(glb.json.scenes![0]!.nodes).toEqual([glb.json.nodes!.indexOf(holder)])
    expect((glb.json.asset as { extras?: { gridOrigin?: unknown } }).extras?.gridOrigin).toMatchObject({ x: 432000, y: 4580000 })
    expect(worst(bytes, kept)).toBeLessThan(0.001)
  })

  it('was half a metre out with its points written as they are, and is within 1 mm with no origin stated', () => {
    expect(worst(toGlb(buildScene(kept)), kept)).toBeGreaterThan(0.1)
    expect(worst(exportPlan(survey, 'glb', ids).data as Uint8Array, survey)).toBeLessThan(0.001)
  })

  it('writes a plan near the origin as before, with no node to move it', () => {
    const near = labPlan(AS_TAPED)
    const glb = parseGlb(exportPlan(near, 'glb', ids).data as Uint8Array)
    // VEW-82: a door's leaf stands on its hinge, which moves the leaf and nothing else.
    const onHinge = (node: object): boolean => (node as { extras?: { gridPart?: string } }).extras?.gridPart === 'leaf'
    expect(glb.json.nodes!.some((node) => node.name === 'origin' || (node.translation !== undefined && !onHinge(node)))).toBe(false)
    // VEW-64: one root, the building, which moves nothing.
    expect(glb.json.scenes![0]!.nodes).toEqual([glb.json.nodes!.findIndex((node) => node.name === 'building')])
    expect((glb.json.asset as { extras?: Record<string, unknown> }).extras).not.toHaveProperty('gridOrigin')
  })

  it('keeps the survey coordinates exactly in the OBJ, the DXF and the IFC', () => {
    expect(exportPlan(kept, 'obj', ids).data).toMatch(/\nv 43200\d\.\d{6} 458000\d\.\d{6} /)
    expect(exportPlan(kept, 'dxf', ids).data).toMatch(/\n43200\d\.\d+\r?\n/)
    // The IFC writes its elements from the site's origin, and puts the site there.
    const ifc = exportPlan(kept, 'ifc', ids).data as string
    expect(ifc).toMatch(/IFCCARTESIANPOINT\(\(432000\.,4580000\.,0\.\)\)/)
  })
})
