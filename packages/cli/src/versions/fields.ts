/**
 * CMD-44: every field that differs between two plan files, part by part.
 *
 * The building comparison (`compareBuildings`) says what stands where; a fact of the person's own,
 * a room's number, a capacity or a department changes nothing that stands, so it said
 * "Changes: none". This reads the two files as JSON and names each field that differs, by where
 * it is in the file: a list of parts with ids is paired by id (`rooms["kitchen"].properties.department`),
 * any other value by its place. A part added or taken away is one line. Nothing is measured.
 */
import { historySay } from './words'

export interface FieldChange {
  /** Where the field is in the file: `rooms["kitchen"].number`, `site.north`. */
  readonly path: string
  /** The value before and after, as JSON; null when the field or part was not there. */
  readonly before: unknown
  readonly after: unknown
  readonly kind: 'changed' | 'added' | 'removed'
  readonly text: string
}

/** The longest value written in a line; the data holds it whole. */
const VALUE_SHOWN = 60

/** The most field changes worked out; past it, the count is all that is said. */
export const FIELD_CHANGES_MAX = 2000

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** A list whose every entry is an object with an id of its own, each once. */
function byId(value: unknown): Map<string, Record<string, unknown>> | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const out = new Map<string, Record<string, unknown>>()
  for (const entry of value) {
    if (!isRecord(entry) || typeof entry['id'] !== 'string' || out.has(entry['id'])) return null
    out.set(entry['id'], entry)
  }
  return out
}

function shown(value: unknown): string {
  const text = JSON.stringify(value) ?? 'null'
  return text.length <= VALUE_SHOWN ? text : `${text.slice(0, VALUE_SHOWN - 1)}…`
}

const key = (path: string, name: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? (path === '' ? name : `${path}.${name}`) : `${path}[${JSON.stringify(name)}]`)

/** The fields that differ between two plan files, in the order of the later file. */
export function fieldChanges(earlier: unknown, later: unknown): { readonly changes: readonly FieldChange[]; readonly total: number } {
  const changes: FieldChange[] = []
  let total = 0
  const push = (path: string, before: unknown, after: unknown): void => {
    total += 1
    if (changes.length >= FIELD_CHANGES_MAX) return
    const kind = before === undefined ? 'added' : after === undefined ? 'removed' : 'changed'
    const text = kind === 'added'
      ? historySay('tool.history.field.added', { path, after: shown(after) })
      : kind === 'removed'
        ? historySay('tool.history.field.removed', { path, before: shown(before) })
        : historySay('tool.history.field.changed', { path, before: shown(before), after: shown(after) })
    changes.push({ path, before: before ?? null, after: after ?? null, kind, text })
  }
  const walk = (path: string, a: unknown, b: unknown): void => {
    if (a === b) return
    if (isRecord(a) && isRecord(b)) {
      for (const name of Object.keys(b)) walk(key(path, name), a[name], b[name])
      for (const name of Object.keys(a)) if (!Object.hasOwn(b, name)) push(key(path, name), a[name], undefined)
      return
    }
    const ia = byId(a)
    const ib = byId(b)
    if (ia !== null && ib !== null) {
      for (const [id, part] of ib) walk(`${path}[${JSON.stringify(id)}]`, ia.get(id), part)
      for (const [id, part] of ia) if (!ib.has(id)) push(`${path}[${JSON.stringify(id)}]`, part, undefined)
      return
    }
    if (a === undefined || b === undefined || JSON.stringify(a) !== JSON.stringify(b)) push(path, a, b)
  }
  walk('', earlier, later)
  return { changes, total }
}

/** The fields that differ between two plan files' texts; none when either is not JSON. */
export function fieldChangesOfTexts(earlier: string, later: string): { readonly changes: readonly FieldChange[]; readonly total: number } {
  let a: unknown
  let b: unknown
  try {
    a = JSON.parse(earlier.replace(/^﻿/, ''))
    b = JSON.parse(later.replace(/^﻿/, ''))
  } catch {
    return { changes: [], total: 0 }
  }
  return fieldChanges(a, b)
}
