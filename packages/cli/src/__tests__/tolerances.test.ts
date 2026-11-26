import { readdirSync, readFileSync } from 'fs'
import { join, relative, resolve } from 'path'
import { describe, expect, it } from 'vitest'

/**
 * MSG-15: the command and the views read their tolerances from the table in
 * `@ongrid/floorplan` (`tolerance()`), as the geometry does. A small number written as
 * `1e-6` in their source is a tolerance of their own; this test fails on one, unless it is
 * listed below with why it stays.
 */

const packages = resolve(__dirname, '../../..')
const SCANNED = ['cli/src', 'viewer/src']

/** Literals that stay, by file and line text, each with why. */
const ALLOWED: ReadonlyArray<readonly [file: string, text: string, why: string]> = [
  ['cli/src/describe/facts.ts', 'export const ALONG_WALL_SINE = 1e-3', 'no entry in the table yet; reviews/MSG-15.md asks for one'],
  ['cli/src/edit/edits.ts', 'Math.abs(dot(n, out) - 1) < 1e-3', 'a cosine, not a length; no entry in the table yet (reviews/MSG-15.md)'],
  ['cli/src/edit/edits.ts', 'oldAxis.dir) - 1) > 1e-6', 'a cosine, not a length; no entry in the table yet (reviews/MSG-15.md)'],
  // CMD-43: the zero guards of a determinant, not lengths.
  ['cli/src/drawing/faces.ts', 'Math.abs(den) < 1e-12 * Ls * Lt', 'a cross product\'s zero guard, scaled by the lengths, not a length'],
  ['cli/src/drawing/ifc.ts', 'Math.abs(d) < 1e-12) return [a, c]', 'a determinant\'s zero guard for three points in a line, not a length'],
  ['cli/src/edit/fit.ts', 'Math.abs(cosine - to) < 1e-3', 'a cosine, not a length, as moveRoomSide reads a side; no entry in the table yet (reviews/MSG-15.md)'],
]

const SMALL = /(?<![\w.])\d+(?:\.\d+)?e-\d+\b/

function sources(folder: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') out.push(...sources(path))
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(path)
    }
  }
  return out
}

/** The code without its comments, so a comment can name a figure. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '')
}

describe('tolerances in the command and the views', () => {
  it('come from the table in @ongrid/floorplan', () => {
    const found: string[] = []
    for (const scanned of SCANNED) {
      for (const file of sources(join(packages, scanned))) {
        const name = relative(packages, file).split('\\').join('/')
        code(readFileSync(file, 'utf8')).split('\n').forEach((line, i) => {
          if (!SMALL.test(line)) return
          if (ALLOWED.some(([f, text]) => f === name && line.includes(text))) return
          found.push(`${name}:${i + 1}: ${line.trim()}`)
        })
      }
    }
    expect(found).toEqual([])
  })

  it('lists no literal that is gone', () => {
    for (const [file, text] of ALLOWED) {
      expect(readFileSync(join(packages, file), 'utf8'), file).toContain(text)
    }
  })
})
