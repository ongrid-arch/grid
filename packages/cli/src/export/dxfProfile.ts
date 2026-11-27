/**
 * HND-1: the office's DXF profile, read from the project folder.
 *
 * A project that wants its own layer names and pens in the DXF holds them in one file beside
 * `grid.json`, `dxf-layers.json` (the format is the core's `readDxfProfile`). It is read the one
 * way every file is (`projectFiles.ts`): inside the project, never through a link out of it.
 * With no file, the DXF uses Grid's neutral profile. A file that is there and wrong refuses the
 * export, naming each part that is wrong, so a file never goes out with pens nobody chose.
 */
import path from 'path'
import { readDxfProfile, type DxfProfile } from '@ongrid/floorplan/geometry'
import { PathRefused, type Project } from '../fs/projectFiles'

/** The profile's file, in the project folder. */
export const DXF_PROFILE_FILE = 'dxf-layers.json'

/** A profile is a short table; a larger file is not one. */
export const DXF_PROFILE_MAX_BYTES = 64 * 1024

/** Why the profile could not be used. The message is one line. */
export class DxfProfileRefused extends Error {
  override readonly name = 'DxfProfileRefused'
}

/**
 * The project's profile and its file, or null when the project has none. VEW-72: `scaleStated`
 * says whether the file states its scale; one that does not leaves the DXF to the largest
 * standard scale the plan fits at.
 */
export function projectDxfProfile(project: Project): { readonly profile: DxfProfile; readonly file: string; readonly scaleStated: boolean } | null {
  const file = path.join(project.folder, DXF_PROFILE_FILE)
  const refuse = (why: string): never => {
    throw new DxfProfileRefused(`${DXF_PROFILE_FILE} in the project folder ${why}. Fix it, or move it away to use Grid's own layers; no file was written.`)
  }
  let read: { readonly text: string; readonly real: string }
  try {
    read = project.readText(file, DXF_PROFILE_MAX_BYTES)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return null
    if (error instanceof PathRefused) throw error
    if (code === 'EFBIG') return refuse(`is larger than ${DXF_PROFILE_MAX_BYTES / 1024} KB, too large for a profile`)
    if (code === 'EISDIR') return refuse('is a folder, not a file')
    return refuse("can't be read as text")
  }
  let value: unknown
  try {
    value = JSON.parse(read.text)
  } catch {
    return refuse('is not JSON')
  }
  const reading = readDxfProfile(value)
  if ('problems' in reading) return refuse(`is not a profile Grid can use: ${reading.problems.join('; ')}`)
  const scaleStated = typeof value === 'object' && value !== null && Object.hasOwn(value, 'scale')
  return { profile: reading.profile, file: project.relative(read.real), scaleStated }
}
