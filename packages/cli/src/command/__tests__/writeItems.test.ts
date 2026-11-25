import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { runGrid } from '../main'

/**
 * WRT-46: rooms text holds no fixtures or furniture, so a plan written again from rooms text keeps
 * its items where they stood. The answer says so, names each one with the room it is in now, and
 * names at once a kept item the new walls run into, which the count after holds too.
 */

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/flat.rooms'), 'utf8')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

async function grid(dir: string, ...args: string[]): Promise<{ status: number; out: string; err: string }> {
  let out = ''
  let err = ''
  const status = await runGrid(args, {
    stdout: (data) => (out += typeof data === 'string' ? data : Buffer.from(data).toString('utf8')),
    stderr: (text) => (err += text),
    stdoutIsTerminal: false,
    cwd: dir,
  })
  return { status, out, err }
}

/** The sample flat written from rooms text, then three double beds put in its file: two in the living room, one in bedroom 1. */
async function flatWithBeds(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'grid-write-items-'))
  made.push(dir)
  expect((await grid(dir, 'init')).status).toBe(0)
  writeFileSync(join(dir, 'plan.rooms'), FLAT)
  expect((await grid(dir, 'write', 'plan.rooms')).status).toBe(0)
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as Record<string, unknown>
  plan['items'] = [
    { id: 'bed-1', library: 'double-bed', at: [1.5, 2.2] },
    { id: 'bed-2', library: 'double-bed', at: [3.3, 2.2] },
    { id: 'bed-3', library: 'double-bed', at: [7.2, 1.7] },
  ]
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(plan, null, 2))
  return dir
}

describe('grid write over a plan that holds items', () => {
  it('says which items it kept and where, and names the one the new walls run into', async () => {
    const dir = await flatWithBeds()
    // Bedroom 1 made narrower: its east wall now stands across bed-3.
    writeFileSync(join(dir, 'narrow.rooms'), FLAT.replace('bedroom  4.4 x 3.1  east of living', 'bedroom  3.0 x 3.1  east of living'))
    const ran = await grid(dir, 'write', 'narrow.rooms', '--replace')
    expect(ran.err).toBe('')
    expect(ran.status).toBe(0)
    expect(ran.out).toContain('Kept the plan\'s 3 items where they stood, as the file has them: bed "bed-1" in "Living room"; bed "bed-2" in "Living room"; bed "bed-3" in "Bedroom 1".')
    expect(ran.out).toContain('their ids stay taken')
    expect(ran.out).toMatch(/Worth a look: Bed "bed-3" runs into wall "[^"]+" by [0-9.]+ m/)
    expect(ran.out).not.toMatch(/Worth a look: Bed "bed-[12]"/)
    // The items stay in the file as they were.
    const items = (JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8')) as { items: { id: string }[] }).items
    expect(items.map((i) => i.id)).toEqual(['bed-1', 'bed-2', 'bed-3'])
    // The count after holds the bed the wall runs into, as grid check does: the same text written
    // over the flat with no beds counts fewer.
    const after = (out: string): number => Number(/Problems in the drawing: \d+ → (\d+)\./.exec(out)?.[1])
    expect((await grid(dir, 'check', '--json', '--full')).out).toContain('item/into-wall')
    const bare = mkdtempSync(join(tmpdir(), 'grid-write-items-'))
    made.push(bare)
    expect((await grid(bare, 'init')).status).toBe(0)
    writeFileSync(join(bare, 'narrow.rooms'), FLAT.replace('bedroom  4.4 x 3.1  east of living', 'bedroom  3.0 x 3.1  east of living'))
    expect(after(ran.out)).toBeGreaterThan(after((await grid(bare, 'write', 'narrow.rooms')).out))
  })

  it('answers the kept items as data with --json, each with its room and what is worth a look', async () => {
    const dir = await flatWithBeds()
    writeFileSync(join(dir, 'narrow.rooms'), FLAT.replace('bedroom  4.4 x 3.1  east of living', 'bedroom  3.0 x 3.1  east of living'))
    const ran = await grid(dir, 'write', 'narrow.rooms', '--replace', '--json')
    expect(ran.status).toBe(0)
    const answer = JSON.parse(ran.out) as { itemsKept: { id: string; kind: string; at: number[]; floor: string; room: string | null; worthALook: string[] }[] }
    expect(answer.itemsKept.map((item) => [item.id, item.kind, item.room])).toEqual([
      ['bed-1', 'bed', 'Living room'],
      ['bed-2', 'bed', 'Living room'],
      ['bed-3', 'bed', 'Bedroom 1'],
    ])
    expect(answer.itemsKept[2]!.at).toEqual([7.2, 1.7])
    expect(answer.itemsKept[2]!.worthALook.join(' ')).toContain('runs into wall')
    expect(answer.itemsKept[0]!.worthALook).toEqual([])
  })

  it('says nothing of items when the plan holds none', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'grid-write-items-'))
    made.push(dir)
    expect((await grid(dir, 'init')).status).toBe(0)
    writeFileSync(join(dir, 'plan.rooms'), FLAT)
    const ran = await grid(dir, 'write', 'plan.rooms')
    expect(ran.status).toBe(0)
    expect(ran.out).not.toContain('items')
    expect((JSON.parse((await grid(dir, 'write', 'plan.rooms', '--json')).out) as { itemsKept: unknown[] }).itemsKept).toEqual([])
  })
})
