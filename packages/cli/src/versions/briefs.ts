/**
 * CMD-57: the brief beside the plan kept with each marker, and two briefs compared.
 *
 * A marker keeps the brief (`<plan>.brief.json`, `brief/brief.ts`) as it was when the marker was
 * set, as the text `briefJson` writes, or null when there was none. Two briefs are compared wish
 * by wish, paired by what each wish is about, never by its place, so a wish taken out before it
 * does not make every later one a change:
 *
 * - a room wish by its name or use, its floor and its fact, the first with the first;
 * - a touch by its two rooms, either way round; an open wish by its quote;
 * - the footprint, each figure and the people by their key.
 *
 * A change asks for less (weakened) when a must becomes a should, a least figure is lowered, a
 * most figure raised (by the figure's own `most`, or an `_at_least`/`_at_most` field) or a figure
 * is taken out of the wish; for more (tightened) the other way round; anything else (a quote,
 * the source, an about size, a level to or from avoid) is changed. A wish taken out is removed.
 */
import { historySay } from './words'
import type { Project } from '../fs/projectFiles'
import { briefJson, FIGURES, parseBrief, readBrief, type Brief, type FigureName } from '../brief/brief'

export type BriefChangeKind = 'added' | 'removed' | 'weakened' | 'tightened' | 'changed'

/** One field of a wish that changed: its value before and after, null when it was not there. */
export interface BriefFieldChange {
  readonly field: string
  readonly before: unknown
  readonly after: unknown
}

/** One wish that changed between two briefs. */
export interface BriefChangeLine {
  readonly kind: BriefChangeKind
  /** Its place in the later brief, and in the earlier; null where it is not. */
  readonly where: string | null
  readonly was: string | null
  /** The wish as each brief holds it, as its file writes it. */
  readonly before: Readonly<Record<string, unknown>> | null
  readonly after: Readonly<Record<string, unknown>> | null
  readonly fields: readonly BriefFieldChange[]
  readonly text: string
}

/** The brief to keep with a marker: its text, null when there is none, undefined when it can't be read. */
export function briefForMarker(project: Project, planFile: string): string | null | undefined {
  const read = readBrief(project, planFile)
  if (read.brief !== null) return JSON.stringify(briefJson(read.brief))
  return read.problem === null ? null : undefined
}

/** A brief a marker kept, read back; null when it kept none or it can't be read. */
export function briefOfText(text: string | null): Brief | null {
  if (text === null) return null
  try {
    return parseBrief(JSON.parse(text))
  } catch {
    return null
  }
}

interface Wish {
  readonly key: string
  readonly place: string
  readonly json: Record<string, unknown>
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Every wish of a brief, by what it is about. */
function wishes(brief: Brief | null): Wish[] {
  if (brief === null) return []
  const json = briefJson(brief)
  const out: Wish[] = []
  const counted = new Map<string, number>()
  const nth = (base: string): string => {
    const n = counted.get(base) ?? 0
    counted.set(base, n + 1)
    return `${base}#${n}`
  }
  const list = (name: string, keyOf: (w: Record<string, unknown>) => string): void => {
    const items = json[name]
    if (!Array.isArray(items)) return
    items.forEach((w: Record<string, unknown>, i) => out.push({ key: nth(`${name}:${keyOf(w)}`), place: `${name}[${i}]`, json: w }))
  }
  list('rooms', (w) => JSON.stringify([w['name'] ?? null, w['use'] ?? null, w['floor'] ?? null, w['fact'] ?? null]))
  list('touch', (w) => JSON.stringify([...(w['rooms'] as string[])].sort()))
  list('open', (w) => JSON.stringify(w['quote']))
  if (isObject(json['footprint'])) out.push({ key: 'footprint', place: 'footprint', json: json['footprint'] })
  if (isObject(json['figures'])) {
    for (const [figure, w] of Object.entries(json['figures'])) if (figure !== 'heading' && isObject(w)) out.push({ key: `figures.${figure}`, place: `figures.${figure}`, json: w })
  }
  if (isObject(json['people'])) out.push({ key: 'people', place: 'people', json: json['people'] })
  return out
}

/** Fields that only say what a wish is, never how much it asks for. */
const WORDING = new Set(['quote', 'source', 'about', 'name', 'use', 'floor', 'fact', 'rooms', 'uses', 'routes', 'measure', 'with_inner'])

/** Whether a field's change asks for less (-1), more (1) or neither (0). */
function direction(place: string, field: string, before: unknown, after: unknown): number {
  if (field === 'level') {
    if (before === 'must' && after === 'should') return -1
    if (before === 'should' && after === 'must') return 1
    return 0
  }
  if (WORDING.has(field) || place === 'people') return 0
  const figure = place.startsWith('figures.') ? place.slice('figures.'.length) : null
  const most = field.endsWith('_at_most') || field === 'at_most' ? true : field.endsWith('_at_least') || field === 'at_least' ? false : figure !== null && field === 'value' && figure in FIGURES && figure !== 'storeys' ? FIGURES[figure as FigureName].most : null
  // A figure taken out of the wish asks for less; one put in asks for more.
  if (after === undefined) return before === undefined ? 0 : -1
  if (before === undefined) return 1
  if (most === null || typeof before !== 'number' || typeof after !== 'number') return 0
  if (before === after) return 0
  return (after > before) === most ? -1 : 1
}

function fieldChanges(place: string, before: Record<string, unknown>, after: Record<string, unknown>): { fields: BriefFieldChange[]; kind: BriefChangeKind | null } {
  const fields: BriefFieldChange[] = []
  let less = false
  let more = false
  for (const field of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const b = before[field]
    const a = after[field]
    if (JSON.stringify(b) === JSON.stringify(a)) continue
    // A touch's two rooms either way round are the same two.
    if (place.startsWith('touch') && field === 'rooms' && JSON.stringify([...(b as string[])].sort()) === JSON.stringify([...(a as string[])].sort())) continue
    fields.push({ field, before: b ?? null, after: a ?? null })
    const d = direction(place, field, b, a)
    if (d < 0) less = true
    if (d > 0) more = true
  }
  if (fields.length === 0) return { fields, kind: null }
  return { fields, kind: less ? 'weakened' : more ? 'tightened' : 'changed' }
}

const shown = (value: unknown): string => (value === null || value === undefined ? '—' : JSON.stringify(value))

/** A wish in a few words: its fields, the quote last. */
function wishWords(json: Readonly<Record<string, unknown>>): string {
  const fields = Object.entries(json).filter(([k]) => k !== 'quote').map(([k, v]) => `${k} ${shown(v)}`)
  return [...fields, ...(json['quote'] === undefined ? [] : [`quote ${shown(json['quote'])}`])].join(', ')
}

function lineText(line: Omit<BriefChangeLine, 'text'>): string {
  const fields = line.fields.map((f) => historySay('tool.brief.field', { field: f.field, before: shown(f.before), after: shown(f.after) })).join('; ')
  switch (line.kind) {
    case 'added': return historySay('tool.brief.added', { where: line.where!, wish: wishWords(line.after!) })
    case 'removed': return historySay('tool.brief.removed', { was: line.was!, wish: wishWords(line.before!) })
    default: {
      const where = line.where === line.was ? line.where! : historySay('tool.brief.moved', { where: line.where!, was: line.was! })
      return historySay(line.kind === 'weakened' ? 'tool.brief.weakened' : line.kind === 'tightened' ? 'tool.brief.tightened' : 'tool.brief.changed', { where, fields })
    }
  }
}

const ORDER: Readonly<Record<BriefChangeKind, number>> = { weakened: 0, removed: 1, changed: 2, tightened: 3, added: 4 }

/** How the brief changed from `before` to `after`: the weakened and removed first. */
export function compareBriefs(before: Brief | null, after: Brief | null): BriefChangeLine[] {
  const earlier = wishes(before)
  const later = new Map(wishes(after).map((w) => [w.key, w]))
  const lines: Omit<BriefChangeLine, 'text'>[] = []
  for (const was of earlier) {
    const now = later.get(was.key)
    if (now === undefined) {
      lines.push({ kind: 'removed', where: null, was: was.place, before: was.json, after: null, fields: [] })
      continue
    }
    later.delete(was.key)
    const { fields, kind } = fieldChanges(was.place, was.json, now.json)
    if (kind !== null) lines.push({ kind, where: now.place, was: was.place, before: was.json, after: now.json, fields })
  }
  for (const now of later.values()) lines.push({ kind: 'added', where: now.place, was: null, before: null, after: now.json, fields: [] })
  return lines.map((line) => ({ ...line, text: lineText(line) })).sort((a, b) => ORDER[a.kind] - ORDER[b.kind])
}

/** The comparison's lines under one heading, or the line that says nothing changed. */
export function briefChangeText(lines: readonly BriefChangeLine[], heading: string, same: string, max: number): string[] {
  if (lines.length === 0) return [same]
  const out = [heading]
  for (const line of lines.slice(0, max)) out.push(`  ${line.text}`)
  if (lines.length > max) out.push(`  ${historySay('tool.brief.more', { count: lines.length - max })}`)
  return out
}

/** How many of the lines ask for less: weakened or removed. */
export function lessCount(lines: readonly BriefChangeLine[]): number {
  return lines.filter((l) => l.kind === 'weakened' || l.kind === 'removed').length
}

/** The lines as data. */
export function briefChangeData(lines: readonly BriefChangeLine[]): Record<string, unknown>[] {
  return lines.map((l) => ({ kind: l.kind, where: l.where, was: l.was, before: l.before, after: l.after, fields: l.fields.map((f) => ({ ...f })), text: l.text }))
}
