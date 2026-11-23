/**
 * AIV-19: a project that lives in memory, for the hosted tool server. One request makes one,
 * puts the plan it carries in it as `plan.json`, runs a tool on it and drops it. It touches no
 * disk and imports no `fs`: the tools read and write it through the same `Project` calls, so no
 * tool needs a hosted form of its own. A path is checked by its text alone, as `Project` does
 * before it reaches the disk: a relative name inside the project, nothing else.
 */
import path from 'path'
import { say, type MessageKey, type Values } from '@ongrid/floorplan/messages'
import { Project, pathProblem, PathRefused, quoted } from './projectFiles'
import { decodeText } from './textEncoding'

/** The one name the hosted tools give the plan they were handed. */
export const MEMORY_PLAN_FILE = 'plan.json'
const HERE = 'this request'
const words = (key: MessageKey, values: Values): string => say('en', key, values)

function errno(code: string, message: string): Error {
  return Object.assign(new Error(message), { code })
}

export class MemoryProject extends Project {
  private readonly files = new Map<string, Uint8Array>()

  constructor() {
    super({ real: HERE, named: HERE }, { real: HERE, named: HERE }, 'project')
  }

  /** The name a path stands for inside the project, or a refusal. */
  private name(given: string): string {
    if (typeof given !== 'string') throw new PathRefused(say('en', 'hosted.fs.notText'))
    const problem = pathProblem(given)
    if (problem) throw new PathRefused(words('hosted.fs.refused', { path: quoted(given), reason: problem }))
    const clean = path.posix.normalize(given.replace(/\\/g, '/'))
    if (clean.startsWith('/') || clean === '..' || clean.startsWith('../') || /^[A-Za-z]:/.test(clean)) {
      throw new PathRefused(words('hosted.fs.outside', { path: quoted(given) }))
    }
    return clean === '.' ? '' : clean
  }

  override resolve(given: string): string {
    return this.name(given)
  }

  override readText(given: string, maxBytes?: number): { readonly text: string; readonly real: string } {
    const bytes = this.readBytes(given, maxBytes ?? Number.MAX_SAFE_INTEGER)
    return { text: decodeText(bytes).text, real: this.name(given) }
  }

  override readBytes(given: string, maxBytes: number): Uint8Array {
    const name = this.name(given)
    const bytes = this.files.get(name)
    if (bytes === undefined) throw errno(this.folderNames(name).length > 0 ? 'EISDIR' : 'ENOENT', words('hosted.fs.noFile', { path: quoted(given) }))
    if (bytes.length > maxBytes) throw errno('EFBIG', words('hosted.fs.tooLarge', { path: quoted(given), bytes: maxBytes }))
    return bytes
  }

  override folderNames(given: string): string[] {
    const name = this.name(given)
    const prefix = name === '' ? '' : `${name}/`
    const names = new Set<string>()
    for (const file of this.files.keys()) if (file.startsWith(prefix) && file !== name) names.add(file.slice(prefix.length).split('/')[0]!)
    return [...names].sort()
  }

  override readTextIfThere(given: string): string | null {
    try {
      return this.readText(given).text
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null
      throw error
    }
  }

  override isLinked(): boolean {
    return false
  }

  override writeFile(given: string, data: string | Uint8Array): string {
    const name = this.writable(given)
    this.files.set(name, typeof data === 'string' ? new TextEncoder().encode(data) : data)
    return name
  }

  override writable(given: string): string {
    const name = this.name(given)
    if (name === '' || this.folderNames(name).length > 0) throw errno('EISDIR', words('hosted.fs.folder', { path: quoted(given) }))
    return name
  }

  override appendText(given: string, text: string): string {
    const name = this.writable(given)
    const old = this.files.get(name)
    return this.writeFile(name, `${old === undefined ? '' : new TextDecoder().decode(old)}${text}`)
  }

  override exists(given: string): boolean {
    const name = this.name(given)
    return name === '' || this.files.has(name) || this.folderNames(name).length > 0
  }

  override createFile(given: string, data: string | Uint8Array): string {
    const name = this.writable(given)
    if (this.files.has(name)) throw errno('EEXIST', words('hosted.fs.taken', { path: quoted(given) }))
    return this.writeFile(name, data)
  }

  override makeFolder(given: string): string {
    return this.name(given)
  }

  override relative(real: string): string {
    return real
  }

  override shown(real: string): string {
    return real
  }
}
