import { spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LINK_CASES_SKIPPED_ON_WINDOWS, T5_TRACE_IMAGE_PATHS } from '../../fs/__tests__/attackCases'

/**
 * CMD-15: every path a command or a tool takes, through every slot that takes one, and the
 * trace image a plan names. `paths.e2e.test.ts` holds the deeper cases for check, draw, export
 * and grid_export; this file holds the breadth. The slots are listed by hand, and the tests
 * fail when a command or a tool with a path argument is added without its slot here.
 *
 * Run as a person and an agent's host run Grid: the built file, as its own Node process, with
 * a project in a temporary folder.
 */

const cli = resolve(__dirname, '../../..')
const bundle = join(cli, 'dist', 'grid.mjs')
const sample = readFileSync(join(cli, 'fixtures', 'two-bed-flat.json'), 'utf8')
const windows = process.platform === 'win32'
const PLAN = 'two-bed-flat.json'
const ROOMS = 'flat.rooms'

const made: string[] = []
let base: string
/** The project folder, and its real path (macOS puts temporary folders behind a link). */
let project: string
let real: string
/** A folder beside the project, holding what must never be read or written. */
let outside: string
/** The rooms text of the sample plan, for grid write and grid_write_rooms. */
let roomsText: string

function tempDir(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix))
  made.push(path)
  return path
}

function linkFolder(target: string, path: string): void {
  symlinkSync(target, path, windows ? 'junction' : 'dir')
}

/** Every file under a folder, with `/` between names, sorted. Links are listed, not followed. */
function tree(folder: string, prefix = ''): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const name = `${prefix}${entry.name}`
    return entry.isDirectory() ? tree(join(folder, entry.name), `${name}/`) : [name]
  }).sort()
}

interface Run {
  readonly status: number | null
  readonly out: string
  readonly err: string
}

function grid(args: readonly string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Run {
  const run = spawnSync(process.execPath, [bundle, ...args], { cwd: options.cwd ?? project, env: options.env ?? process.env, timeout: 30_000 })
  if (run.error) throw run.error
  return { status: run.status, out: run.stdout.toString('utf8'), err: run.stderr.toString('utf8') }
}

interface Call {
  readonly name: string
  readonly arguments: Record<string, unknown>
}

interface ToolAnswer {
  readonly text: string
  readonly isError: boolean
}

/** Starts `grid serve`, sends the requests, and gives each answer's text in order. */
function rpc(requests: ReadonlyArray<{ method: string; params?: unknown }>, options: { cwd?: string; args?: string[]; env?: NodeJS.ProcessEnv } = {}): Promise<unknown[]> {
  return new Promise((done, fail) => {
    const child = spawn(process.execPath, [bundle, 'serve', ...(options.args ?? [])], {
      cwd: options.cwd ?? project,
      env: options.env ?? process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let out = ''
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString() })
    child.on('error', fail)
    child.on('close', () => {
      try {
        const replies = out.split('\n').filter((line) => line.trim()).map((line) => JSON.parse(line) as { id: number })
        expect(replies.map((reply) => reply.id)).toEqual(requests.map((_, i) => i + 1))
        done(replies)
      } catch (error) {
        fail(error)
      }
    })
    child.stdin.end(requests.map((request, i) => `${JSON.stringify({ jsonrpc: '2.0', id: i + 1, ...request })}\n`).join(''))
  })
}

async function callTools(calls: readonly Call[], options: { cwd?: string; args?: string[]; env?: NodeJS.ProcessEnv } = {}): Promise<ToolAnswer[]> {
  const replies = await rpc(calls.map((call) => ({ method: 'tools/call', params: call })), options) as Array<{
    result?: { content: Array<{ text: string }>; isError?: boolean }
    error?: { message: string }
  }>
  return replies.map((reply) => reply.error
    ? { text: reply.error.message, isError: true }
    : { text: reply.result!.content.map((part) => part.text).join('\n'), isError: reply.result!.isError === true })
}

// ---------------------------------------------------------------------------------------------
// Every slot that takes a path

/** One way to hand a command a path: its arguments, and the path as the refusal quotes it. */
interface CommandSlot {
  readonly label: string
  readonly args: (path: string) => string[]
  /** The path as given: some slots need an extension added to get past their own check. */
  readonly given: (path: string) => string
}

const asIs = (path: string): string => path

/** Every command, and each place it takes a path to read or write inside the project. */
const COMMAND_SLOTS: Readonly<Record<string, readonly CommandSlot[]>> = {
  // Its folder is the project folder itself, refused by other rules (paths.e2e and init.e2e).
  init: [],
  write: [
    { label: 'the rooms text', args: (p) => ['write', p, '--plan', 'new.json'], given: asIs },
    { label: '--plan', args: (p) => ['write', ROOMS, '--plan', `${p}.json`], given: (p) => `${p}.json` },
    // BRF-6: a first layout reads the brief beside the plan, and writes the plan.
    { label: '--plan, with --layout', args: (p) => ['write', '--layout', 'tidy', '--plan', `${p}.json`], given: (p) => `${p}.json` },
    // HND-12: a phone room scan, read like a plan; its evidence file is the plan's name beside the plan.
    { label: '--scan', args: (p) => ['write', '--scan', p, '--plan', 'new.json'], given: asIs },
    // CMD-43: a DXF or IFC drawing, read like a scan; its rooms text is the plan's name beside the plan.
    { label: '--from', args: (p) => ['write', '--from', p, '--plan', 'new.json'], given: asIs },
  ],
  check: [
    { label: 'the plan', args: (p) => ['check', p], given: asIs },
    // MSG-10: marking a note writes the marks file beside the plan, named after it.
    { label: 'the plan, marking a note seen', args: (p) => ['check', p, '--seen', '1', '--reason', 'Seen', '--by', 'Owner'], given: asIs },
  ],
  describe: [
    { label: 'the plan', args: (p) => ['describe', p], given: asIs },
    // VEW-9: the walk's pictures go into a folder, each named in it.
    { label: '--pictures', args: (p) => ['describe', PLAN, '--length', 'walk', '--pictures', p], given: (p) => `${p}/walk-01.png` },
  ],
  // WRT-8: the markers file is the plan's name beside the plan, never a path of its own.
  mark: [{ label: '--plan', args: (p) => ['mark', 'start', '--plan', p], given: asIs }],
  diff: [
    { label: 'the plan', args: (p) => ['diff', p], given: asIs },
    { label: '--picture', args: (p) => ['diff', PLAN, '--since', 'start', '--picture', `${p}.png`], given: (p) => `${p}.png` },
    { label: '--out', args: (p) => ['diff', PLAN, '--since', 'start', '--out', `${p}.png`], given: (p) => `${p}.png` },
  ],
  draw: [
    { label: 'the plan', args: (p) => ['draw', p], given: asIs },
    { label: '--out', args: (p) => ['draw', PLAN, '--out', `${p}.svg`], given: (p) => `${p}.svg` },
  ],
  export: [
    { label: 'the plan', args: (p) => ['export', p, '--format', 'dxf'], given: asIs },
    { label: '--out', args: (p) => ['export', PLAN, '--format', 'dxf', '--out', `${p}.dxf`], given: (p) => `${p}.dxf` },
  ],
  sheet: [
    { label: 'the plan', args: (p) => ['sheet', p, '--layout', 'check'], given: asIs },
    { label: '--sheet', args: (p) => ['sheet', PLAN, '--layout', 'client', '--sheet', p], given: asIs },
    { label: '--out', args: (p) => ['sheet', PLAN, '--layout', 'check', '--out', `${p}.pdf`], given: (p) => `${p}.pdf` },
  ],
  tidy: [
    { label: 'the plan', args: (p) => ['tidy', p], given: asIs },
    { label: '--out', args: (p) => ['tidy', PLAN, '--apply', 'all', '--out', `${p}.json`], given: (p) => `${p}.json` },
  ],
  edit: [
    { label: 'the plan', args: (p) => ['edit', 'rename', p, '--room', 'lounge', '--name', 'Lounge'], given: asIs },
    { label: '--out', args: (p) => ['edit', 'rename', PLAN, '--room', 'lounge', '--name', 'Lounge', '--out', `${p}.json`], given: (p) => `${p}.json` },
  ],
  // HND-9: its occupancy file is the plan's name beside the plan, never a path of its own.
  occupancy: [{ label: 'the plan', args: (p) => ['occupancy', p], given: asIs }],
  // VEW-4: the plan is refused before the page's server starts; its preview record is the plan's name beside it.
  preview: [{ label: 'the plan', args: (p) => ['preview', p, '--port', '0'], given: asIs }],
  // The tool server: its tools' paths are below. --project is the project folder itself.
  serve: [],
  mcp: [],
}

/** The commands that read a plan file, as they are given one. */
const PLAN_READERS: ReadonlyArray<readonly [label: string, args: (plan: string) => string[]]> = [
  ['check', (p) => ['check', p]],
  ['describe', (p) => ['describe', p]],
  ['draw', (p) => ['draw', p]],
  ['draw --3d', (p) => ['draw', p, '--3d', '--out', 'still.png']],
  ['export', (p) => ['export', p, '--format', 'ifc']],
  ['sheet', (p) => ['sheet', p, '--layout', 'check']],
  ['tidy', (p) => ['tidy', p]],
  ['occupancy', (p) => ['occupancy', p]],
  ['mark', (p) => ['mark', 'start', '--plan', p]],
  ['diff', (p) => ['diff', p]],
  ['write --replace', (p) => ['write', ROOMS, '--plan', p, '--replace']],
]

/** One way to hand a tool a path. */
interface ToolSlot {
  readonly arg: string
  readonly call: (path: string) => Call
  readonly given: (path: string) => string
}

/** A call with `path` put in for `"@"`, and for `"@.json"` with its ending kept. */
function tool(name: string, args: Record<string, unknown>): (path: string) => Call {
  return (path) => ({
    name,
    arguments: JSON.parse(JSON.stringify(args).replace(/"@(\.json)?"/g, (_, end?: string) => JSON.stringify(`${path}${end ?? ''}`))) as Record<string, unknown>,
  })
}

/** The other arguments each tool needs to get as far as its paths. `@` is the path under test. */
/** VEW-3: a camera record as grid_view returns it, enough of it to save. */
const CAMERA = { target: { room: null, point: [5, 4, 1] }, bearing: 135, tilt: 30, distance: 20, lens: { focalLength: 35 }, cut: null }

const TOOL_SLOTS: Readonly<Record<string, readonly ToolSlot[]>> = {
  grid_compare: [
    { arg: 'plans', call: tool('grid_compare', { plans: ['@', PLAN] }), given: asIs },
    { arg: 'plans', call: tool('grid_compare', { plans: [PLAN, '@'] }), given: asIs },
  ],
  // WRT-8: the earlier version is read from the markers file beside the plan, or the project's .git.
  grid_diff: [{ arg: 'plan', call: tool('grid_diff', { plan: '@' }), given: asIs }],
  grid_areas: [{ arg: 'plan', call: tool('grid_areas', { plan: '@' }), given: asIs }],
  grid_takeoff: [
    { arg: 'plan', call: tool('grid_takeoff', { plan: '@' }), given: asIs },
    // ARE-13: the person's rates file, read like the plan.
    { arg: 'rates', call: tool('grid_takeoff', { plan: PLAN, for: 'estimate', rates: '@' }), given: asIs },
  ],
  grid_schedule: [{ arg: 'plan', call: tool('grid_schedule', { plan: '@' }), given: asIs }],
  // CNT-9: the three tools that ask across the parts read the plan only.
  grid_fields: [{ arg: 'plan', call: tool('grid_fields', { plan: '@' }), given: asIs }],
  grid_find: [{ arg: 'plan', call: tool('grid_find', { plan: '@', kind: ['door'] }), given: asIs }],
  grid_count: [{ arg: 'plan', call: tool('grid_count', { plan: '@', kind: ['room'], by: 'use' }), given: asIs }],
  grid_measure: [{ arg: 'plan', call: tool('grid_measure', { plan: '@', what: 'room', room: 'lounge' }), given: asIs }],
  grid_view: [
    { arg: 'plan', call: tool('grid_view', { plan: '@', kind: 'plan' }), given: asIs },
    // VEW-62: the picture's own path, written inside the project only.
    { arg: 'out', call: (p) => ({ name: 'grid_view', arguments: { plan: PLAN, kind: 'plan', out: `${p}.png` } }), given: (p) => `${p}.png` },
  ],
  grid_describe: [{ arg: 'plan', call: tool('grid_describe', { plan: '@' }), given: asIs }],
  grid_check: [{ arg: 'plan', call: tool('grid_check', { plan: '@' }), given: asIs }],
  grid_report_problem: [{ arg: 'plan', call: tool('grid_report_problem', { plan: '@', tool: 'grid_check', expected: 'The plan read.' }), given: asIs }],
  grid_preview: [{ arg: 'plan', call: tool('grid_preview', { plan: '@', view: '2d', note: 'A look' }), given: asIs }],
  // VEW-4: the page's own call; its record is the plan's name beside the plan, never a path of its own.
  grid_preview_sync: [{ arg: 'plan', call: tool('grid_preview_sync', { plan: '@' }), given: asIs }],
  grid_export: [{ arg: 'plan', call: tool('grid_export', { plan: '@', format: 'glb' }), given: asIs }],
  grid_sheet: [{ arg: 'plan', call: tool('grid_sheet', { plan: '@', layout: 'check' }), given: asIs }],
  grid_mark_start: [{ arg: 'plan', call: tool('grid_mark_start', { plan: '@' }), given: asIs }],
  // MSG-10: its marks file is the plan's name beside the plan, never a path of its own.
  grid_mark_seen: [{ arg: 'plan', call: tool('grid_mark_seen', { plan: '@', line: 1, code: 'room/too-small', reason: 'Seen', by: 'Owner' }), given: asIs }],
  // BRF-1: its brief is the plan's name beside the plan, never a path of its own.
  grid_write_brief: [{ arg: 'plan', call: tool('grid_write_brief', { plan: '@', brief: { rooms: [{ name: 'Lounge', area: 20, level: 'must', source: 'assumed' }] } }), given: asIs }],
  // MSG-24: its words go into the plan's own display, never a file of their own.
  grid_words: [{ arg: 'plan', call: tool('grid_words', { plan: '@', language: 'de', words: { 'join.and': ' und ' } }), given: asIs }],
  grid_write_rooms: [
    { arg: 'plan', call: (p) => ({ name: 'grid_write_rooms', arguments: { plan: `${p}.json`, rooms: roomsText } }), given: (p) => `${p}.json` },
    // BRF-6: a first layout reads the brief beside the plan, and writes the plan.
    { arg: 'plan', call: (p) => ({ name: 'grid_write_rooms', arguments: { plan: `${p}.json`, layout: 'tidy' } }), given: (p) => `${p}.json` },
    // HND-12: a phone room scan in place of rooms text.
    { arg: 'scan', call: (p) => ({ name: 'grid_write_rooms', arguments: { plan: 'new.json', scan: p } }), given: asIs },
    // CMD-38: rooms text read from a file in the project.
    { arg: 'roomsFile', call: (p) => ({ name: 'grid_write_rooms', arguments: { plan: 'new.json', roomsFile: p } }), given: asIs },
    // CMD-43: a DXF or IFC drawing in place of rooms text.
    { arg: 'from', call: (p) => ({ name: 'grid_write_rooms', arguments: { plan: 'new.json', from: p } }), given: asIs },
  ],
  grid_change_opening: [
    { arg: 'plan', call: tool('grid_change_opening', { plan: '@', opening: 'bed2-door', hinge: 'end' }), given: asIs },
    { arg: 'out', call: tool('grid_change_opening', { plan: PLAN, opening: 'bed2-door', hinge: 'end', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // WRT-38: one wall's thickness.
  grid_change_wall: [
    { arg: 'plan', call: tool('grid_change_wall', { plan: '@', wall: 'bedrooms', thickness: 0.12 }), given: asIs },
    { arg: 'out', call: tool('grid_change_wall', { plan: PLAN, wall: 'bedrooms', thickness: 0.12, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // CNT-15: one named type, which every part of it takes.
  grid_change_type: [
    { arg: 'plan', call: tool('grid_change_type', { plan: '@', of: 'wall', type: 'stud', name: 'Stud partition' }), given: asIs },
    { arg: 'out', call: tool('grid_change_type', { plan: PLAN, of: 'wall', type: 'stud', name: 'Stud partition', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_move_room_side: [
    { arg: 'plan', call: tool('grid_move_room_side', { plan: '@', room: 'kitchen', side: 'east', by: 0.2 }), given: asIs },
    { arg: 'out', call: tool('grid_move_room_side', { plan: PLAN, room: 'kitchen', side: 'east', by: 0.2, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_mirror: [
    { arg: 'plan', call: tool('grid_mirror', { plan: '@', how: 'left-right' }), given: asIs },
    { arg: 'out', call: tool('grid_mirror', { plan: PLAN, how: 'left-right', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_merge_rooms: [
    { arg: 'plan', call: tool('grid_merge_rooms', { plan: '@', room: 'bed1', with: 'bed2' }), given: asIs },
    { arg: 'out', call: tool('grid_merge_rooms', { plan: PLAN, room: 'bed1', with: 'bed2', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // MSG-16: 1 m, not 1.5, so the new wall lands clear of the bedroom's window and the call
  // reaches the path.
  grid_split_room: [
    { arg: 'plan', call: tool('grid_split_room', { plan: '@', room: 'bed1', side: 'west', size: 1, new_room: 'store', new_name: 'Store' }), given: asIs },
    { arg: 'out', call: tool('grid_split_room', { plan: PLAN, room: 'bed1', side: 'west', size: 1, new_room: 'store', new_name: 'Store', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_add_room: [
    { arg: 'plan', call: tool('grid_add_room', { plan: '@', room: 'porch', name: 'Porch', against: 'lounge', side: 'north', width: 3, depth: 2, in_the_way: 'remove' }), given: asIs },
    { arg: 'out', call: tool('grid_add_room', { plan: PLAN, room: 'porch', name: 'Porch', against: 'lounge', side: 'north', width: 3, depth: 2, in_the_way: 'remove', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_add_opening: [
    { arg: 'plan', call: tool('grid_add_opening', { plan: '@', type: 'window', room: 'kitchen', side: 'east' }), given: asIs },
    { arg: 'out', call: tool('grid_add_opening', { plan: PLAN, type: 'window', room: 'kitchen', side: 'east', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_stretch: [
    { arg: 'plan', call: tool('grid_stretch', { plan: '@', side: 'east', by: 0.3 }), given: asIs },
    { arg: 'out', call: tool('grid_stretch', { plan: PLAN, side: 'east', by: 0.3, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_rename_room: [
    { arg: 'plan', call: tool('grid_rename_room', { plan: '@', room: 'lounge', name: 'Lounge' }), given: asIs },
    { arg: 'out', call: tool('grid_rename_room', { plan: PLAN, room: 'lounge', name: 'Lounge', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // WRT-6: squaring a scan reads the plan and writes it, or another file.
  grid_square_scan: [
    { arg: 'plan', call: tool('grid_square_scan', { plan: '@', all: true }), given: asIs },
    { arg: 'out', call: tool('grid_square_scan', { plan: PLAN, all: true, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // CNT-20: a library entry placed by name reads the plan (and the library folder beside it) and writes it, or another file.
  grid_place_item: [
    { arg: 'plan', call: tool('grid_place_item', { plan: '@', name: 'wc', x: 1, y: 1 }), given: asIs },
    { arg: 'out', call: tool('grid_place_item', { plan: PLAN, name: 'wc', x: 1, y: 1, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // CNT-44: a room filled with desks reads the plan (and the library folder beside it) and writes it, or another file.
  grid_fill_room: [
    { arg: 'plan', call: tool('grid_fill_room', { plan: '@', room: 'lounge', name: 'chair' }), given: asIs },
    { arg: 'out', call: tool('grid_fill_room', { plan: PLAN, room: 'lounge', name: 'chair', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // WRT-73: phases set on the plan, and one plan with phases written from a before and an after.
  grid_set_phase: [
    { arg: 'plan', call: tool('grid_set_phase', { plan: '@', phase: 'new', parts: ['bed2-door'] }), given: asIs },
    { arg: 'out', call: tool('grid_set_phase', { plan: PLAN, phase: 'new', parts: ['bed2-door'], out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_start_works: [
    { arg: 'plan', call: tool('grid_start_works', { plan: '@' }), given: asIs },
    { arg: 'out', call: tool('grid_start_works', { plan: PLAN, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_phase_from: [
    { arg: 'before', call: tool('grid_phase_from', { before: '@', after: PLAN, out: 'works.json' }), given: asIs },
    { arg: 'after', call: tool('grid_phase_from', { before: PLAN, after: '@', out: 'works.json' }), given: asIs },
    { arg: 'out', call: tool('grid_phase_from', { before: PLAN, after: PLAN, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // WRT-36: grid tidy on the tool server.
  grid_tidy: [
    { arg: 'plan', call: tool('grid_tidy', { plan: '@' }), given: asIs },
    { arg: 'out', call: tool('grid_tidy', { plan: PLAN, all: true, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // CMD-42: any other field of a part, written into the plan.
  grid_set: [
    { arg: 'plan', call: tool('grid_set', { plan: '@', parts: ['lounge'], set: { floorOffset: 0.02 } }), given: asIs },
    { arg: 'out', call: tool('grid_set', { plan: PLAN, parts: ['lounge'], set: { floorOffset: 0.02 }, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // WRT-74: facts and a room's number, written into the plan.
  grid_set_facts: [
    { arg: 'plan', call: tool('grid_set_facts', { plan: '@', parts: ['lounge'], set: { department: 'Sales' } }), given: asIs },
    { arg: 'out', call: tool('grid_set_facts', { plan: PLAN, parts: ['lounge'], set: { department: 'Sales' }, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // LVL-21: a stair added and changed, written into the plan.
  grid_add_stair: [
    { arg: 'plan', call: tool('grid_add_stair', { plan: '@', from: 'ground', to: 'first', width: 0.9, run: ['1,1', '1,4'] }), given: asIs },
    { arg: 'out', call: tool('grid_add_stair', { plan: PLAN, from: 'ground', to: 'first', width: 0.9, run: ['1,1', '1,4'], out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_change_stair: [
    { arg: 'plan', call: tool('grid_change_stair', { plan: '@', id: 'st', width: 1 }), given: asIs },
    { arg: 'out', call: tool('grid_change_stair', { plan: PLAN, id: 'st', width: 1, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // CNT-41: the plot and the site's things, written into the plan.
  grid_set_site: [
    { arg: 'plan', call: tool('grid_set_site', { plan: '@', north: 30 }), given: asIs },
    { arg: 'out', call: tool('grid_set_site', { plan: PLAN, north: 30, out: '@.json' }), given: (p) => `${p}.json` },
  ],
  grid_change_site: [
    { arg: 'plan', call: tool('grid_change_site', { plan: '@', action: 'add', kind: 'tree', at: '1,1' }), given: asIs },
    { arg: 'out', call: tool('grid_change_site', { plan: PLAN, action: 'add', kind: 'tree', at: '1,1', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // VEW-67: the trace image, its picture resolved from the project folder like the plan.
  grid_place_trace: [
    // Written beside the plan, so the plans other tests trace keep the picture they name.
    { arg: 'plan', call: tool('grid_place_trace', { plan: '@', image: 'scan.png', out: 'placed-trace.json' }), given: asIs },
    { arg: 'image', call: (p) => ({ name: 'grid_place_trace', arguments: { plan: PLAN, image: `${p}.png` } }), given: (p) => `${p}.png` },
    { arg: 'out', call: tool('grid_place_trace', { plan: PLAN, image: 'scan.png', out: '@.json' }), given: (p) => `${p}.json` },
  ],
  // VEW-3: a camera saved by name, written into the plan.
  grid_save_view: [
    { arg: 'plan', call: tool('grid_save_view', { plan: '@', name: 'Corner', camera: CAMERA }), given: asIs },
    { arg: 'out', call: tool('grid_save_view', { plan: PLAN, name: 'Corner', camera: CAMERA, out: '@.json' }), given: (p) => `${p}.json` },
  ],
}

/**
 * The plan-reading call of every tool that reads one and would follow its trace image. CMD-13's
 * grid_report_problem never follows it: the draft leaves it out (reportProblem.test.ts holds
 * that the path is not in the draft).
 */
const PLAN_TOOLS: ReadonlyArray<readonly [name: string, call: (plan: string) => Call]> = Object.entries(TOOL_SLOTS)
  .filter(([name]) => name !== 'grid_write_rooms' && name !== 'grid_report_problem')
  .map(([name, slots]) => [name, slots[0]!.call] as const)

// ---------------------------------------------------------------------------------------------

beforeAll(() => {
  if (!existsSync(bundle)) throw new Error('dist/grid.mjs is missing: run npm run build first (npm test does it)')
  const dir = tempDir('grid-rooms-')
  writeFileSync(join(dir, PLAN), sample)
  const run = grid(['describe', PLAN, '--as', 'rooms'], { cwd: dir })
  expect(run.status).toBe(0)
  roomsText = run.out
})

beforeEach(() => {
  base = tempDir('grid-every-path-')
  project = join(base, 'project')
  outside = join(base, 'outside')
  mkdirSync(project)
  mkdirSync(outside)
  real = realpathSync.native(project)
  writeFileSync(join(project, PLAN), sample)
  writeFileSync(join(project, ROOMS), roomsText)
  writeFileSync(join(outside, 'victim.json'), sample)
  writeFileSync(join(outside, 'victim.svg'), 'victim')
})

afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

/** A refusal: exit 1, one line on standard error naming the path and the project folder. */
function expectCommandRefused(run: Run, given: string, ...words: string[]): void {
  expect({ status: run.status, out: run.out }).toEqual({ status: 1, out: '' })
  expect(run.err.trimEnd().split('\n')).toHaveLength(1)
  expect(run.err.startsWith('grid: ')).toBe(true)
  expect(run.err).toContain(JSON.stringify(given))
  // CMD-29: a refusal never says where the project folder is on the disk.
  expect(run.err).not.toContain(real)
  for (const word of words) expect(run.err).toContain(word)
}

function expectToolRefused(answer: ToolAnswer, given: string, ...words: string[]): void {
  expect(answer.isError).toBe(true)
  expect(answer.text).toContain(JSON.stringify(given))
  // CMD-29: a refusal never says where the project folder is on the disk.
  expect(answer.text).not.toContain(real)
  for (const word of words) expect(answer.text).toContain(word)
}

/** MSG-20: the check's one line on a trace image it did not follow: the path, the project folder and why. */
function expectTraceLeftOut(text: string, given: string, why: string): void {
  expect(text.match(/\[plan\/trace-left-out\]/g) ?? []).toHaveLength(1)
  expect(text).toContain(JSON.stringify(given))
  // CMD-29: a refusal never says where the project folder is on the disk.
  expect(text).not.toContain(real)
  expect(text).toContain(why)
}

function expectOutsideUntouched(): void {
  expect(tree(outside)).toEqual(['victim.json', 'victim.svg'])
  expect(readFileSync(join(outside, 'victim.svg'), 'utf8')).toBe('victim')
  expect(readFileSync(join(outside, 'victim.json'), 'utf8')).toBe(sample)
}

describe('the slots this file lists', () => {
  it('cover every command grid --help lists', () => {
    const help = grid(['--help']).out
    const commands = [...help.split('Commands:')[1]!.split('\n\n')[0]!.matchAll(/^ {2}([a-z]+)\s/gm)].map((m) => m[1])
    expect(commands.sort()).toEqual(Object.keys(COMMAND_SLOTS).sort())
  })

  it('cover every tool argument that is a path, and no other', async () => {
    const PATH_ARGS = ['plan', 'plans', 'out', 'rates', 'scan', 'roomsFile', 'before', 'after', 'image']
    // CMD-43: from is a drawing's path in grid_write_rooms; elsewhere it is a part or a point.
    const isPath = (tool: string, arg: string): boolean => PATH_ARGS.includes(arg) || (tool === 'grid_write_rooms' && arg === 'from')
    const [reply] = await rpc([{ method: 'tools/list' }]) as Array<{ result: { tools: Array<{ name: string; inputSchema: { properties: Record<string, unknown> } }> } }>
    const pathArgs = reply!.result.tools.flatMap((t) => Object.keys(t.inputSchema.properties)
      .filter((arg) => isPath(t.name, arg))
      .map((arg) => `${t.name} ${arg}`))
    const listed = [...new Set(Object.entries(TOOL_SLOTS).flatMap(([name, slots]) => slots.map((slot) => `${name} ${slot.arg}`)))]
    expect(listed.sort()).toEqual(pathArgs.sort())
    // No other free text argument of any tool is described as a file, a folder or a path.
    const others = reply!.result.tools.flatMap((t) => Object.entries(t.inputSchema.properties as Record<string, { type?: unknown; enum?: unknown; description?: string }>)
      .filter(([arg, schema]) => !isPath(t.name, arg)
        && JSON.stringify(schema.type).includes('string') && schema.enum === undefined
        && /\b(file|folder|path)\b/i.test(schema.description ?? ''))
      .map(([arg]) => `${t.name} ${arg}`))
    expect(others).toEqual([])
  }, 20_000)
})

const commandCases = Object.values(COMMAND_SLOTS).flat()

describe('the six T-5 paths, given to every command in every slot that takes a path', () => {
  it.each(T5_TRACE_IMAGE_PATHS)('%j', (path, why) => {
    for (const slot of commandCases) {
      expectCommandRefused(grid(slot.args(path)), slot.given(path), why)
    }
    expect(tree(project)).toEqual([ROOMS, PLAN].sort())
    expectOutsideUntouched()
  }, 120_000)
})

describe('the six T-5 paths, given to every tool in every argument that takes a path', () => {
  it('are refused, naming the path and the project folder', async () => {
    const slots = Object.values(TOOL_SLOTS).flat()
    const calls = T5_TRACE_IMAGE_PATHS.flatMap(([path]) => slots.map((slot) => slot.call(path)))
    const answers = await callTools(calls)
    let i = 0
    for (const [path, why] of T5_TRACE_IMAGE_PATHS) {
      for (const slot of slots) expectToolRefused(answers[i++]!, slot.given(path), why)
    }
    expect(tree(project)).toEqual([ROOMS, PLAN].sort())
    expectOutsideUntouched()
  }, 60_000)
})

describe('a symbolic link out of the project, in every slot', () => {
  beforeEach(() => {
    linkFolder(outside, join(project, 'linked'))
  })

  it('is refused by every command', () => {
    // Refused at the link, before what is beyond it is looked at, so the name needn't be there.
    for (const slot of commandCases) {
      expectCommandRefused(grid(slot.args('linked/victim')), slot.given('linked/victim'), 'through a symbolic link')
    }
    expect(tree(project)).toEqual(['linked', ROOMS, PLAN].sort())
    expectOutsideUntouched()
  }, 120_000)

  it('is refused by every tool', async () => {
    const slots = Object.values(TOOL_SLOTS).flat()
    const answers = await callTools(slots.map((slot) => slot.call('linked/victim')))
    slots.forEach((slot, i) => expectToolRefused(answers[i]!, slot.given('linked/victim'), 'through a symbolic link'))
    expect(tree(project)).toEqual(['linked', ROOMS, PLAN].sort())
    expectOutsideUntouched()
  }, 60_000)
})

describe('the trace image a plan names (T-5)', () => {
  /** A copy of the sample plan whose trace image is `path`. */
  function tracePlan(name: string, path: string): string {
    writeFileSync(join(project, name), JSON.stringify({ ...JSON.parse(sample) as object, referenceImage: { path, opacity: 0.4 } }))
    return name
  }

  // MSG-20: a trace image that cannot be followed is left out with one line: the plan still reads.
  it.each(T5_TRACE_IMAGE_PATHS)('%j is never followed: every command reads the plan without it', (path, why) => {
    const plan = tracePlan('traced.json', path)
    for (const [label, args] of PLAN_READERS) {
      const run = grid(args(plan))
      expect(run.err, label).not.toContain("can't be used: its trace image")
    }
    const check = grid(['check', plan])
    expect(check.status).toBe(0)
    expectTraceLeftOut(check.out, path, why)
    expectOutsideUntouched()
  }, 120_000)

  it('is never followed by a tool either, for each of the six; grid_check says why', async () => {
    const plans = T5_TRACE_IMAGE_PATHS.map(([path], i) => tracePlan(`traced-${i}.json`, path))
    const calls = plans.flatMap((plan) => PLAN_TOOLS.map(([, call]) => call(plan)))
    const answers = await callTools(calls)
    answers.forEach((answer, i) => expect(answer.text, calls[i]!.name).not.toContain("can't be used: its trace image"))
    expect(answers).toHaveLength(T5_TRACE_IMAGE_PATHS.length * PLAN_TOOLS.length)
    const checks = await callTools(plans.map((plan) => ({ name: 'grid_check', arguments: { plan } })))
    checks.forEach((answer, i) => {
      const [path, why] = T5_TRACE_IMAGE_PATHS[i]!
      expect(answer.isError).toBe(false)
      expectTraceLeftOut(answer.text, path, why)
    })
    expectOutsideUntouched()
    // Six plans times every tool that reads one: it grows with each tool and runs long on a busy machine.
  }, 300_000)

  it('HND-10: is never followed when it does not end as a picture, by any command or tool', async () => {
    const path = 'notes/plan.sh'
    const plan = tracePlan('traced.json', path)
    const check = grid(['check', plan])
    expect(check.status).toBe(0)
    expect(check.out).toContain('[plan/trace-left-out]')
    expect(check.out).toContain(`${JSON.stringify(path)} does not end in .png, .jpg, .jpeg or .pdf`)
    const answers = await callTools(PLAN_TOOLS.map(([, call]) => call(plan)))
    for (const answer of answers) expect(answer.text).not.toContain("can't be used: its trace image")
  }, 120_000)

  it('is never followed through a link to a folder outside, by the command and the tool server', async () => {
    linkFolder(outside, join(project, 'linked'))
    const plan = tracePlan('traced.json', 'linked/victim.svg')
    expectTraceLeftOut(grid(['check', plan]).out, 'linked/victim.svg', 'through a symbolic link')
    const [answer] = await callTools([{ name: 'grid_check', arguments: { plan } }])
    expectTraceLeftOut(answer!.text, 'linked/victim.svg', 'through a symbolic link')
    expectOutsideUntouched()
  }, 20_000)

  it.skipIf(windows)(`is never followed through a link to a file outside (${LINK_CASES_SKIPPED_ON_WINDOWS})`, async () => {
    symlinkSync(join(outside, 'victim.svg'), join(project, 'trace.png'))
    const plan = tracePlan('traced.json', 'trace.png')
    expect(grid(['describe', plan]).status).toBe(0)
    expectTraceLeftOut(grid(['check', plan]).out, 'trace.png', 'through a symbolic link')
    const [answer] = await callTools([{ name: 'grid_check', arguments: { plan } }])
    expectTraceLeftOut(answer!.text, 'trace.png', 'through a symbolic link')
    expectOutsideUntouched()
  }, 20_000)

  it('starts from the project folder, wherever Grid runs, and need not be there yet', async () => {
    mkdirSync(join(project, 'assets'))
    writeFileSync(join(project, 'assets', 'reference.png'), 'png')
    mkdirSync(join(project, 'plans'))
    writeFileSync(join(project, 'plans', 'a.json'), JSON.stringify({ ...JSON.parse(sample) as object, referenceImage: { path: 'assets/reference.png' } }))
    writeFileSync(join(project, 'plans', 'b.json'), JSON.stringify({ ...JSON.parse(sample) as object, referenceImage: { path: 'assets/later.png' } }))
    const work = join(base, 'elsewhere')
    mkdirSync(work)
    for (const plan of ['a.json', 'b.json']) {
      expect(grid(['check', join('plans', plan)]).status).toBe(0)
      expect(grid(['check', join('..', 'project', 'plans', plan), '--project', project], { cwd: work }).status).toBe(0)
    }
    const answers = await callTools([
      { name: 'grid_check', arguments: { plan: 'plans/a.json' } },
      { name: 'grid_check', arguments: { plan: 'plans/b.json' } },
    ], { cwd: work, args: ['--project', project] })
    for (const answer of answers) expect(answer.isError).toBe(false)
    // Inside the project folder by its text, but outside once `..` is followed.
    tracePlan('up.json', 'assets/../../outside/victim.svg')
    expectTraceLeftOut(grid(['check', 'up.json']).out, 'assets/../../outside/victim.svg', 'outside the project folder')
  }, 20_000)
})

describe('the base plan a fit-out names (CNT-10)', () => {
  /** A copy of the sample plan fitted out in the base at `path`. */
  function fitOut(name: string, path: string): string {
    writeFileSync(join(project, name), JSON.stringify({ ...JSON.parse(sample) as object, base: path }))
    return name
  }

  it.each(T5_TRACE_IMAGE_PATHS)('%j makes every command refuse the plan', (path, why) => {
    const plan = fitOut('fitted.json', path)
    for (const [, args] of PLAN_READERS) {
      expectCommandRefused(grid(args(plan)), path, 'base plan', why)
    }
    expect(tree(project)).toEqual([ROOMS, PLAN, plan].sort())
    expectOutsideUntouched()
  }, 120_000)

  it('makes every tool refuse the plan, for each of the six', async () => {
    const plans = T5_TRACE_IMAGE_PATHS.map(([path], i) => fitOut(`fitted-${i}.json`, path))
    const calls = plans.flatMap((plan) => PLAN_TOOLS.map(([, call]) => call(plan)))
    const answers = await callTools(calls)
    answers.forEach((answer, i) => {
      const [path, why] = T5_TRACE_IMAGE_PATHS[Math.floor(i / PLAN_TOOLS.length)]!
      expectToolRefused(answer, path, 'base plan', why)
    })
    expect(tree(project)).toEqual([ROOMS, PLAN, ...plans].sort())
    expectOutsideUntouched()
  }, 60_000)

  it('is refused through a link to a folder outside, by the command and the tool server', async () => {
    linkFolder(outside, join(project, 'linked'))
    const plan = fitOut('fitted.json', 'linked/victim.json')
    expectCommandRefused(grid(['check', plan]), 'linked/victim.json', 'base plan', 'through a symbolic link')
    const [answer] = await callTools([{ name: 'grid_check', arguments: { plan } }])
    expectToolRefused(answer!, 'linked/victim.json', 'base plan', 'through a symbolic link')
  }, 20_000)
})

describe('every file Grid writes lands under the project folder', () => {
  it('from a folder outside the project, with --project, by the command and the tool server', async () => {
    const work = join(base, 'elsewhere')
    const home = join(base, 'home')
    const temp = join(base, 'temp')
    for (const folder of [work, home, temp]) mkdirSync(folder)
    mkdirSync(join(project, 'plans'))
    writeFileSync(join(project, 'plans', 'flat.json'), sample)
    // Where else a program might write: the home folder and the temporary folder, made empty here.
    const env = { ...process.env, HOME: home, USERPROFILE: home, TMPDIR: temp, TMP: temp, TEMP: temp }
    const plan = join('..', 'project', 'plans', 'flat.json')
    const at = ['--project', project]
    const runs = [
      ...['dxf', 'ifc', 'obj', 'glb'].map((format) => grid(['export', plan, '--format', format, ...at], { cwd: work, env })),
      grid(['export', plan, '--format', 'dxf', '--out', '../project/plans/copy.dxf', ...at], { cwd: work, env }),
      grid(['draw', plan, '--out', '../project/plans/flat.svg', ...at], { cwd: work, env }),
      grid(['draw', plan, '--png', '--out', '../project/plans/flat.png', ...at], { cwd: work, env }),
      grid(['sheet', plan, '--layout', 'check', ...at], { cwd: work, env }),
      // The sample has no wall fault, so this writes nothing; its --out is still checked.
      grid(['tidy', plan, '--apply', 'all', '--out', '../project/plans/tidied.json', ...at], { cwd: work, env }),
      grid(['write', `../project/${ROOMS}`, '--plan', '../project/plans/written.json', ...at], { cwd: work, env }),
    ]
    for (const run of runs) expect([run.status, run.err]).toEqual([0, expect.any(String)])
    const answers = await callTools([
      { name: 'grid_export', arguments: { plan: 'plans/flat.json', format: 'glb' } },
      { name: 'grid_sheet', arguments: { plan: 'plans/flat.json', layout: 'check' } },
      { name: 'grid_mirror', arguments: { plan: 'plans/flat.json', how: 'left-right', out: 'plans/mirrored.json' } },
      { name: 'grid_move_room_side', arguments: { plan: 'plans/flat.json', room: 'kitchen', side: 'east', by: 0.2, out: 'plans/wider.json' } },
      { name: 'grid_change_opening', arguments: { plan: 'plans/flat.json', opening: 'bed2-door', hinge: 'end', out: 'plans/hinged.json' } },
      { name: 'grid_write_rooms', arguments: { plan: 'plans/tool.json', rooms: roomsText } },
    ], { cwd: work, args: at, env })
    for (const answer of answers) expect(answer).toEqual({ text: expect.any(String), isError: false })

    const sheets = tree(join(project, 'plans', 'exports')).filter((name) => name.endsWith('.pdf'))
    expect(sheets).toHaveLength(1)
    expect(tree(project)).toEqual([
      ROOMS, PLAN,
      'plans/.gitignore', 'plans/copy.dxf',
      'plans/exports/flat.dxf', 'plans/exports/flat.glb', 'plans/exports/flat.ifc', 'plans/exports/flat.obj', `plans/exports/${sheets[0]}`,
      'plans/flat.json', 'plans/flat.png', 'plans/flat.svg',
      'plans/hinged.json', 'plans/mirrored.json', 'plans/tool.json', 'plans/wider.json', 'plans/written.json',
    ].sort())
    // The original is left as it was: each change went to its out.
    expect(readFileSync(join(project, 'plans', 'flat.json'), 'utf8')).toBe(sample)
    expect(readdirSync(base).sort()).toEqual(['elsewhere', 'home', 'outside', 'project', 'temp'])
    for (const folder of [work, home, temp]) expect(tree(folder)).toEqual([])
    expectOutsideUntouched()
  }, 120_000)
})
