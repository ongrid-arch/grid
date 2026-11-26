/**
 * CMD-43: the data of an ISO 10303-21 file (STEP), the text an IFC file is written in: each
 * `#n=TYPE(...);` record with its arguments.
 *
 * An argument is a string (its `''` and its `\X2\...\X0\`, `\X\..` and `\S\.` codes read), a
 * number, an enumeration (`.ELEMENT.`), a reference (`#12`), a list, a typed value
 * (`IFCLABEL('x')`), unset (`$`) or derived (`*`). Comments are skipped.
 *
 * Pure: text in, records out. Refuses with `DrawingRefused`.
 */
import { DrawingRefused } from './model'

export type StepValue =
  | { readonly kind: 'string'; readonly value: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'enum'; readonly value: string }
  | { readonly kind: 'ref'; readonly value: number }
  | { readonly kind: 'list'; readonly value: readonly StepValue[] }
  | { readonly kind: 'typed'; readonly type: string; readonly value: readonly StepValue[] }
  | { readonly kind: 'unset' }
  | { readonly kind: 'derived' }

export interface StepRecord {
  readonly id: number
  readonly type: string
  readonly args: readonly StepValue[]
}

/** A string's codes read: `''` is a quote, `\X2\00E9\X0\` UTF-16 code units, `\X\E9` a byte of Latin-1, `\S\.` a high Latin-1 letter. */
export function stepString(raw: string): string {
  let out = ''
  let i = 0
  while (i < raw.length) {
    const c = raw[i]!
    if (c === "'" && raw[i + 1] === "'") {
      out += "'"
      i += 2
    } else if (c === '\\' && raw.startsWith('\\X2\\', i)) {
      const end = raw.indexOf('\\X0\\', i + 4)
      const hex = raw.slice(i + 4, end < 0 ? raw.length : end)
      for (let k = 0; k + 4 <= hex.length; k += 4) out += String.fromCharCode(parseInt(hex.slice(k, k + 4), 16))
      i = end < 0 ? raw.length : end + 4
    } else if (c === '\\' && raw.startsWith('\\X4\\', i)) {
      const end = raw.indexOf('\\X0\\', i + 4)
      const hex = raw.slice(i + 4, end < 0 ? raw.length : end)
      for (let k = 0; k + 8 <= hex.length; k += 8) out += String.fromCodePoint(parseInt(hex.slice(k, k + 8), 16))
      i = end < 0 ? raw.length : end + 4
    } else if (c === '\\' && raw.startsWith('\\X\\', i)) {
      out += String.fromCharCode(parseInt(raw.slice(i + 3, i + 5), 16))
      i += 5
    } else if (c === '\\' && raw.startsWith('\\S\\', i)) {
      out += String.fromCharCode(raw.charCodeAt(i + 3) + 128)
      i += 4
    } else if (c === '\\' && raw[i + 1] === '\\') {
      out += '\\'
      i += 2
    } else {
      out += c
      i++
    }
  }
  return out
}

/** The records of a STEP file's DATA section, by id. */
export function readStep(text: string): Map<number, StepRecord> {
  if (!/^\s*ISO-10303-21\s*;/.test(text)) throw new DrawingRefused('drawing/not-read', 'This is not an IFC file Grid can read: it does not start with ISO-10303-21; (an IFC-XML or IFC-ZIP file is not read: save it as an .ifc).')
  const data = text.search(/\bDATA\s*;/)
  if (data < 0) throw new DrawingRefused('drawing/not-read', 'This IFC file has no DATA section, so there is nothing to read.')
  const records = new Map<number, StepRecord>()
  let i = text.indexOf(';', data) + 1
  const n = text.length
  const REF = /#(\d+)/y
  const NUM = /[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/y
  const TYPE = /[A-Za-z_][A-Za-z0-9_]*/y
  const HEAD = /#(\d+)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*/y
  const at = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = i
    return re.exec(text)
  }
  const skipSpace = (): void => {
    for (;;) {
      while (i < n && (text.charCodeAt(i) <= 32)) i++
      if (text.startsWith('/*', i)) {
        const end = text.indexOf('*/', i + 2)
        i = end < 0 ? n : end + 2
        continue
      }
      return
    }
  }
  const fail = (what: string): never => {
    const line = text.slice(0, i).split('\n').length
    throw new DrawingRefused('drawing/not-read', `This IFC file cannot be read at line ${line}: ${what}.`)
  }
  const value = (): StepValue => {
    skipSpace()
    const c = text[i]
    if (c === "'") {
      let j = i + 1
      for (;;) {
        const k = text.indexOf("'", j)
        if (k < 0) fail('a string is not closed')
        if (text[k + 1] === "'") j = k + 2
        else {
          const raw = text.slice(i + 1, k)
          i = k + 1
          return { kind: 'string', value: stepString(raw) }
        }
      }
    }
    if (c === '#') {
      const m = at(REF)
      if (m === null) fail('a reference has no number')
      i += m![0].length
      return { kind: 'ref', value: Number(m![1]) }
    }
    if (c === '$') {
      i++
      return { kind: 'unset' }
    }
    if (c === '*') {
      i++
      return { kind: 'derived' }
    }
    if (c === '.') {
      const k = text.indexOf('.', i + 1)
      if (k < 0) fail('an enumeration is not closed')
      const v = text.slice(i + 1, k)
      i = k + 1
      return { kind: 'enum', value: v }
    }
    if (c === '(') return { kind: 'list', value: list() }
    if (c === '"') {
      const k = text.indexOf('"', i + 1)
      i = k < 0 ? n : k + 1
      return { kind: 'string', value: '' }
    }
    const num = at(NUM)
    if (num !== null) {
      i += num[0].length
      return { kind: 'number', value: Number(num[0]) }
    }
    const type = at(TYPE)
    if (type !== null) {
      i += type[0].length
      skipSpace()
      if (text[i] !== '(') fail(`${type[0]} has no arguments`)
      return { kind: 'typed', type: type[0].toUpperCase(), value: list() }
    }
    return fail(`'${c ?? 'the end'}' is not a value`)
  }
  const list = (): StepValue[] => {
    i++ // (
    const out: StepValue[] = []
    skipSpace()
    if (text[i] === ')') {
      i++
      return out
    }
    for (;;) {
      out.push(value())
      skipSpace()
      if (text[i] === ',') {
        i++
        continue
      }
      if (text[i] === ')') {
        i++
        return out
      }
      fail('a list is not closed')
    }
  }
  for (;;) {
    skipSpace()
    if (i >= n || text.startsWith('ENDSEC', i)) break
    const head = at(HEAD)
    if (head === null) fail('a record does not start with #<n>=<TYPE>')
    i += head![0].length
    if (text[i] !== '(') fail(`#${head![1]} has no arguments`)
    const args = list()
    skipSpace()
    if (text[i] === ';') i++
    records.set(Number(head![1]), { id: Number(head![1]), type: head![2]!.toUpperCase(), args })
  }
  return records
}
