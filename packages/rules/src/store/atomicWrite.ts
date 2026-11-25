import fs from 'fs'
import { randomBytes } from 'crypto'
import path from 'path'

export interface AtomicWriteOptions {
  /**
   * Readable by its owner only (0600), whatever the umask and the file's mode before: for the
   * rules store, kept on this computer for this user. Otherwise a new file gets the mode the
   * person's umask gives (0644 under the usual 022) and a replaced file keeps its own (CMD-30).
   */
  readonly ownerOnly?: boolean
}

/** The mode of the file there, or null when there is none to replace. */
function modeThere(target: string): number | null {
  try {
    const entry = fs.statSync(target)
    return entry.isFile() ? entry.mode & 0o777 : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

/** The refusal of a file whose owner may not write it, with `EACCES` as `code`, as the system would give. */
function readOnly(target: string): NodeJS.ErrnoException {
  const error: NodeJS.ErrnoException = new Error(`${JSON.stringify(path.basename(target))} is read-only, so Grid leaves it as it is`)
  error.code = 'EACCES'
  return error
}

/**
 * Grid's one atomic file writer (QAR-6): the rules store and the `grid` command's project
 * resolver both write through it. Readers see either the old contents or the fully flushed
 * replacement. It opens a new file with O_EXCL beside the target, flushes it, then renames it
 * over the target. The caller decides which path may be written.
 *
 * CMD-30: a file whose owner has no write permission (`chmod 444`) is refused with `EACCES`
 * and left as it is; the rename would otherwise replace it, as a folder the person may write
 * lets it. A file replaced keeps its mode; a new one gets the umask's.
 */
export function atomicWriteFile(target: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): void {
  const before = modeThere(target)
  if (before !== null && (before & 0o200) === 0) throw readOnly(target)
  // A short name of its own, so a long file name still fits once the temporary name is added.
  const temporary = path.join(path.dirname(target), `.grid-${randomBytes(6).toString('hex')}.tmp`)
  let fd: number | undefined = fs.openSync(temporary, 'wx', options.ownerOnly === true ? 0o600 : 0o666)
  try {
    // Set after opening, so the umask does not narrow it: the mode the file had is the person's.
    if (options.ownerOnly === true) fs.fchmodSync(fd, 0o600)
    else if (before !== null && process.platform !== 'win32') fs.fchmodSync(fd, before)
    fs.writeFileSync(fd, data)
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = undefined
    fs.renameSync(temporary, target)
  } catch (error) {
    try {
      if (fd !== undefined) fs.closeSync(fd)
    } finally {
      fs.rmSync(temporary, { force: true })
    }
    throw error
  }
}

/** The rules store's writer: JSON, readable by its owner only. */
export function atomicWriteJson(target: string, data: unknown): void {
  atomicWriteFile(target, JSON.stringify(data, null, 2), { ownerOnly: true })
}
