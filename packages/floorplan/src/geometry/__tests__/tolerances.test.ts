/**
 * The one table of tolerances and limits (MSG-15): every check reads it, every entry is Grid's
 * own check on the drawing, and no number that decides closeness or plausibility lives
 * anywhere else in the geometry, the validation or the schema.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOLERANCES, limit, tolerance, tolerancesAsStated, withTolerances } from '../tolerances'
import type { ToleranceEntry } from '../tolerances'
import { validatePlan } from '../validate'
import { buildingKind } from '../plausible'
import { exportPlan, EXPORT_FORMATS } from '../../export/planExport'
import { parseFloorPlan } from '../../types/floorplan'
import type { FloorPlan, Wall } from '../plan'
import { outline } from '../../test-support/outline'
import * as geometry from '../index'

const SOURCE = resolve(__dirname, '../..')

function sources(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === '__tests__' || name === 'export') continue
      out.push(...sources(path))
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/** The code without comments and string literals, which may name a figure without using it. */
const codeOf = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')

/**
 * A numeric tolerance literal: a number written with a negative exponent (1e-9), or a decimal
 * of a few centimetres or less (0.01, 0.002). Halves, shares like 0.9, sizes that draw the plan
 * and counts are not tolerances and are not looked for.
 */
/** The words a size that could be read as a requirement carries (MSG-18). */
const NOT_A_CODE_FIGURE = "Grid's own size, not a code figure"

const TOLERANCE_LITERAL = /(?<![\w.])(?:\d+(?:\.\d+)?e-\d+|0\.0\d*)(?![\w.])/g

describe('the tolerance table', () => {
  it('is the only place a numeric tolerance is written, in the geometry, validation, schema, rooms-first writing and the scan reader', () => {
    const files = [...sources(join(SOURCE, 'geometry')), ...sources(join(SOURCE, 'types')), ...sources(join(SOURCE, 'rooms')), ...sources(join(SOURCE, 'scan'))].filter(
      (file) => !file.endsWith(join('geometry', 'tolerances.ts'))
    )
    expect(files.length).toBeGreaterThan(30)
    const found = files.flatMap((file) =>
      [...codeOf(readFileSync(file, 'utf8')).matchAll(TOLERANCE_LITERAL)].map((m) => `${relative(SOURCE, file)}: ${m[0]}`)
    )
    expect(found).toEqual([])
  })

  it('finds a literal where one is written, so the test above can fail', () => {
    const code = codeOf("const a = 1e-9\nconst b = x < 0.01\n// 0.05 in a comment\nconst c = '0.002'\nconst d = 0.5\nconst e = 12.01")
    expect([...code.matchAll(TOLERANCE_LITERAL)].map((m) => m[0])).toEqual(['1e-9', '0.01'])
  })

  it('marks every entry as Grid\'s own drawing check, with a positive value and what it decides', () => {
    for (const [name, entry] of Object.entries(TOLERANCES)) {
      expect(entry.basis, name).toBe('grid-drawing-check')
      expect(['tolerance', 'limit', 'arithmetic'], name).toContain(entry.kind)
      expect(entry.decides.length, name).toBeGreaterThan(10)
      const values = 'values' in entry ? entry.values : [entry.value, (entry as ToleranceEntry).home ?? entry.value, (entry as ToleranceEntry).hall ?? entry.value]
      for (const value of values) expect(value >= 0 && Number.isFinite(value), name).toBe(true)
      // No entry cites a document: it has no field for one, and its words name none.
      expect(Object.keys(entry).sort(), name).toEqual(
        'values' in entry ? ['basis', 'decides', 'kind', 'unit', 'values'] : ['basis', 'decides', 'kind', 'unit', 'value', ...('home' in entry ? ['home'] : []), ...('hall' in entry ? ['hall'] : [])].sort()
      )
      // A size that could be read as a requirement says it is not one (MSG-18), in these words only.
      expect(entry.decides.replace(NOT_A_CODE_FIGURE, ''), name).not.toMatch(/\b(code|regulation|standard|clause|CTE|BS|DIN|IBC)\b/)
    }
  })

  it('holds the size a person passes through as Grid\'s own, saying it is not a code figure (MSG-18), the use indicators (CNT-13), the headroom bands (LVL-6), the hall of a first layout (BRF-6), the narrowest side of a room it draws from an area (WRT-61) and the low storey and stair door (LVL-18), and the smallest and narrowest rooms of a home (ARE-72)', () => {
    const passable = {
      passableWidth: 0.4,
      passableHeight: 1.2,
      passableSill: 0.3,
      passableRise: 0.3,
      useOpenLeaf: 0.05,
      useApproachDepth: 0.3,
      windowGlassKept: 1.2,
      useDoorwayClear: 0.8,
      usePassageWidth: 0.9,
      useTurningCircle: 1.5,
      useClearSpace: 0.6,
      headroomLow: 1.5,
      headroomFull: 2.2,
      layoutHall: 1.1,
      layoutNarrowest: 1.2,
      storeyLowest: 2,
      stairDoorLowest: 1.8,
      homeRoomNarrowest: 1.8,
      homeWetRoomNarrowest: 0.6
    } as const
    // ARE-72: a home's smallest rooms, in square metres, say it too.
    const areas = { homeRoomSmallest: 4, homeWetRoomSmallest: 0.8 } as const
    for (const [name, value] of Object.entries(areas)) {
      const entry: ToleranceEntry = TOLERANCES[name as keyof typeof areas]
      expect(entry, name).toMatchObject({ kind: 'limit', value, unit: 'm²', basis: 'grid-drawing-check' })
      expect(entry.decides.startsWith(`${NOT_A_CODE_FIGURE}.`), name).toBe(true)
    }
    for (const [name, value] of Object.entries(passable)) {
      const entry: ToleranceEntry = TOLERANCES[name as keyof typeof passable]
      expect(entry, name).toMatchObject({ kind: 'limit', value, unit: 'm', basis: 'grid-drawing-check' })
      expect(entry.decides.startsWith(`${NOT_A_CODE_FIGURE}.`), name).toBe(true)
    }
    // Only these carry the words: no other figure needs to say it is not one.
    const saying = Object.entries(TOLERANCES).filter(([, entry]) => entry.decides.includes(NOT_A_CODE_FIGURE)).map(([name]) => name)
    expect(saying.sort()).toEqual([...Object.keys(passable), ...Object.keys(areas)].sort())
  })

  it('holds the three figures MSG-15 names', () => {
    expect(TOLERANCES.openingOverrun.value).toBe(0.001)
    expect(TOLERANCES.gap.value).toBe(0.02)
    expect(TOLERANCES.areaEqual.value).toBe(1e-6)
  })

  it('is stated in docs/tolerances.md, entry by entry, with the value Grid uses', () => {
    const readme = readFileSync(resolve(SOURCE, '../../../docs/tolerances.md'), 'utf8')
    for (const [name, entry] of Object.entries(TOLERANCES)) {
      if (entry.kind === 'arithmetic' || !('value' in entry)) continue
      const figures = [
        ...('home' in entry ? [`${String((entry as ToleranceEntry).home)} in a home`] : []),
        ...('hall' in entry ? [`${String((entry as ToleranceEntry).hall)} in a hall`] : [])
      ]
      const home = figures.length > 0 ? ` (${figures.join(', ')})` : ''
      expect(readme, name).toContain(`| \`${name}\` | ${entry.kind} | ${String(entry.value)} ${entry.unit}${home} |`)
    }
  })

  it('is exported from the geometry', () => {
    expect(geometry.TOLERANCES).toBe(TOLERANCES)
    expect(typeof geometry.withTolerances).toBe('function')
  })
})

describe('adjusting the table for a survey', () => {
  it('changes an entry for what runs inside, and puts it back after, even when that throws', () => {
    expect(tolerance('openingOverrun')).toBe(0.001)
    const inside = withTolerances({ openingOverrun: 0.01 }, () => [tolerance('openingOverrun'), tolerancesAsStated()])
    expect(inside).toEqual([0.01, false])
    expect(() =>
      withTolerances({ gap: 0.05 }, () => {
        throw new Error('boom')
      })
    ).toThrow('boom')
    expect(tolerance('gap')).toBe(0.02)
    expect(tolerancesAsStated()).toBe(true)
  })

  it('nests: an inner change keeps what the outer one left in force', () => {
    const seen = withTolerances({ gap: 0.05 }, () =>
      withTolerances({ openingOverrun: 0.01 }, () => [tolerance('gap'), tolerance('openingOverrun')])
    )
    expect(seen).toEqual([0.05, 0.01])
  })

  it('refuses to change an arithmetic guard, a name that is not there, or a value that is not one', () => {
    const run = (): number => 1
    expect(() => withTolerances({ noLength: 1 } as never, run)).toThrow(/rounding noise and cannot be adjusted/)
    expect(() => withTolerances({ nothing: 1 } as never, run)).toThrow(/no tolerance named "nothing"/)
    expect(() => withTolerances({ gap: -1 }, run)).toThrow(/positive finite number/)
    expect(() => withTolerances({ gap: Infinity }, run)).toThrow(/positive finite number/)
  })

  it('uses a home figure only in a home, and a change replaces it for every building', () => {
    expect(limit('wallHighest')).toBe(40)
    expect(limit('wallHighest', 'home')).toBe(10)
    expect(withTolerances({ wallHighest: 20 }, () => limit('wallHighest', 'home'))).toBe(20)
  })

  it('uses a hall figure only in a hall, and the plain one where an entry has none (WRT-22)', () => {
    expect(limit('roomsSideAsked')).toBe(200)
    expect(limit('roomsSideAsked', 'home')).toBe(50)
    expect(limit('roomsSideAsked', 'hall')).toBe(1000)
    expect(limit('typicalHeightHighest', 'hall')).toBe(30)
    expect(limit('wallThickest', 'hall')).toBe(3)
    expect(withTolerances({ roomsSideAsked: 300 }, () => limit('roomsSideAsked', 'hall'))).toBe(300)
  })

  it('reads a home from the rooms the plan says are lived in', () => {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const planWith = (use: string | undefined): FloorPlan => parseFloorPlan({ walls, rooms: [{ ...room, use }] })
    expect(buildingKind(planWith('bedroom'))).toBe('home')
    expect(buildingKind(planWith('living'))).toBe('home')
    expect(buildingKind(planWith('storage'))).toBe('any')
    expect(buildingKind(planWith(undefined))).toBe('any')
  })

  it('reads a building of large halls from the kind of building the plan or a floor says it is (WRT-22)', () => {
    const { walls, room: bare } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const room = { ...bare, use: 'storage' }
    for (const kind of ['assembly', 'sport', 'industry', 'warehouse'] as const) {
      expect(buildingKind(parseFloorPlan({ walls, rooms: [room], building: kind }))).toBe('hall')
      expect(buildingKind(parseFloorPlan({ walls, rooms: [room], floors: [{ id: 'ground', name: 'Ground', level: 0, building: kind }] }))).toBe('hall')
    }
    expect(buildingKind(parseFloorPlan({ walls, rooms: [{ ...room, use: 'bedroom' }], building: 'warehouse' }))).toBe('hall')
    expect(buildingKind(parseFloorPlan({ walls, rooms: [room], building: 'office' }))).toBe('any')
    expect(buildingKind(parseFloorPlan({ walls, rooms: [room], building: 'parking' }))).toBe('any')
  })
})

describe('no export holds a non-number (lab T-7, MS-3)', () => {
  const options = { projectId: 'p', projectName: 'Huge', now: new Date('2026-01-01T00:00:00Z') }

  /** A sound room beside walls of every size validation refuses, built in code past the schema. */
  function huge(): FloorPlan {
    const { walls, room } = outline([[0, 0], [5, 0], [5, 4], [0, 4]])
    const extra: Wall[] = [
      { id: 'thick', start: [10, 0], end: [14, 0], thickness: 1e308, height: 2.7, kind: 'interior' as const },
      { id: 'tall', start: [10, 2], end: [14, 2], thickness: 0.2, height: 1e9, kind: 'interior' as const },
      { id: 'far', start: [1e21, 0], end: [1e21, 4], thickness: 0.2, height: 2.7, kind: 'interior' as const },
      { id: 'inf', start: [Infinity, 0], end: [20, 0], thickness: 0.2, height: 2.7, kind: 'interior' as const }
    ]
    return { version: '1', units: 'm', walls: [...walls, ...extra], rooms: [room], openings: [] }
  }

  it('refuses each of those walls, and keeps the sound room', () => {
    const result = validatePlan(huge())
    expect([...result.broken].sort()).toEqual(['far', 'inf', 'tall', 'thick'])
    expect(result.issues.filter((i) => i.code === 'wall/too-large').map((i) => i.id)).toEqual(['thick', 'tall', 'far', 'inf'])
  })

  it.each(EXPORT_FORMATS)('writes %s with no Infinity and no NaN in it', (format) => {
    const { data } = exportPlan(huge(), format, options)
    // A GLB's text is its JSON chunk: 12 bytes of header, then the chunk's length and type.
    const bytes = typeof data === 'string' ? null : data
    const text = bytes === null ? (data as string) : new TextDecoder().decode(bytes.subarray(20, 20 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(12, true)))
    expect(text).not.toMatch(/Infinity|NaN/)
    if (format === 'glb') {
      // The bounds are numbers: JSON writes a non-number as null.
      const json = JSON.parse(text) as { accessors?: { min?: unknown[]; max?: unknown[] }[] }
      for (const accessor of json.accessors ?? []) {
        for (const bound of [...(accessor.min ?? []), ...(accessor.max ?? [])]) expect(typeof bound).toBe('number')
      }
    }
    if (format !== 'ifc') expect(text.length).toBeGreaterThan(100)
  })
})
