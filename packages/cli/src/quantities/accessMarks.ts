/**
 * SHT-27: the access measurements made printable. `readAccess` reads the brief beside the plan and
 * runs `accessAnswer` (CNT-17, `grid_measure what=access`) once; `accessMarkLabels` turns its data
 * into the marks a plan picture draws by part id (`AccessMarkLabels`, `drawingMarks`): each way in
 * and each marked route through its rooms and doors, each room's turning circle, each door's clear
 * width and sill and each step on a way, with its words in the drawing's language. A number short
 * of one of the person's own figures carries that figure in its words, so a shortfall is never a
 * mark without a number. Nothing is measured here, and nothing says a room or a way is accessible.
 */
import { tolerance } from '@ongrid/floorplan/geometry'
import type { AccessMarkLabels, DrawingMarksAsked } from '@ongrid/floorplan/geometry/drawingMarks'
import { say, type Language } from '@ongrid/floorplan/messages'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { confirmedFigure } from '@ongrid/rules'
import { readBrief, type FigureWish } from '../brief/brief'
import type { Project } from '../fs/projectFiles'
import { accessAnswer, most, YOUR_FIGURE, type AccessData, type AccessWay, type Against } from './access'
import { surveyPlan } from './survey'
import { displayFor, lengthText, ownLengthText } from './units'

/** What `accessAnswer` gave, with the person's figures it was set against and the brief they came from. */
export interface AccessRead {
  readonly data: AccessData
  /** The person's own figures for access, with their quotes; empty with no brief. */
  readonly yours: readonly FigureWish[]
  /** The brief's file, relative to the project; null when no brief was read. */
  readonly brief: string | null
  /** True when a brief is there but could not be read. */
  readonly unread: boolean
}

/** The figures `accessAnswer` sets numbers against. */
const ACCESS_FIGURE_NAMES: ReadonlySet<string> = new Set(['door_width', 'corridor_width', 'turning_circle', 'step'])

/** The access measurements of a plan, against the brief beside it when there is one (`project` given). */
export function readAccess(project: Project | undefined, planFile: string, plan: FloorPlan): AccessRead {
  let yours: readonly FigureWish[] = []
  let brief: string | null = null
  let unread = false
  if (project !== undefined) {
    try {
      const read = readBrief(project, planFile)
      unread = read.problem !== null
      if (read.brief !== null) {
        brief = read.file
        yours = read.brief.figures
      }
    } catch {
      unread = true
    }
  }
  const survey = surveyPlan(plan)
  const where = { ...(survey.plan.site?.country === undefined ? {} : { country: survey.plan.site.country }), ...(survey.plan.building === undefined ? {} : { building: survey.plan.building }) }
  const { data } = accessAnswer(survey, { yours, code: (key) => confirmedFigure(key, where) }, (m) => String(m), brief)
  return { data, yours: yours.filter((w) => ACCESS_FIGURE_NAMES.has(w.figure)), brief, unread }
}

/** The first of the person's own figures a number falls short of; a code's is said in the sheet's tables. */
const shortOfYours = (against: readonly Against[]): Against | undefined => against.find((a) => a.short && a.figure.from === 'yours')

/** A way's stops in walking order: its rooms and the doors or openings between them, by id. */
export function wayStops(way: AccessWay): string[] {
  const stops: string[] = []
  for (const leg of way.legs) {
    if (!leg.fromOutside && leg.rooms[0] !== undefined) stops.push(leg.rooms[0])
    for (const via of leg.vias) stops.push(via.via, via.into)
  }
  return stops
}

/** The step figure of the person's own, as `accessAnswer` sets a step against it. */
function stepFigure(yours: readonly FigureWish[]): Parameters<typeof most>[1] {
  const wish = yours.find((w) => w.figure === 'step')
  return wish === undefined ? null : { from: 'yours', label: YOUR_FIGURE, figure: 'step', value: wish.value, quote: wish.quote }
}

/** The marks of `read` for a plan picture, worded in `language` with the plan's units. */
export function accessMarkLabels(read: AccessRead, plan: FloorPlan, language: Language = 'en'): AccessMarkLabels {
  const display = displayFor(undefined, undefined, plan, language)
  const L = (m: number): string => lengthText(m, display)
  const own = (m: number): string => ownLengthText(m, display)
  const withFigure = (label: string, against: Against | undefined, over = false): string =>
    against === undefined ? label : say(language, over ? 'drawing.access.over' : 'drawing.access.under', { label, figure: own(against.figure.value) })
  const sillAbove = tolerance('sameFloorLevel')
  const doors = read.data.doors.map((d) => {
    const clear = say(language, 'drawing.access.door', { clear: L(d.clear) })
    const label = d.sill > sillAbove ? say(language, 'drawing.access.sill', { label: clear, sill: L(d.sill) }) : clear
    const short = shortOfYours(d.against)
    return { id: d.id, label: withFigure(label, short), short: short !== undefined }
  })
  const turning = read.data.turning.map((t) => {
    const short = shortOfYours(t.against)
    return { room: t.room, at: t.at, diameter: t.diameter, label: withFigure(say(language, 'drawing.access.turning', { diameter: L(t.diameter) }), short), short: short !== undefined }
  })
  const figure = stepFigure(read.yours)
  const steps: AccessMarkLabels['steps'][number][] = []
  for (const way of read.data.ways) {
    for (const step of way.steps) {
      // A sill is in its door's words; a stair is drawn as a stair.
      if (step.kind === 'sill' || step.kind === 'stair' || step.height === null) continue
      const short = most(step.height, figure).find((a) => a.short)
      const label = withFigure(say(language, 'drawing.access.step', { height: L(step.height) }), short, true)
      if (!steps.some((s) => s.at === step.at && s.label === label)) steps.push({ at: step.at, label, short: short !== undefined })
    }
  }
  const routes = read.data.ways.filter((w) => w.found).map((w) => ({ to: w.to, stops: wayStops(w) }))
  return { routes, turning, doors, steps }
}

/** `marks` with the access marks of the plan added, read from the brief beside `planFile`. */
export function withAccessMarks(marks: DrawingMarksAsked, project: Project | undefined, planFile: string, plan: FloorPlan, language: Language = 'en'): DrawingMarksAsked {
  return { ...marks, access: accessMarkLabels(readAccess(project, planFile, plan), plan, language) }
}
