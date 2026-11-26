/**
 * The last committed version of a plan file, read from the project's own git folder (WRT-8).
 *
 * Grid runs no program to read it: running `git` in a folder an agent works in would also run
 * whatever that folder's git settings ask for. It reads the files git keeps, the way git
 * itself reads them, and only through `fs/projectFiles.ts`: `HEAD`, the branch it names
 * (loose or in `packed-refs`), the commit, the trees down the plan's path and the plan's
 * blob, each one a loose object or an object in a pack, deltas included.
 *
 * What it can read, and says so otherwise:
 * - a `.git` folder in the project folder itself, or a `.git` file naming one inside it. A
 *   repository whose `.git` is above the project folder, or a worktree whose objects are kept
 *   elsewhere, is outside the project, and Grid reads nothing outside it;
 * - a plan file inside the project folder, as committed on the branch `HEAD` names;
 * - SHA-1 repositories. A SHA-256 one is said to be one Grid does not read.
 */
import { inflateSync } from 'zlib'
import { PathRefused, type Project } from '../fs/projectFiles'
import { decodeText } from '../fs/textEncoding'

/** Why the last committed version could not be read. One line, naming what is missing. */
export class GitUnread extends Error {
  override readonly name = 'GitUnread'
}

/** The most Grid reads of one file of git's: a pack holds the whole history. */
export const GIT_FILE_MAX_BYTES = 512 * 1024 * 1024
/** A delta chain longer than this is refused: git keeps them to 50 by default. */
const DELTA_DEPTH_MAX = 4096

export interface CommittedVersion {
  readonly text: string
  /** The commit it was read from, as 40 hex digits. */
  readonly commit: string
  /** The branch `HEAD` names, or null when it names a commit. */
  readonly branch: string | null
}

const SHA = /^[0-9a-f]{40}$/

interface GitObject {
  readonly type: 'commit' | 'tree' | 'blob' | 'tag'
  readonly data: Uint8Array
}

const TYPES: Readonly<Record<number, GitObject['type']>> = { 1: 'commit', 2: 'tree', 3: 'blob', 4: 'tag' }

function hex(bytes: Uint8Array, from: number, length = 20): string {
  let out = ''
  for (let i = from; i < from + length; i++) out += bytes[i]!.toString(16).padStart(2, '0')
  return out
}

const decoder = new TextDecoder('utf-8', { fatal: false })

class Repository {
  private packsRead = false
  private loadedPacks: Array<{ pack: Uint8Array; index: Uint8Array; count: number }> = []

  constructor(
    private readonly project: Project,
    /** The git folder, relative to the project folder, with `/` between names. */
    readonly folder: string,
  ) {}

  private bytes(name: string): Uint8Array | null {
    try {
      return this.project.readBytes(`${this.folder}/${name}`, GIT_FILE_MAX_BYTES)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
  }

  text(name: string): string | null {
    const read = this.bytes(name)
    return read === null ? null : decoder.decode(read)
  }

  /** The commit a ref names, from its loose file or `packed-refs`. */
  resolveRef(ref: string): string | null {
    if (!/^refs\/[A-Za-z0-9._/-]+$/.test(ref) || ref.includes('..')) throw new GitUnread(`HEAD names ${JSON.stringify(ref)}, which is not a branch Grid reads.`)
    const loose = this.text(ref)?.trim()
    if (loose !== undefined && loose !== '') {
      if (loose.startsWith('ref: ')) return this.resolveRef(loose.slice(5).trim())
      return SHA.test(loose) ? loose : null
    }
    for (const line of (this.text('packed-refs') ?? '').split('\n')) {
      const [sha, name] = line.trim().split(' ')
      if (name === ref && sha !== undefined && SHA.test(sha)) return sha
    }
    return null
  }

  private loadPacks(): void {
    if (this.packsRead) return
    this.packsRead = true
    for (const name of this.project.folderNames(`${this.folder}/objects/pack`)) {
      if (!/^pack-[0-9a-f]+\.idx$/.test(name)) continue
      const index = this.bytes(`objects/pack/${name}`)
      const pack = this.bytes(`objects/pack/${name.replace(/\.idx$/, '.pack')}`)
      if (index === null || pack === null) continue
      // Version 2 only: "\377tOc", then 2.
      if (index[0] !== 0xff || index[1] !== 0x74 || index[2] !== 0x4f || index[3] !== 0x63 || readU32(index, 4) !== 2) continue
      this.loadedPacks.push({ pack, index, count: readU32(index, 8 + 255 * 4) })
    }
  }

  /** Where an object is in a pack, or null when no pack has it. */
  private findPacked(sha: string): { pack: Uint8Array; offset: number } | null {
    this.loadPacks()
    const first = parseInt(sha.slice(0, 2), 16)
    for (const { pack, index, count } of this.loadedPacks) {
      let lo = first === 0 ? 0 : readU32(index, 8 + (first - 1) * 4)
      let hi = readU32(index, 8 + first * 4)
      const names = 8 + 256 * 4
      while (lo < hi) {
        const mid = (lo + hi) >>> 1
        const at = hex(index, names + mid * 20)
        if (at === sha) {
          const offsets = names + count * 20 + count * 4
          let offset = readU32(index, offsets + mid * 4)
          if (offset & 0x80000000) {
            const large = offsets + count * 4 + (offset & 0x7fffffff) * 8
            offset = readU32(index, large) * 2 ** 32 + readU32(index, large + 4)
          }
          return { pack, offset }
        }
        if (at < sha) lo = mid + 1
        else hi = mid
      }
    }
    return null
  }

  private packed(pack: Uint8Array, offset: number, depth: number): GitObject {
    if (depth > DELTA_DEPTH_MAX) throw new GitUnread('A git object is stored as a chain of changes too long to follow.')
    let at = offset
    let byte = pack[at++]!
    const type = (byte >> 4) & 7
    while (byte & 0x80) byte = pack[at++]!
    if (type === 6) {
      // OFS_DELTA: the base is this far back in the same pack.
      byte = pack[at++]!
      let back = byte & 0x7f
      while (byte & 0x80) {
        byte = pack[at++]!
        back = (back + 1) * 128 + (byte & 0x7f)
      }
      const base = this.packed(pack, offset - back, depth + 1)
      return { type: base.type, data: applyDelta(base.data, inflate(pack, at)) }
    }
    if (type === 7) {
      const base = this.object(hex(pack, at), depth + 1)
      return { type: base.type, data: applyDelta(base.data, inflate(pack, at + 20)) }
    }
    const named = TYPES[type]
    if (named === undefined) throw new GitUnread('A git pack holds an object of a kind Grid does not read.')
    return { type: named, data: inflate(pack, at) }
  }

  object(sha: string, depth = 0): GitObject {
    const loose = this.bytes(`objects/${sha.slice(0, 2)}/${sha.slice(2)}`)
    if (loose !== null) {
      const raw = inflateSync(loose)
      const space = raw.indexOf(0x20)
      const nul = raw.indexOf(0)
      const type = decoder.decode(raw.subarray(0, space)) as GitObject['type']
      if (!['commit', 'tree', 'blob', 'tag'].includes(type) || nul < 0) throw new GitUnread('A git object is not one Grid can read.')
      return { type, data: raw.subarray(nul + 1) }
    }
    const found = this.findPacked(sha)
    if (found === null) throw new GitUnread(`The git object ${sha.slice(0, 12)} is not in the project's git folder.`)
    return this.packed(found.pack, found.offset, depth)
  }
}

function readU32(bytes: Uint8Array, at: number): number {
  return ((bytes[at]! << 24) >>> 0) + (bytes[at + 1]! << 16) + (bytes[at + 2]! << 8) + bytes[at + 3]!
}

function inflate(bytes: Uint8Array, at: number): Uint8Array {
  return inflateSync(bytes.subarray(at))
}

/** A git delta applied to its base: copies from the base and inserted bytes. */
function applyDelta(base: Uint8Array, delta: Uint8Array): Uint8Array {
  let at = 0
  const size = (): number => {
    let value = 0
    let shift = 0
    let byte: number
    do {
      byte = delta[at++]!
      value += (byte & 0x7f) * 2 ** shift
      shift += 7
    } while (byte & 0x80)
    return value
  }
  if (size() !== base.length) throw new GitUnread('A git object is stored as a change to another that does not match it.')
  const out = new Uint8Array(size())
  let written = 0
  while (at < delta.length) {
    const op = delta[at++]!
    if (op & 0x80) {
      let offset = 0
      let length = 0
      for (let i = 0; i < 4; i++) if (op & (1 << i)) offset += delta[at++]! * 2 ** (8 * i)
      for (let i = 0; i < 3; i++) if (op & (1 << (4 + i))) length += delta[at++]! * 2 ** (8 * i)
      if (length === 0) length = 0x10000
      out.set(base.subarray(offset, offset + length), written)
      written += length
    } else if (op > 0) {
      out.set(delta.subarray(at, at + op), written)
      at += op
      written += op
    } else {
      throw new GitUnread('A git object is stored as a change Grid cannot read.')
    }
  }
  if (written !== out.length) throw new GitUnread('A git object is stored as a change that does not add up.')
  return out
}

/** The entry for one name in a tree: its mode and object. */
function treeEntry(tree: Uint8Array, name: string): { mode: string; sha: string } | null {
  let at = 0
  while (at < tree.length) {
    const space = tree.indexOf(0x20, at)
    const nul = tree.indexOf(0, space)
    if (space < 0 || nul < 0) break
    const mode = decoder.decode(tree.subarray(at, space))
    const entry = decoder.decode(tree.subarray(space + 1, nul))
    const sha = hex(tree, nul + 1)
    if (entry === name) return { mode, sha }
    at = nul + 21
  }
  return null
}

/** The git folder of the project, relative to it: `.git`, or the folder a `.git` file names. */
function gitFolder(project: Project): string | null {
  if (!project.exists('.git')) return null
  const names = project.folderNames('.git')
  if (names.length > 0) return '.git'
  let text: string
  try {
    text = project.readText('.git', 4096).text
  } catch {
    return null
  }
  const named = /^gitdir:\s*(.+?)\s*$/m.exec(text)?.[1]
  if (named === undefined) return null
  try {
    return project.relative(project.resolve(named, 'project'))
  } catch (error) {
    if (error instanceof PathRefused) throw new GitUnread('The project\'s .git names a git folder outside the project folder, and Grid reads nothing outside it.')
    throw error
  }
}

/** How far back a commit is looked for by its first digits, along the first parents of `HEAD`. */
export const COMMITS_WALKED_MAX = 1000

/** CMD-44: an earlier commit, named `git~N` (N first parents back) or by 7 to 40 of its hex digits. */
export const GIT_BACK = /^git~([0-9]{1,4})$/
export const COMMIT_DIGITS = /^[0-9a-f]{7,40}$/

/**
 * The plan file as last committed. `planFile` is a path inside the project; the repository must
 * be the project folder's own. Throws `GitUnread` with the reason when it cannot be read.
 */
export function lastCommitted(project: Project, planFile: string): CommittedVersion {
  return committedVersion(project, planFile, 'git')
}

/**
 * CMD-44: the plan file as committed at `ref`: `git` (the last commit), `git~N` (N first parents
 * back from it) or a commit by its first hex digits, found among the first parents of `HEAD`.
 */
export function committedVersion(project: Project, planFile: string, ref: string): CommittedVersion {
  const folder = gitFolder(project)
  if (folder === null) throw new GitUnread('The project folder holds no git repository of its own (.git), so there is no last committed version to read.')
  const repo = new Repository(project, folder)
  const head = repo.text('HEAD')?.trim()
  if (head === undefined || head === '') throw new GitUnread('The project\'s git folder has no HEAD.')
  // A worktree keeps its objects in the folder `commondir` names: outside its own.
  const common = repo.text('commondir')?.trim()
  const objects = common === undefined ? repo : new Repository(project, `${folder}/${common}`.replace(/\/\.\/?/g, '/'))
  let branch: string | null = null
  let commit: string | null
  if (head.startsWith('ref: ')) {
    branch = head.slice(5).trim()
    commit = objects.resolveRef(branch)
    if (commit === null) throw new GitUnread(`The branch ${JSON.stringify(branch.replace(/^refs\/heads\//, ''))} has no commit yet, so there is no last committed version.`)
  } else {
    commit = SHA.test(head) ? head : null
    if (commit === null) throw new GitUnread(/^[0-9a-f]{64}$/.test(head) ? 'The project\'s git repository uses SHA-256, which Grid does not read.' : 'The project\'s git HEAD is not one Grid reads.')
  }

  const commitData = (sha: string): string => {
    const object = objects.object(sha)
    if (object.type !== 'commit') throw new GitUnread('The project\'s git HEAD does not name a commit.')
    return decoder.decode(object.data)
  }
  const parentOf = (sha: string): string | null => /^parent ([0-9a-f]{40})$/m.exec(commitData(sha))?.[1] ?? null
  const back = GIT_BACK.exec(ref)
  if (back !== null) {
    for (let i = 0; i < Number(back[1]); i++) {
      const parent = parentOf(commit)
      if (parent === null) throw new GitUnread(`${ref} goes back further than the first commit, ${i} back.`)
      commit = parent
    }
  } else if (ref !== 'git') {
    let found: string | null = null
    let at: string | null = commit
    for (let i = 0; at !== null && i < COMMITS_WALKED_MAX; i++) {
      if (at.startsWith(ref)) {
        found = at
        break
      }
      at = parentOf(at)
    }
    if (found === null) throw new GitUnread(`No commit starting ${ref} is among the last ${COMMITS_WALKED_MAX} first parents of HEAD.`)
    commit = found
  }

  const where = ref === 'git' ? 'the last commit' : `commit ${commit.slice(0, 7)}`
  const treeSha = /^tree ([0-9a-f]{40})$/m.exec(commitData(commit))?.[1]
  if (treeSha === undefined) throw new GitUnread('The last commit names no tree.')
  const path = project.relative(project.resolve(planFile))
  let sha = treeSha
  const parts = path.split('/')
  for (const [i, part] of parts.entries()) {
    const tree = objects.object(sha)
    if (tree.type !== 'tree') throw new GitUnread(`${JSON.stringify(path)} is not in ${where}.`)
    const entry = treeEntry(tree.data, part)
    if (entry === null) throw new GitUnread(`${JSON.stringify(path)} is not in ${where}.`)
    if (i < parts.length - 1 && entry.mode !== '40000') throw new GitUnread(`${JSON.stringify(path)} is not in ${where}.`)
    sha = entry.sha
  }
  const blob = objects.object(sha)
  if (blob.type !== 'blob') throw new GitUnread(`${JSON.stringify(path)} is not a file in ${where}.`)
  // The one way a plan's bytes become text (MSG-9).
  return { text: decodeText(blob.data).text, commit, branch }
}
