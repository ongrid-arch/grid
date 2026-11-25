/**
 * MSG-11: `grid check` in Spanish, run the way a person runs it: the built file, as its own Node
 * process, in a temporary folder. The report starts with the Spanish label, writes its figures
 * with a decimal comma and the room uses by their Spanish names, keeps each room's name as the
 * plan writes it, and no line of it reads as a pass or as approval.
 */
import { spawnSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { approvalWords, GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'

const cli = resolve(__dirname, '../../..')
const bundle = join(cli, 'dist', 'grid.mjs')
const SPANISH_LABEL = 'Orientación general, no sus normas locales'

const made: string[] = []
let dir: string

interface Plan {
  rooms: { id: string; name: string; use?: string }[]
  display?: Record<string, unknown>
  site?: Record<string, unknown>
}

/** The two-bed flat with its uses written in Spanish, one bedroom named "dormitorio" and one shrunk name, and a use Grid does not know. */
function spanishPlan(): Plan {
  const plan = JSON.parse(readFileSync(join(cli, 'fixtures', 'tiny-loft.json'), 'utf8')) as Plan
  for (const room of plan.rooms) {
    if (room.use === 'bedroom') {
      room.use = 'Dormitorio'
      room.name = 'dormitorio'
    }
    if (room.use === 'living') room.use = 'salón'
  }
  // COD-3: the room sizes are checked only where the plan states its place.
  plan.site = { ...plan.site, country: 'US' }
  return plan
}

beforeAll(() => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-language-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(spanishPlan(), null, 2))
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function grid(args: readonly string[]): { status: number | null; out: string; err: string } {
  const run = spawnSync(process.execPath, [bundle, ...args], { cwd: dir, timeout: 30_000 })
  if (run.error) throw run.error
  return { status: run.status, out: run.stdout.toString('utf8'), err: run.stderr.toString('utf8') }
}

describe('grid check --lang es (MSG-11)', () => {
  it('prints the Spanish label, decimal commas and Spanish use names, and keeps room names as written', () => {
    const run = grid(['check', 'plan.json', '--lang', 'es', '--full'])
    expect(run.status).toBe(0)
    const lines = run.out.split('\n')
    expect(lines[0]).toBe(SPANISH_LABEL)
    // A figure from a code, and a room's size, with a decimal comma.
    expect(run.out).toMatch(/6,5 m²/)
    expect(run.out).not.toMatch(/\b\d+\.\d+ m²/)
    // The uses Grid knows, by their Spanish names, where a line lists them; the check words in Spanish.
    expect(run.out).toContain('Comprobaciones hechas')
    expect(run.out).toMatch(/dormitorios, salones y comedores/)
    expect(run.out).not.toContain('worth a look')
    // The room's own name, as the plan writes it.
    expect(run.out).toContain('"dormitorio"')
    const plan = spanishPlan()
    expect(approvalWords(run.out, plan.rooms.flatMap((r) => [r.id, r.name]))).toEqual([])
  })

  it('checks a room whose use is "dormitorio" as a bedroom', () => {
    const run = grid(['check', 'plan.json', '--lang', 'es', '--json'])
    expect(run.status).toBe(0)
    const result = JSON.parse(run.out) as { label: string; language: string; result: { label: string; lines: { code: string; message: string; values?: Record<string, unknown> }[]; coverage: { ruleId: string; lookedAt: { ids: string[] }[] }[] } }
    expect(result.label).toBe(SPANISH_LABEL)
    expect(result.language).toBe('es')
    expect(result.result.label).toBe(SPANISH_LABEL)
    expect(result.result.lines.map((l) => l.code)).not.toContain('plan/unknown-use')
    const bedroom = spanishPlan().rooms.find((r) => r.name === 'dormitorio')!
    const sizes = result.result.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(sizes.lookedAt.flatMap((g) => g.ids)).toContain(bedroom.id)
  })

  it("writes in the plan's own language when it states one, and English when asked", () => {
    const plan = spanishPlan()
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...plan, display: { language: 'es' } }))
    expect(grid(['check', 'plan.json']).out.split('\n')[0]).toBe(SPANISH_LABEL)
    expect(grid(['check', 'plan.json', '--lang', 'en']).out.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    writeFileSync(join(dir, 'plan.json'), JSON.stringify({ ...plan, display: { language: 'es', decimal: 'point' } }))
    expect(grid(['check', 'plan.json', '--full']).out).toMatch(/6\.5 m²/)
  })

  // MSG-24: any language is taken, in the plan's own words for it, else in English.
  it('writes a language Grid ships no words for in English, and refuses a word that is no language tag, by name', () => {
    const french = grid(['check', 'plan.json', '--lang', 'fr'])
    expect(french.status).toBe(0)
    expect(french.out.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    const run = grid(['check', 'plan.json', '--lang', 'Français'])
    expect(run.status).not.toBe(0)
    expect(run.out).toBe('')
    expect(run.err).toContain('--lang')
    expect(run.err).toContain('language tag')
  })
})
