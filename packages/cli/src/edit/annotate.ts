/**
 * Writing on the drawing and the sketch layer placed and taken out (SHT-22, `grid_annotate`): a
 * patch of the plan's own `annotations` and `sketch`, as every change is. The ids named are taken
 * out first, then each entry is placed after the plan's own, by rooms text's one reading of its
 * words (`notePart` in `rooms/notes.ts`), so a call and a rooms text line place the same thing.
 * One entry that cannot be placed refuses the whole call, naming it, with nothing written.
 *
 * Nothing placed is measured or checked: it is drawn and exported only.
 */
import { givenIds, isAnnotation, notePart, notePlaceOf, NoteRefused, notesSummary, placedLine, routeShaft, type NoteWords } from '@ongrid/floorplan/rooms'
import { floorOf } from '@ongrid/floorplan/geometry'
import type { Annotation, SketchItem } from '@ongrid/floorplan/types/floorplan'
import type { Survey } from '../quantities/survey'
import { emptyPatch, type Patch } from './edits'
import { EditRefused } from './refused'

export interface AnnotateRequest {
  /** What to place, in order, each with where its words came from, to lead a refusal (`lines[2]`, `The tag`). */
  readonly add: readonly { readonly words: NoteWords; readonly from: string }[]
  /** Ids of annotations or sketch items to take out. */
  readonly remove: readonly string[]
  /** The floor an entry that names none is on: null for the ground floor (C5). */
  readonly floor: string | null
}

const listed = (ids: readonly string[]): string => `${ids.slice(0, 20).join(', ')}${ids.length > 20 ? ` and ${ids.length - 20} more` : ''}`

/** The plan with the parts taken out and placed, and a line for each. */
export function annotate(survey: Survey, request: AnnotateRequest): Patch {
  const plan = survey.plan
  const before: Array<Annotation | SketchItem> = [...(plan.annotations ?? []), ...(plan.sketch ?? [])]
  if (request.add.length === 0 && request.remove.length === 0) throw new EditRefused('Give what to place (kind and its place, or lines) or what to take out (remove).')
  const unknown = request.remove.filter((id) => !before.some((p) => p.id === id))
  if (unknown.length > 0) throw new EditRefused(`The plan has no note, tag, symbol, key or sketch item ${listed(unknown)}. ${before.length === 0 ? 'Its drawing carries none.' : `Its drawing carries: ${listed(before.map((p) => p.id))}.`}`)
  const kept = before.filter((p) => !request.remove.includes(p.id))
  const place = notePlaceOf(plan)
  const prefix = (words: NoteWords): string => (words.kind === 'route' || ['note', 'tag', 'symbol', 'key'].includes(words.kind) ? words.kind : 'sketch')
  const keptPrefix = (p: Annotation | SketchItem): string => (isAnnotation(p) ? p.kind : routeShaft(p) !== null ? 'route' : 'sketch')
  const ids = givenIds([...kept.map((p) => ({ prefix: keptPrefix(p), id: p.id })), ...request.add.map((a) => ({ prefix: prefix(a.words), ...(a.words.id === undefined ? {} : { id: a.words.id }) }))]).slice(kept.length)
  const taken = new Set(kept.map((p) => p.id))
  const placed: Array<Annotation | SketchItem> = []
  request.add.forEach((entry, k) => {
    const id = ids[k]!
    if (taken.has(id)) throw new EditRefused(`${entry.from}: the plan's drawing has ${id} already. Give the new one its own id, or take that one out with remove in the same call.`)
    taken.add(id)
    try {
      placed.push(notePart(entry.words, id, place, request.floor))
    } catch (error) {
      if (error instanceof NoteRefused) throw new EditRefused(`${entry.from}: ${error.message}`)
      throw error
    }
  })
  const annotations = [...kept.filter(isAnnotation), ...placed.filter(isAnnotation)]
  const sketch = [...kept.filter((p): p is SketchItem => !isAnnotation(p)), ...placed.filter((p): p is SketchItem => !isAnnotation(p))]
  const rooms = new Map(plan.rooms.map((r) => [r.id, floorOf(r)]))
  const said = [
    ...(request.remove.length === 0 ? [] : [`Took off the drawing: ${listed(request.remove)}.`]),
    ...(placed.length === 0 ? [] : [`Placed on the drawing, drawn and exported only, never measured or checked:`, ...placed.map((p) => `  ${placedLine(p, rooms)}`)]),
    ...(annotations.length + sketch.length === 0 ? ['The drawing now carries no notes and no sketch.'] : ['The drawing now carries:', ...notesSummary({ annotations, sketch, rooms: plan.rooms }).map((l) => `  ${l}`)]),
  ]
  return {
    ...emptyPatch(said),
    plan: { annotations: annotations.length === 0 ? null : annotations, sketch: sketch.length === 0 ? null : sketch },
    extra: { placed: placed.map((p) => p.id), removed: [...request.remove] },
  }
}
