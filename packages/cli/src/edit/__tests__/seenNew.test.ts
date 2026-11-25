/**
 * MSG-29: a change, and a diff, name each note set aside as seen that the change made new again,
 * counted with the same country as the mark. On the sample flat the US figures give one note
 * about the ground floor, and no report counted without a country has it: so a change names it
 * only when it counts the note again for the United States, as the mark was made.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { GRID_TOOLS } from '../../mcp/serveTools'

const sample = resolve(__dirname, '../../../fixtures/two-bed-flat.json')
const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function project(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-seen-new-'))
  made.push(dir)
  writeFileSync(join(dir, 'plan.json'), readFileSync(sample))
  return dir
}

const tool = (name: string) => GRID_TOOLS.find((t) => t.name === name)!
const call = async (dir: string, name: string, args: Record<string, unknown>) => tool(name).run(args, { project: openProject(dir, dir) })

interface SeenNew {
  number: number
  code: string
  thing: { kind: string; id: string }
  country: string | null
  by: string
  reason: string
  changed: { kind: string; id: string }[]
  text: string
}

/** Marks the US report's first note as seen, as the person asked. */
async function markUs(dir: string): Promise<string> {
  const check = await call(dir, 'grid_check', { plan: 'plan.json', country: 'US' })
  const line = (check.data as { lines: { code: string }[] }).lines[0]!
  await call(dir, 'grid_mark_seen', { plan: 'plan.json', line: 1, code: line.code, reason: 'Uses come with the next drawing', by: 'Reviewer', country: 'US' })
  return line.code
}

describe('a change that makes a seen note new again', () => {
  it('names it with its number in the report for the mark\'s country, who marked it and what changed', async () => {
    const dir = project()
    const code = await markUs(dir)
    expect(JSON.parse(readFileSync(join(dir, 'plan.seen.json'), 'utf8')).marks[0].country).toBe('US')
    const answer = await call(dir, 'grid_move_room_side', { plan: 'plan.json', room: 'bed2', side: 'north', by: 0.5 })
    const seenNew = (answer.data as { seenNew: SeenNew[] }).seenNew
    expect(seenNew).toHaveLength(1)
    expect(seenNew[0]).toMatchObject({ number: 1, code, thing: { kind: 'floor', id: 'ground' }, country: 'US', by: 'Reviewer', reason: 'Uses come with the next drawing' })
    expect(seenNew[0]!.changed).toContainEqual({ kind: 'floor', id: 'ground' })
    const said = answer.text.split('\n').find((line) => line.startsWith('Seen note 1 is new again'))
    expect(said).toBe(seenNew[0]!.text)
    expect(said).toContain(', counted for the United States as when it was marked: ')
    expect(said).toContain(`[${code}]`)
    expect(said).toContain('It was seen by "Reviewer" on ')
    expect(said).toMatch(/; floor "ground"[^;]* changed since\.$/)
    // grid_check counted for the United States lists it as new again too.
    const check = await call(dir, 'grid_check', { plan: 'plan.json', country: 'US' })
    expect((check.data as { seenCount: number }).seenCount).toBe(0)
  })

  it('names it once: a second change finds it already new', async () => {
    const dir = project()
    await markUs(dir)
    await call(dir, 'grid_move_room_side', { plan: 'plan.json', room: 'bed2', side: 'north', by: 0.5 })
    const again = await call(dir, 'grid_move_room_side', { plan: 'plan.json', room: 'bed2', side: 'north', by: -0.5 })
    expect((again.data as { seenNew: SeenNew[] }).seenNew).toEqual([])
    expect(again.text).not.toContain('Seen note')
  })

  it('says nothing with no marks, or when the change is written to another file', async () => {
    const plain = project()
    const none = await call(plain, 'grid_move_room_side', { plan: 'plan.json', room: 'bed2', side: 'north', by: 0.5 })
    expect((none.data as { seenNew: SeenNew[] }).seenNew).toEqual([])
    expect(none.text).not.toContain('Seen note')
    const dir = project()
    await markUs(dir)
    const elsewhere = await call(dir, 'grid_move_room_side', { plan: 'plan.json', room: 'bed2', side: 'north', by: 0.5, out: 'option-b.json' })
    expect((elsewhere.data as { seenNew: SeenNew[] }).seenNew).toEqual([])
  })
})

describe('a diff since a seen note was marked', () => {
  it('names the note new again since the earlier version', async () => {
    const dir = project()
    await call(dir, 'grid_mark_start', { plan: 'plan.json' })
    const code = await markUs(dir)
    await call(dir, 'grid_move_room_side', { plan: 'plan.json', room: 'bed2', side: 'north', by: 0.5 })
    const diff = await call(dir, 'grid_diff', { plan: 'plan.json', picture: false })
    const seenNew = (diff.data as { seenNew: SeenNew[] }).seenNew
    expect(seenNew.map((s) => [s.number, s.code, s.country])).toEqual([[1, code, 'US']])
    expect(diff.text.split('\n')).toContain(seenNew[0]!.text)
  })

  it('names none when nothing the note is about changed', async () => {
    const dir = project()
    await call(dir, 'grid_mark_start', { plan: 'plan.json' })
    await markUs(dir)
    const diff = await call(dir, 'grid_diff', { plan: 'plan.json', picture: false })
    expect((diff.data as { seenNew: SeenNew[] }).seenNew).toEqual([])
  })
})
