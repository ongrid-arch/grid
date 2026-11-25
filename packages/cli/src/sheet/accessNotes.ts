/**
 * SHT-12: the access measurements that fall under the person's own figures, for a client sheet's
 * first page. Read from the brief beside the plan with `accessAnswer`, the answer `grid_measure
 * what=access` gives, against the person's figures only: no code figure is used here. Nothing
 * says a room or the building is accessible; a number is listed only when it is short.
 */
import { confirmedFigure } from '@ongrid/rules'
import { readBrief } from '../brief/brief'
import type { LoadedPlan } from '../command/plan'
import type { Project } from '../fs/projectFiles'
import { accessAnswer, type Against } from '../quantities/access'
import { surveyPlan } from '../quantities/survey'

export interface AccessNote {
  readonly kind: 'door' | 'corridor' | 'turning'
  /** Metres: what the plan measures, and the person's figure it is under. */
  readonly measured: number
  readonly figure: number
  /** Names of rooms, or null for the outside. A corridor and a turning space have one. */
  readonly rooms: readonly (string | null)[]
}

/** The person's own figure of this kind that the number falls short of; a step is not a width. */
const under = (against: readonly Against[], figure: string): Against | undefined => against.find((a) => a.short && a.figure.from === 'yours' && a.figure.figure === figure)

/**
 * Every measurement under one of the person's figures; empty with no brief or no such figure.
 * Corridors and turning spaces come first, so a page that prints only a few shows each kind.
 */
export function accessNotes(project: Project, planFile: string, loaded: LoadedPlan): AccessNote[] {
  let read: ReturnType<typeof readBrief>
  try {
    read = readBrief(project, planFile)
  } catch {
    return []
  }
  if (read.brief === null || read.brief.figures.length === 0) return []
  const survey = surveyPlan(loaded.plan)
  const where = { ...(survey.plan.site?.country === undefined ? {} : { country: survey.plan.site.country }), ...(survey.plan.building === undefined ? {} : { building: survey.plan.building }) }
  const { data } = accessAnswer(survey, { yours: read.brief.figures, code: (key) => confirmedFigure(key, where) }, (m) => String(m), read.file)
  const nameOf = (id: string): string | null => (id === 'outside' ? null : survey.byId.get(id)?.facts.name ?? id)
  const notes: AccessNote[] = []
  for (const c of data.corridors) {
    const a = under(c.against, 'corridor_width')
    if (a) notes.push({ kind: 'corridor', measured: c.narrowest ?? c.widest, figure: a.figure.value, rooms: [nameOf(c.room)] })
  }
  for (const t of data.turning) {
    const a = under(t.against, 'turning_circle')
    if (a) notes.push({ kind: 'turning', measured: t.diameter, figure: a.figure.value, rooms: [nameOf(t.room)] })
  }
  for (const d of data.doors) {
    const a = under(d.against, 'door_width')
    if (a) notes.push({ kind: 'door', measured: d.clear, figure: a.figure.value, rooms: [nameOf(d.between[0]), nameOf(d.between[1])] })
  }
  return notes
}
