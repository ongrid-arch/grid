/**
 * SHT-27: the access sheet (`grid sheet --layout access`, `grid_sheet layout=access`): what
 * `grid_measure what=access` measures, made printable. Its first page says what was measured and
 * lists the person's own figures with their words from the brief; then a page per floor draws the
 * ways, the turning circles, each door's clear width and sill and each step (`accessMarkLabels`),
 * with that floor's doors in a table; then the corridors and turning spaces, the ways in with their
 * steps, and what Grid did not look at. Every number is `accessAnswer`'s; nothing is measured here,
 * and nothing says a room, a way or the plan is accessible. Pure: `pages.ts` hands it the pictures.
 */
import { planFloors } from '@ongrid/floorplan/geometry'
import type { AccessMarkLabels } from '@ongrid/floorplan/geometry/drawingMarks'
import type { MessageKey } from '@ongrid/floorplan/messages'
import type { LoadedPlan } from '../command/plan'
import { most, YOUR_FIGURE, type AccessWay, type Against, type WayStep } from '../quantities/access'
import type { AccessRead } from '../quantities/accessMarks'
import type { Body, SheetFigure, SheetPicture, SheetRow, SheetTable, SheetUnits, Words } from './pages'

/** What `pages.ts` lends the access sheet: its pictures, units and notes, as every sheet has them. */
export interface AccessSheetParts {
  readonly picture: (floor: string, labels: AccessMarkLabels) => SheetPicture
  readonly units: SheetUnits
  readonly undecided: (floor: string) => string[]
  readonly labels: (read: AccessRead) => AccessMarkLabels
}

/** The not-looked-at list, one key per entry, in the order `NOT_LOOKED_AT` (`quantities/access.ts`) gives it. */
export const NOT_LOOKED_AT_KEYS: readonly MessageKey[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `sheet.access.notLooked.${n}` as MessageKey)

const DASH = '–'

/** The person's own figure, and a confirmed code's, each said as whose it is: under it or not. */
function againstWords(against: readonly Against[], units: SheetUnits, w: Words, step = false): string[] {
  return against.map((a) => {
    const figure = units.length(a.figure.value)
    if (a.figure.from === 'yours') return w.say(step ? (a.short ? 'sheet.access.over' : 'sheet.access.noHigher') : a.short ? 'sheet.access.under' : 'sheet.access.atLeast', { figure })
    return w.say(a.short ? 'sheet.access.codeUnder' : 'sheet.access.codeAtLeast', { figure, source: a.figure.label })
  })
}

export function accessBodies(loaded: LoadedPlan, name: string, w: Words, read: AccessRead, parts: AccessSheetParts): Body[] {
  const { data } = read
  const units = parts.units
  const labels = parts.labels(read)
  const roomNames = new Map(loaded.plan.rooms.map((r) => [r.id, r.name] as const))
  const roomName = (id: string | null): string => (id === null ? w.say('sheet.access.entrance') : id === 'outside' ? w.say('sheet.access.outside') : roomNames.get(id) ?? id)
  const join = (list: readonly string[]): string => list.join(w.say('join.comma'))
  const title = w.say('sheet.access.title')
  const page = (pageTitle: string, rest: Partial<Body>): Body => ({
    kind: 'summary', floor: null, topLine: `${name} / ${pageTitle}`, title: pageTitle, subtitle: null,
    paragraphs: [], figures: [], table: null, picture: null, notes: [], ...rest,
  })

  // The first page: what was measured, and against what.
  const marked = data.marked
    ? w.say('sheet.access.marked', {
      what: join([
        ...data.rooms.map((room) => roomName(room)),
        ...data.routes.filter((r) => r.from !== null).map((r) => w.say('sheet.access.route', { from: roomName(r.from), to: roomName(r.to) })),
      ]) || DASH,
    })
    : w.say('sheet.access.marked.none')
  // A step set against the person's own step figure, a most, as `accessAnswer` sets it.
  const stepFigure = read.yours.find((y) => y.figure === 'step')
  const stepAgainst = (height: number): Against[] => (stepFigure === undefined ? [] : most(height, { from: 'yours', label: YOUR_FIGURE, figure: 'step', value: stepFigure.value, quote: stepFigure.quote }))
  const steps = new Map<string, WayStep>()
  for (const way of data.ways) for (const step of way.steps) steps.set(`${step.kind} ${step.at}`, step)
  const short = [...data.doors, ...data.corridors, ...data.turning].filter((x) => x.against.some((a) => a.short)).length + [...steps.values()].filter((s) => s.kind !== 'stair' && s.height !== null && stepAgainst(s.height).some((a) => a.short)).length
  const figures: SheetFigure[] = [
    { value: String(data.doors.length), label: w.say('sheet.access.figure.doors') },
    { value: String(short), label: w.say('sheet.access.figure.short') },
    { value: String(steps.size), label: w.say('sheet.access.figure.steps') },
  ]
  const yoursTable: SheetTable | null = read.yours.length === 0 ? null : {
    heading: w.say('sheet.access.figures', { unit: units.lengthWord }),
    rows: read.yours.map((wish): SheetRow => ({
      name: w.say(`sheet.access.figure.${wish.figure}` as MessageKey),
      detail: wish.quote === null ? w.say('sheet.access.figure.yours') : w.say('sheet.access.figure.quote', { quote: wish.quote }),
      area: units.length(wish.value),
    })),
    total: null,
    note: null,
  }
  const first = page(title, {
    paragraphs: [w.say('sheet.access.head'), marked, ...(data.unknown.length === 0 ? [] : [w.say('sheet.access.unknown', { ids: join(data.unknown) })])],
    figures,
    table: yoursTable,
    notes: [
      ...(read.unread ? [w.say('sheet.access.figures.notRead')] : read.yours.length === 0 ? [w.say('sheet.access.figures.none')] : []),
      data.figures.code.length === 0 ? w.say('sheet.access.code.none') : w.say('sheet.access.code', { figures: join(data.figures.code.map((c) => `${units.length(c.value)}, ${c.label}`)) }),
      w.say('sheet.access.rule'),
    ],
  })

  // A page per floor: the drawing with its marks, and the floor's doors.
  const floors = planFloors(loaded.plan).map((floor): Body => {
    const doors = data.doors.filter((d) => d.floor === floor.id)
    const table: SheetTable | null = doors.length === 0 ? null : {
      heading: w.say('sheet.access.doors', { unit: units.lengthWord }),
      rows: doors.map((d): SheetRow => ({
        name: w.say('sheet.access.door.name', { type: w.say(`sheet.type.${d.type}` as MessageKey), id: d.id, a: roomName(d.between[0]), b: roomName(d.between[1]) }),
        detail: join([
          w.say('sheet.access.door.hole', { hole: units.length(d.hole) }),
          ...(d.sill > 0 ? [w.say('sheet.access.door.sill', { sill: units.length(d.sill, 'height') })] : []),
          ...(d.entrance ? [w.say('sheet.access.door.entrance')] : []),
          ...againstWords(d.against, units, w),
        ]),
        area: units.length(d.clear),
      })),
      total: null,
      note: null,
    }
    return {
      kind: 'floor', floor: floor.id, topLine: `${name} / ${title} / ${floor.name}`, title: floor.name, subtitle: title,
      paragraphs: [], figures: [], table,
      picture: parts.picture(floor.id, labels),
      notes: [w.say('sheet.access.floor.marks'), ...(doors.length === 0 ? [w.say('sheet.access.doors.none')] : []), ...parts.undecided(floor.id)],
    }
  })

  // The rooms: each corridor at its narrowest, and each room's turning space.
  const roomRows: SheetRow[] = [
    ...data.corridors.map((c): SheetRow => ({
      name: roomName(c.room),
      detail: join([w.say(c.narrowest === null ? 'sheet.access.corridor.noEnds' : 'sheet.access.corridor.row'), ...againstWords(c.against, units, w)]),
      area: units.length(c.narrowest ?? c.widest),
    })),
    ...data.turning.map((t): SheetRow => ({ name: roomName(t.room), detail: join([w.say('sheet.access.turning.row'), ...againstWords(t.against, units, w)]), area: units.length(t.diameter) })),
  ]
  const rooms = page(w.say('sheet.access.rooms'), { table: { heading: w.say('sheet.access.rooms.heading', { unit: units.lengthWord }), rows: roomRows, total: null, note: null } })

  // The ways in, each with the doors it passes and its steps; then what was not looked at.
  const stepWords = (s: WayStep): string => {
    const height = s.height === null ? DASH : units.length(s.height, 'height')
    const said = s.kind === 'sill'
      ? w.say('sheet.access.step.sill', { height, id: s.at })
      : s.kind === 'stair'
        ? s.height === null || s.count === null ? w.say('sheet.access.step.stairUnknown', { id: s.at }) : w.say('sheet.access.step.stair', { id: s.at, count: s.count, height })
        : w.say(s.up === false ? 'sheet.access.step.down' : 'sheet.access.step.up', { height, id: s.at })
    return s.height === null || s.kind === 'stair' ? said : join([said, ...againstWords(stepAgainst(s.height), units, w, true)])
  }
  const wayRow = (way: AccessWay): SheetRow => {
    const head = way.from === null ? w.say('sheet.access.way.to', { room: roomName(way.to) }) : w.say('sheet.access.way.fromTo', { from: roomName(way.from), to: roomName(way.to) })
    if (!way.found) return { name: head, detail: w.say('sheet.access.way.notFound'), area: DASH }
    const vias = way.legs.flatMap((leg) => leg.vias.map((v) => v.via))
    const lifts = way.joins.filter((j) => j.kind === 'lift').map((j) => w.say('sheet.access.step.lift', { id: j.via }))
    const stepText = way.steps.length === 0
      ? w.say('sheet.access.way.noStep')
      : w.say(way.steps.length === 1 ? 'sheet.access.way.steps.one' : 'sheet.access.way.steps.many', { count: way.steps.length, steps: join(way.steps.map(stepWords)) })
    return {
      name: head,
      detail: join([vias.length === 0 ? w.say('sheet.access.way.already') : w.say('sheet.access.way.through', { doors: join(vias) }), stepText, ...lifts]),
      area: way.narrowest === null ? DASH : units.length(way.narrowest.clear),
    }
  }
  const ways = page(w.say('sheet.access.ways'), {
    table: data.ways.length === 0 ? null : { heading: w.say('sheet.access.ways.heading', { unit: units.lengthWord }), rows: data.ways.map(wayRow), total: null, note: null },
    notes: [...(data.entrance === null ? [w.say('sheet.access.ways.none')] : []), w.say('sheet.access.notLooked'), ...NOT_LOOKED_AT_KEYS.map((key) => w.say(key))],
  })
  return [first, ...floors, rooms, ways]
}
