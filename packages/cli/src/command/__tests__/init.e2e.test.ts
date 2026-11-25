import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { starterPlanText } from '../init'

/**
 * CMD-6: `grid init` starts a project folder, and inside one `check`, `draw` and `export` need
 * no plan file. Run as a person runs it: the built file, as its own Node process, in a
 * temporary folder.
 */

const cli = resolve(__dirname, '../../..')
const bundle = join(cli, 'dist', 'grid.mjs')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const made: string[] = []
let base: string

beforeAll(() => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
})

beforeEach(() => {
  base = mkdtempSync(join(tmpdir(), 'grid-init-'))
  made.push(base)
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

interface Run {
  readonly status: number | null
  readonly out: string
  readonly err: string
}

function grid(args: readonly string[], cwd: string, env: NodeJS.ProcessEnv = process.env): Run {
  const run = spawnSync(process.execPath, [bundle, ...args], { cwd, env })
  if (run.error) throw run.error
  return { status: run.status, out: run.stdout.toString('utf8'), err: run.stderr.toString('utf8') }
}

/** Every entry under a folder, folders ending in `/`, sorted. */
function tree(folder: string, prefix = ''): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`
    return entry.isDirectory() ? [`${name}/`, ...tree(join(folder, entry.name), `${name}/`)] : [name]
  }).sort()
}

/** Each file's bytes and modification time, to show nothing was touched. */
function snapshot(folder: string): Record<string, string> {
  return Object.fromEntries(tree(folder).filter((name) => !name.endsWith('/')).map((name) => {
    const file = join(folder, name)
    return [name, `${statSync(file).mtimeMs} ${readFileSync(file).toString('base64')}`]
  }))
}

function expectRefusal(run: Run, status: number, ...parts: string[]): void {
  expect(run.status).toBe(status)
  expect(run.out).toBe('')
  expect(run.err.trimEnd().split('\n')).toHaveLength(1)
  for (const part of parts) expect(run.err).toContain(part)
}

const LAYOUT = ['.gitignore', 'exports/', 'grid.json', 'plan.json']

describe('grid init <folder>', () => {
  it('makes the folder with grid.json, the starter plan, exports/ and the ignore line, and says what it made', () => {
    const run = grid(['init', 'demo'], base)
    expect(run.status).toBe(0)
    expect(run.err).toBe('')
    const demo = join(base, 'demo')
    expect(tree(demo)).toEqual(LAYOUT)
    expect(readFileSync(join(demo, '.gitignore'), 'utf8')).toBe('exports/\n')
    const marker = JSON.parse(readFileSync(join(demo, 'grid.json'), 'utf8')) as Record<string, unknown>
    expect(Object.keys(marker)).toEqual(['version', 'projectId'])
    expect(marker.version).toBe('1')
    expect(marker.projectId).toMatch(UUID)
    // QAR-5: the plan stores the same id, which the IFC builds its identities from.
    expect(readFileSync(join(demo, 'plan.json'), 'utf8')).toBe(starterPlanText(marker.projectId as string))
    expect((JSON.parse(readFileSync(join(demo, 'plan.json'), 'utf8')) as { projectId: unknown }).projectId).toBe(marker.projectId)

    const lines = run.out.split('\n')
    expect(lines[0]).toBe('Made a Grid project in demo:')
    for (const name of LAYOUT) expect(run.out).toMatch(new RegExp(`^  ${name.replace('.', '\\.')} `, 'm'))
    expect(run.out).toContain('rules store')
    expect(run.out).toContain('Next: cd demo && grid check')
  })

  it('gives every project its own id', () => {
    grid(['init', 'one'], base)
    grid(['init', 'two'], base)
    const id = (folder: string): unknown => (JSON.parse(readFileSync(join(base, folder, 'grid.json'), 'utf8')) as { projectId: unknown }).projectId
    expect(id('one')).not.toBe(id('two'))
  })

  it('refuses a second time, says why, and changes nothing', () => {
    expect(grid(['init', 'demo'], base).status).toBe(0)
    const demo = join(base, 'demo')
    const before = snapshot(demo)
    expectRefusal(grid(['init', 'demo'], base), 1, '"demo" is already a Grid project', 'grid.json', 'changed nothing')
    expectRefusal(grid(['init'], demo), 1, 'is already a Grid project')
    expect(snapshot(demo)).toEqual(before)
  })

  it('starts a project in an empty folder that is already there', () => {
    mkdirSync(join(base, 'empty'))
    const run = grid(['init', 'empty'], base)
    expect(run.status).toBe(0)
    expect(run.out.split('\n')[0]).toBe('Started a Grid project in empty:')
    expect(tree(join(base, 'empty'))).toEqual(LAYOUT)
  })

  it('adds its own files to a folder of other files, and keeps what is there', () => {
    const folder = join(base, 'existing')
    mkdirSync(folder)
    writeFileSync(join(folder, 'notes.txt'), 'a note')
    writeFileSync(join(folder, '.gitignore'), 'node_modules/')
    const run = grid(['init', 'existing'], base)
    expect(run.status).toBe(0)
    expect(tree(folder)).toEqual([...LAYOUT, 'notes.txt'].sort())
    expect(readFileSync(join(folder, 'notes.txt'), 'utf8')).toBe('a note')
    expect(readFileSync(join(folder, '.gitignore'), 'utf8')).toBe('node_modules/\nexports/\n')
  })

  it('keeps an exports folder that is there, with what it holds', () => {
    const folder = join(base, 'kept')
    mkdirSync(join(folder, 'exports'), { recursive: true })
    writeFileSync(join(folder, 'exports', 'old.dxf'), 'old')
    expect(grid(['init', 'kept'], base).status).toBe(0)
    expect(readFileSync(join(folder, 'exports', 'old.dxf'), 'utf8')).toBe('old')
  })

  it('refuses a folder that holds a plan.json, and writes nothing', () => {
    const folder = join(base, 'has-plan')
    mkdirSync(folder)
    writeFileSync(join(folder, 'plan.json'), '{}')
    expectRefusal(grid(['init', 'has-plan'], base), 1, 'already holds a plan.json', 'never replaces a file')
    expect(tree(folder)).toEqual(['plan.json'])
    expect(readFileSync(join(folder, 'plan.json'), 'utf8')).toBe('{}')
  })

  it('refuses a folder that holds a file named exports, and writes nothing', () => {
    const folder = join(base, 'file-exports')
    mkdirSync(folder)
    writeFileSync(join(folder, 'exports'), 'a file')
    expectRefusal(grid(['init', 'file-exports'], base), 1, 'a file named exports', 'changed nothing')
    expect(tree(folder)).toEqual(['exports'])
  })

  it('makes only the last folder: refused when the folder above is missing', () => {
    expectRefusal(grid(['init', join('missing', 'demo')], base), 1, 'the folder above it does not exist')
    expect(tree(base)).toEqual([])
  })

  it('refuses a file where the folder would go', () => {
    writeFileSync(join(base, 'taken'), 'x')
    expectRefusal(grid(['init', 'taken'], base), 1, 'a file, not a folder')
  })

  it('refuses names the resolver refuses, and the home folder, and writes nothing', () => {
    expectRefusal(grid(['init', 'NUL'], base), 1, 'a name Windows keeps for a device')
    expectRefusal(grid(['init', 'https://example.invalid/x'], base), 1, 'is an address')
    const home = join(base, 'home')
    mkdirSync(home)
    expectRefusal(grid(['init'], home, { ...process.env, HOME: home, USERPROFILE: home }), 1, 'the home folder')
    expect(tree(base)).toEqual(['home/'])
  })

  it.each([
    [['init', 'a', 'b'], 'init takes one folder, but was given 2'],
    [['init', 'demo', '--project', 'demo'], 'init has no option "--project"'],
    [['init', '--force'], 'init has no option "--force"'],
    [['init', '-'], 'not standard input'],
    [['init', '--help', '--help'], '--help was given more than once'],
  ])('%j is refused by name, with exit 2', (args, reason) => {
    expectRefusal(grid(args, base), 2, reason)
    expect(tree(base)).toEqual([])
  })

  it('shows its help', () => {
    const run = grid(['init', '--help'], base)
    expect(run.status).toBe(0)
    expect(run.out.startsWith('Usage: grid init [<folder>]')).toBe(true)
    expect(grid(['--help'], base).out).toContain('init    Starts a project folder')
    expect(grid(['--help'], base).out).toContain('a folder that holds grid.json')
  })
})

describe('the starter plan', () => {
  const plan = JSON.parse(starterPlanText()) as {
    rooms: Array<{ use?: string }>
    openings: Array<{ type: string; hinge?: string; swing?: string }>
  }

  it('is a two-room flat that says what each room is for and which way each door opens', () => {
    expect(plan.rooms).toHaveLength(2)
    expect(plan.rooms.map((room) => room.use).sort()).toEqual(['bedroom', 'living'])
    const doors = plan.openings.filter((opening) => opening.type === 'door')
    expect(doors.length).toBeGreaterThan(0)
    for (const door of doors) {
      expect(door.hinge).toBeDefined()
      expect(door.swing).toBeDefined()
    }
  })
})

describe('inside a project grid init made', () => {
  let demo: string
  beforeEach(() => {
    expect(grid(['init', 'demo'], base).status).toBe(0)
    demo = join(base, 'demo')
  })

  it('grid check reads plan.json with no path: the label first, no problems, and every room checked', () => {
    const run = grid(['check'], demo)
    expect(run.status).toBe(0)
    expect(run.out.split('\n')[0]).toBe(GENERAL_GUIDANCE_LABEL)
    expect(run.out).toContain('To look at: nothing.')
    expect(run.out).not.toContain('Not checked')
    expect(run.out).not.toContain('Problems in the drawing')
    expect(run.out).toBe(grid(['check', 'plan.json'], demo).out)
  })

  it('grid check --json: 0 issues, and nothing left unchecked', () => {
    const run = grid(['check', '--json'], demo)
    expect(run.status).toBe(0)
    const result = JSON.parse(run.out) as { issues: unknown[]; report: { notChecked: unknown[]; findings: unknown[]; rules: Array<{ id: string }> } }
    expect(result.issues).toEqual([])
    expect(result.report.findings).toEqual([])
    expect(result.report.notChecked).toEqual([])
    expect(result.report.rules.length).toBeGreaterThan(0)
  })

  it('grid export --format dxf writes only exports/plan.dxf', () => {
    const before = snapshot(demo)
    const run = grid(['export', '--format', 'dxf'], demo)
    expect(run.status).toBe(0)
    expect(run.out).toBe(`Wrote ${join('exports', 'plan.dxf')}\n`)
    expect(run.err).toBe('')
    expect(tree(demo)).toEqual([...LAYOUT, 'exports/plan.dxf'].sort())
    expect(snapshot(demo)).toMatchObject(before)
    expect(readFileSync(join(demo, 'exports', 'plan.dxf'), 'utf8')).toContain('SECTION')
  })

  it.each(['ifc', 'glb', 'obj'])('grid export --format %s writes into exports/', (format) => {
    expect(grid(['export', '--format', format], demo).status).toBe(0)
    expect(tree(join(demo, 'exports'))).toEqual([`plan.${format}`])
  })

  it('QAR-5 gives the IFC the same identities whatever the plan file is called', () => {
    writeFileSync(join(demo, 'House.json'), readFileSync(join(demo, 'plan.json')))
    expect(grid(['export', '--format', 'ifc'], demo).status).toBe(0)
    expect(grid(['export', '--format', 'ifc', 'House.json'], demo).status).toBe(0)
    const guids = (name: string): string[] =>
      [...readFileSync(join(demo, 'exports', name), 'utf8').matchAll(/^#\d+=IFC\w+\('([0-9A-Za-z_$]{22})'/gm)].map((m) => m[1]!)
    expect(guids('plan.ifc').length).toBeGreaterThan(10)
    expect(guids('house.ifc')).toEqual(guids('plan.ifc'))
  })

  it('finds the project with --project from another folder too, and writes into its exports/', () => {
    const run = grid(['export', '--format', 'dxf', '--project', 'demo'], base)
    expect(run.status).toBe(0)
    expect(run.out).toBe(`Wrote ${join('demo', 'exports', 'plan.dxf')}\n`)
    expect(tree(base)).toEqual(['demo/', ...[...LAYOUT, 'exports/plan.dxf'].map((name) => `demo/${name}`)].sort())
    expect(grid(['check', '--project', 'demo'], base).status).toBe(0)
  })

  it('grid draw prints the plan with no path', () => {
    const run = grid(['draw'], demo)
    expect(run.status).toBe(0)
    expect(run.out.startsWith('<svg')).toBe(true)
  })

  it('a plan named on the command line still wins', () => {
    const other = JSON.parse(starterPlanText()) as { rooms: Array<{ use?: string }> }
    for (const room of other.rooms) delete room.use
    writeFileSync(join(demo, 'other.json'), JSON.stringify(other))
    // COD-3: the US stated, so the room-size check's "no use stated" line is there to name.
    const run = grid(['check', 'other.json', '--country', 'US'], demo)
    expect(run.status).toBe(0)
    expect(run.out).toContain('not checked, floor')
  })

  it('says so when plan.json was removed', () => {
    rmSync(join(demo, 'plan.json'))
    expectRefusal(grid(['check'], demo), 1, 'holds no plan.json', 'the project\'s plan is plan.json')
  })
})

describe('outside a project (CMD-18)', () => {
  it.each([[['check']], [['describe']], [['export', '--format', 'dxf']]])('%j reads plan.json in the folder, with no grid.json', (args) => {
    writeFileSync(join(base, 'plan.json'), starterPlanText())
    expect(grid(args, base).status).toBe(0)
    expect(tree(base)).not.toContain('grid.json')
  })

  it('says where it looked when the folder holds no plan.json', () => {
    const run = grid(['check'], base)
    expect(run.status).toBe(1)
    expect(run.err).toContain('holds no plan.json')
    expect(run.err).toContain('no grid.json')
    expect(run.err).toContain('grid init')
    expect(tree(base)).toEqual([])
  })
})
