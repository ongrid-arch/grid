/**
 * SHT-27: the access measurements made findable and printable. The wheelchair user's narrow flat
 * (lab EL-15: every door a 0.55 m hole, a hall 0.70 m wide, an 18 cm sill at the entrance) with
 * the person's own figures in the brief: the drawing marks each way in, each turning circle, each
 * door's clear width and sill with the figure it falls short of, and the access sheet prints the
 * figures with their quotes, the tables and what Grid did not look at. grid_measure's description
 * puts wheelchair, step-free and accessible first.
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { say } from '@ongrid/floorplan/messages'
import { pictureToSvg, planPicture } from '@ongrid/viewer/src/picture'
import { openProject } from '../../fs/projectFiles'
import { loadPlan } from '../../command/plan'
import { runGrid } from '../../command/main'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'
import { NOT_LOOKED_AT } from '../../quantities/access'
import { accessMarkLabels, readAccess } from '../../quantities/accessMarks'
import { READ_TOOLS } from '../../mcp/readTools'
import { NOT_LOOKED_AT_KEYS } from '../accessSheet'
import { sheetPages } from '../pages'

const LAB = resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')
function labPlan(name: string): Record<string, unknown> {
  for (const line of gunzipSync(readFileSync(LAB)).toString('utf8').split('\n')) {
    if (line.length === 0) continue
    const stored = JSON.parse(line) as { name: string; text: string }
    if (stored.name === name) return JSON.parse(stored.text) as Record<string, unknown>
  }
  throw new Error(`${name} is not in the lab data`)
}
const NARROW = 'J/scenarios/7-wheelchair-user/probe-narrow-everything.json'
const BRIEF = {
  figures: {
    door_width: { value: 0.8, level: 'must', source: 'given', quote: 'doors 80 cm clear for my chair' },
    corridor_width: { value: 1.2, level: 'must', source: 'given', quote: 'a hall I can pass along, 1.2 m' },
    turning_circle: { value: 1.5, level: 'must', source: 'given', quote: 'room to turn, 1.5 m' },
    step: { value: 0, level: 'must', source: 'given', quote: 'no step at any door' },
  },
}
const DATE = new Date('2026-11-21T12:00:00Z')

let b: Bench | null = null
afterEach(() => {
  b?.close()
  b = null
})

async function withBrief(brief: unknown = BRIEF): Promise<{ project: ReturnType<typeof openProject>; loaded: ReturnType<typeof loadPlan> }> {
  b = bench({ 'probe.json': labPlan(NARROW) })
  if (brief !== null) expect((await b.call('grid_write_brief', { plan: 'probe.json', brief })).isError).toBe(false)
  const project = openProject(b.folder, b.folder, 'project')
  return { project, loaded: loadPlan(project, 'probe.json') }
}

describe('SHT-27 the access marks on a plan', () => {
  it('draws each way, each turning circle and each door\'s clear width, naming the figure a number is short of', async () => {
    const { project, loaded } = await withBrief()
    const read = readAccess(project, 'probe.json', loaded.plan)
    const labels = accessMarkLabels(read, loaded.plan)
    const svg = pictureToSvg(planPicture(loaded.plan, { floor: 'ground', marks: { access: labels } }))
    // One dashed way per room reached from the entrance, each ending in its room.
    const routes = [...svg.matchAll(/data-part="access-route" data-to="([^"]+)"/g)].map((m) => m[1])
    expect(routes.length).toBe(read.data.ways.filter((w) => w.found).length)
    expect(routes.length).toBeGreaterThanOrEqual(5)
    // Every door measured has its clear width, and the 0.80 m figure it is short of, in its tag.
    const doors = [...svg.matchAll(/data-part="access-door" data-id="([^"]+)" data-short="(true|false)"/g)].map((m) => [m[1], m[2]])
    expect(doors.map((d) => d[0])).toEqual(expect.arrayContaining(['door-entrance', 'door-living', 'door-bath']))
    expect(doors.filter((d) => d[0]!.startsWith('door-')).every((d) => d[1] === 'true')).toBe(true)
    expect(svg).toContain('0.50 m clear, under your 0.80 m')
    // The entrance's 18 cm sill is in its door's words, over the person's step of 0.
    expect(svg).toContain('0.50 m clear, sill 0.18 m, under your 0.80 m')
    // Each room's turning circle at its size, the hall's short of the person's 1.50 m.
    const hall = svg.match(/data-part="access-turning" data-id="hall" data-diameter="([\d.]+)" data-short="true"/)
    expect(hall).not.toBeNull()
    expect(Number(hall![1])).toBeCloseTo(0.7, 1)
    expect(svg).toMatch(/turns 0\.7\d m, under your 1\.50 m/)
  })

  it('draws the numbers alone with no brief, none of them short', async () => {
    const { project, loaded } = await withBrief(null)
    const labels = accessMarkLabels(readAccess(project, 'probe.json', loaded.plan), loaded.plan)
    expect(labels.doors.length).toBeGreaterThan(0)
    expect([...labels.doors, ...labels.turning, ...labels.steps].some((m) => m.short)).toBe(false)
    expect(labels.doors.every((d) => !d.label.includes('your'))).toBe(true)
  })

  it('is asked for by grid draw --marks access, and by grid_view marks access', async () => {
    await withBrief()
    let out = ''
    let err = ''
    const code = await runGrid(['draw', 'probe.json', '--marks', 'access'], { stdout: (data) => { out += String(data) }, stderr: (data) => { err += String(data) }, stdoutIsTerminal: false, cwd: b!.folder })
    expect(code, err).toBe(0)
    expect(out).toContain('data-part="access-door"')
    expect(out).toContain('under your 0.80 m')
    const view = await b!.call('grid_view', { plan: 'probe.json', kind: 'plan', marks: ['access'] })
    expect(view.isError, view.text).toBe(false)
    expect(view.text).toMatch(/what grid_measure what=access measures, as tags: \d+ ways in/)
    expect(view.text).toMatch(/\b[1-9]\d* short of the person's own figures/)
  })
})

describe('SHT-27 the access sheet', () => {
  it('prints the figures with their quotes, a drawing per floor, the tables and the not-looked-at list', async () => {
    const { project, loaded } = await withBrief()
    const sheet = sheetPages(loaded, null, 'access', { name: 'probe', date: DATE, access: readAccess(project, 'probe.json', loaded.plan) })
    expect(sheet.layout).toBe('access')
    const [first, ...rest] = sheet.pages
    expect(first!.title).toBe('Access')
    expect(first!.paragraphs[0]).toBe(say('en', 'sheet.access.head'))
    // The person's own figures, each with their words from the brief.
    expect(first!.table!.rows.map((r) => [r.name, r.area])).toEqual([
      ['Door width', '0.80 m'], ['Corridor width', '1.20 m'], ['Turning circle', '1.50 m'], ['Step at a door, at most', '0.00 m'],
    ])
    expect(first!.table!.rows[0]!.detail).toBe('your figure, as you said it: “doors 80 cm clear for my chair”')
    expect(Number(first!.figures[1]!.value)).toBeGreaterThan(0)
    // The floor page: the drawing with the access marks, and its doors against the figure.
    const floor = rest.find((p) => p.kind === 'floor')!
    expect(floor.picture).toMatchObject({ kind: 'plan', floor: 'ground' })
    expect((floor.picture as { access?: unknown }).access).toBeDefined()
    const entrance = floor.table!.rows.find((r) => r.name.includes('door-entrance'))!
    expect(entrance.area).toBe('0.50 m')
    expect(entrance.detail).toBe('0.55 m hole, sill 0.18 m, the entrance, under your 0.80 m')
    // The hall at its narrowest and its turning space, each against the person's figure.
    const rooms = rest.find((p) => p.title === 'Corridors and turning space')!
    expect(rooms.table!.rows.find((r) => r.detail!.startsWith('corridor'))!.detail).toBe('corridor, at its narrowest from end to end, under your 1.20 m')
    // The ways in, each with its doors and steps, then what Grid did not look at.
    const ways = rest.find((p) => p.title === 'Ways in')!
    const bath = ways.table!.rows.find((r) => r.name === 'To Bathroom')!
    expect(bath.detail).toContain('through door-entrance, door-bed2, door-bath')
    expect(bath.detail).toContain('1 step: a sill of 0.18 m at door-entrance, higher than your 0.00 m')
    expect(ways.notes).toContain('Not looked at:')
    expect(ways.notes.slice(-NOT_LOOKED_AT.length)).toEqual([...NOT_LOOKED_AT])
    // Numbers, never a finding.
    expect(sheet.pages.flatMap((p) => [...p.paragraphs, ...p.notes]).join('\n')).not.toMatch(/\bis accessible|complies|approved/i)
  })

  it('says when no brief gives figures, and writes the PDF through grid_sheet layout=access', async () => {
    const { project, loaded } = await withBrief(null)
    const sheet = sheetPages(loaded, null, 'access', { name: 'probe', date: DATE, access: readAccess(project, 'probe.json', loaded.plan) })
    expect(sheet.pages[0]!.table).toBeNull()
    expect(sheet.pages[0]!.notes[0]).toBe(say('en', 'sheet.access.figures.none'))
    const reply = await b!.call('grid_sheet', { plan: 'probe.json', layout: 'access', date: '2026-11-21' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.data!['written']).toMatch(/probe-access\.pdf$/)
    const words = await b!.call('grid_sheet', { plan: 'probe.json', layout: 'access', sheet: { version: '1', name: 'X' } })
    expect(words.isError).toBe(true)
    expect(words.text).toContain('an access sheet takes none')
  }, 60000)

  it('keeps one key per thing not looked at, in the measure\'s own words', () => {
    expect(NOT_LOOKED_AT_KEYS.map((key) => say('en', key))).toEqual([...NOT_LOOKED_AT])
  })
})

describe('SHT-27 grid_measure is found for access', () => {
  it('starts its description with wheelchair, step-free and accessible, and what=access', () => {
    const measure = READ_TOOLS.find((t) => t.name === 'grid_measure')!
    const first = measure.description.split('. ')[0]!
    expect(first).toMatch(/^Use this when the person asks about wheelchair, step-free or accessible access: what=access/)
  })
})
