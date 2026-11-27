/**
 * SHT-25: a long call reports how far it has got when the client asks (MCP's `progressToken` in the
 * request's `_meta`): `grid_sheet` sends one `notifications/progress` line per page, in order,
 * before its answer. A call without a token, or a server that cannot send lines of its own, sends
 * none, as before.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { handleLine } from '../protocol'
import { projectTools } from '../serveTools'

const folder = mkdtempSync(join(tmpdir(), 'grid-progress-'))
writeFileSync(join(folder, 'grid.json'), '{"version":1}\n')
writeFileSync(join(folder, 'plan.json'), readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/rooms/two-storey.plan.json')))
const tools = projectTools(openProject(folder, folder, 'project'))
afterAll(() => rmSync(folder, { recursive: true, force: true }))

interface Note {
  readonly method: string
  readonly params: { readonly progressToken: string | number; readonly progress: number; readonly total: number; readonly message: string }
}

async function call(params: Record<string, unknown>, notifying = true): Promise<{ notes: Note[]; answer: { result: { structuredContent: { pages: unknown[] } }; id: number }; order: string[] }> {
  const notes: Note[] = []
  const order: string[] = []
  const line = JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'grid_sheet', arguments: { plan: 'plan.json', layout: 'check', date: '2026-01-31' }, ...params } })
  const out = await handleLine(line, tools, [], notifying ? (note) => { notes.push(JSON.parse(note) as Note); order.push('note') } : undefined)
  order.push('answer')
  return { notes, answer: JSON.parse(out as string), order }
}

describe('a grid_sheet call with a progress token (SHT-25)', () => {
  it('hears of every page, in order, before its answer', async () => {
    const { notes, answer, order } = await call({ _meta: { progressToken: 'sheet-1' } })
    const pages = answer.result.structuredContent.pages.length
    expect(pages).toBeGreaterThan(2)
    expect(notes).toHaveLength(pages)
    notes.forEach((note, i) => {
      expect(note.method).toBe('notifications/progress')
      expect(note).not.toHaveProperty('id')
      expect(note.params).toEqual({ progressToken: 'sheet-1', progress: i + 1, total: pages, message: `Page ${i + 1} of ${pages}` })
    })
    expect(order.at(-1)).toBe('answer')
    expect(order.filter((o) => o === 'note')).toHaveLength(pages)
  }, 120_000)

  it('takes a whole number as its token, as the protocol allows', async () => {
    const { notes } = await call({ _meta: { progressToken: 42 } })
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((note) => note.params.progressToken === 42)).toBe(true)
  }, 120_000)

  it('hears nothing without a token, with a token that is no token, or from a server that sends no lines of its own', async () => {
    expect((await call({})).notes).toEqual([])
    expect((await call({ _meta: { progressToken: { not: 'a token' } } })).notes).toEqual([])
    expect((await call({ _meta: { progressToken: 'x'.repeat(65) } })).notes).toEqual([])
    const quiet = await call({ _meta: { progressToken: 'sheet-2' } }, false)
    expect(quiet.notes).toEqual([])
    expect(quiet.answer.id).toBe(7)
  }, 120_000)
})
