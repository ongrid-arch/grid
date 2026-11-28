/**
 * CMD-39: every answer kept to a size an agent's host takes. On a tower of twenty hotel floors (500
 * rooms) the reading tools and grid_write_rooms answered far more than the budget; now each answer
 * is within it, says on its first line after the label what it left out and how to get the rest,
 * and still matches its output schema. A small plan's answer is as it was, to the byte.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import Ajv from 'ajv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ANSWER_BUDGET_BYTES } from '../budget'
import { GRID_TOOLS } from '../serveTools'
import { toolDefinition } from '../toolkit'
import { bench, type Bench, type Reply } from './replay/harness'

const ROOMS = resolve(__dirname, '../../../../floorplan/fixtures/rooms')
const FLOORS = 20

/** The hotel floor's rooms text written on each of `FLOORS` floors, its room numbers by floor. */
function tower(): string {
  const hotel = readFileSync(resolve(ROOMS, 'hotel.rooms'), 'utf8').split('\n')
  const lines = [...hotel.slice(0, 3), ...hotel.slice(4, 11)]
  const floor = hotel.slice(11).filter((line) => line.trim() !== '')
  for (let f = 1; f <= FLOORS; f++) lines.push(`floor f${f} "Floor ${f}" level ${3 * f}`, ...floor.map((line) => line.replace(/\b3(0\d)\b/g, `${f}$1`)))
  return lines.join('\n')
}

const ajv = new Ajv({ allErrors: true, schemaId: 'auto' })
function schemaProblems(tool: string, data: unknown): string[] {
  const validate = ajv.compile(toolDefinition(GRID_TOOLS.find((t) => t.name === tool)!)['outputSchema'] as Record<string, unknown>)
  return validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.dataPath || '/'} ${e.message}`)
}

const size = (reply: Reply): number => new TextEncoder().encode(reply.text + JSON.stringify(reply.data ?? {})).length

let b: Bench
let wrote: Reply
beforeAll(async () => {
  b = bench({ 'flat.json': JSON.parse(readFileSync(resolve(ROOMS, 'flat.plan.json'), 'utf8')) })
  wrote = await b.call('grid_write_rooms', { plan: 'tower.json', rooms: tower() })
  // WRT-87: without the text it was written from, so the read-back is the plan worked out, every room and wall of it.
  const file = JSON.parse(readFileSync(join(b.folder, 'tower.json'), 'utf8')) as { written?: { text?: string } }
  if (file.written !== undefined) delete file.written.text
  writeFileSync(join(b.folder, 'tower.json'), `${JSON.stringify(file, null, 2)}\n`)
}, 120_000)
afterAll(() => b.close())

describe('every answer within the budget (CMD-39)', () => {
  it('keeps the write of a large plan within the budget, its result still said', () => {
    expect(wrote.isError, wrote.text).toBe(false)
    expect(size(wrote)).toBeLessThanOrEqual(ANSWER_BUDGET_BYTES)
    const [label, note] = wrote.text.split('\n')
    expect(label).toBe('General guidance, not your local rules')
    expect(note).toMatch(/^This answer is \d+ KB whole, more than the 20 KB an answer is kept to/)
    expect(note).toContain('The change is made in full.')
    expect(note).not.toContain('page=')
    expect(wrote.text).toContain(`${FLOORS} floors, 500 rooms`)
    expect(schemaProblems('grid_write_rooms', wrote.data)).toEqual([])
  })

  for (const [tool, args] of [
    ['grid_check', {}],
    ['grid_areas', {}],
    ['grid_describe', {}],
    ['grid_describe', { as: 'rooms' }],
    ['grid_schedule', {}],
    ['grid_takeoff', {}],
  ] as const) {
    it(`${tool} ${JSON.stringify(args)} answers within the budget and says what it left out`, async () => {
      const reply = await b.call(tool, { plan: 'tower.json', ...args })
      expect(reply.isError, reply.text).toBe(false)
      expect(size(reply)).toBeLessThanOrEqual(ANSWER_BUDGET_BYTES)
      expect(reply.text.split('\n').slice(0, 2).join('\n')).toMatch(/This answer is \d+ KB whole, more than the 20 KB an answer is kept to, so it is shortened: .*whole=true gives all of it at once/)
      const leftOut = reply.data!['left_out'] as { whole_bytes: number; budget_bytes: number; pages: number }
      expect(leftOut.budget_bytes).toBe(ANSWER_BUDGET_BYTES)
      expect(leftOut.whole_bytes).toBeGreaterThan(ANSWER_BUDGET_BYTES)
      expect(schemaProblems(tool, reply.data)).toEqual([])
    }, 60_000)
  }

  it('keeps rooms text read back as rooms text: its own lines stay comments', async () => {
    const reply = await b.call('grid_describe', { plan: 'tower.json', as: 'rooms' })
    for (const line of reply.text.split('\n').filter((l) => l.includes('KB whole') || l.includes('more lines like these') || l.includes('lines left out here'))) expect(line).toMatch(/^# /)
  }, 60_000)

  it('gives the text in pieces with page, and refuses a piece there is not', async () => {
    const first = await b.call('grid_describe', { plan: 'tower.json', as: 'rooms' })
    const pages = (first.data!['left_out'] as { pages: number }).pages
    expect(pages).toBeGreaterThan(2)
    const second = await b.call('grid_describe', { plan: 'tower.json', as: 'rooms', page: 2 })
    expect(second.isError, second.text).toBe(false)
    expect(size(second)).toBeLessThanOrEqual(ANSWER_BUDGET_BYTES)
    expect(second.text.split('\n')[1]).toBe(`# Piece 2 of ${pages} of this answer's text, ${Math.round((first.data!['left_out'] as { whole_bytes: number }).whole_bytes / 1000)} KB whole; page=3 gives the next.`)
    const last = await b.call('grid_describe', { plan: 'tower.json', as: 'rooms', page: pages })
    expect(last.text.split('\n')[1]).toMatch(/: the last\.$/)
    const beyond = await b.call('grid_describe', { plan: 'tower.json', as: 'rooms', page: pages + 1 })
    expect(beyond.isError).toBe(true)
    expect(beyond.text).toBe(`page takes a whole number from 1 to ${pages}: this answer's text is ${pages} pieces.`)
    const half = await b.call('grid_describe', { plan: 'tower.json', as: 'rooms', page: 1.5 })
    expect(half.isError).toBe(true)
    expect(half.text).toBe('page takes a whole number, from 1.')
  }, 60_000)

  it('walks every list it cut with page: the pieces together hold the whole answer\'s lines', async () => {
    const whole = await b.call('grid_check', { plan: 'tower.json', whole: true })
    const all = (whole.data!['lines'] as { code: string; message: string }[]).map((line) => `${line.code} ${line.message}`)
    const first = await b.call('grid_check', { plan: 'tower.json' })
    const pages = (first.data!['left_out'] as { pages: number }).pages
    expect(pages).toBeGreaterThan(1)
    const seen: string[] = []
    for (let page = 1; page <= pages; page++) {
      const piece = await b.call('grid_check', { plan: 'tower.json', page })
      expect(piece.isError, piece.text).toBe(false)
      expect(size(piece)).toBeLessThanOrEqual(ANSWER_BUDGET_BYTES)
      expect(schemaProblems('grid_check', piece.data)).toEqual([])
      const cut = (piece.data!['left_out'] as { lists: { path: string; from?: number; shown: number }[] }).lists.find((list) => list.path === 'lines')
      expect(cut?.from).toBe(seen.length)
      seen.push(...(piece.data!['lines'] as { code: string; message: string }[]).map((line) => `${line.code} ${line.message}`))
    }
    expect(seen).toEqual(all)
  }, 120_000)

  it('gives the answer whole with whole=true', async () => {
    const reply = await b.call('grid_areas', { plan: 'tower.json', whole: true })
    expect(size(reply)).toBeGreaterThan(ANSWER_BUDGET_BYTES)
    expect(reply.data!['left_out']).toBeUndefined()
    expect((reply.data!['floors'] as unknown[]).length).toBe(FLOORS)
  }, 60_000)

  it('leaves a small plan\'s answer as it was', async () => {
    const plain = await b.call('grid_areas', { plan: 'flat.json' })
    const whole = await b.call('grid_areas', { plan: 'flat.json', whole: true })
    expect(plain.text).toBe(whole.text)
    expect(plain.data).toEqual(whole.data)
    expect(plain.data!['left_out']).toBeUndefined()
    const one = await b.call('grid_areas', { plan: 'flat.json', page: 2 })
    expect(one.text).toBe("This answer's text is one piece: leave page out.")
  })

  it('offers page only on the tools that read: calling a change again to read on would change the plan again; the preview neither', () => {
    for (const tool of GRID_TOOLS) {
      const properties = (toolDefinition(tool)['inputSchema'] as { properties: Record<string, unknown> }).properties
      // The preview's answers are the page's to draw, whole.
      expect(properties['whole'] !== undefined, tool.name).toBe(tool.ui === undefined)
      expect(properties['page'] !== undefined, tool.name).toBe(tool.hint === 'read' && tool.ui === undefined)
    }
  })
})
