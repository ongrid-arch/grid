/**
 * A strict ISO 10303-21 reader for the IFC tests, written for them and never sharing the
 * writer's helpers: a writer that mis-escapes a string and a reader that mis-unescapes it the
 * same way would agree with each other and with nobody else. It rejects anything the standard
 * does not allow (an unescaped quote, a raw non-ASCII byte, a malformed entity line), so a
 * malformed file fails in a test instead of in an architect's import dialog.
 *
 * Moved here from `ifc.test.ts` for HND-2, so the structural test reads files the same way.
 */
import { expect } from 'vitest'

// ---------------------------------------------------------------------------
// A strict ISO 10303-21 reader
// ---------------------------------------------------------------------------

export type Value =
  | { readonly t: 'null' }
  | { readonly t: 'derived' }
  | { readonly t: 'str'; readonly v: string }
  | { readonly t: 'num'; readonly v: number; readonly raw: string }
  | { readonly t: 'enum'; readonly v: string }
  | { readonly t: 'ref'; readonly v: number }
  | { readonly t: 'list'; readonly v: readonly Value[] }
  | { readonly t: 'typed'; readonly name: string; readonly v: Value }

export interface Entity {
  readonly id: number
  readonly type: string
  readonly args: readonly Value[]
}

export interface Doc {
  readonly header: ReadonlyMap<string, readonly Value[]>
  readonly entities: ReadonlyMap<number, Entity>
  readonly order: readonly Entity[]
}

class Reader {
  pos = 0
  constructor(readonly src: string) {}

  private fail(message: string): never {
    throw new Error(`${message} at ${this.pos} in: ${this.src}`)
  }

  peek(): string {
    return this.src[this.pos] ?? ''
  }

  expect(char: string): void {
    if (this.peek() !== char) this.fail(`expected ${char}`)
    this.pos++
  }

  atEnd(): boolean {
    return this.pos >= this.src.length
  }

  value(): Value {
    const c = this.peek()
    if (c === '$') {
      this.pos++
      return { t: 'null' }
    }
    if (c === '*') {
      this.pos++
      return { t: 'derived' }
    }
    if (c === "'") return this.string()
    if (c === '.') return this.enumeration()
    if (c === '#') return this.reference()
    if (c === '(') return this.list()
    if (c === '-' || (c >= '0' && c <= '9')) return this.number()
    if (c >= 'A' && c <= 'Z') return this.typed()
    return this.fail(`unexpected ${JSON.stringify(c)}`)
  }

  private string(): Value {
    this.expect("'")
    let out = ''
    for (;;) {
      if (this.atEnd()) this.fail('unterminated string')
      const c = this.src[this.pos]!
      const code = c.charCodeAt(0)
      if (code < 0x20 || code > 0x7e) this.fail(`raw character U+${code.toString(16)} in string`)

      if (c === "'") {
        if (this.src[this.pos + 1] === "'") {
          out += "'"
          this.pos += 2
          continue
        }
        this.pos++
        return { t: 'str', v: out }
      }

      if (c === '\\') {
        if (this.src[this.pos + 1] === '\\') {
          out += '\\'
          this.pos += 2
          continue
        }
        if (this.src.startsWith('\\X2\\', this.pos)) {
          this.pos += 4
          const end = this.src.indexOf('\\X0\\', this.pos)
          if (end < 0) this.fail('unterminated \\X2\\ block')
          const hex = this.src.slice(this.pos, end)
          if (hex.length === 0 || hex.length % 4 !== 0 || !/^[0-9A-F]+$/.test(hex)) {
            this.fail(`bad \\X2\\ payload ${hex}`)
          }
          for (let i = 0; i < hex.length; i += 4) {
            out += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16))
          }
          this.pos = end + 4
          continue
        }
        if (this.src.startsWith('\\X4\\', this.pos)) {
          this.pos += 4
          const end = this.src.indexOf('\\X0\\', this.pos)
          if (end < 0) this.fail('unterminated \\X4\\ block')
          const hex = this.src.slice(this.pos, end)
          if (hex.length === 0 || hex.length % 8 !== 0 || !/^[0-9A-F]+$/.test(hex)) this.fail(`bad \\X4\\ payload ${hex}`)
          for (let i = 0; i < hex.length; i += 8) out += String.fromCodePoint(parseInt(hex.slice(i, i + 8), 16))
          this.pos = end + 4
          continue
        }
        this.fail('unknown escape')
      }

      out += c
      this.pos++
    }
  }

  private enumeration(): Value {
    this.expect('.')
    const m = /^[A-Z][A-Z0-9_]*/.exec(this.src.slice(this.pos))
    if (!m) this.fail('bad enumeration')
    this.pos += m[0].length
    this.expect('.')
    return { t: 'enum', v: m[0] }
  }

  private reference(): Value {
    this.expect('#')
    const m = /^\d+/.exec(this.src.slice(this.pos))
    if (!m) this.fail('bad reference')
    this.pos += m[0].length
    return { t: 'ref', v: Number(m[0]) }
  }

  private number(): Value {
    const m = /^-?\d+(\.\d*)?(E[+-]?\d+)?/.exec(this.src.slice(this.pos))
    if (!m) this.fail('bad number')
    this.pos += m[0].length
    return { t: 'num', v: Number(m[0]), raw: m[0] }
  }

  private list(): Value {
    this.expect('(')
    const items: Value[] = []
    if (this.peek() === ')') {
      this.pos++
      return { t: 'list', v: items }
    }
    for (;;) {
      items.push(this.value())
      if (this.peek() === ',') {
        this.pos++
        continue
      }
      this.expect(')')
      return { t: 'list', v: items }
    }
  }

  private typed(): Value {
    const m = /^[A-Z][A-Z0-9_]*/.exec(this.src.slice(this.pos))
    if (!m) this.fail('bad type name')
    this.pos += m[0].length
    this.expect('(')
    const inner = this.value()
    this.expect(')')
    return { t: 'typed', name: m[0], v: inner }
  }

  /** `a,b,c` with no enclosing parentheses: the argument list of an entity. */
  args(): Value[] {
    const out: Value[] = []
    if (this.atEnd()) return out
    for (;;) {
      out.push(this.value())
      if (this.peek() === ',') {
        this.pos++
        continue
      }
      if (!this.atEnd()) this.fail('trailing characters')
      return out
    }
  }
}

export function parseArgs(text: string): Value[] {
  return new Reader(text).args()
}

export function parseDoc(text: string): Doc {
  const lines = text.split('\n')
  expect(lines[lines.length - 1]).toBe('')
  lines.pop()
  expect(text).not.toContain('\r')

  let i = 0
  const next = (): string => {
    const line = lines[i++]
    if (line === undefined) throw new Error('unexpected end of file')
    return line
  }

  expect(next()).toBe('ISO-10303-21;')
  expect(next()).toBe('HEADER;')

  const header = new Map<string, Value[]>()
  for (let line = next(); line !== 'ENDSEC;'; line = next()) {
    const m = /^([A-Z_]+)\((.*)\);$/.exec(line)
    if (!m) throw new Error(`bad header line: ${line}`)
    header.set(m[1]!, parseArgs(m[2]!))
  }

  expect(next()).toBe('DATA;')

  const entities = new Map<number, Entity>()
  const order: Entity[] = []
  for (let line = next(); line !== 'ENDSEC;'; line = next()) {
    const m = /^#(\d+)=([A-Z][A-Z0-9_]*)\((.*)\);$/.exec(line)
    if (!m) throw new Error(`bad entity line: ${line}`)
    const entity: Entity = { id: Number(m[1]), type: m[2]!, args: parseArgs(m[3]!) }
    if (entities.has(entity.id)) throw new Error(`duplicate #${entity.id}`)
    entities.set(entity.id, entity)
    order.push(entity)
  }

  expect(next()).toBe('END-ISO-10303-21;')
  expect(i).toBe(lines.length)

  return { header, entities, order }
}

export function* walk(value: Value): Generator<Value> {
  yield value
  if (value.t === 'list') for (const item of value.v) yield* walk(item)
  if (value.t === 'typed') yield* walk(value.v)
}

// Typed accessors: each throws on a mismatch, so a wrong attribute shape fails loudly.
export const str = (v: Value | undefined): string => {
  if (v?.t !== 'str') throw new Error(`expected string, got ${JSON.stringify(v)}`)
  return v.v
}
export const num = (v: Value | undefined): number => {
  if (v?.t !== 'num') throw new Error(`expected number, got ${JSON.stringify(v)}`)
  return v.v
}
export const ref = (v: Value | undefined): number => {
  if (v?.t !== 'ref') throw new Error(`expected reference, got ${JSON.stringify(v)}`)
  return v.v
}
export const en = (v: Value | undefined): string => {
  if (v?.t !== 'enum') throw new Error(`expected enumeration, got ${JSON.stringify(v)}`)
  return v.v
}
export const items = (v: Value | undefined): readonly Value[] => {
  if (v?.t !== 'list') throw new Error(`expected list, got ${JSON.stringify(v)}`)
  return v.v
}
export const refs = (v: Value | undefined): number[] => items(v).map(ref)
export const nums = (v: Value | undefined): number[] => items(v).map(num)

export const ofType = (doc: Doc, type: string): Entity[] => doc.order.filter((e) => e.type === type)

export function entity(doc: Doc, id: number): Entity {
  const found = doc.entities.get(id)
  if (!found) throw new Error(`#${id} is not defined`)
  return found
}

export const only = (doc: Doc, type: string): Entity => {
  const found = ofType(doc, type)
  expect(found, type).toHaveLength(1)
  return found[0]!
}

