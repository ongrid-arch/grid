/**
 * IFC export — the open BIM interchange format Revit reads.
 *
 * IFC2x3 with the Coordination View 2.0 on purpose: it is Revit's own default
 * IFC export and the variant every BIM tool imports. Walls are extruded solids
 * and openings are separate elements that void them, which is exactly the split
 * this exporter needs; IFC4's Reference View has no boolean voids, so walls
 * would have to ship pre-cut and a door would lose the opening it sits in.
 *
 * Input is the whole `FloorPlan`, not a resolved drawing: `PlanDrawing` has the
 * openings already cut out of the walls and is flat, `Scene3D` keeps a wall
 * only as an elevation with anonymous holes. IFC wants the uncut wall plus each
 * opening as its own typed element, on a named storey. The export still cannot
 * disagree with the views, because each floor goes through the same validation
 * (`validatePlan`) and an element is written exactly when the views draw it.
 *
 * Coordinates are the model's own: metres, X and Y as on the plan, Z up (C4).
 * That is already a right-handed basis with Z up, so nothing is flipped. A plan
 * whose y runs down (CNT-3, C7) is written as it is, so its model is the
 * building's mirror image; `grid check` says so (`plan/y-down`). A plan at
 * survey coordinates is moved near the origin, the move kept in the site's and
 * the building's placements (`nearOrigin`, HND-2): moved to the site's origin when the
 * plan states one (HND-11).
 *
 * HND-2: the file carries what the plan already says, in the fields IFC has for
 * it: each space its room's number, use and net area with the rule (ARE-9,
 * ARE-12); base quantities on walls, spaces, slabs, doors, windows and doorless
 * openings; wall types by stated kind and thickness, each with its material;
 * door and window styles by size. What the plan does not hold (flats, slabs,
 * materials, opening types) is not made up: slabs Grid works out say so.
 */

import type { Floor, FloorPlan, Opening, PlanIndex, Room, Wall, WallKind } from '../plan'
import type { DoorType, OpeningKind, WallType, WindowKind, WindowType } from '../../types/floorplan'
import { en as englishWords } from '../../messages/en'
import { openingTypeOf, typeMaterial, wallTypeOf } from '../partTypes'
import { doorKindOf, statedKind } from '../openingKinds'
import { openingParts } from '../openingParts'
import { planFloors, planForFloor } from '../floors'
import { planBuildings } from '../buildings'
import { sharedPart, wholeWall } from '../through'
import { english, said } from '../../messages/say'
import { inIdOrder } from '../order'
import { indexPlan, openingsOf } from '../plan'
import {
  isDrawnWall,
  isFiniteWall,
  roofOver,
  SLAB_THICKNESS,
  stackBuildings,
  type StoreyLevel
} from '../elevations'
import type { MultiPolygon } from 'polygon-clipping'
import { planEnvelope, roomCeiling, type FloorRoof } from '../envelope'
import { isOutdoor, outdoorKind, outdoorRoofed } from '../outdoor'
import { faceUnderTop, floorRoofShape, planeAt, volumeUnder, wallPeak, wallTopProfile, type RoofPlane } from '../roofs'
import { multiArea, piecesAsRings, ringOf } from '../polygons'
import { tolerance } from '../tolerances'
import { tryRoomShape } from '../room'
import { roomZones } from '../zones'
import { planFlats } from '../flats'
import { roomFloorOffset } from '../steps'
import { wallExposure } from '../exposure'
import { brokenOnFloor, validatePlan } from '../validate'
import type { StairLayout } from '../stairs'
import { planStairs } from '../stairs'
import { stairBlocks } from '../scene3d'
import type { WallEnds } from '../wall'
import { openingChord, openingSpan, wallAxis, wallPolygon } from '../wall'
import { curveStations, wallCurve, type WallCurve } from '../arc'
import type { Vec2 } from '../vec2'
import { partPhases, phasedJoints } from '../phases'
import type { Phase } from '../../types/floorplan'
import { isItemKind, itemRoom, roomShapes } from '../items'
import { itemKindWord } from '../itemKinds'
import { columnArea, columnDepth, columnFloorIds, columnPart, soundColumns } from '../columns'
import { GENERAL_GUIDANCE_LABEL } from '../rules/types'
import { roomFloorArea } from '../room'
import { FLAT_AREA_RULE, MEASURES, planAreaFigures } from '../areas'
import { roomNumbers, shownRoomNumber, type RoomNumber } from '../roomNumbers'
import { nearOrigin } from './origin'
import { area } from '../vec2'
import { approximationLines, leftOutByKind, leftOutSummary, partNames, type Approximations, type LeftOutKind, type LeftOutPart } from './leftOut'
import { factOf, factText, ROOM_NUMBER_FACT, type Facts } from '../../types/facts'
import { directionOfTurn, planOrientation } from '../orientation'

export interface IfcOptions {
  /**
   * Seeds every element's GlobalId, so a BIM tool can recognise an updated
   * export of the same project. Plan ids such as `w1` repeat across projects:
   * without a seed, two Grid models linked in one Revit session would share
   * element ids. The id the plan stores (`FloorPlan.projectId`, QAR-5) wins over
   * this one; when neither is there, `IFC_DEFAULT_PROJECT_ID` is used.
   */
  readonly projectId?: string
  readonly projectName?: string
  /**
   * Written into the header and the owner history. The exporter never reads the
   * clock (it must stay pure and deterministic), so the caller supplies it;
   * without one, `IFC_DEFAULT_TIMESTAMP` is used.
   */
  readonly timestamp?: Date
  /**
   * HND-6: the parts of the plan this file leaves out, written as the building's property set
   * `Grid_LeftOut`. None, and the file is as it was.
   */
  readonly leftOut?: readonly LeftOutPart[]
  /**
   * CNT-18: the curves the file writes as straight pieces, written as the building's property set
   * `Grid_Approximated`. None, and the file is as it was.
   */
  readonly approximations?: Approximations
}

/** The project identity used when the caller supplies none. */
export const IFC_DEFAULT_PROJECT_ID = 'grid-project'

/** The Unix epoch: a fixed instant that honestly reads "not supplied". */
export const IFC_DEFAULT_TIMESTAMP: Date = new Date(0)

const DEFAULT_PROJECT_NAME = 'Grid plan'

// ---------------------------------------------------------------------------
// STEP attribute encoding
// ---------------------------------------------------------------------------

const NULL = '$'
const DERIVED = '*'

const ref = (id: number): string => `#${id}`
const refs = (ids: readonly number[]): string => `(${ids.map(ref).join(',')})`
const en = (name: string): string => `.${name}.`

/**
 * A STEP real: it must contain a point (`3.`, never `3`), and `-0` is noise
 * that some readers parse and nobody wants to read. Ten decimals keep the unit
 * direction of a rotated wall exact to well below a micrometre.
 */
function real(value: number): string {
  if (!Number.isFinite(value)) return '0.'
  const trimmed = value.toFixed(10).replace(/0+$/, '')
  return trimmed === '-0.' ? '0.' : trimmed
}

const int = (value: number): string => String(Math.trunc(value))
const reals = (values: readonly number[]): string => `(${values.map(real).join(',')})`

/**
 * A STEP string, quoted and escaped.
 *
 * Names come from the plan file, which the assistant writes, so a value must
 * not be able to end early or start a forged entity. A `'` is doubled and a `\`
 * is doubled (it is the escape character). Anything outside printable ASCII is
 * written as `\X2\HHHH\X0\`, the UTF-16 code units in uppercase hex, so the
 * file stays ASCII whatever encoding the caller saves it with and a reader
 * decodes the name as typed; a character outside the BMP is one `\X4\` code point (CMD-26).
 * Control characters (a newline would end the entity's line) are dropped.
 */
export function ifcString(value: string): string {
  const clean = value.replace(/\p{Cc}/gu, '')
  let out = ''
  let block = ''
  let wide = false

  const flush = (): void => {
    if (block.length > 0) out += `\\${wide ? 'X4' : 'X2'}\\${block}\\X0\\`
    block = ''
  }

  for (const char of clean) {
    const code = char.codePointAt(0)!
    if (code >= 0x20 && code <= 0x7e) {
      flush()
      out += code === 0x27 ? "''" : code === 0x5c ? '\\\\' : char
    } else {
      // CMD-26: beyond the BMP is one code point of eight hex digits (`\X4\`), not a surrogate pair.
      const isWide = code > 0xffff
      if (block.length > 0 && isWide !== wide) flush()
      wide = isWide
      block += code.toString(16).toUpperCase().padStart(isWide ? 8 : 4, '0')
    }
  }
  flush()

  return `'${out}'`
}

const str = ifcString

// ---------------------------------------------------------------------------
// GlobalId
// ---------------------------------------------------------------------------

/** IFC's 64-character alphabet for a GlobalId, in value order. */
const GUID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/**
 * A 128-bit hash of the text, as four 32-bit words.
 *
 * cyrb128 (public domain): four lanes cross-mixed with `Math.imul`, so it needs
 * no `crypto` and no `Buffer` (this module also compiles for the browser) and
 * gives the same words on every engine. It is not cryptographic and does not
 * need to be: an identity only has to be stable and, over a file's few
 * thousand elements, collision-free, which `GuidIssuer` then makes certain.
 */
function hash128(text: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762

  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }

  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)

  const mix = h2 ^ h3 ^ h4
  h1 ^= mix
  return [h1 >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0]
}

/**
 * An IfcGloballyUniqueId: 128 bits as 22 characters. The first character
 * carries the top 2 bits (so it is `0`-`3`), the other 21 carry 6 bits each.
 *
 * Deterministic on purpose: a random GUID would give a different identity on
 * every export, so a BIM tool could never recognise an updated model.
 */
export function ifcGuid(seed: string): string {
  const words = hash128(seed)
  const bit = (n: number): number => (words[n >> 5]! >>> (31 - (n & 31))) & 1

  let out = ''
  let position = 0
  for (let group = 0; group < 22; group++) {
    let value = 0
    for (let b = group === 0 ? 2 : 6; b > 0; b--) value = (value << 1) | bit(position++)
    out += GUID_ALPHABET[value]
  }
  return out
}

export interface GuidIssuer {
  /**
   * The GlobalId of one element of the plan, unique among all this issuer gave.
   * `floor` is the floor the element is on, or null for what the whole building
   * shares (the project, the site, a storey, a door style).
   */
  issue(kind: string, id: string, floor?: string | null): string
}

/**
 * Issues GlobalIds for one document, from the project id, the element's kind,
 * its floor and its id (QAR-5), written as one JSON array so that no two of
 * them read as the same text, whatever the ids hold.
 *
 * Seeded by the project because plan ids such as `w1` repeat across projects,
 * and by the floor so that identities stay apart if ids ever become per floor.
 * An id already issued gets a counter appended and is hashed again: the hash
 * makes a collision astronomically unlikely, and this makes it impossible.
 */
export function createGuidIssuer(projectId: string): GuidIssuer {
  const used = new Set<string>()

  return {
    issue(kind, id, floor = null) {
      const seed = JSON.stringify([projectId, kind, floor, id])
      let guid = ifcGuid(seed)
      for (let n = 1; used.has(guid); n++) guid = ifcGuid(`${seed}#${n}`)
      used.add(guid)
      return guid
    }
  }
}

class StepWriter {
  private readonly rows: string[] = []

  add(type: string, ...attributes: readonly string[]): number {
    const id = this.rows.length + 1
    this.rows.push(`#${id}=${type}(${attributes.join(',')});`)
    return id
  }

  toString(header: readonly string[]): string {
    return [
      'ISO-10303-21;',
      'HEADER;',
      ...header,
      'ENDSEC;',
      'DATA;',
      ...this.rows,
      'ENDSEC;',
      'END-ISO-10303-21;',
      ''
    ].join('\n')
  }
}

// ---------------------------------------------------------------------------
// Building the document
// ---------------------------------------------------------------------------

/** Entities every element shares, written once. */
interface Shared {
  /** The views of the 3D `Model` context that a shape names. */
  readonly bodyContext: number
  readonly axisContext: number
  /** A placement at the origin with the default axes: the foot of every extrusion. */
  readonly identity: number
  /** Z up, and the extrusion direction of every solid here. */
  readonly up: number
  readonly east2: number
}

/** One wall type: the walls of one stated kind and one thickness, with their material; or (CNT-15) the walls of one named type and thickness. */
interface WallTypeEntry {
  readonly kind: WallKind
  readonly thickness: number
  /** CNT-15: the plan's named type, or null for a type Grid makes from the kind and thickness. */
  readonly named: WallType | null
  /** The layer set the type carries, and the usage its walls carry. */
  readonly set: number
  readonly usage: number
  readonly walls: number[]
}

/** Wall materials and types, created on first use. */
interface WallMaterials {
  /** CNT-15: one material per name, the type's own or "Not stated" (lab AU3-4). */
  readonly byName: Map<string, number>
  /** One type per kind and thickness. Insertion order is first use, so the output stays deterministic. */
  readonly byType: Map<string, WallTypeEntry>
}

/** Doors and windows of one type: the same kind, handing and size. */
interface OpeningStyleEntry {
  readonly type: 'door' | 'window'
  /** CNT-14: the kind the plan states, or null. */
  readonly kind: OpeningKind | null
  readonly operation: DoorOperation | 'NOTDEFINED'
  readonly width: number
  readonly height: number
  readonly fillers: number[]
  /** CNT-15: the plan's named door or window type, or null. */
  readonly named: DoorType | WindowType | null
}

interface Context {
  readonly w: StepWriter
  /** CNT-15: the plan's named types, which the walls, doors and windows name. */
  readonly plan: Pick<FloorPlan, 'types'>
  readonly owner: number
  readonly shared: Shared
  readonly materials: WallMaterials
  /** Doors and windows by type (`openingStyleKey`), in the order they were first written. */
  readonly openingStyles: Map<string, OpeningStyleEntry>
  /** CNT-14: the glass's surface style, written on first use. */
  glassStyle: number | null
  /** Every room's number (ARE-12), by `floor`, NUL, `id`. */
  readonly roomNumbers: ReadonlyMap<string, RoomNumber>
  /** The GlobalId of an element of this context's floor, or of the building's. */
  guid(kind: string, id: string): string
  readonly issuer: GuidIssuer
  /**
   * CNT-9: the elements whose part carries facts of the person's own, in the order they were
   * written, for one property set each at the end (`writeFacts`).
   */
  readonly facts: FactsOn[]
  /** CNT-10: each part's phase by id, in a plan with phases; empty in one with none. */
  readonly phaseOf: ReadonlyMap<string, Phase>
  /** CNT-10: the elements whose part has a phase, in the order they were written (`writePhases`). */
  readonly phases: PhaseOn[]
}

/** CNT-10: an element and its part's phase. */
interface PhaseOn {
  readonly element: number
  readonly kind: string
  readonly id: string
  readonly guid: Context['guid']
  readonly phase: Phase
}

/** CNT-10: notes an element whose part has a phase, for `writePhases`. */
function notePhase(c: Context, element: number, kind: string, id: string): void {
  const phase = c.phaseOf.get(id)
  if (phase !== undefined) c.phases.push({ element, kind, id, guid: c.guid, phase })
}

/** CNT-9: an element and the facts its part carries. */
interface FactsOn {
  readonly element: number
  /** What the part is and its id, for the set's GlobalId: `wall`, `door`, `space`, `storey`. */
  readonly kind: string
  readonly id: string
  /** The GlobalIds of the context it was written in: its floor's, or the building's. */
  readonly guid: Context['guid']
  readonly facts: Facts
}

/** CNT-9: notes an element whose part carries facts, for `writeFacts`. */
function noteFacts(c: Context, element: number, kind: string, part: { readonly id: string; readonly properties?: Facts | undefined }): void {
  if (part.properties === undefined || Object.keys(part.properties).length === 0) return
  c.facts.push({ element, kind, id: part.id, guid: c.guid, facts: part.properties })
}

/** A floor and an id as one key: ids repeat from floor to floor. */
const onFloorKey = (floor: string, id: string): string => `${floor}\u0000${id}`

/** The same context, issuing the identities of one floor's elements. */
function onFloor(c: Context, floorId: string): Context {
  return { ...c, guid: (kind, id) => c.issuer.issue(kind, id, floorId) }
}

function isoSeconds(date: Date): string {
  return date.toISOString().slice(0, 19)
}

/** A caller-supplied `Date` can be invalid, and `toISOString` throws on one. */
function usableTimestamp(date: Date | undefined): Date {
  return date && Number.isFinite(date.getTime()) ? date : IFC_DEFAULT_TIMESTAMP
}

function writeOwnerHistory(w: StepWriter, timestamp: Date): number {
  // No personal data goes into the file: the person is anonymous. IfcPerson
  // WR1 requires a FamilyName or a GivenName to exist, so FamilyName is the
  // empty string: present, and carrying nothing.
  const person = w.add('IFCPERSON', str('anonymous'), str(''), NULL, NULL, NULL, NULL, NULL, NULL)
  const organisation = w.add('IFCORGANIZATION', NULL, str('Grid'), NULL, NULL, NULL)
  const personAndOrganisation = w.add(
    'IFCPERSONANDORGANIZATION',
    ref(person),
    ref(organisation),
    NULL
  )
  const application = w.add(
    'IFCAPPLICATION',
    ref(organisation),
    str('1'),
    str('Grid'),
    str('Grid')
  )

  return w.add(
    'IFCOWNERHISTORY',
    ref(personAndOrganisation),
    ref(application),
    NULL,
    en('NOCHANGE'),
    NULL,
    NULL,
    NULL,
    int(Math.floor(timestamp.getTime() / 1000))
  )
}

function writeUnits(w: StepWriter): number {
  const unit = (type: string, name: string): number =>
    w.add('IFCSIUNIT', DERIVED, en(type), NULL, en(name))

  return w.add(
    'IFCUNITASSIGNMENT',
    refs([
      unit('LENGTHUNIT', 'METRE'),
      unit('AREAUNIT', 'SQUARE_METRE'),
      unit('VOLUMEUNIT', 'CUBIC_METRE'),
      unit('PLANEANGLEUNIT', 'RADIAN')
    ])
  )
}

/**
 * The model's context. Its `TrueNorth` is the north the plan states (CNT-3, C7), as a direction
 * in the plan's X and Y; a plan that states none gets none (`$`), where Grid once wrote +Y for
 * every plan (lab EL-14). IFC reads an absent `TrueNorth` as +Y, but the file no longer claims it.
 */
function writeModelContext(w: StepWriter, stated: number | null): { model: number; shared: Shared } {
  const origin = w.add('IFCCARTESIANPOINT', reals([0, 0, 0]))
  const up = w.add('IFCDIRECTION', reals([0, 0, 1]))
  const east = w.add('IFCDIRECTION', reals([1, 0, 0]))
  const world = w.add('IFCAXIS2PLACEMENT3D', ref(origin), ref(up), ref(east))
  const toward = stated === null ? null : directionOfTurn(stated)
  const north = toward === null ? NULL : ref(w.add('IFCDIRECTION', reals([toward.x, toward.y])))

  const model = w.add(
    'IFCGEOMETRICREPRESENTATIONCONTEXT',
    NULL,
    str('Model'),
    int(3),
    '1.E-05',
    ref(world),
    north
  )

  // The views a shape names. Their dimension, precision and axes are derived
  // from the parent context, which is what `*` says.
  const subContext = (identifier: string, view: string): number =>
    w.add(
      'IFCGEOMETRICREPRESENTATIONSUBCONTEXT',
      str(identifier),
      str('Model'),
      DERIVED,
      DERIVED,
      DERIVED,
      DERIVED,
      ref(model),
      NULL,
      en(view),
      NULL
    )

  const bodyContext = subContext('Body', 'MODEL_VIEW')
  const axisContext = subContext('Axis', 'GRAPH_VIEW')
  const identity = w.add('IFCAXIS2PLACEMENT3D', ref(origin), NULL, NULL)
  const east2 = w.add('IFCDIRECTION', reals([1, 0]))

  return { model, shared: { bodyContext, axisContext, identity, up, east2 } }
}

type Triple = readonly [number, number, number]

/**
 * A placement at `at`, relative to another one (or to the world when `rel` is
 * null). With `along`, local X points that way and Z stays up, which makes Y the
 * left normal (a right-handed basis, so nothing here is ever mirrored).
 */
function placement(w: StepWriter, rel: number | null, at: Triple, along?: Triple): number {
  const point = w.add('IFCCARTESIANPOINT', reals(at))
  const axes = along
    ? w.add(
        'IFCAXIS2PLACEMENT3D',
        ref(point),
        ref(w.add('IFCDIRECTION', reals([0, 0, 1]))),
        ref(w.add('IFCDIRECTION', reals(along)))
      )
    : w.add('IFCAXIS2PLACEMENT3D', ref(point), NULL, NULL)
  return w.add('IFCLOCALPLACEMENT', rel === null ? NULL : ref(rel), ref(axes))
}

function aggregate(c: Context, key: string, parent: number, children: readonly number[]): void {
  // IFC's RelatedObjects is SET [1:?]: an empty relationship is invalid.
  if (children.length === 0) return
  c.w.add(
    'IFCRELAGGREGATES',
    str(c.guid('aggregates', key)),
    ref(c.owner),
    NULL,
    NULL,
    ref(parent),
    refs(children)
  )
}

/**
 * One floor, sliced and validated the way the views do it (`buildScene` and
 * `buildFloorPlan`): an element is exported exactly when the views draw it.
 */
interface FloorModel {
  readonly floor: Floor
  readonly index: PlanIndex
  readonly broken: ReadonlySet<string>
  /** The walls that become wall elements: not virtual, not broken. */
  readonly walls: readonly Wall[]
}

const isSoundOpening = (opening: Opening): boolean =>
  Number.isFinite(opening.offset) &&
  Number.isFinite(opening.width) &&
  Number.isFinite(opening.sill) &&
  Number.isFinite(opening.height)

function analyseFloor(plan: FloorPlan, floor: Floor): FloorModel {
  try {
    const slice = planForFloor(plan, floor.id)
    const index = indexPlan(slice)
    const broken = new Set(validatePlan(slice, index, { spaces: false }).broken)

    // Validation judges shape, not whether a number is a number: a NaN passes
    // every comparison it is put through. Such an element would be written as
    // zeros, which is worse than leaving it out, so it counts as broken here and
    // takes down what hangs on it, exactly as a broken wall does there.
    for (const wall of slice.walls) if (!isFiniteWall(wall)) broken.add(wall.id)
    for (const opening of slice.openings) {
      if (!isSoundOpening(opening) || broken.has(opening.wall)) broken.add(opening.id)
    }
    for (const room of slice.rooms) {
      if (room.boundary.some((wallId) => broken.has(wallId))) broken.add(room.id)
    }

    const walls = slice.walls.filter((wall) => isDrawnWall(wall, broken))
    return { floor, index, broken, walls }
  } catch {
    // Validation is total, but the export must be even if it is not: a floor
    // that cannot be analysed is a floor with nothing sound on it.
    const empty: FloorPlan = { ...plan, walls: [], rooms: [], openings: [], items: [], ...(plan.columns === undefined ? {} : { columns: [] }) }
    return { floor, index: indexPlan(empty), broken: new Set(), walls: [] }
  }
}

/**
 * Storey elevations, by floor id, from what each floor states and the tallest exported wall on
 * it, stacked on `SLAB_THICKNESS` slabs where a floor states none (see `stackFloors`): the same
 * rule the 3D view uses through `floorElevations`.
 */
function deriveLevels(plan: FloorPlan, models: readonly FloorModel[]): Map<string, StoreyLevel> {
  // CNT-6, LVL-23: each building of the plan on its own, from its pad.
  return stackBuildings(
    plan,
    models.map(({ floor, walls, index }) => {
      let tallest = 0
      for (const wall of walls) {
        // LVL-5: a wall through floors counts toward the floor it rises through, with its own
        // height (`floorElevations` stacks it so); its stretches below run through the slabs.
        const part = sharedPart(wall)
        if (part !== null && !part.top) continue
        // LVL-6: a wall the floor's roof cuts is as tall as the roof leaves it.
        if (Number.isFinite(wall.height)) tallest = Math.max(tallest, wallPeak(index.plan, wall))
      }
      return { floor, tallest }
    }),
    SLAB_THICKNESS
  )
}

interface Storey {
  readonly id: number
  readonly placement: number
  readonly model: FloorModel
  readonly elevation: number
  /** The height of its level: what spaces are extruded to. */
  readonly height: number
  /** Its rooms' spaces, by room id, as they are written. */
  readonly spaces: Map<string, number>
}

function writeStorey(
  c: Context,
  parentPlacement: number,
  model: FloorModel,
  level: StoreyLevel
): Storey {
  const placementId = placement(c.w, parentPlacement, [0, 0, level.floorLevel])
  const id = c.w.add(
    'IFCBUILDINGSTOREY',
    str(c.guid('storey', model.floor.id)),
    ref(c.owner),
    str(model.floor.name),
    NULL,
    NULL,
    ref(placementId),
    NULL,
    NULL,
    en('ELEMENT'),
    real(level.floorLevel)
  )
  noteFacts(c, id, 'storey', model.floor)
  return {
    id,
    placement: placementId,
    model,
    elevation: level.floorLevel,
    height: level.clearHeight,
    spaces: new Map()
  }
}

/** A rectangle on its own centre line, `width` along X and `depth` across it. */
function rectangleProfile(c: Context, width: number, depth: number, centreX: number): number {
  const centre = c.w.add('IFCCARTESIANPOINT', reals([centreX, 0]))
  const position = c.w.add('IFCAXIS2PLACEMENT2D', ref(centre), ref(c.shared.east2))
  return c.w.add(
    'IFCRECTANGLEPROFILEDEF',
    en('AREA'),
    NULL,
    ref(position),
    real(width),
    real(depth)
  )
}

/** The profile swept `height` along +Z, from the origin of the element's own frame. */
function extrusion(c: Context, profile: number, height: number): number {
  return c.w.add(
    'IFCEXTRUDEDAREASOLID',
    ref(profile),
    ref(c.shared.identity),
    ref(c.shared.up),
    real(height)
  )
}

/** A body of one solid, or (CNT-14) of a door's or window's parts, swept or (LVL-6) clipped. */
function bodyRepresentation(c: Context, solids: number | readonly number[], type: 'SweptSolid' | 'Clipping' = 'SweptSolid'): number {
  return c.w.add(
    'IFCSHAPEREPRESENTATION',
    ref(c.shared.bodyContext),
    str('Body'),
    str(type),
    refs(typeof solids === 'number' ? [solids] : solids)
  )
}

/** CNT-14: a box, `size` (along x, along y) round `centre` in the element's frame, from `bottom` up by `height`. */
function boxSolid(c: Context, centre: readonly [number, number], size: readonly [number, number], bottom: number, height: number): number {
  const position = c.w.add('IFCAXIS2PLACEMENT2D', ref(c.w.add('IFCCARTESIANPOINT', reals([centre[0], centre[1]]))), ref(c.shared.east2))
  const profile = c.w.add('IFCRECTANGLEPROFILEDEF', en('AREA'), NULL, ref(position), real(size[0]), real(size[1]))
  const foot = bottom === 0 ? c.shared.identity : c.w.add('IFCAXIS2PLACEMENT3D', ref(c.w.add('IFCCARTESIANPOINT', reals([0, 0, bottom]))), NULL, NULL)
  return c.w.add('IFCEXTRUDEDAREASOLID', ref(profile), ref(foot), ref(c.shared.up), real(height))
}

/**
 * CNT-14: shows a solid as glass, pale and seen through, with one surface style the file writes
 * once (IFC2x3's styled item, presentation style assignment, surface style and rendering).
 */
function glazed(c: Context, solid: number): void {
  if (c.glassStyle === null) {
    const colour = c.w.add('IFCCOLOURRGB', NULL, real(0.7), real(0.82), real(0.9))
    const rendering = c.w.add('IFCSURFACESTYLERENDERING', ref(colour), real(0.65), NULL, NULL, NULL, NULL, NULL, NULL, en('NOTDEFINED'))
    const style = c.w.add('IFCSURFACESTYLE', str('Glass'), en('BOTH'), refs([rendering]))
    c.glassStyle = c.w.add('IFCPRESENTATIONSTYLEASSIGNMENT', refs([style]))
  }
  c.w.add('IFCSTYLEDITEM', ref(solid), refs([c.glassStyle]), NULL)
}

/** A plane through `at`, and the side of it a clipping takes away: the side `toward` points to. */
interface HalfSpaceCut {
  readonly at: Triple
  readonly toward: Triple
}

/**
 * LVL-6: a solid with each half-space taken away, in turn, as IFC cuts a gable wall: an
 * IfcBooleanClippingResult per cut, of an IfcHalfSpaceSolid bounded by an IfcPlane whose normal
 * points into what is taken away (AgreementFlag false). The planes are in the frame the solid is
 * swept in.
 */
function clipped(c: Context, solid: number, cuts: readonly HalfSpaceCut[]): number {
  let result = solid
  for (const cut of cuts) {
    const length = Math.hypot(...cut.toward)
    const normal = cut.toward.map((v) => v / length)
    const position = c.w.add('IFCAXIS2PLACEMENT3D', ref(c.w.add('IFCCARTESIANPOINT', reals(cut.at))), ref(c.w.add('IFCDIRECTION', reals(normal))), NULL)
    const half = c.w.add('IFCHALFSPACESOLID', ref(c.w.add('IFCPLANE', ref(position))), '.F.')
    result = c.w.add('IFCBOOLEANCLIPPINGRESULT', en('DIFFERENCE'), ref(result), ref(half))
  }
  return result
}

/** What lies above a roof plane, in a frame whose origin stands `base` above the floor's level. */
const above = (plane: RoofPlane, base: number): HalfSpaceCut => ({ at: [0, 0, plane.z0 - base], toward: [-plane.gx, -plane.gy, 1] })

const productShape = (c: Context, representations: readonly number[]): number =>
  c.w.add('IFCPRODUCTDEFINITIONSHAPE', NULL, NULL, refs(representations))

/**
 * A relationship needs a GlobalId of its own. They are keyed by what they
 * relate, so they stay as stable as the elements do.
 */
function relate(c: Context, type: string, key: string, ...rest: readonly string[]): number {
  return c.w.add(type, str(c.guid(type, key)), ref(c.owner), NULL, NULL, ...rest)
}

// ---------------------------------------------------------------------------
// Properties and base quantities (HND-2)
// ---------------------------------------------------------------------------

const label = (value: string): string => `IFCLABEL(${str(value)})`
const identifier = (value: string): string => `IFCIDENTIFIER(${str(value)})`
const textValue = (value: string): string => `IFCTEXT(${str(value)})`
const booleanValue = (value: boolean): string => `IFCBOOLEAN(${en(value ? 'T' : 'F')})`

/** IfcPropertySingleValue(Name, Description, NominalValue, Unit). */
const property = (c: Context, name: string, nominal: string): number =>
  c.w.add('IFCPROPERTYSINGLEVALUE', str(name), NULL, nominal, NULL)

/**
 * A property set on one element. `key` keeps its identity and its relation's apart from every
 * other set of the element. A `Pset_` name is the standard's, for its own properties only; a
 * `Grid_` set is Grid's own.
 */
function propertySet(c: Context, key: string, name: string, properties: readonly number[], element: number): void {
  if (properties.length === 0) return
  const set = c.w.add('IFCPROPERTYSET', str(c.guid('pset', key)), ref(c.owner), str(name), NULL, refs(properties))
  relate(c, 'IFCRELDEFINESBYPROPERTIES', `pset:${key}`, refs([element]), ref(set))
}

/** A base quantity: its kind, name, value in metres, m² or m³, and what it measures, when said. */
type Quantity = readonly ['LENGTH' | 'AREA' | 'VOLUME', string, number, string?]

/**
 * A base quantity set (`Qto_…BaseQuantities`) on one element, as an IfcElementQuantity whose
 * method is `BaseQuantities`: what a BIM tool's take-off and schedules read. A value that is not
 * a number is left out; none is negative (IFC2x3 requires it).
 */
function quantitySet(c: Context, key: string, name: string, quantities: readonly Quantity[], element: number): void {
  const written = quantities
    .filter(([, , value]) => Number.isFinite(value))
    .map(([kind, quantity, value, description]) =>
      // IfcQuantityLength / Area / Volume (Name, Description, Unit, Value): the unit is the project's.
      c.w.add(`IFCQUANTITY${kind}`, str(quantity), description === undefined ? NULL : str(description), NULL, real(Math.max(0, value)))
    )
  if (written.length === 0) return
  const set = c.w.add('IFCELEMENTQUANTITY', str(c.guid('qto', key)), ref(c.owner), str(name), NULL, str('BaseQuantities'), refs(written))
  relate(c, 'IFCRELDEFINESBYPROPERTIES', `qto:${key}`, refs([element]), ref(set))
}

/** The length round a closed ring. */
function perimeter(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    sum += Math.hypot(b.x - a.x, b.y - a.y)
  }
  return sum
}

/** A footprint's area: its outline less its holes. */
const footprintArea = (footprint: Footprint): number =>
  footprint.holes.reduce((sum, hole) => sum - area(hole), area(footprint.outline))

/** A size in a type's name and key, in metres to the millimetre, as the estimate's keys write it (ARE-13). */
const sizeText = (value: number): string => String(Math.round(value * 1000) / 1000)

interface WallElement {
  readonly id: number
  readonly placement: number
  readonly wall: Wall
  readonly length: number
  /** The area of its body profile, seen from above: its footprint, corners joined. */
  readonly footprint: number
  /** CNT-18: a curved wall is placed at the storey's origin, unturned, and its openings at their chords. */
  readonly curved: boolean
  /** CMD-26: whether it faces outside (`wallExposure`), which its doors and windows share. */
  readonly outside: boolean
  /** LVL-6: its body's height, the highest point of the top a roof leaves it, else its own. */
  readonly height: number
  /** LVL-6: its side along the axis under its top, and its body's volume, cut by the roof. */
  readonly side: number
  readonly volume: number
  /** Whether the roof cuts it. */
  readonly cut: boolean
}

/**
 * A wall as IfcWallStandardCase: placed at `wall.start` with local X along the
 * axis, an `Axis` polyline from 0 to the length, and a `Body` that is the
 * rectangle (length x thickness) extruded `height`. The rectangle is centred on
 * the axis, which is C1: thickness grows symmetrically from the reference line.
 * Where the wall meets others its corners are joined as in the 2D and 3D views
 * (SHT-2): the body is then the outline with each face running to the joint, an
 * IfcArbitraryClosedProfileDef whose two long sides stay parallel to the axis.
 *
 * Everything that can throw (`wallAxis` on a zero-length wall) is computed
 * before the first entity is written, so a failure leaves no dangling entity.
 */
function writeWall(c: Context, storey: Storey, wall: Wall, ends: WallEnds | undefined): WallElement {
  // A curve that cannot be worked out has no straight axis either: `wallAxis` refuses it below, and the wall is left out.
  const curve = wallCurve(wall)
  if (curve !== null) return writeCurvedWall(c, storey, wall, curve, ends)
  const axis = wallAxis(wall)
  const { w } = c

  const wallPlacement = placement(
    w,
    storey.placement,
    [axis.start.x, axis.start.y, 0],
    [axis.dir.x, axis.dir.y, 0]
  )

  const from = w.add('IFCCARTESIANPOINT', reals([0, 0]))
  const to = w.add('IFCCARTESIANPOINT', reals([axis.length, 0]))
  const line = w.add('IFCPOLYLINE', refs([from, to]))
  const axisRepresentation = w.add(
    'IFCSHAPEREPRESENTATION',
    ref(c.shared.axisContext),
    str('Axis'),
    str('Curve2D'),
    refs([line])
  )

  const half = wall.thickness / 2
  // Local Y is the wall's normal, its left face.
  const outline: Ring | null =
    ends === undefined
      ? null
      : [
          { x: -ends.start.right, y: -half },
          { x: axis.length + ends.end.right, y: -half },
          { x: axis.length + ends.end.left, y: half },
          { x: -ends.start.left, y: half }
        ]
  const profile =
    outline === null
      ? rectangleProfile(c, axis.length, wall.thickness, axis.length / 2)
      : footprintProfile(c, { outline, holes: [] })
  // LVL-6: a wall the floor's roof cuts rises to its highest point and has the roof's planes taken
  // off above its line, each level across the wall as the views draw it.
  const top = wallTopProfile(storey.model.index.plan, wall)
  const roof = top === null ? null : floorRoofShape(storey.model.index.plan, storey.model.floor.id)
  const peak = top === null ? wall.height : Math.max(...top.map((p) => p.z))
  const cuts: HalfSpaceCut[] = []
  const planes: RoofPlane[] = []
  for (const plane of roof?.planes ?? []) {
    const a = plane.z0 + plane.gx * axis.start.x + plane.gy * axis.start.y
    const b = plane.gx * axis.dir.x + plane.gy * axis.dir.y
    if (Math.min(a, a + b * axis.length) < peak - tolerance('joint')) {
      cuts.push({ at: [0, 0, a], toward: [-b, 0, 1] })
      planes.push({ z0: a, gx: b, gy: 0 })
    }
  }
  const swept = extrusion(c, profile, peak)
  const body = cuts.length === 0 ? bodyRepresentation(c, swept) : bodyRepresentation(c, clipped(c, swept, cuts), 'Clipping')
  const shape = productShape(c, [axisRepresentation, body])

  const id = w.add(
    'IFCWALLSTANDARDCASE',
    str(c.guid('wall', wall.id)),
    ref(c.owner),
    str(wall.id),
    NULL,
    NULL,
    ref(wallPlacement),
    ref(shape),
    NULL
  )

  writeWallProperties(c, wall, id, wallExposure(storey.model.index, wall.id) === 'exterior')
  typeWall(c, wall, id)
  noteFacts(c, id, 'wall', wall)
  notePhase(c, id, 'wall', wall.id)
  const footprint = outline === null ? axis.length * wall.thickness : area(outline)
  // LVL-6 with HND-2: a wall the roof cuts is measured as written, under its cut top.
  const ring = outline ?? [{ x: 0, y: -half }, { x: axis.length, y: -half }, { x: axis.length, y: half }, { x: 0, y: half }]
  const side = top === null ? axis.length * peak : faceUnderTop(top, 0, axis.length)
  const volume = cuts.length === 0 ? footprint * peak : volumeUnder([...planes, { z0: peak, gx: 0, gy: 0 }], [[ringOf(ring)]])
  return { id, placement: wallPlacement, wall, length: axis.length, footprint, height: peak, side, volume, cut: cuts.length > 0, curved: false, outside: wallExposure(storey.model.index, wall.id) === 'exterior' }
}

/**
 * CNT-18: a curved wall. It is placed at the storey's origin, unturned, so its shapes are in the
 * plan's own coordinates. Its `Axis` is the true arc, an IfcTrimmedCurve on an IfcCircle trimmed
 * by angle (radians, the file's plane angle unit), running the way the wall turns; its `Body`
 * is its outline, corners joined as in the views, followed by the straight pieces the views
 * draw it with (`wallPolygon`), extruded `height`: IFC2x3's profiles take an arc only through a
 * composite curve, which the Coordination View's readers do not all build. A whole circle's
 * body is a ring: its outer face with its inner face as a void. The note names the wall
 * (`Grid_Approximated`).
 */
function writeCurvedWall(c: Context, storey: Storey, wall: Wall, curve: WallCurve, ends: WallEnds | undefined): WallElement {
  const { w } = c
  const wallPlacement = placement(w, storey.placement, [0, 0, 0])

  const centre = w.add('IFCCARTESIANPOINT', reals([curve.centre.x, curve.centre.y]))
  const circle = w.add('IFCCIRCLE', ref(w.add('IFCAXIS2PLACEMENT2D', ref(centre), ref(c.shared.east2))), real(curve.radius))
  const trim = (angle: number): string => `(IFCPARAMETERVALUE(${real(angle)}))`
  const end = curve.startAngle + curve.sweep
  const line = w.add('IFCTRIMMEDCURVE', ref(circle), trim(curve.startAngle), trim(end), curve.sweep > 0 ? '.T.' : '.F.', en('PARAMETER'))
  const axisRepresentation = w.add('IFCSHAPEREPRESENTATION', ref(c.shared.axisContext), str('Axis'), str('Curve2D'), refs([line]))

  const half = wall.thickness / 2
  // A face of a whole circle: its stations at `offset` from the axis, the last (the first again) left off.
  const ring = (offset: number): Vec2[] =>
    curveStations(curve)
      .slice(0, -1)
      .map((s) => {
        const angle = curve.startAngle + (Math.sign(curve.sweep) * s) / curve.radius
        return { x: curve.centre.x + (curve.radius + offset) * Math.cos(angle), y: curve.centre.y + (curve.radius + offset) * Math.sin(angle) }
      })
  const footprint: Footprint = curve.closed
    ? { outline: counterClockwise(ring(half)), holes: [[...counterClockwise(ring(-half))].reverse()] }
    : { outline: counterClockwise(wallPolygon(wall, ends)), holes: [] }
  const profile = footprintProfile(c, footprint)
  const body = bodyRepresentation(c, extrusion(c, profile, wall.height))
  const shape = productShape(c, [axisRepresentation, body])

  const id = w.add('IFCWALLSTANDARDCASE', str(c.guid('wall', wall.id)), ref(c.owner), str(wall.id), NULL, NULL, ref(wallPlacement), ref(shape), NULL)
  writeWallProperties(c, wall, id, wallExposure(storey.model.index, wall.id) === 'exterior')
  typeWall(c, wall, id)
  noteFacts(c, id, 'wall', wall)
  notePhase(c, id, 'wall', wall.id)
  // The roof does not cut a curved wall (LVL-6's wall tops follow straight walls): it is measured at its own height.
  const bodyArea = footprintArea(footprint)
  return { id, placement: wallPlacement, wall, length: curve.length, footprint: bodyArea, height: wall.height, side: curve.length * wall.height, volume: bodyArea * wall.height, cut: false, curved: true, outside: wallExposure(storey.model.index, wall.id) === 'exterior' }
}

/** A ring of points counter-clockwise, as a profile's outline runs. */
function counterClockwise(points: readonly Vec2[]): Vec2[] {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    twice += a.x * b.y - b.x * a.y
  }
  return twice >= 0 ? [...points] : [...points].reverse()
}

/**
 * HND-2: `Qto_WallBaseQuantities`, from the wall as written: its axis length, thickness and
 * height, the footprint of its body (corners joined, SHT-2), its side along the axis, and its
 * volume, each less the openings written in it (their width by height, through its thickness).
 */
function writeWallQuantities(c: Context, element: WallElement, openings: readonly Opening[]): void {
  const { wall, length, footprint, height, side, volume, cut } = element
  const holes = openings.reduce((sum, opening) => sum + opening.width * opening.height, 0)
  quantitySet(c, `wall:${wall.id}`, 'Qto_WallBaseQuantities', [
    ['LENGTH', 'Length', length, 'Along its axis, from start to end.'],
    ['LENGTH', 'Width', wall.thickness],
    cut ? ['LENGTH', 'Height', height, 'Its highest point: the roof cuts its top.'] : ['LENGTH', 'Height', height],
    ['AREA', 'GrossFootprintArea', footprint, 'Its body seen from above, with its corners joined to the walls it meets.'],
    ['AREA', 'GrossSideArea', side, cut ? 'One side along its axis, under the top the roof leaves it.' : 'Its length along the axis times its height, one side.'],
    ['AREA', 'NetSideArea', side - holes, 'The gross side area less every opening written in it, at its full size.'],
    ['VOLUME', 'GrossVolume', volume],
    ['VOLUME', 'NetVolume', volume - holes * wall.thickness, 'The gross volume less every opening written in it, through its thickness.']
  ], element.id)
}

/** What a wall's material and type are called, by the kind the plan states (ARE-13 prices by it too). */
const WALL_KIND_WORDS: Readonly<Record<WallKind, string>> = {
  exterior: 'Exterior wall',
  interior: 'Interior wall',
  partition: 'Partition',
  // CNT-6 (C23): a party wall, or a wall to the common parts.
  separating: 'Separating wall'
}

/** The plan holds no type, material or construction for these walls: the type says so. */
const WALL_TYPE_NOTE =
  'The plan holds no type, material or build-up for these walls: the type is the walls of one stated kind and one thickness, with one layer whose material is not stated.'

/** CNT-15: a type the plan names: its material, as one layer; the plan holds no build-up. */
const NAMED_WALL_TYPE_NOTE = "The plan's own wall type: one layer of its material, as thick as the wall. The plan holds no build-up."

/** CNT-15 (lab AU3-4): what a material the plan does not state is called. */
const NOT_STATED = englishWords['type.material.notStated']

/** A wall's stated kind; a file read without the schema may leave it out, and the schema's default is interior. */
const kindOf = (wall: Wall): WallKind => (wall.kind in WALL_KIND_WORDS ? wall.kind : 'interior')

/** CNT-15: the one material of a name, written on first use. */
function materialNamed(c: Context, label: string): number {
  let material = c.materials.byName.get(label)
  if (material === undefined) {
    material = c.w.add('IFCMATERIAL', str(label))
    c.materials.byName.set(label, material)
  }
  return material
}

/**
 * IFC2x3 requires every IfcWallStandardCase to be associated with exactly one
 * IfcMaterialLayerSetUsage (its WR1), so each wall gets one: a single layer as
 * thick as the wall. The usage runs along local Y (across the wall) with an
 * offset of -thickness/2, which centres the layer on the axis, the same band the
 * Body profile covers (C1).
 *
 * HND-2: walls are typed by the kind the plan states and their thickness, the way
 * the estimate groups them (`wall:exterior:0.35`, ARE-13). Each type is an
 * IfcWallType carrying its IfcMaterialLayerSet; its walls carry that set's usage.
 * CNT-15 (C24): a wall that takes one of the plan's named types is typed by it (and
 * its thickness, which the wall may state for itself), named after it, and its layer
 * is the type's material; every other layer's material is "Not stated" (lab AU3-4),
 * never a word Grid made up. All are created on first use and the relations are
 * written once at the end, so nothing is written for a plan with no walls.
 */
function typeWall(c: Context, wall: Wall, element: number): void {
  const { w, materials } = c
  const kind = kindOf(wall)
  const named = wallTypeOf(c.plan, wall)
  const key = named === null ? `wall:${kind}:${sizeText(wall.thickness)}` : `wall-type:${named.id}:${sizeText(wall.thickness)}`

  let entry = materials.byType.get(key)
  if (!entry) {
    const material = materialNamed(c, typeMaterial(named) ?? NOT_STATED)
    const layer = w.add('IFCMATERIALLAYER', ref(material), real(wall.thickness), NULL)
    const set = w.add('IFCMATERIALLAYERSET', refs([layer]), str(wallTypeName(kind, wall.thickness, named)))
    const usage = w.add(
      'IFCMATERIALLAYERSETUSAGE',
      ref(set),
      en('AXIS2'),
      en('POSITIVE'),
      real(-wall.thickness / 2)
    )
    entry = { kind, thickness: wall.thickness, named, set, usage, walls: [] }
    materials.byType.set(key, entry)
  }
  entry.walls.push(element)
}

/** A type's name: Grid's from the kind and thickness, or the plan's own, with the thickness when a wall states another. */
const wallTypeName = (kind: WallKind, thickness: number, named: WallType | null = null): string =>
  named === null ? `${WALL_KIND_WORDS[kind]} ${sizeText(thickness)} m` : named.thickness === undefined || named.thickness === thickness ? named.name : `${named.name} ${sizeText(thickness)} m`

/**
 * Each wall type, the walls it types, and the two material associations: the layer set on the
 * type, its usage on the walls.
 */
function writeWallTypes(c: Context): void {
  for (const [key, { kind, thickness, named, set, usage, walls }] of c.materials.byType) {
    // IfcWallType: GlobalId, OwnerHistory, Name, Description, ApplicableOccurrence,
    // HasPropertySets, RepresentationMaps, Tag, ElementType, PredefinedType.
    const type = c.w.add(
      'IFCWALLTYPE',
      str(c.guid('wall-type', key)),
      ref(c.owner),
      str(wallTypeName(kind, thickness, named)),
      str(named === null ? WALL_TYPE_NOTE : NAMED_WALL_TYPE_NOTE),
      NULL,
      NULL,
      NULL,
      str(key),
      // CNT-15: a glazed type says so in its element type: a glass partition is not plastered.
      str(named?.glazed === true ? `${WALL_KIND_WORDS[kind]}, glazed` : WALL_KIND_WORDS[kind]),
      en('STANDARD')
    )
    relate(c, 'IFCRELDEFINESBYTYPE', key, refs(walls), ref(type))
    relate(c, 'IFCRELASSOCIATESMATERIAL', `type:${key}`, refs([type]), ref(set))
    relate(c, 'IFCRELASSOCIATESMATERIAL', key, refs(walls), ref(usage))
  }
}

/**
 * `IsExternal` is the answer the drawing and the DXF give (`wallExposure`, MSG-13): worked out
 * from the rooms on the wall's sides, and true for any wall stated `exterior`. A wall that faces
 * outside for part of its length is external. Thickness decides nothing.
 */
function writeWallProperties(c: Context, wall: Wall, element: number, outside: boolean): void {
  const external = c.w.add(
    'IFCPROPERTYSINGLEVALUE',
    str('IsExternal'),
    NULL,
    `IFCBOOLEAN(${en(outside ? 'T' : 'F')})`,
    NULL
  )
  const set = c.w.add(
    'IFCPROPERTYSET',
    str(c.guid('pset', wall.id)),
    ref(c.owner),
    str('Pset_WallCommon'),
    NULL,
    refs([external])
  )
  relate(c, 'IFCRELDEFINESBYPROPERTIES', wall.id, refs([element]), ref(set))
}

/**
 * How far the void overshoots each face of its wall. Cutting exactly to the
 * faces leaves coincident surfaces, which a boolean leaves as a zero-thickness
 * skin; 1 cm each side makes the cut clean through both faces.
 */
const VOID_CLEARANCE = 0.01

/**
 * Depth of a rooflight's pane (LVL-6): a thin box in the middle of the roof's depth, as a door's or
 * window's leaf was drawn before CNT-14 gave doors and windows their frames, leaves and glass.
 */
const ROOFLIGHT_DEPTH = 0.05

type DoorOperation =
  | 'SINGLE_SWING_LEFT'
  | 'SINGLE_SWING_RIGHT'
  | 'DOUBLE_DOOR_SINGLE_SWING'
  | 'FOLDING_TO_LEFT'
  | 'FOLDING_TO_RIGHT'
  | 'SLIDING_TO_LEFT'
  | 'SLIDING_TO_RIGHT'
  | 'DOUBLE_DOOR_SLIDING'
  | 'ROLLINGUP'
  | 'USERDEFINED'

/**
 * IFC's operation for a door, from its kind and handing (CNT-14), or null when it cannot be told.
 *
 * IFC names the hinge side as seen looking the way the door opens (its local +y). Unturned,
 * local x runs from `wall.start`, so `start` is on the left; a door opening to the right face
 * is turned, which puts `start` on its right. A door with no kind is one swinging leaf, and needs
 * both values; a pair opens one way from both jambs; a folding or pocket door folds or slides
 * toward the end it names (`hinge`); a sliding door is two leaves; a garage door lifts overhead,
 * which IFC2x3 has no word for, so it is user-defined and its style's name says so.
 */
function doorOperation(opening: Opening): DoorOperation | null {
  const kind = doorKindOf(opening.kind)
  const toLeft = (opening.hinge === 'start') === (opening.swing !== 'right')
  switch (kind) {
    case 'single':
      if (opening.hinge === undefined || opening.swing === undefined) return null
      return toLeft ? 'SINGLE_SWING_LEFT' : 'SINGLE_SWING_RIGHT'
    case 'double':
      return 'DOUBLE_DOOR_SINGLE_SWING'
    case 'folding':
      if (opening.hinge === undefined || opening.swing === undefined) return null
      return toLeft ? 'FOLDING_TO_LEFT' : 'FOLDING_TO_RIGHT'
    case 'pocket':
      if (opening.hinge === undefined) return null
      return toLeft ? 'SLIDING_TO_LEFT' : 'SLIDING_TO_RIGHT'
    case 'sliding':
      return 'DOUBLE_DOOR_SLIDING'
    case 'roller':
      return 'ROLLINGUP'
    case 'garage':
      return 'USERDEFINED'
  }
}

const HANDING_WORDS: Record<DoorOperation | 'NOTDEFINED', string> = {
  SINGLE_SWING_LEFT: 'single swing, left',
  SINGLE_SWING_RIGHT: 'single swing, right',
  DOUBLE_DOOR_SINGLE_SWING: 'double, single swing',
  FOLDING_TO_LEFT: 'folding, to the left',
  FOLDING_TO_RIGHT: 'folding, to the right',
  SLIDING_TO_LEFT: 'pocket, sliding to the left',
  SLIDING_TO_RIGHT: 'pocket, sliding to the right',
  DOUBLE_DOOR_SLIDING: 'sliding, two leaves',
  ROLLINGUP: 'roller, rolling up',
  USERDEFINED: 'garage, lifting overhead',
  NOTDEFINED: 'swing not stated'
}

const OPERATION_ORDER: Record<DoorOperation | 'NOTDEFINED', number> = {
  SINGLE_SWING_LEFT: 0,
  SINGLE_SWING_RIGHT: 1,
  NOTDEFINED: 2,
  DOUBLE_DOOR_SINGLE_SWING: 3,
  FOLDING_TO_LEFT: 4,
  FOLDING_TO_RIGHT: 5,
  SLIDING_TO_LEFT: 6,
  SLIDING_TO_RIGHT: 7,
  DOUBLE_DOOR_SLIDING: 8,
  ROLLINGUP: 9,
  USERDEFINED: 10
}

/** IFC2x3's window operation for a stated kind: one panel, or two side by side. */
const WINDOW_OPERATION: Record<WindowKind, string> = {
  single: 'SINGLE_PANEL',
  double: 'DOUBLE_PANEL_VERTICAL',
  sliding: 'DOUBLE_PANEL_VERTICAL',
  fixed: 'SINGLE_PANEL',
  'high-level': 'SINGLE_PANEL'
}

/**
 * A door or window type's key: its kind and size, as the estimate prices it (`door:0.9x2.1`,
 * ARE-13), with the kind the plan states between (`door:sliding:2.2x2.1`, CNT-14, lab AC-13).
 */
const styleTag = (type: 'door' | 'window', kind: OpeningKind | null, width: number, height: number): string =>
  `${type}:${kind === null ? '' : `${kind}:`}${sizeText(width)}x${sizeText(height)}`

function styleName(entry: OpeningStyleEntry): string {
  // CNT-15: a type the plan names is called by its name, with a door's handing.
  if (entry.named !== null) return entry.type === 'window' ? entry.named.name : `${entry.named.name}, ${HANDING_WORDS[entry.operation]}`
  const size = `${sizeText(entry.width)} x ${sizeText(entry.height)} m`
  if (entry.type === 'window') return entry.kind === null ? `Window ${size}` : `Window ${size}, ${entry.kind}`
  if (entry.kind !== null && entry.operation === 'NOTDEFINED') return `Door ${size}, ${entry.kind}, handing not stated`
  return `Door ${size}, ${HANDING_WORDS[entry.operation]}`
}

/** How Grid groups the openings into types (CNT-14: by the kind the plan states, when it states one). */
const STYLE_NOTE =
  'Grid groups the openings by kind (as the plan states it; a door with none is one swinging leaf), size (the hole in the wall, width by height) and, for a door, its handing.'

/** CNT-15: how a type the plan names is written. */
const NAMED_STYLE_NOTE = "The plan's own door or window type, and for a door its handing; its material is the type's."

/** Puts a door or window in its type, made on first use. */
function typeOpening(c: Context, opening: Opening, operation: DoorOperation | null, filler: number): void {
  const type = opening.type === 'door' ? 'door' : 'window'
  const kind = statedKind(type, opening.kind)
  const handing = type === 'door' ? operation ?? 'NOTDEFINED' : 'NOTDEFINED'
  // CNT-15 (C24): a door or window that takes one of the plan's named types is typed by it.
  const named = openingTypeOf(c.plan, opening)
  const key = named === null ? `${styleTag(type, kind, opening.width, opening.height)}:${handing}` : `${type}-type:${named.id}:${handing}`
  const entry = c.openingStyles.get(key)
  if (entry) entry.fillers.push(filler)
  else c.openingStyles.set(key, { type, kind, operation: handing, width: opening.width, height: opening.height, fillers: [filler], named })
}

/** CNT-15: Grid's types first, then the plan's named ones by id. */
function namedOrder(a: { readonly id: string } | null, b: { readonly id: string } | null): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? -1 : 1
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
}

/**
 * HND-2: one shared style per door type and per window type, with the doors or windows it types:
 * the same size and, for a door, the same handing, since IFC2x3 keeps a door's operation on its
 * style. Shared, because a BIM tool makes one family type per style. Doors first, then windows,
 * each by handing, width and height.
 */
function writeOpeningStyles(c: Context): void {
  const entries = [...c.openingStyles.entries()].sort(
    ([, a], [, b]) =>
      (a.type === b.type ? 0 : a.type === 'door' ? -1 : 1) ||
      // CNT-15: Grid's types first, then the plan's named ones by id.
      namedOrder(a.named, b.named) ||
      (a.kind === b.kind ? 0 : a.kind === null ? -1 : b.kind === null ? 1 : a.kind < b.kind ? -1 : 1) ||
      OPERATION_ORDER[a.operation] - OPERATION_ORDER[b.operation] ||
      a.width - b.width ||
      a.height - b.height
  )
  for (const [key, entry] of entries) {
    const tag = entry.named === null ? styleTag(entry.type, entry.kind, entry.width, entry.height) : `${entry.type}-type:${entry.named.id}`
    const note = entry.named === null ? STYLE_NOTE : NAMED_STYLE_NOTE
    const style =
      entry.type === 'door'
        ? // IfcDoorStyle: GlobalId, OwnerHistory, Name, Description, ApplicableOccurrence,
          // HasPropertySets, RepresentationMaps, Tag, OperationType, ConstructionType,
          // ParameterTakesPrecedence, Sizeable.
          c.w.add(
            'IFCDOORSTYLE',
            str(c.guid('door-style', key)),
            ref(c.owner),
            str(styleName(entry)),
            str(note),
            NULL,
            NULL,
            NULL,
            str(tag),
            en(entry.operation),
            en('NOTDEFINED'),
            '.F.',
            '.T.'
          )
        : // IfcWindowStyle: GlobalId, OwnerHistory, Name, Description, ApplicableOccurrence,
          // HasPropertySets, RepresentationMaps, Tag, ConstructionType, OperationType,
          // ParameterTakesPrecedence, Sizeable.
          c.w.add(
            'IFCWINDOWSTYLE',
            str(c.guid('window-style', key)),
            ref(c.owner),
            str(styleName(entry)),
            str(note),
            NULL,
            NULL,
            NULL,
            str(tag),
            en('NOTDEFINED'),
            en(entry.kind === null ? 'NOTDEFINED' : WINDOW_OPERATION[entry.kind as WindowKind]),
            '.F.',
            '.T.'
          )
    relate(c, 'IFCRELDEFINESBYTYPE', key, refs(entry.fillers), ref(style))
    // CNT-15 (lab AU3-4): a named type's doors or windows are of its material, or "Not stated".
    if (entry.named !== null) relate(c, 'IFCRELASSOCIATESMATERIAL', `material:${key}`, refs(entry.fillers), ref(materialNamed(c, typeMaterial(entry.named) ?? NOT_STATED)))
  }
}

/**
 * An opening as a void in its wall, plus, for a door or a window, the element
 * that fills it. Returns the filler (to be contained in the storey), if any.
 *
 * The void is placed relative to its wall at (offset, 0, sill): C2 makes
 * `offset` the near edge along the axis, so its rectangle (width x thickness)
 * starts at the placement and is centred on the axis across it. The filler is
 * placed relative to the void, so moving one moves the other.
 */
function writeOpening(c: Context, element: WallElement, opening: Opening): number | null {
  const { w } = c
  const { wall } = element

  // CNT-18: in a curved wall the hole is the straight chord between the opening's edges (C21),
  // placed there and as wide as that chord, and deep enough to cut through both faces where
  // they bow away from it.
  const span = openingSpan(opening)
  const chord = element.curved ? openingChord(wall, span.from, span.to) : null
  const width = chord === null ? opening.width : chord.length
  const bow = chord === null ? 0 : 2 * (wallCurve(wall)!.radius + wall.thickness / 2) * Math.sin(opening.width / (4 * wallCurve(wall)!.radius)) ** 2
  const voidPlacement =
    chord === null
      ? w.add(
          'IFCLOCALPLACEMENT',
          ref(element.placement),
          ref(
            w.add(
              'IFCAXIS2PLACEMENT3D',
              ref(w.add('IFCCARTESIANPOINT', reals([opening.offset, 0, opening.sill]))),
              NULL,
              NULL
            )
          )
        )
      : placement(w, element.placement, [chord.start.x, chord.start.y, opening.sill], [chord.dir.x, chord.dir.y, 0])

  const cut = rectangleProfile(
    c,
    width,
    wall.thickness + 2 * VOID_CLEARANCE + 2 * bow,
    width / 2
  )
  const voidShape = productShape(c, [
    bodyRepresentation(c, extrusion(c, cut, opening.height))
  ])

  const hole = w.add(
    'IFCOPENINGELEMENT',
    str(c.guid('opening', opening.id)),
    ref(c.owner),
    str(opening.id),
    NULL,
    NULL,
    ref(voidPlacement),
    ref(voidShape),
    NULL
  )
  relate(c, 'IFCRELVOIDSELEMENT', opening.id, ref(element.id), ref(hole))

  // A plain opening only cuts the wall, and carries its own quantities; its facts go on the void
  // (CNT-9).
  if (opening.type === 'opening') {
    noteFacts(c, hole, 'opening', opening)
    notePhase(c, hole, 'opening', opening.id)
    quantitySet(c, `opening:${opening.id}`, 'Qto_OpeningElementBaseQuantities', [
      ['LENGTH', 'Width', opening.width],
      ['LENGTH', 'Height', opening.height],
      ['LENGTH', 'Depth', wall.thickness],
      ['AREA', 'Area', opening.width * opening.height]
    ], hole)
    return null
  }

  // IFC opens a door toward its own +y, with a LEFT door's hinge at local x = 0. A door
  // that opens to the wall's right face is turned half a turn about z, from its far end, so
  // it opens that way and still fills the same span.
  const operation = opening.type === 'door' ? doorOperation(opening) : null
  const turned = operation !== null && opening.swing === 'right'
  const fillerPlacement = turned
    ? placement(w, voidPlacement, [width, 0, 0], [-1, 0, 0])
    : placement(w, voidPlacement, [0, 0, 0])
  // CNT-14: its frame, leaves and glass (`openingParts`), in the filler's own frame: from the
  // void's corner along the wall, across it toward its left face, up from the sill; turned with
  // the filler. CNT-18: on a curved wall the filler spans the chord, so the parts' places along
  // the curve are drawn in to it.
  const along = width / opening.width
  const solids = openingParts(opening, wall).map((part) => {
    const x0 = (part.along[0] - opening.offset) * along
    const x1 = (part.along[1] - opening.offset) * along
    const [cx, cy] = turned ? [width - (x0 + x1) / 2, -(part.across[0] + part.across[1]) / 2] : [(x0 + x1) / 2, (part.across[0] + part.across[1]) / 2]
    const solid = boxSolid(c, [cx, cy], [x1 - x0, part.across[1] - part.across[0]], part.up[0] - opening.sill, part.up[1] - part.up[0])
    if (part.part === 'glass') glazed(c, solid)
    return solid
  })
  const fillerShape = productShape(c, [bodyRepresentation(c, solids)])

  const filler = w.add(
    opening.type === 'door' ? 'IFCDOOR' : 'IFCWINDOW',
    str(c.guid(opening.type, opening.id)),
    ref(c.owner),
    str(opening.id),
    NULL,
    NULL,
    ref(fillerPlacement),
    ref(fillerShape),
    str(opening.id),
    real(opening.height),
    real(width)
  )
  relate(c, 'IFCRELFILLSELEMENT', opening.id, ref(hole), ref(filler))
  const size: Quantity[] = [
    ['LENGTH', 'Width', opening.width],
    ['LENGTH', 'Height', opening.height],
    ['AREA', 'Area', opening.width * opening.height, 'The hole in the wall, width by height: the plan holds no frame.']
  ]
  quantitySet(c, `${opening.type}:${opening.id}`, opening.type === 'door' ? 'Qto_DoorBaseQuantities' : 'Qto_WindowBaseQuantities', size, filler)
  // CMD-26: the set a BIM tool reads a door or window by: its reference (its id) and whether it is external.
  propertySet(c, `${opening.type}:${opening.id}`, opening.type === 'door' ? 'Pset_DoorCommon' : 'Pset_WindowCommon', [
    property(c, 'Reference', `IFCIDENTIFIER(${str(opening.id)})`),
    property(c, 'IsExternal', `IFCBOOLEAN(${en(element.outside ? 'T' : 'F')})`)
  ], filler)
  typeOpening(c, opening, operation, filler)
  noteFacts(c, filler, opening.type, opening)
  notePhase(c, filler, opening.type, opening.id)
  return filler
}

/**
 * A room as an IfcSpace: its footprint is the polygon from the inner faces of
 * its walls (C3), counter-clockwise, less its holes (ARE-6), extruded to the
 * storey height. Virtual walls still close the outline through their faces, so
 * an open-plan room keeps its area although no wall element stands there.
 * Returns null for a room whose boundary does not close.
 *
 * A room set off its storey (LVL-7) stands at its `floorOffset` and still reaches the storey's
 * ceiling, so a genkan or a stage is a space at its own level, not at the storey's.
 */
function writeSpace(c: Context, storey: Storey, room: Room): number | null {
  const footprint = roomFootprint(storey, room)
  if (!footprint) return null
  const { w } = c

  const offset = roomFloorOffset(room)
  // LVL-6: under a roof the floor states, the space rises to the roof's top and the roof's planes
  // are taken off it, so it holds the volume under the slope.
  const roof = floorRoofShape(storey.model.index.plan, storey.model.floor.id)
  const reach = roof === null ? storey.height : roof.top
  // A room raised to the ceiling or past it (asked about by the checks) keeps the storey's height.
  const height = reach - offset > 0 ? reach - offset : reach
  const corners = [footprint.outline, ...footprint.holes].flat()
  const cutting = (roof?.planes ?? []).filter(
    (plane) => Math.min(...corners.map((p) => plane.z0 + plane.gx * p.x + plane.gy * p.y)) - offset < height - tolerance('joint')
  )
  const cuts = cutting.map((plane) => above(plane, offset))
  // HND-2's volume, as written: under the roof, the clipped body's.
  const volume =
    cuts.length === 0
      ? footprintArea(footprint) * height
      : volumeUnder([...cutting.map((plane) => ({ ...plane, z0: plane.z0 - offset })), { z0: height, gx: 0, gy: 0 }], [[ringOf(footprint.outline), ...footprint.holes.map((hole) => ringOf(hole))]])
  const spacePlacement = placement(w, storey.placement, [0, 0, offset])
  const profile = footprintProfile(c, footprint)
  const swept = extrusion(c, profile, height)
  const shape = productShape(c, [cuts.length === 0 ? bodyRepresentation(c, swept) : bodyRepresentation(c, clipped(c, swept, cuts), 'Clipping')])

  // HND-2: Name is the room's number and LongName its name, the way a BIM tool reads a room's
  // number and name; ObjectType is its use, when the plan states one. CNT-9: the number is the
  // one the room states, else Grid's count (`shownRoomNumber`).
  const numbered = c.roomNumbers.get(onFloorKey(storey.model.floor.id, room.id))
  const number = numbered === undefined ? undefined : shownRoomNumber(numbered)
  const space = w.add(
    'IFCSPACE',
    str(c.guid('space', room.id)),
    ref(c.owner),
    str(number ?? room.name),
    NULL,
    room.use === undefined ? NULL : str(room.use),
    ref(spacePlacement),
    ref(shape),
    str(room.name),
    en('ELEMENT'),
    // CNT-7 (C26): an outdoor space is an external space.
    en(isOutdoor(room) ? 'EXTERNAL' : 'INTERNAL'),
    NULL
  )
  writeSpaceData(c, storey, room, space, footprint, { height, volume, cut: cuts.length > 0 }, numbered)
  // The stated number is a fact of the room's set too, first, as the DXF writes it.
  const facts = room.number === undefined || factOf(room, ROOM_NUMBER_FACT) !== undefined ? room.properties : { [ROOM_NUMBER_FACT]: room.number, ...room.properties }
  noteFacts(c, space, 'space', { id: room.id, properties: facts })
  notePhase(c, space, 'space', room.id)
  return space
}

/** Grid_Space's words for a room whose use the plan does not state, as the areas say it (ARE-9). */
const USE_NOT_SAID = 'not said'

const FOOTPRINT_RULE =
  "The space's footprint: inside the faces of its walls, less its holes; a room drawn inside it is not taken off."

/**
 * HND-2: what a room is, in the fields IFC has for it. `Pset_SpaceCommon` holds its number
 * (`Reference`: the one it states, else Grid's count, CNT-9) and its use (`Category`, when
 * stated); `Grid_Space`, Grid's own set, holds its
 * id, number, use and net area with the measure and the rule it follows (ARE-9's net, in Grid's
 * words); `Qto_SpaceBaseQuantities` its height, perimeter, footprint, net area and volume.
 */
function writeSpaceData(
  c: Context,
  storey: Storey,
  room: Room,
  space: number,
  footprint: Footprint,
  body: { readonly height: number; readonly volume: number; readonly cut: boolean },
  numbered: RoomNumber | undefined
): void {
  let net: number | null = null
  try {
    // ARE-9's net, by the one function the areas use: the outline less its holes and the rooms
    // drawn inside it.
    net = roomFloorArea(room, storey.model.index, footprint.outline)
  } catch {
    // Left unsaid: the space still carries its footprint.
  }
  const gross = footprintArea(footprint)
  // CNT-7: an outdoor space's floor is outdoor area, in no net figure.
  const rule = isOutdoor(room) ? MEASURES.outdoor : MEASURES.net

  // CNT-7 (C26): an outdoor space says so, its kind and whether a roof covers it (lab EL-18).
  const kind = outdoorKind(room)
  propertySet(c, `space:${room.id}`, 'Pset_SpaceCommon', [
    ...(numbered === undefined ? [] : [property(c, 'Reference', identifier(shownRoomNumber(numbered)))]),
    ...(room.use === undefined ? [] : [property(c, 'Category', label(room.use))]),
    ...(kind === null ? [] : [property(c, 'IsExternal', booleanValue(true))])
  ], space)

  propertySet(c, `grid-space:${room.id}`, 'Grid_Space', [
    property(c, 'Id', identifier(room.id)),
    // CNT-9: a number the room states is text, as the plan gives it; Grid's count an integer.
    ...(numbered === undefined
      ? []
      : [property(c, 'Number', numbered.stated === null ? `IFCINTEGER(${int(numbered.number)})` : label(numbered.stated))]),
    property(c, 'Use', label(room.use ?? USE_NOT_SAID)),
    ...(kind === null ? [] : [property(c, 'Outdoor', label(kind)), property(c, 'Roofed', booleanValue(outdoorRoofed(room) === true))]),
    ...(net === null
      ? []
      : [
          property(c, 'Area', `IFCAREAMEASURE(${real(net)})`),
          property(c, 'AreaMeasure', label(rule.name)),
          property(c, 'AreaRule', textValue(rule.measures))
        ])
  ], space)

  quantitySet(c, `space:${room.id}`, 'Qto_SpaceBaseQuantities', [
    body.cut ? ['LENGTH', 'Height', body.height, 'Its highest point: the roof cuts it.'] : ['LENGTH', 'Height', body.height],
    ['LENGTH', 'GrossPerimeter', perimeter(footprint.outline)],
    ['AREA', 'GrossFloorArea', gross, FOOTPRINT_RULE],
    ...(net === null ? [] : [['AREA', 'NetFloorArea', net, rule.measures] as const]),
    body.cut ? ['VOLUME', 'GrossVolume', body.volume, 'Under the roof: the space as written, cut to its slopes.'] : ['VOLUME', 'GrossVolume', body.volume]
  ], space)
}

type Ring = readonly { readonly x: number; readonly y: number }[]

/** A room's outline, counter-clockwise, and its holes (ARE-6), clockwise. */
interface Footprint {
  readonly outline: Ring
  readonly holes: readonly Ring[]
}

/**
 * A room's footprint: the polygon from the inner faces of its walls (C3),
 * counter-clockwise, with its holes, the ones the 3D view's slab has too. Null
 * when the boundary does not close or a corner is not a number.
 */
function roomFootprint(storey: Storey, room: Room): Footprint | null {
  const shape = tryRoomShape(room, storey.model.index)
  if (!shape) return null
  const finite = (ring: Ring): boolean => ring.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!finite(shape.polygon) || !shape.holes.every(finite)) return null
  return { outline: shape.polygon, holes: shape.holes }
}

/**
 * A footprint as a closed profile: with its holes as voids when it has any. A closed polyline
 * repeats its first point.
 */
function footprintProfile(c: Context, footprint: Footprint): number {
  const curve = (ring: Ring): number =>
    c.w.add('IFCPOLYLINE', refs([...ring, ring[0]!].map((p) => c.w.add('IFCCARTESIANPOINT', reals([p.x, p.y])))))
  const outer = curve(footprint.outline)
  if (footprint.holes.length === 0) return c.w.add('IFCARBITRARYCLOSEDPROFILEDEF', en('AREA'), NULL, ref(outer))
  const inner = footprint.holes.map(curve)
  return c.w.add('IFCARBITRARYPROFILEDEFWITHVOIDS', en('AREA'), NULL, ref(outer), refs(inner))
}

type SlabKind = 'FLOOR' | 'BASESLAB' | 'ROOF'

/**
 * How thick a ceiling is drawn. IFC has no ceiling without a body; a thin board over the room,
 * its underside at the ceiling's height, is enough for a viewer to show it. Not a figure of the
 * building: the plan states no ceiling build-up.
 */
const CEILING_DEPTH = 0.02

/** An outline's pieces, each extruded `thickness` up from the element's placement, as one body. */
function piecesShape(c: Context, pieces: MultiPolygon, thickness: number): number | null {
  const solids = piecesAsRings(pieces)
    .filter((piece) => piece.outline.length >= 3)
    .map((piece) => extrusion(c, footprintProfile(c, piece), thickness))
  if (solids.length === 0) return null
  return productShape(c, [
    c.w.add('IFCSHAPEREPRESENTATION', ref(c.shared.bodyContext), str('Body'), str('SweptSolid'), refs(solids))
  ])
}

/** An IfcSlab over `pieces`, extruded `thickness` up from `bottom` (relative to its storey). */
function writeSlab(
  c: Context,
  storey: Storey,
  key: readonly [string, string],
  name: string,
  pieces: MultiPolygon,
  kind: SlabKind,
  bottom: number,
  thickness: number,
  parent: number = storey.placement
): { id: number; placement: number } | null {
  if (!(thickness > 0) || pieces.length === 0) return null
  const slabPlacement = placement(c.w, parent, [0, 0, bottom])
  const shape = piecesShape(c, pieces, thickness)
  if (shape === null) return null
  const id = c.w.add('IFCSLAB', str(c.guid(key[0], key[1])), ref(c.owner), str(name), NULL, NULL, ref(slabPlacement), ref(shape), NULL, en(kind))
  return { id, placement: slabPlacement }
}

const footprintPieces = (footprint: Footprint): MultiPolygon => [[ringOf(footprint.outline), ...footprint.holes.map(ringOf)]]

/** IFC's roof types (IfcRoofTypeEnum), by the shape the floor states. */
const ROOF_TYPES = { flat: 'FLAT_ROOF', 'mono-pitch': 'SHED_ROOF', gable: 'GABLE_ROOF', hip: 'HIP_ROOF' } as const

/** The lowest point of a roof's underside over its pieces, above the floor's level. */
function roofBase(roof: FloorRoof): number {
  let low = Infinity
  for (const facet of roof.facets) {
    for (const piece of piecesAsRings(facet.pieces)) for (const p of piece.outline) low = Math.min(low, planeAt(facet.plane, p))
  }
  return Number.isFinite(low) ? low : roof.bottom
}

/**
 * LVL-6: a sloped roof as one IfcSlab `ROOF`: each plane's pieces swept up from the roof's lowest
 * point past its highest, with what lies above the roof's top face and below its underside taken
 * off (`clipped`), so each piece lies on its slope, as thick as the roof measured upright.
 */
function writeSlopedRoof(c: Context, storey: Storey, floor: Floor, roof: FloorRoof): { id: number; placement: number } | null {
  const base = roofBase(roof)
  const solids: number[] = []
  for (const facet of roof.facets) {
    const below: HalfSpaceCut = { at: [0, 0, facet.plane.z0 - base], toward: [facet.plane.gx, facet.plane.gy, -1] }
    const over = above({ ...facet.plane, z0: facet.plane.z0 + roof.thickness }, base)
    for (const piece of piecesAsRings(facet.pieces)) {
      if (piece.outline.length < 3) continue
      const high = Math.max(...piece.outline.map((p) => planeAt(facet.plane, p))) + roof.thickness - base
      if (!(high > 0)) continue
      solids.push(clipped(c, extrusion(c, footprintProfile(c, piece), high), [over, below]))
    }
  }
  if (solids.length === 0) return null
  const slabPlacement = placement(c.w, storey.placement, [0, 0, base])
  const shape = productShape(c, [c.w.add('IFCSHAPEREPRESENTATION', ref(c.shared.bodyContext), str('Body'), str('Clipping'), refs(solids))])
  const id = c.w.add('IFCSLAB', str(c.guid('roof-slab', floor.id)), ref(c.owner), str(`${floor.name} roof slab`), NULL, NULL, ref(slabPlacement), ref(shape), NULL, en('ROOF'))
  return { id, placement: slabPlacement }
}

/**
 * LVL-6: each rooflight as a void through the roof slab and the window that fills it, as a window
 * fills a wall: the void an upright prism over the rooflight's rectangle on the plan, through the
 * roof and past both faces; the window a pane in the slope, as wide and long as the rooflight, in
 * the middle of the roof's depth. Returns the windows, to be contained in the storey.
 */
function writeRooflights(c: Context, storey: Storey, floor: Floor, roof: FloorRoof, slab: { id: number; placement: number }): number[] {
  const windows: number[] = []
  const slabBase = roof.facets.some((f) => f.plane.gx !== 0 || f.plane.gy !== 0) ? roofBase(roof) : roof.bottom - storey.elevation
  for (const place of roof.rooflights) {
    const { rooflight, plane } = place
    const heights = place.outline.map((p) => planeAt(plane, p))
    const low = Math.min(...heights) - VOID_CLEARANCE
    const high = Math.max(...heights) + roof.thickness + VOID_CLEARANCE
    const cut = extrusion(c, footprintProfile(c, { outline: place.outline, holes: [] }), high - low)
    const hole = c.w.add(
      'IFCOPENINGELEMENT',
      str(c.guid('opening', `rooflight:${floor.id}:${rooflight.id}`)),
      ref(c.owner),
      str(rooflight.id),
      NULL,
      str('Rooflight'),
      ref(placement(c.w, slab.placement, [0, 0, low - slabBase])),
      ref(productShape(c, [bodyRepresentation(c, cut)])),
      NULL
    )
    relate(c, 'IFCRELVOIDSELEMENT', `rooflight:${floor.id}:${rooflight.id}`, ref(slab.id), ref(hole))

    // The pane: its own z the roof's normal, its x along the rooflight's width.
    const at = { x: rooflight.at[0], y: rooflight.at[1] }
    const length = Math.hypot(plane.gx, plane.gy, 1)
    const normal: Triple = [-plane.gx / length, -plane.gy / length, 1 / length]
    const middle = planeAt(plane, at) + roof.thickness / 2
    const origin: Triple = [at.x - (normal[0] * ROOFLIGHT_DEPTH) / 2, at.y - (normal[1] * ROOFLIGHT_DEPTH) / 2, middle - (normal[2] * ROOFLIGHT_DEPTH) / 2]
    const axes = c.w.add(
      'IFCAXIS2PLACEMENT3D',
      ref(c.w.add('IFCCARTESIANPOINT', reals(origin))),
      ref(c.w.add('IFCDIRECTION', reals(normal))),
      ref(c.w.add('IFCDIRECTION', reals([place.across.x, place.across.y, 0])))
    )
    const pane = rectangleProfile(c, rooflight.width, rooflight.length, 0)
    const window = c.w.add(
      'IFCWINDOW',
      str(c.guid('window', `rooflight:${floor.id}:${rooflight.id}`)),
      ref(c.owner),
      str(rooflight.id),
      NULL,
      str('Rooflight'),
      ref(c.w.add('IFCLOCALPLACEMENT', ref(storey.placement), ref(axes))),
      ref(productShape(c, [bodyRepresentation(c, extrusion(c, pane, ROOFLIGHT_DEPTH))])),
      NULL,
      real(rooflight.length),
      real(rooflight.width)
    )
    relate(c, 'IFCRELFILLSELEMENT', `rooflight:${floor.id}:${rooflight.id}`, ref(hole), ref(window))
    windows.push(window)
  }
  return windows
}

/** The length round the outer edge of every piece, its holes not counted. */
const piecesPerimeter = (pieces: MultiPolygon): number =>
  piecesAsRings(pieces).reduce((sum, piece) => sum + perimeter(piece.outline), 0)

/**
 * HND-2: `Qto_SlabBaseQuantities`, from the slab as written: its body's outline and its
 * thickness, and, when openings void it, its net area and volume, the body less them.
 */
function writeSlabQuantities(c: Context, key: string, slab: number, body: MultiPolygon, thickness: number, net?: number): void {
  const gross = multiArea(body)
  quantitySet(c, key, 'Qto_SlabBaseQuantities', [
    ['LENGTH', 'Width', thickness, 'Its thickness.'],
    ['LENGTH', 'Perimeter', piecesPerimeter(body)],
    ['AREA', 'GrossArea', gross],
    ...(net === undefined ? [] : [['AREA', 'NetArea', net, 'The gross area less the openings that void it.'] as const]),
    ['VOLUME', 'GrossVolume', gross * thickness],
    ...(net === undefined ? [] : [['VOLUME', 'NetVolume', net * thickness] as const])
  ], slab)
}

/**
 * HND-2 on LVL-4's slabs: the plan states no slab or roof outline, so every slab and roof is
 * Grid's reading of the walls (`planEnvelope`), and `Grid_Slab` says so: `Assumed` true, whether
 * the thickness is the plan's, and what Grid took, in words, as the take-off says it.
 */
function describeSlab(c: Context, key: string, slab: number, thicknessStated: boolean, note: string): void {
  propertySet(c, key, 'Grid_Slab', [
    property(c, 'Assumed', booleanValue(true)),
    property(c, 'ThicknessStated', booleanValue(thicknessStated)),
    property(c, 'Note', textValue(note))
  ], slab)
}

const slabNote = (thicknessStated: boolean): string =>
  'The plan states no slab: Grid takes the floor\'s outline, to the outside face of its walls, open over its stairs, lift shafts and voids, ' +
  (thicknessStated ? 'as thick as the floor states.' : `${SLAB_THICKNESS} m thick: the floor states no slab thickness.`)
const sunkenNote = (thicknessStated: boolean): string =>
  'The plan states no slab: Grid puts one under this room, set below its storey, over its footprint, ' +
  (thicknessStated ? 'as thick as the floor\'s slab states.' : `${SLAB_THICKNESS} m thick: the floor states no slab thickness.`)
const RAISED_NOTE =
  'The plan states no slab: Grid fills under this room, set above its storey, over its footprint, from the storey\'s floor up to the room\'s.'
const roofNote = (thickness: number): string =>
  `The plan states no roof: Grid puts a flat one, ${thickness} m thick, over every part of the floor with nothing above, on its walls, with no overhang and no fall.`

/**
 * LVL-6 with HND-2: a roof the floor states, measured as written: its area on the slope, the
 * rooflights' rectangles in it, and its volume, as thick as it is measured upright over its plan.
 * With rooflights, the net area and volume are the roof less them.
 */
function writeStatedRoofQuantities(c: Context, key: string, slab: number, roof: FloorRoof): void {
  const lights = roof.rooflights.reduce((sum, place) => sum + place.rooflight.width * place.rooflight.length, 0)
  const net = roof.facets.reduce((sum, facet) => sum + facet.area, 0)
  const some = roof.rooflights.length > 0
  quantitySet(c, key, 'Qto_SlabBaseQuantities', [
    ['LENGTH', 'Width', roof.thickness, roof.pitch === 0 ? 'Its thickness.' : 'Its thickness, measured upright.'],
    ['LENGTH', 'Perimeter', piecesPerimeter(roof.pieces), 'Round its edge on the plan.'],
    roof.pitch === 0 ? ['AREA', 'GrossArea', roof.slopeArea + lights] : ['AREA', 'GrossArea', roof.slopeArea + lights, 'On the slope.'],
    ...(some ? [['AREA', 'NetArea', roof.slopeArea, 'The gross area less its rooflights.'] as const] : []),
    ['VOLUME', 'GrossVolume', roof.area * roof.thickness],
    ...(some ? [['VOLUME', 'NetVolume', net * roof.thickness] as const] : [])
  ], slab)
}

const statedRoofNote = (roof: FloorRoof): string =>
  `The floor states its roof (${roof.shape ?? 'flat'}): its shape, eaves and pitch are the plan's. Grid lays it over every part of the floor with nothing above, its eaves on the outside walls' lines, ${roof.thickness} m thick measured upright, with no overhang.`

/**
 * Every storey's slab, its openings, the roof over its parts with nothing above, its parapet and
 * its rooms' ceilings (LVL-4), from the floor's outline (`planEnvelope`):
 *
 * - one IfcSlab per floor, the one it stands on, over the whole outline, walls and all: a base
 *   slab on the lowest level. Each stair, lift shaft and void that opens it is an
 *   IfcOpeningElement voiding it, as a door voids a wall. A room set below its storey (LVL-7) is
 *   cut out of it and gets a slab of its own, lower down; a room set above it gets a slab from the
 *   storey's floor up to its own.
 * - an IfcRoof (a flat roof) aggregating an IfcSlab `ROOF` over every part with nothing above, on
 *   the floor's walls, and, with a parapet stated, an IfcWall `Parapet` along its edge.
 * - an IfcCovering `CEILING` for each room that states a ceiling, and one for each lowered zone.
 *
 * Written after everything else, in a containment relation of their own per storey, so the walls,
 * openings and spaces keep the entities they always had.
 */
function writeSlabs(building: Context, plan: FloorPlan, storeys: readonly Storey[]): void {
  if (storeys.length === 0) return
  const floors = new Map(storeys.map((storey) => [storey.model.floor.id, { floorLevel: storey.elevation, clearHeight: storey.height }] as const))
  let envelope: ReturnType<typeof planEnvelope>
  try {
    envelope = planEnvelope(plan, { elevations: { floors, roof: roofOver(floors) } })
  } catch {
    return
  }
  const byFloor = new Map(envelope.floors.map((f) => [f.floor, f] as const))

  for (const storey of storeys) {
    const { index, broken, floor } = storey.model
    const c = onFloor(building, floor.id)
    const contained: number[] = []
    const env = byFloor.get(floor.id)
    const roomNames = new Map(index.plan.rooms.map((room) => [room.id, room.name || room.id] as const))

    try {
      const slab = env?.slab ?? null
      if (slab !== null) {
        const kind: SlabKind = slab.kind === 'base' ? 'BASESLAB' : 'FLOOR'
        const written = writeSlab(c, storey, ['floor-slab', floor.id], `${floor.name} slab`, slab.body, kind, -slab.thickness, slab.thickness)
        if (written !== null) {
          contained.push(written.id)
          const key = `floor-slab:${floor.id}`
          writeSlabQuantities(c, key, written.id, slab.body, slab.thickness, slab.openings.length === 0 ? undefined : slab.area)
          describeSlab(c, key, written.id, slab.thicknessStated, slabNote(slab.thicknessStated))
          for (const opening of slab.openings) {
            const shape = piecesShape(c, opening.pieces, slab.thickness + 2 * VOID_CLEARANCE)
            if (shape === null) continue
            const over = opening.room === null ? opening.via : roomNames.get(opening.room) ?? opening.room
            const hole = c.w.add(
              'IFCOPENINGELEMENT',
              str(c.guid('slab-opening', `${opening.kind}:${opening.via}`)),
              ref(c.owner),
              str(`Opening over ${over}`),
              NULL,
              str(opening.kind === 'void' ? 'Void' : opening.kind === 'lift' ? 'Lift shaft' : opening.kind === 'ramp' ? 'Ramp' : 'Stair'),
              ref(placement(c.w, written.placement, [0, 0, -VOID_CLEARANCE])),
              ref(shape),
              NULL
            )
            relate(c, 'IFCRELVOIDSELEMENT', `slab:${floor.id}:${opening.kind}:${opening.via}`, ref(written.id), ref(hole))
            quantitySet(c, `slab-opening:${opening.kind}:${opening.via}`, 'Qto_OpeningElementBaseQuantities', [
              ['LENGTH', 'Depth', slab.thickness],
              ['AREA', 'Area', opening.area, 'On plan, inside the floor\'s outline.']
            ], hole)
          }
        }
        // LVL-7: a room set below its storey stands on a slab of its own, lower down.
        for (const sunk of slab.sunken) {
          const piece = writeSlab(c, storey, ['slab', sunk.room], `${roomNames.get(sunk.room) ?? sunk.room} floor slab`, sunk.pieces, kind, sunk.offset - slab.thickness, slab.thickness)
          if (piece === null) continue
          contained.push(piece.id)
          writeSlabQuantities(c, `slab:${sunk.room}`, piece.id, sunk.pieces, slab.thickness)
          describeSlab(c, `slab:${sunk.room}`, piece.id, slab.thicknessStated, sunkenNote(slab.thicknessStated))
        }
      }
    } catch {
      // A slab that cannot be built is left out; the rest still exports.
    }

    // LVL-7: a room set above its storey stands on a slab from the storey's floor up to its own.
    for (const room of index.plan.rooms) {
      // A zone's floor is its room's slab (CNT-8).
      if (broken.has(room.id) || roomZones(index).zoneOf.has(room.id)) continue
      const offset = roomFloorOffset(room)
      if (!(offset > tolerance('sameFloorLevel'))) continue
      try {
        const footprint = roomFootprint(storey, room)
        if (!footprint) continue
        const raised = writeSlab(c, storey, ['slab', room.id], `${room.name} floor slab`, footprintPieces(footprint), 'FLOOR', 0, offset)
        if (raised === null) continue
        contained.push(raised.id)
        writeSlabQuantities(c, `slab:${room.id}`, raised.id, footprintPieces(footprint), offset)
        // Its thickness is the room's stated rise above its storey.
        describeSlab(c, `slab:${room.id}`, raised.id, true, RAISED_NOTE)
      } catch {
        // A room that cannot be built is left out.
      }
    }

    try {
      const roof = env?.roof ?? null
      if (roof !== null) {
        const bottom = roof.bottom - storey.elevation
        const element = c.w.add(
          'IFCROOF',
          str(c.guid('roof-element', floor.id)),
          ref(c.owner),
          str(`${floor.name} roof`),
          NULL,
          NULL,
          ref(placement(c.w, storey.placement, [0, 0, 0])),
          NULL,
          NULL,
          en(ROOF_TYPES[roof.shape ?? 'flat'])
        )
        const sloped = roof.facets.some((f) => f.plane.gx !== 0 || f.plane.gy !== 0)
        const flatPieces = roof.facets.length === 1 ? roof.facets[0]!.pieces : roof.pieces
        const slab = sloped
          ? writeSlopedRoof(c, storey, floor, roof)
          : writeSlab(c, storey, ['roof-slab', floor.id], `${floor.name} roof slab`, flatPieces, 'ROOF', bottom, roof.thickness)
        if (slab !== null) {
          aggregate(c, `roof:${floor.id}`, element, [slab.id])
          // IFC2x3 has no base quantities for a roof: its slab carries them.
          if (roof.shape === null) {
            writeSlabQuantities(c, `roof-slab:${floor.id}`, slab.id, roof.pieces, roof.thickness)
            describeSlab(c, `roof-slab:${floor.id}`, slab.id, false, roofNote(roof.thickness))
          } else {
            writeStatedRoofQuantities(c, `roof-slab:${floor.id}`, slab.id, roof)
            describeSlab(c, `roof-slab:${floor.id}`, slab.id, false, statedRoofNote(roof))
          }
          contained.push(...writeRooflights(c, storey, floor, roof, slab))
        }
        contained.push(element)
        if (roof.parapet !== null) {
          const shape = piecesShape(c, roof.parapet.pieces, roof.parapet.height)
          if (shape !== null) {
            const parapet = c.w.add(
              'IFCWALL',
              str(c.guid('parapet', floor.id)),
              ref(c.owner),
              str(`${floor.name} parapet`),
              NULL,
              str('Parapet'),
              ref(placement(c.w, storey.placement, [0, 0, bottom + roof.thickness])),
              ref(shape),
              NULL
            )
            contained.push(parapet)
            const footprint = multiArea(roof.parapet.pieces)
            quantitySet(c, `parapet:${floor.id}`, 'Qto_WallBaseQuantities', [
              ['LENGTH', 'Height', roof.parapet.height, 'Above the roof.'],
              ['AREA', 'GrossFootprintArea', footprint],
              ['VOLUME', 'GrossVolume', footprint * roof.parapet.height]
            ], parapet)
          }
        }
      }
    } catch {
      // A roof that cannot be built is left out.
    }

    // The rooms' ceilings, each covering its space. A zone has none of its own (CNT-8, `roomCeiling`).
    for (const room of index.plan.rooms) {
      if (broken.has(room.id) || room.ceiling === undefined || c.phaseOf.get(room.id) === 'demolished') continue
      try {
        const pieces = roomCeiling(room, index, storey.height, floorRoofShape(index.plan, floor.id)) ?? []
        const coverings: number[] = []
        const offset = roomFloorOffset(room)
        for (const piece of pieces) {
          const shape = piecesShape(c, piece.pieces, CEILING_DEPTH)
          if (shape === null) continue
          const covering = c.w.add(
            'IFCCOVERING',
            str(c.guid('ceiling', `${room.id}:${piece.zone ?? ''}`)),
            ref(c.owner),
            str(piece.zone === null ? `${room.name} ceiling` : `${room.name} ceiling, lowered zone ${piece.zone}`),
            NULL,
            NULL,
            ref(placement(c.w, storey.placement, [0, 0, offset + piece.height])),
            ref(shape),
            NULL,
            en('CEILING')
          )
          coverings.push(covering)
          // The board's depth is drawn, not the plan's, so only its area is a quantity.
          quantitySet(c, `ceiling:${room.id}:${piece.zone ?? ''}`, 'Qto_CoveringBaseQuantities', [
            ['AREA', 'GrossArea', piece.area, 'On plan, inside the room\'s walls.']
          ], covering)
        }
        if (coverings.length === 0) continue
        contained.push(...coverings)
        const space = storey.spaces.get(room.id)
        if (space !== undefined) relate(c, 'IFCRELCOVERSSPACES', `ceiling:${room.id}`, ref(space), refs(coverings))
      } catch {
        // A ceiling that cannot be built is left out.
      }
    }

    if (contained.length > 0) {
      relate(c, 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `slabs:${floor.id}`, refs(contained), ref(storey.id))
    }
  }
}

/**
 * The stairs the plan states (LVL-3), each as an IfcStair in the storey it rises from, made of
 * an IfcStairFlight per flight, with its number of risers and treads, the riser height and the
 * tread length Grid worked out, and a landing slab per turn. Each part is the block the 3D view
 * draws (`stairBlocks`): solid from the stair's foot to the riser it tops.
 *
 * Written last, after the slabs, so a plan that states no stairs gets the file it always did.
 */
function writeStairs(building: Context, plan: FloorPlan, storeys: readonly Storey[]): void {
  if ((plan.stairs ?? []).length === 0) return
  const byFloor = new Map(storeys.map((storey) => [storey.model.floor.id, storey] as const))
  const contained = new Map<string, number[]>()
  for (const stair of planStairs(plan, brokenOnFloor).stairs) {
    const storey = byFloor.get(stair.lower.floor)
    if (storey === undefined) continue
    try {
      const id = writeStair(onFloor(building, stair.lower.floor), storey, stair)
      contained.set(stair.lower.floor, [...(contained.get(stair.lower.floor) ?? []), id])
    } catch {
      // A stair that cannot be built is left out.
    }
  }
  for (const [floor, ids] of contained) {
    relate(onFloor(building, floor), 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `stairs:${floor}`, refs(ids), ref(byFloor.get(floor)!.id))
  }
}

function writeStair(c: Context, storey: Storey, stair: StairLayout): number {
  // The blocks stand on the stair's foot, measured from the storey's level, as in 3D.
  const blocks = stairBlocks(stair, storey.elevation).blocks
  const base = blocks[0]?.bottom ?? 0
  const at = placement(c.w, storey.placement, [0, 0, base])
  const body = (outlines: readonly { readonly outline: Footprint['outline']; readonly height: number }[]): number =>
    productShape(c, [
      c.w.add(
        'IFCSHAPEREPRESENTATION',
        ref(c.shared.bodyContext),
        str('Body'),
        str('SweptSolid'),
        refs(outlines.map(({ outline, height }) => extrusion(c, footprintProfile(c, { outline, holes: [] }), height)))
      )
    ])
  const element = c.w.add(
    'IFCSTAIR',
    str(c.guid('stair', stair.id)),
    ref(c.owner),
    str(stair.name),
    NULL,
    NULL,
    ref(at),
    NULL,
    NULL,
    en(stair.flights.length === 1 ? 'STRAIGHT_RUN_STAIR' : 'NOTDEFINED')
  )
  const parts: number[] = []
  let block = 0
  stair.flights.forEach((flight, i) => {
    const treads = flight.risers - 1
    const steps = blocks.slice(block, block + treads).map((b) => ({ outline: b.outline, height: b.top - b.bottom }))
    block += treads
    parts.push(
      c.w.add(
        'IFCSTAIRFLIGHT',
        str(c.guid('stair-flight', `${stair.id}:${i}`)),
        ref(c.owner),
        str(`${stair.name} flight ${i + 1}`),
        NULL,
        NULL,
        ref(placement(c.w, at, [0, 0, 0])),
        ref(body(steps)),
        NULL,
        int(flight.risers),
        int(treads),
        real(stair.riserHeight),
        real(flight.going)
      )
    )
  })
  stair.landings.forEach((_, i) => {
    const landing = blocks[block + i]!
    const slab = c.w.add(
      'IFCSLAB',
      str(c.guid('stair-landing', `${stair.id}:${i}`)),
      ref(c.owner),
      str(`${stair.name} landing ${i + 1}`),
      NULL,
      NULL,
      ref(placement(c.w, at, [0, 0, 0])),
      ref(body([{ outline: landing.outline, height: landing.top - landing.bottom }])),
      NULL,
      en('LANDING')
    )
    writeSlabQuantities(c, `landing:${stair.id}:${i}`, slab, footprintPieces({ outline: landing.outline, holes: [] }), landing.top - landing.bottom)
    parts.push(slab)
  })
  aggregate(c, `stair:${stair.id}`, element, parts)
  return element
}

/** Writes everything a floor holds, and links it to its storey. */
function writeStoreyContents(building: Context, storey: Storey): void {
  const { index, broken } = storey.model
  const c = onFloor(building, storey.model.floor.id)
  const contained: number[] = []
  // CNT-10: each state's corners are joined among its own walls, so a demolished wall never bends a new one.
  const joints = phasedJoints(storey.model.walls, c.phaseOf)

  for (const part of storey.model.walls) {
    // LVL-5 (C19): a wall through floors is one wall element, on its own floor's storey, from its
    // foot to its top, with its openings as stated: the window through two storeys is one window.
    const whole = wholeWall(part, openingsOf(index, part.id).filter((o) => !broken.has(o.id)))
    if (whole === null) continue
    const wall = whole.wall
    let element: WallElement
    try {
      element = writeWall(c, storey, wall, joints.get(wall.id))
    } catch {
      // A wall that cannot be built is left out; the rest still exports.
      continue
    }
    contained.push(element.id)

    const written: Opening[] = []
    for (const opening of whole.openings) {
      if (broken.has(opening.id)) continue
      try {
        const filler = writeOpening(c, element, opening)
        written.push(opening)
        if (filler !== null) contained.push(filler)
      } catch {
        // Likewise: one bad opening does not cost the wall its others.
      }
    }
    writeWallQuantities(c, element, written)
  }

  if (contained.length > 0) {
    relate(
      c,
      'IFCRELCONTAINEDINSPATIALSTRUCTURE',
      storey.model.floor.id,
      refs(contained),
      ref(storey.id)
    )
  }

  const spaces: number[] = []
  for (const room of index.plan.rooms) {
    // A zone (CNT-8) is no space of its own: its floor is in its room's space, counted once.
    // CNT-10: the spaces are the rooms after the work.
    if (broken.has(room.id) || roomZones(index).zoneOf.has(room.id) || c.phaseOf.get(room.id) === 'demolished') continue
    try {
      const space = writeSpace(c, storey, room)
      if (space !== null) {
        spaces.push(space)
        storey.spaces.set(room.id, space)
      }
    } catch {
      // A room that cannot be built is left out.
    }
  }
  // Spaces are aggregated under their storey, not contained in it.
  aggregate(c, `spaces:${storey.model.floor.id}`, storey.id, spaces)
}

/**
 * CNT-12: every storey's fixtures (CNT-20: and furniture, and any kind the registry holds), each an IfcFurnishingElement and never a wall: placed at its
 * middle, turned as the plan turns it, and its footprint extruded to its height from the floor of
 * the room it stands in. `ObjectType` is its kind and `Tag` its id. Written after everything else,
 * in a containment relation of their own per storey, so a plan with no fixtures writes the same
 * file as before.
 */
function writeItems(building: Context, storeys: readonly Storey[]): void {
  for (const storey of storeys) {
    const { index, broken, floor } = storey.model
    const items = (index.plan.items ?? []).filter((item) => !broken.has(item.id) && isItemKind(item.kind))
    if (items.length === 0) continue
    const c = onFloor(building, floor.id)
    const rooms = roomShapes(index, broken)
    const written: number[] = []
    for (const item of items) {
      try {
        const room = itemRoom(item, rooms)
        const turn = ((item.turn ?? 0) * Math.PI) / 180
        const along: Triple = [Math.cos(turn), Math.sin(turn), 0]
        const itemPlacement = placement(c.w, storey.placement, [item.at[0], item.at[1], room === null ? 0 : roomFloorOffset(room)], along)
        const body = bodyRepresentation(c, extrusion(c, rectangleProfile(c, item.size[0], item.size[1], 0), item.height))
        const kind = itemKindWord(item.kind)
        written.push(
          c.w.add(
            'IFCFURNISHINGELEMENT',
            str(c.guid('item', item.id)),
            ref(c.owner),
            str(item.label ?? kind),
            NULL,
            str(item.kind),
            ref(itemPlacement),
            ref(productShape(c, [body])),
            str(item.id)
          )
        )
      } catch {
        // A fixture that cannot be built is left out.
      }
    }
    if (written.length > 0) {
      relate(c, 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `items:${floor.id}`, refs(written), ref(storey.id))
    }
  }
}

/**
 * CNT-16 (C25): each column as an IfcColumn on the storey of its own floor, raised once, whole: a
 * square column a rectangle and a round one a circle, swept from the storey's level to its top
 * (the floor it rises through, its stated height above that floor's level, else that storey's
 * height), turned as the plan turns it. `ObjectType` is its shape and `Tag` its id, with its base
 * quantities: its length, its cross-section and its volume. Written after the stairs, in a
 * containment relation of their own per storey, so a plan with no columns writes the same file.
 */
function writeColumns(building: Context, plan: FloorPlan, storeys: readonly Storey[]): void {
  if ((plan.columns ?? []).length === 0) return
  const byFloor = new Map(storeys.map((storey) => [storey.model.floor.id, storey] as const))
  for (const storey of storeys) {
    const { index, floor } = storey.model
    const c = onFloor(building, floor.id)
    const written: number[] = []
    for (const column of soundColumns(index.plan)) {
      const part = columnPart(column)
      if (part !== null && !part.base) continue
      try {
        const whole = part?.whole ?? column
        const floors = columnFloorIds(plan, whole)
        const top = byFloor.get(floors[floors.length - 1]!) ?? storey
        const rise = top.elevation + (whole.height ?? top.height) - storey.elevation
        if (!(rise > 0)) continue
        const turn = ((column.turn ?? 0) * Math.PI) / 180
        const along: Triple = [Math.cos(turn), Math.sin(turn), 0]
        const columnPlacement = placement(c.w, storey.placement, [column.at[0], column.at[1], 0], along)
        const position = c.w.add('IFCAXIS2PLACEMENT2D', ref(c.w.add('IFCCARTESIANPOINT', reals([0, 0]))), ref(c.shared.east2))
        const profile = column.shape === 'round'
          ? c.w.add('IFCCIRCLEPROFILEDEF', en('AREA'), NULL, ref(position), real(column.width / 2))
          : rectangleProfile(c, column.width, columnDepth(column), 0)
        const body = bodyRepresentation(c, extrusion(c, profile, rise))
        const element = c.w.add(
          'IFCCOLUMN',
          str(c.guid('column', column.id)),
          ref(c.owner),
          str(column.label ?? column.id),
          NULL,
          str(column.shape),
          ref(columnPlacement),
          ref(productShape(c, [body])),
          str(column.id)
        )
        const section = columnArea(column)
        quantitySet(c, `column:${column.id}`, 'Qto_ColumnBaseQuantities', [
          ['LENGTH', 'Length', rise],
          ['AREA', 'CrossSectionArea', section],
          ['VOLUME', 'GrossVolume', section * rise],
        ], element)
        written.push(element)
      } catch {
        // A column that cannot be built is left out.
      }
    }
    if (written.length > 0) relate(c, 'IFCRELCONTAINEDINSPATIALSTRUCTURE', `columns:${floor.id}`, refs(written), ref(storey.id))
  }
}

/** CNT-9: the name of the property set that holds a part's facts of the person's own. */
export const IFC_FACTS_SET = 'Grid_Properties'

/** CNT-9: one fact as an IFC value: an integer, a real, a boolean, or a label. */
function factValue(value: Facts[string]): string {
  if (typeof value === 'boolean') return `IFCBOOLEAN(${en(value ? 'T' : 'F')})`
  if (typeof value === 'number') return Number.isSafeInteger(value) ? `IFCINTEGER(${int(value)})` : `IFCREAL(${real(value)})`
  return `IFCLABEL(${str(factText(value))})`
}

/**
 * CNT-4: each flat of the plan's flats list as an IfcZone, grouping the spaces of its rooms
 * through one IfcRelAssignsToGroup, on every floor it is on (a duplex's spaces are on two storeys).
 * Name is the flat's name and ObjectType its type's; `Grid_Flat`, Grid's own set, holds its id,
 * its type, whether it is its type's mirror image and its net area with the rule it follows
 * (ARE-9's net, counted as the areas count it). A flat none of whose rooms has a space is not
 * written. Written after the storeys, so a plan with no flats writes the same file as before.
 */
function writeZones(building: Context, plan: FloorPlan, storeys: readonly Storey[]): void {
  if ((plan.flats ?? []).length === 0) return
  const figures = planAreaFigures(plan)
  const byFloor = new Map(storeys.map((storey) => [storey.model.floor.id, storey] as const))
  const rule = MEASURES.net
  const resolvedFlats = new Map(planFlats(plan).map((f) => [f.id, f] as const))
  for (const flat of figures.flats) {
    const resolved = resolvedFlats.get(flat.id)
    const spaces = (resolved?.rooms ?? []).flatMap(({ id, floor }) => {
      const space = byFloor.get(floor)?.spaces.get(id)
      return space === undefined ? [] : [space]
    })
    if (spaces.length === 0) continue
    const c = building
    // IfcZone (GlobalId, OwnerHistory, Name, Description, ObjectType).
    const zone = c.w.add('IFCZONE', str(c.guid('zone', flat.id)), ref(c.owner), str(flat.name), NULL, flat.type === null ? NULL : str(flat.typeName ?? flat.type))
    // IfcRelAssignsToGroup (GlobalId, OwnerHistory, Name, Description, RelatedObjects, RelatedObjectsType, RelatingGroup).
    c.w.add('IFCRELASSIGNSTOGROUP', str(c.guid('zone-group', flat.id)), ref(c.owner), NULL, NULL, refs(spaces), NULL, ref(zone))
    propertySet(c, `grid-flat:${flat.id}`, 'Grid_Flat', [
      property(c, 'Id', identifier(flat.id)),
      ...(flat.type === null ? [] : [property(c, 'Type', identifier(flat.type))]),
      ...(flat.typeName === null ? [] : [property(c, 'TypeName', label(flat.typeName))]),
      property(c, 'Mirrored', booleanValue(flat.mirrored)),
      property(c, 'Area', `IFCAREAMEASURE(${real(flat.net)})`),
      property(c, 'AreaMeasure', label(rule.name)),
      property(c, 'AreaRule', textValue(FLAT_AREA_RULE))
    ], zone)
  }
}

/**
 * CNT-9: each part's facts of the person's own as one property set, `Grid_Properties`, of one
 * IfcPropertySingleValue per fact, in the order the plan gives them, related to its element by an
 * IfcRelDefinesByProperties. The set's name is Grid's own: `Pset_` names are the standard's. The
 * elements come in the order they were written, which is id order (QAR-5), so the file does not
 * hang on the plan's order; a plan with no facts writes the same file as before.
 */
function writeFacts(c: Context): void {
  for (const { element, kind, id, guid, facts } of c.facts) {
    const on: Context = { ...c, guid }
    const values = Object.entries(facts).map(([name, value]) => c.w.add('IFCPROPERTYSINGLEVALUE', str(name), NULL, factValue(value), NULL))
    const set = c.w.add('IFCPROPERTYSET', str(on.guid('facts', `${kind}:${id}`)), ref(c.owner), str(IFC_FACTS_SET), NULL, refs(values))
    relate(on, 'IFCRELDEFINESBYPROPERTIES', `facts:${kind}:${id}`, refs([element]), ref(set))
  }
}

/** CNT-10: the name of the property set that says what the work does to an element. */
export const IFC_PHASE_SET = 'Grid_Phase'

/**
 * CNT-10: each element of a plan with phases gets one property set, `Grid_Phase`, holding
 * `Phase`: `existing`, `demolished` or `new`, as the plan says it. A demolished wall or opening is
 * written as it stood before the work, so a BIM tool can show or hide either state by this set;
 * the rooms written are those after the work. The set's name is Grid's own: `Pset_` names are the
 * standard's. Written after the facts, in the order the elements were written; a plan with no
 * phases writes the file it wrote before.
 */
function writePhases(c: Context): void {
  for (const { element, kind, id, guid, phase } of c.phases) {
    const on: Context = { ...c, guid }
    const value = c.w.add('IFCPROPERTYSINGLEVALUE', str('Phase'), NULL, `IFCLABEL(${str(phase)})`, NULL)
    const set = c.w.add('IFCPROPERTYSET', str(on.guid('phase', `${kind}:${id}`)), ref(c.owner), str(IFC_PHASE_SET), NULL, refs([value]))
    relate(on, 'IFCRELDEFINESBYPROPERTIES', `phase:${kind}:${id}`, refs([element]), ref(set))
  }
}

/** The property names of `Grid_LeftOut`, by kind: a count and the names. */
const LEFT_OUT_PROPERTIES: Readonly<Record<LeftOutKind, readonly [string, string]>> = {
  wall: ['Walls', 'WallIds'],
  room: ['Rooms', 'RoomIds'],
  opening: ['Openings', 'OpeningIds'],
  item: ['Fixtures', 'FixtureIds'],
  stair: ['Stairs', 'StairIds'],
  floor: ['Floors', 'FloorIds'],
  // LVL-8: an opening pattern the reader could not read.
  pattern: ['OpeningPatterns', 'OpeningPatternIds']
}

/**
 * HND-6: what the file leaves out of the plan, as a property set on the building, the place a BIM
 * tool shows for the whole model. `Parts` is how many, `Note` says so in words, and each kind
 * has its count and its ids (JSON strings, then a STEP string like every other text here). The
 * set's name is Grid's own: `Pset_` names are the standard's. Written last, so that a file that
 * leaves nothing out is as it was.
 */
function writeLeftOut(c: Context, building: number, leftOut: readonly LeftOutPart[]): void {
  if (leftOut.length === 0) return
  const value = (name: string, nominal: string): number => c.w.add('IFCPROPERTYSINGLEVALUE', str(name), NULL, nominal, NULL)
  const properties = [
    value('Parts', `IFCINTEGER(${int(leftOut.length)})`),
    value('Note', `IFCTEXT(${str(leftOutSummary(leftOut))})`)
  ]
  for (const { kind, parts } of leftOutByKind(leftOut)) {
    const [count, ids] = LEFT_OUT_PROPERTIES[kind]
    properties.push(value(count, `IFCINTEGER(${int(parts.length)})`), value(ids, `IFCTEXT(${str(partNames(parts).join(', '))})`))
  }
  const set = c.w.add(
    'IFCPROPERTYSET',
    str(c.guid('left-out', 'set')),
    ref(c.owner),
    str('Grid_LeftOut'),
    str('Parts of the plan Grid left out of this file'),
    refs(properties)
  )
  c.w.add('IFCRELDEFINESBYPROPERTIES', str(c.guid('left-out', 'relation')), ref(c.owner), NULL, NULL, refs([building]), ref(set))
}

/**
 * CNT-18: the curves the file writes as straight pieces, as the building's property set
 * `Grid_Approximated`, beside `Grid_LeftOut`: `Parts` is how many, `Note` says so in words, and
 * the walls and the rooms each have their count and ids. Written only when there are some.
 */
function writeApproximations(c: Context, building: number, approximations: Approximations): void {
  const { parts } = approximations
  if (parts.length === 0) return
  const value = (name: string, nominal: string): number => c.w.add('IFCPROPERTYSINGLEVALUE', str(name), NULL, nominal, NULL)
  const properties = [value('Parts', `IFCINTEGER(${int(parts.length)})`), value('Note', `IFCTEXT(${str(approximationLines(approximations)[0]!)})`)]
  for (const kind of ['wall', 'room'] as const) {
    const group = parts.filter((part) => part.kind === kind)
    if (group.length === 0) continue
    const [count, ids] = LEFT_OUT_PROPERTIES[kind]
    const names = partNames(group.map((part) => ({ kind, id: part.id, place: null, floor: part.floor, code: null })))
    properties.push(value(count, `IFCINTEGER(${int(group.length)})`), value(ids, `IFCTEXT(${str(names.join(', '))})`))
  }
  const set = c.w.add('IFCPROPERTYSET', str(c.guid('approximated', 'set')), ref(c.owner), str('Grid_Approximated'), str(english(said('drawing.ifc.approximated'))), refs(properties))
  c.w.add('IFCRELDEFINESBYPROPERTIES', str(c.guid('approximated', 'relation')), ref(c.owner), NULL, NULL, refs([building]), ref(set))
}

/** CNT-3: where the plan says it sits: only with an origin, and when every number of it can be written. */
function siteOf(plan: FloorPlan): (NonNullable<FloorPlan['site']> & { readonly origin: readonly [number, number] }) | null {
  const site = plan.site
  if (site === undefined || site.origin === undefined) return null
  const numbers = [...site.origin, site.latitude ?? 0, site.longitude ?? 0, site.elevation ?? 0]
  return numbers.every(Number.isFinite) ? { ...site, origin: site.origin } : null
}

/**
 * Degrees as IFC2x3's compound plane angle: degrees, minutes, seconds and millionths of a
 * second, each with the angle's sign.
 */
function compoundAngle(degrees: number): string {
  const sign = degrees < 0 ? -1 : 1
  const micro = Math.round(Math.abs(degrees) * 3600 * 1_000_000)
  const parts = [Math.floor(micro / 3_600_000_000), Math.floor(micro / 60_000_000) % 60, Math.floor(micro / 1_000_000) % 60, micro % 1_000_000]
  return `(${parts.map((part) => int(sign * part + 0)).join(',')})`
}

/** The id the plan stores (QAR-5), else the caller's, else the default. */
function projectIdOf(plan: FloorPlan, options: IfcOptions): string {
  const stored: unknown = plan.projectId
  if (typeof stored === 'string' && stored !== '') return stored
  return options.projectId ?? IFC_DEFAULT_PROJECT_ID
}

type Pair2 = readonly [number, number]

/** CMD-26: the building's name from the plan: its one named building, else the plan's name or title. */
function buildingName(plan: FloorPlan): string {
  const named = plan.buildings ?? []
  if (named.length === 1 && named[0]!.name !== undefined && named[0]!.name !== '') return named[0]!.name
  return plan.name ?? plan.title ?? 'Building'
}

function buildDocument(given: FloorPlan, options: IfcOptions): string {
  const timestamp = usableTimestamp(options.timestamp)
  // QAR-5: the parts in id order, so the file does not hang on the order they are listed in.
  const { plan, at: origin } = nearOrigin(inIdOrder(given))
  // CMD-26: the project is the plan's own name, else its title, else the name the caller gives.
  const projectName = plan.name ?? plan.title ?? options.projectName ?? DEFAULT_PROJECT_NAME

  const w = new StepWriter()
  const issuer = createGuidIssuer(projectIdOf(plan, options))
  const owner = writeOwnerHistory(w, timestamp)
  const units = writeUnits(w)
  const { model: context, shared } = writeModelContext(w, planOrientation(plan).north)
  const c: Context = {
    w,
    owner,
    shared,
    plan,
    materials: { byName: new Map(), byType: new Map() },
    openingStyles: new Map(),
    glassStyle: null,
    roomNumbers: new Map(roomNumbers(plan).map((n) => [onFloorKey(n.floor, n.id), n] as const)),
    guid: (kind, id) => issuer.issue(kind, id),
    issuer,
    facts: [],
    phaseOf: partPhases(plan),
    phases: []
  }

  // The fixed entities (project, site, building) use their own kind as the id.
  const rooted = (
    type: string,
    kind: string,
    id: string,
    name: string,
    ...rest: readonly string[]
  ): number => w.add(type, str(c.guid(kind, id)), ref(owner), str(name), ...rest)

  const project = rooted(
    'IFCPROJECT',
    'project',
    'project',
    projectName,
    // MSG-3: the label as the project's description, which a viewer shows with its name.
    str(GENERAL_GUIDANCE_LABEL),
    NULL,
    NULL,
    NULL,
    refs([context]),
    ref(units)
  )

  // CNT-3: a plan that says where it sits puts the site's origin on that point of the plan, with
  // its latitude, longitude and elevation; the building stays in the plan's own coordinates.
  // HND-2: the elements are written moved by `origin` (`nearOrigin`), so the site sits at the
  // plan's stated point, else at `origin`, and the building at `origin` from the site's: every
  // element is where the plan puts it. `site.origin` is not moved, so it is the plan's own point.
  const where = siteOf(plan)
  const siteAt: Pair2 = where === null ? origin : where.origin
  const sitePlacement = placement(w, null, [siteAt[0], siteAt[1], 0])
  const site = rooted(
    'IFCSITE',
    'site',
    'site',
    'Site',
    NULL,
    NULL,
    ref(sitePlacement),
    NULL,
    NULL,
    en('ELEMENT'),
    where?.latitude === undefined ? NULL : compoundAngle(where.latitude),
    where?.longitude === undefined ? NULL : compoundAngle(where.longitude),
    where?.elevation === undefined ? NULL : real(where.elevation),
    NULL,
    NULL
  )

  // LVL-23: one building for each the plan names, holding its own storeys; the floors no building
  // names (every floor, when the plan names none) stay in one building of the plan's name.
  const models = planFloors(plan).map((floor) => analyseFloor(plan, floor))
  const named = planBuildings(plan).filter((b) => b.floors.length > 0)
  const holder = new Map(named.flatMap((b) => b.floors.map((floor) => [floor, b.id] as const)))
  const rest = models.filter((model) => !holder.has(model.floor.id))
  const groups: { key: string; id: string; name: string; models: FloorModel[] }[] = [
    ...(named.length === 0 || rest.length > 0 ? [{ key: 'building', id: 'building', name: named.length === 0 ? buildingName(plan) : (plan.name ?? plan.title ?? 'Building'), models: rest }] : []),
    // The first keeps the plan's own building's id when every floor is in a building, so its identity stays as before.
    ...named.map((b, i) => ({ key: i === 0 && rest.length === 0 ? 'building' : `building:${b.id}`, id: i === 0 && rest.length === 0 ? 'building' : `named:${b.id}`, name: b.name, models: models.filter((model) => holder.get(model.floor.id) === b.id) })),
  ]
  const buildings = groups.map((group) => {
    const at = placement(w, sitePlacement, [origin[0] - siteAt[0], origin[1] - siteAt[1], 0])
    const id = rooted('IFCBUILDING', 'building', group.id, group.name, NULL, NULL, ref(at), NULL, NULL, en('ELEMENT'), NULL, NULL, NULL)
    return { ...group, entity: id, placement: at }
  })
  const building = buildings[0]!.entity

  const levels = deriveLevels(plan, models)
  const storeyOf = new Map<string, Storey>()
  for (const group of buildings) {
    for (const model of group.models) storeyOf.set(model.floor.id, writeStorey(c, group.placement, model, levels.get(model.floor.id)!))
  }
  const storeys = models.map((model) => storeyOf.get(model.floor.id)!)
  for (const storey of storeys) writeStoreyContents(c, storey)
  writeWallTypes(c)
  writeOpeningStyles(c)

  aggregate(c, 'project', project, [site])
  aggregate(c, 'site', site, buildings.map((b) => b.entity))
  for (const group of buildings) {
    aggregate(
      c,
      group.key,
      group.entity,
      group.models.map((model) => storeyOf.get(model.floor.id)!.id)
    )
  }
  writeSlabs(c, plan, storeys)
  writeItems(c, storeys)
  writeStairs(c, plan, storeys)
  writeColumns(c, plan, storeys)
  writeZones(c, plan, storeys)
  writeFacts(c)
  writePhases(c)
  writeLeftOut(c, building, options.leftOut ?? [])
  writeApproximations(c, building, options.approximations ?? { parts: [], off: 0 })

  return w.toString([
    // MSG-3: the label beside the view definition, in the header every reader parses first.
    `FILE_DESCRIPTION((${str('ViewDefinition [CoordinationView_V2.0]')},${str(GENERAL_GUIDANCE_LABEL)}),${str('2;1')});`,
    // FILE_NAME(name, time_stamp, author, organization, preprocessor, system, authorization)
    // Author and organisation stay empty: no personal data goes into the file.
    `FILE_NAME(${str(projectName)},${str(isoSeconds(timestamp))},(${str('')}),(${str('')}),` +
      `${str('Grid')},${str('Grid')},${str('')});`,
    `FILE_SCHEMA((${str('IFC2X3')}));`
  ])
}

/**
 * The plan as an IFC2x3 document.
 *
 * Pure and total: it never throws, never reads the clock or the filesystem, and
 * the same plan, project identity and timestamp give byte-identical output,
 * whatever order the plan lists its walls, rooms and openings in (QAR-5).
 * Lines end in LF: ISO 10303-21 accepts any line terminator, and LF keeps the
 * bytes identical wherever the string is written.
 */
export function toIfc(plan: FloorPlan, options: IfcOptions = {}): string {
  try {
    return buildDocument(plan, options)
  } catch {
    // Whatever the plan did to the exporter, the caller still gets a valid
    // document: the empty one, under the project's own identity when it can be read.
    let projectId = options.projectId
    try {
      projectId = projectIdOf(plan, options)
    } catch {
      // Left as the caller's.
    }
    return buildDocument({ version: '1', units: 'm', walls: [], rooms: [], openings: [] }, { ...options, projectId })
  }
}
