/**
 * The one way Grid's command and tool server reach the disk: every path is resolved here,
 * against the project folder, and refused when it leads outside it.
 *
 * The project folder is the folder named with `--project`, or else the folder Grid runs in.
 * The top of a disk and the home folder are refused as project folders: inside either one,
 * "only inside the project" would mean almost anywhere.
 *
 * A path is refused before the disk is touched when its text alone says it can't name a file
 * in the project, on any computer the plan may travel to: a web address (`https:`, `file:`,
 * `data:`, `javascript:` ...), a network or device path (`\\server\share`, `\\?\C:\`), a name
 * Windows keeps for a device (`CON`, `NUL`, `COM1`, `LPT1`, with or without an extension), a
 * hidden data stream (`plan.json:stream`), a name ending in a dot or a space, a control or
 * direction-override character. `\` and `/` both separate folders, on every system.
 *
 * Then symbolic links are followed, for the file and for every folder above it that exists
 * (a file about to be written doesn't exist yet), and the real path must be inside the real
 * project folder. What is read or written is that real path, so what was checked is what is
 * opened. Writing a file makes the folders it needs on the way, always inside the project
 * folder (CMD-19); `createFile`, `appendText` and `makeFolder` do not, and `grid init` makes
 * only the one project folder it is asked for.
 *
 * Nothing else in `packages/cli` may import `fs`: a test fails if it does.
 */
import fs from 'fs'
import { homedir } from 'os'
import path from 'path'
import { atomicWriteFile } from '@ongrid/rules/atomicWrite'
import { decodeText, TextNotDecoded } from './textEncoding'

/** Why a path was refused. The message is one line and names the path and the project folder. */
export class PathRefused extends Error {
  override readonly name = 'PathRefused'
}

/** Longest path text Grid looks at. Real paths are far shorter. */
export const PATH_MAX = 4096
/** The largest text file Grid reads, in bytes, unless the caller says less (MSG-9). */
export const TEXT_FILE_MAX_BYTES = 64 * 1024 * 1024
/** As many links as one path may go through, as the systems themselves allow. */
const LINKS_MAX = 40
/** Most file systems refuse a longer name: say so plainly instead of with a system error. */
export const NAME_MAX_BYTES = 255

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const INVISIBLE = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/
const DEVICE_PATH = /^[\\/]{2}[?.][\\/]|^[\\/]\?\?[\\/]/
const NETWORK_PATH = /^[\\/]{2}/
// Two letters or more, so `C:` stays a drive. No dot, so `plan.json:x` reads as a data stream.
const SCHEME = /^([A-Za-z][A-Za-z0-9+-]+):/
const DRIVE = /^[A-Za-z]:/
const WINDOWS_FORBIDDEN = /[<>"|?*]/
// Windows treats these as devices in any folder, whatever follows the first dot.
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³]|conin\$|conout\$|clock\$)$/i

/** The text of a path, quoted, so a space at the end or a line break can be seen. */
export function quoted(text: string): string {
  return JSON.stringify(text)
}

/**
 * Why this text is not a path on this computer at all, or null: empty, too long, a control or
 * direction-override character, a web address or other scheme, a network or device path.
 * This is all the project folder itself is checked for: it already exists, so its own name is
 * a name this computer allows.
 */
export function addressProblem(text: string): string | null {
  if (text.length === 0) return 'it is empty'
  if (text.length > PATH_MAX) return `it is longer than ${PATH_MAX} characters`
  if (CONTROL.test(text)) return 'it holds a control character'
  if (INVISIBLE.test(text)) return 'it holds an invisible direction or formatting character'
  if (DEVICE_PATH.test(text)) return 'it is a Windows device path'
  if (NETWORK_PATH.test(text)) return 'it is a network path'
  const scheme = SCHEME.exec(text)
  if (scheme) return `it is an address (${scheme[1]!.toLowerCase()}:), not a file path`
  return null
}

/**
 * Why this text can't name a file in a project, from the text alone, or null. Each reason is
 * a short clause, such as "it is an address (https:), not a file path". `platform` decides
 * only whether a drive letter can be meant: every other rule holds on every system.
 */
export function pathProblem(text: string, platform: NodeJS.Platform = process.platform): string | null {
  const address = addressProblem(text)
  if (address) return address
  let rest = text
  if (DRIVE.test(text)) {
    if (platform !== 'win32') return 'it is a Windows path, with a drive letter'
    rest = text.slice(2)
    if (!/^[\\/]/.test(rest)) return `it is relative to the current folder of drive ${text.slice(0, 2)}`
  }
  for (const name of rest.split(/[\\/]+/)) {
    if (name === '' || name === '.' || name === '..') continue
    if (name.includes(':')) return `the name ${quoted(name)} holds a colon, which Windows reads as a hidden data stream`
    const forbidden = WINDOWS_FORBIDDEN.exec(name)
    if (forbidden) return `the name ${quoted(name)} holds ${forbidden[0]}, which Windows does not allow in a file name`
    if (/[. ]$/.test(name)) return `the name ${quoted(name)} ends in a dot or a space, which Windows drops`
    const device = name.split('.')[0]!.trimEnd()
    if (WINDOWS_DEVICE.test(device)) return `the name ${quoted(name)} is ${device.toUpperCase()}, a name Windows keeps for a device`
    if (Buffer.byteLength(name, 'utf8') > NAME_MAX_BYTES) return `the name ${quoted(name.slice(0, 20))}... is longer than ${NAME_MAX_BYTES} bytes`
  }
  return null
}

/** `\` separates folders on every system, so a path means the same wherever the plan goes. */
function separated(text: string): string {
  return process.platform === 'win32' ? text : text.replace(/\\/g, '/')
}

function isInside(folder: string, target: string): boolean {
  const rel = path.relative(folder, target)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel))
}

function errno(code: string, message: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: ${message}`), { code })
}

function codeOf(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | null)?.code
}

function realFolder(folder: string): string | null {
  try {
    return fs.realpathSync.native(folder)
  } catch {
    return null
  }
}

/** Where a path really leads, and how many of its last names don't exist yet. */
interface Located {
  readonly real: string
  readonly missing: number
}

/** Where a relative path starts: the folder Grid runs in (the command), or the project folder (the tool server). */
export type RelativeTo = 'cwd' | 'project'

/** A folder by its real path, and as it was named before links were followed. */
interface Folder {
  readonly real: string
  readonly named: string
}

export class Project {
  /** The real path of the project folder. */
  readonly folder: string
  private readonly project: Folder
  private readonly cwd: Folder
  private readonly base: Folder

  /** Use `openProject`. */
  constructor(project: Folder, cwd: Folder, relativeTo: RelativeTo) {
    this.folder = project.real
    this.project = project
    this.cwd = cwd
    this.base = relativeTo === 'cwd' ? cwd : project
  }

  private refused(given: string, reason: string): PathRefused {
    return new PathRefused(`${quoted(given)} is refused: ${reason}. Grid reads and writes only files inside the project folder ${quoted(this.folder)}.`)
  }

  private outside(given: string, throughLink: boolean): PathRefused {
    const how = throughLink ? ', through a symbolic link' : ''
    return new PathRefused(
      `${quoted(given)} is outside the project folder ${quoted(this.folder)}${how}. `
      + 'Grid reads and writes only files inside it; name another project folder with --project.',
    )
  }

  /**
   * The text checks. An absolute path that is inside the project by its text is checked only
   * below the project folder: the folder's own name is the person's choice, and its real path
   * may be a network path, as for a mapped drive on Windows. Nothing here touches the disk, so
   * a network path outside is refused before Windows would sign in to it.
   */
  private textProblem(given: string): string | null {
    const typed = separated(given)
    if (path.isAbsolute(typed)) {
      const absolute = path.resolve(typed)
      for (const folder of [this.project.real, this.project.named]) {
        if (isInside(folder, absolute)) {
          const below = path.relative(folder, absolute)
          return below === '' ? null : pathProblem(below)
        }
      }
    }
    return pathProblem(given)
  }

  /**
   * Follows the path to where it really leads. Refused when its text can't name a file in the
   * project, or when the real path of what exists of it is outside the project folder.
   */
  private locate(given: string, base: Folder = this.base): Located {
    if (typeof given !== 'string') throw new PathRefused('A path must be text.')
    const problem = this.textProblem(given)
    if (problem) throw this.refused(given, problem)
    const lexical = path.resolve(base.real, separated(given))
    const asNamed = path.resolve(base.named, separated(given))

    // Inside by its text, or once the links of the system above the project are resolved (such
    // as /var to /private/var on macOS, or a short Windows name). Every other outcome, an error
    // included, gives the same refusal, so a refusal says nothing about what is out there.
    // Network and device paths never get this far: their text alone refuses them.
    const below = this.below(lexical) ?? this.below(asNamed) ?? this.belowOnceResolved(lexical)
    if (below === null) throw this.outside(given, false)

    // Then down from the project folder one name at a time. A link is read, not followed
    // blindly: its target must be a path, and inside the project, before anything there is
    // looked at.
    const queue = below === '' ? [] : below.split(path.sep)
    let current = this.folder
    let links = 0
    while (queue.length > 0) {
      const name = queue.shift()!
      const next = path.join(current, name)
      let entry: fs.Stats
      try {
        entry = fs.lstatSync(next)
      } catch (error) {
        const code = codeOf(error)
        if (code !== 'ENOENT' && code !== 'ENOTDIR') throw error
        const rest = [name, ...queue]
        return { real: path.join(current, ...rest), missing: rest.length }
      }
      if (!entry.isSymbolicLink()) {
        current = next
        continue
      }
      if (++links > LINKS_MAX) throw this.refused(given, `it goes through more than ${LINKS_MAX} symbolic links`)
      const target = fs.readlinkSync(next)
      if (addressProblem(target)) throw this.outside(given, true)
      const into = this.below(path.resolve(current, target)) ?? this.belowOnceResolved(path.resolve(current, target))
      if (into === null) throw this.outside(given, true)
      queue.unshift(...(into === '' ? [] : into.split(path.sep)))
      current = this.folder
    }
    return { real: current, missing: 0 }
  }

  /**
   * The part below the project folder of an absolute path, after following the links of what
   * exists of it, or null: outside, or anything went wrong.
   */
  private belowOnceResolved(absolute: string): string | null {
    let existing = absolute
    const rest: string[] = []
    for (;;) {
      try {
        return this.below(path.join(fs.realpathSync.native(existing), ...rest))
      } catch (error) {
        const code = codeOf(error)
        const parent = path.dirname(existing)
        if ((code !== 'ENOENT' && code !== 'ENOTDIR') || parent === existing) return null
        rest.unshift(path.basename(existing))
        existing = parent
      }
    }
  }

  /** The part of an absolute path below the project folder, by its text, or null when it is outside. */
  private below(absolute: string): string | null {
    for (const folder of [this.project.real, this.project.named]) {
      if (isInside(folder, absolute)) return path.relative(folder, absolute)
    }
    return null
  }

  /**
   * Checks a path without reading or writing anything, and gives the real path it leads to.
   * For a feature that hands the path on, such as a trace image the app will show.
   * `relativeTo` says where a relative path starts when it isn't where this project's own
   * paths start: a path written inside a plan file starts from the project folder (CMD-15).
   */
  resolve(given: string, relativeTo?: RelativeTo): string {
    const base = relativeTo === undefined ? this.base : relativeTo === 'cwd' ? this.cwd : this.project
    return this.locate(given, base).real
  }

  /**
   * The text of a file in the project, read by the one reader (`textEncoding.ts`): a byte-order
   * mark is dropped, UTF-16 is recognised, and anything else must be strict UTF-8, or
   * `TextNotDecoded` says where it is not. Errors carry `ENOENT`, `EISDIR` or, for a file larger
   * than `maxBytes`, `EFBIG` as `code`; the size is checked before anything is read.
   */
  readText(given: string, maxBytes: number = TEXT_FILE_MAX_BYTES): { readonly text: string; readonly real: string } {
    const { real, missing } = this.locate(given)
    if (missing > 0) throw errno('ENOENT', `no such file ${quoted(given)}`)
    const stat = fs.statSync(real)
    if (stat.isDirectory()) throw errno('EISDIR', `${quoted(given)} is a folder`)
    if (!stat.isFile()) throw this.refused(given, 'it is not a plain file')
    if (stat.size > maxBytes) throw errno('EFBIG', `${quoted(given)} is larger than ${maxBytes} bytes`)
    const bytes = fs.readFileSync(real)
    if (bytes.length > maxBytes) throw errno('EFBIG', `${quoted(given)} is larger than ${maxBytes} bytes`)
    try {
      return { text: decodeText(bytes).text, real }
    } catch (error) {
      if (error instanceof TextNotDecoded) throw new TextNotDecoded(`${given} ${error.message}`)
      throw error
    }
  }

  /**
   * The bytes of a file in the project, as they are: for a file that is not text, such as an
   * object in the project's own git folder (WRT-8). Errors carry `code` as `readText`'s do.
   */
  readBytes(given: string, maxBytes: number): Uint8Array {
    const { real, missing } = this.locate(given)
    if (missing > 0) throw errno('ENOENT', `no such file ${quoted(given)}`)
    const stat = fs.statSync(real)
    if (stat.isDirectory()) throw errno('EISDIR', `${quoted(given)} is a folder`)
    if (!stat.isFile()) throw this.refused(given, 'it is not a plain file')
    if (stat.size > maxBytes) throw errno('EFBIG', `${quoted(given)} is larger than ${maxBytes} bytes`)
    const bytes = fs.readFileSync(real)
    if (bytes.length > maxBytes) throw errno('EFBIG', `${quoted(given)} is larger than ${maxBytes} bytes`)
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  /** The names in a folder inside the project, sorted; empty when there is no such folder. */
  folderNames(given: string): string[] {
    const { real, missing } = this.locate(given)
    if (missing > 0 || !fs.statSync(real).isDirectory()) return []
    return fs.readdirSync(real).sort()
  }

  /** The text of a file, or null when there is none. */
  readTextIfThere(given: string): string | null {
    try {
      return this.readText(given).text
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return null
      throw error
    }
  }

  /**
   * Whether the entry itself is a symbolic link, or a file with other names (a hard link, which
   * can't be told from the original and may be outside the project). Its folder is followed
   * and checked first.
   */
  isLinked(given: string): boolean {
    const { real: folder, missing } = this.locate(path.dirname(separated(given)))
    if (missing > 0) return false
    try {
      const entry = fs.lstatSync(path.join(folder, path.basename(separated(given))))
      return entry.isSymbolicLink() || (entry.isFile() && entry.nlink > 1)
    } catch (error) {
      if (codeOf(error) === 'ENOENT') return false
      throw error
    }
  }

  /**
   * Writes a file atomically: readers see the old contents or all of the new. The folders above
   * it that don't exist are made first, inside the project (CMD-19); a name on the way that is a
   * file refuses with `ENOTDIR`. An existing link inside the project is followed: its target is replaced. Written
   * files can be read only by their owner. Returns the real path written.
   */
  writeFile(given: string, data: string | Uint8Array): string {
    const real = this.writable(given)
    fs.mkdirSync(path.dirname(real), { recursive: true })
    atomicWriteFile(real, data)
    return real
  }

  /**
   * Checks, writing nothing, what `writeFile` checks before it writes: no name on the way is a
   * file and the name is not a folder. Folders that are not there are made by `writeFile`, not
   * here. Throws as `writeFile` does; returns the real path.
   */
  writable(given: string): string {
    const { real, missing } = this.locate(given)
    if (missing > 0) {
      // The deepest folder that exists must be a folder: a file in its place can't hold the path.
      let above = real
      for (let i = 0; i < missing; i++) above = path.dirname(above)
      if (!fs.statSync(above).isDirectory()) throw errno('ENOTDIR', `a name on the way to ${quoted(given)} is a file, not a folder`)
    }
    if (missing === 0 && fs.statSync(real).isDirectory()) throw errno('EISDIR', `${quoted(given)} is a folder`)
    return real
  }

  /**
   * Adds text to the end of a file, making it when it isn't there. Keeps the file's mode.
   * Refused for a file with other names: appending writes through a hard link.
   */
  appendText(given: string, text: string): string {
    const { real, missing } = this.locate(given)
    if (missing > 1) throw errno('ENOENT', `the folder of ${quoted(given)} does not exist`)
    if (missing === 0 && fs.statSync(real).nlink > 1) throw this.refused(given, 'it is a hard link, which may also be a file outside the project')
    fs.appendFileSync(real, text, 'utf8')
    return real
  }

  /** Whether something is there: a file, a folder, or a link that leads inside the project. */
  exists(given: string): boolean {
    return this.locate(given).missing === 0
  }

  /**
   * Writes a new file, and never replaces one: errors with `EEXIST` as `code` when the name is
   * taken, even by a file made a moment ago. Its folder must exist. Readable by its owner only.
   * Returns the real path written.
   */
  createFile(given: string, data: string | Uint8Array): string {
    const { real, missing } = this.locate(given)
    if (missing > 1) throw errno('ENOENT', `the folder of ${quoted(given)} does not exist`)
    if (missing === 0) throw errno('EEXIST', `${quoted(given)} is already there`)
    const fd = fs.openSync(real, 'wx', 0o600)
    try {
      fs.writeFileSync(fd, data)
      fs.fsyncSync(fd)
    } catch (error) {
      fs.closeSync(fd)
      fs.rmSync(real, { force: true })
      throw error
    }
    fs.closeSync(fd)
    return real
  }

  /** Makes one folder when it isn't there; its parent must exist. Returns its real path. */
  makeFolder(given: string): string {
    const { real, missing } = this.locate(given)
    if (missing > 1) throw errno('ENOENT', `the folder above ${quoted(given)} does not exist`)
    if (missing === 1) fs.mkdirSync(real)
    else if (!fs.statSync(real).isDirectory()) throw errno('ENOTDIR', `${quoted(given)} is a file, not a folder`)
    return real
  }

  /** A real path inside the project, relative to the project folder, with `/` between names. */
  relative(real: string): string {
    return path.relative(this.folder, real).split(path.sep).join('/')
  }

  /** A real path as a person sees it: relative to the folder Grid runs in when it is inside it. */
  shown(real: string): string {
    const rel = path.relative(this.cwd.real, real)
    return rel && isInside(this.cwd.real, real) ? rel : real
  }
}

/**
 * The project folder: `given` (from `--project`), resolved against `cwd`, or else `cwd`.
 * Refused when it isn't an existing folder, or is the top of a disk or the home folder.
 *
 * Relative paths start from `cwd` for the command, as in any shell, and from the project
 * folder for the tool server, which a host may start anywhere.
 */
export function openProject(given: string | undefined, cwd: string, relativeTo: RelativeTo = 'cwd'): Project {
  const cwdProblem = addressProblem(cwd)
  if (given === undefined && cwdProblem) {
    throw new PathRefused(`Grid runs in ${quoted(cwd)}, which is refused as the project folder: ${cwdProblem}. Run Grid in the folder that holds the plan, or name that folder with --project <folder>.`)
  }
  const here = fs.realpathSync.native(cwd)
  const named = given === undefined ? `Grid runs in ${quoted(here)}` : `--project ${quoted(given)}`
  const fix = 'Run Grid in the folder that holds the plan, or name that folder with --project <folder>.'
  if (given !== undefined) {
    const problem = addressProblem(given)
    if (problem) throw new PathRefused(`${named} is refused: ${problem}. ${fix}`)
  }
  const wanted = path.resolve(cwd, separated(given ?? '.'))

  let folder: string
  try {
    folder = fs.realpathSync.native(wanted)
  } catch (error) {
    if (codeOf(error) === 'ENOENT' || codeOf(error) === 'ENOTDIR') throw new PathRefused(`${named}, but there is no such folder. ${fix}`)
    throw error
  }
  if (!fs.statSync(folder).isDirectory()) throw new PathRefused(`${named}, but that is a file, not a folder. ${fix}`)
  if (path.dirname(folder) === folder) {
    throw new PathRefused(`${named}, which is the top of a disk and can't be the project folder: Grid would read and write anywhere on it. ${fix}`)
  }
  const home = realFolder(homedir())
  if (home !== null && path.relative(home, folder) === '') {
    throw new PathRefused(`${named}, which is the home folder and can't be the project folder: Grid would read and write anywhere in it. ${fix}`)
  }
  return new Project({ real: folder, named: wanted }, { real: here, named: path.resolve(cwd) }, relativeTo)
}

/**
 * The project folder `grid init` starts: `given`, resolved against `cwd`, made when it isn't
 * there, or else `cwd`. Only the last folder is made: the folder above it must exist. Refused
 * as `openProject` refuses, and when the new folder's name is one `pathProblem` refuses.
 * `made` says whether the folder was made now.
 */
export function startProjectFolder(given: string | undefined, cwd: string): { readonly project: Project; readonly made: boolean } {
  if (given === undefined) return { project: openProject(undefined, cwd), made: false }
  const fix = 'Name the folder to start the project in.'
  const problem = addressProblem(given) ?? pathProblem(path.basename(separated(given)))
  if (problem) throw new PathRefused(`${quoted(given)} is refused as the project folder: ${problem}. ${fix}`)
  const wanted = path.resolve(cwd, separated(given))
  let made = false
  try {
    fs.mkdirSync(wanted)
    made = true
  } catch (error) {
    const code = codeOf(error)
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new PathRefused(`${quoted(given)} can't be made: the folder above it does not exist. Grid makes only the last folder. ${fix}`)
    }
    if (code === 'EACCES' || code === 'EPERM') throw new PathRefused(`${quoted(given)} can't be made: permission denied. ${fix}`)
    // Already there: openProject says whether it can be the project folder.
    if (code !== 'EEXIST') throw error
  }
  return { project: openProject(given, cwd), made }
}
