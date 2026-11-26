import { spawn } from 'child_process'
import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openProject } from '../../fs/projectFiles'
import { handleLine, type ServerTool } from '../protocol'
import { GRID_TOOLS, projectTools } from '../serveTools'
import { allArgs, toolDefinition } from '../toolkit'
import { twoBedFlat } from './replay/plans'

interface Reply {
  readonly texts: string[]
  readonly isError: boolean
  readonly data: Record<string, unknown> | undefined
}

let folder: string
let tools: ServerTool[]
let id = 1

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'grid-revisions-'))
  writeFileSync(join(folder, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(folder, 'plan.json'), `${JSON.stringify(twoBedFlat(), null, 2)}\n`)
  tools = projectTools(openProject(folder, folder, 'project'))
})

afterEach(() => rmSync(folder, { recursive: true, force: true }))

async function call(name: string, args: Record<string, unknown> = {}): Promise<Reply> {
  const line = JSON.stringify({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name, arguments: args } })
  const out = JSON.parse((await handleLine(line, tools)) as string) as { result: { content: Array<{ type: string; text?: string }>; isError?: boolean; structuredContent?: Record<string, unknown> } }
  return { texts: out.result.content.filter((c) => c.type === 'text').map((c) => c.text!), isError: out.result.isError === true, data: out.result.structuredContent }
}

const planText = (): string => readFileSync(join(folder, 'plan.json'), 'utf8')
const revisionNow = (): string => createHash('sha256').update(planText()).digest('hex').slice(0, 12)
const roomName = (room: string): string => (JSON.parse(planText()) as { rooms: { id: string; name: string }[] }).rooms.find((r) => r.id === room)!.name

describe('the plan revision on every answer', () => {
  it('is in the data of an answer that reads the plan, and in a line of its own after it', async () => {
    const read = await call('grid_describe')
    expect(read.isError).toBe(false)
    expect(read.data!['planRevision']).toBe(revisionNow())
    expect(read.texts).toHaveLength(2)
    expect(read.texts[1]).toBe(`"plan.json" is at revision ${revisionNow()}. A change given based_on=${revisionNow()} is refused if the plan changes first.`)
    // The answer's own text is left as it was: rooms text stays rooms text.
    const rooms = await call('grid_describe', { as: 'rooms' })
    expect(rooms.texts[0]).not.toContain('revision')
  })

  it('is left out of a refusal and of an answer about no plan file', async () => {
    const refused = await call('grid_describe', { plan: 'nowhere.json' })
    expect(refused.isError).toBe(true)
    expect(refused.texts).toHaveLength(1)
    const project = await call('grid_project')
    expect(project.data!['planRevision']).toBeUndefined()
  })

  it('is the plan as a change wrote it', async () => {
    const before = (await call('grid_describe')).data!['planRevision']
    const renamed = await call('grid_rename_room', { room: 'bed2', name: 'Study' })
    expect(renamed.isError).toBe(false)
    expect(renamed.data!['planRevision']).toBe(revisionNow())
    expect(renamed.data!['planRevision']).not.toBe(before)
  })

  it('is listed in every tool\'s output schema', () => {
    for (const tool of GRID_TOOLS) {
      const schema = toolDefinition(tool)['outputSchema'] as { properties?: Record<string, unknown>; anyOf?: { properties?: Record<string, unknown> }[] }
      if (schema.properties !== undefined) expect(schema.properties, tool.name).toHaveProperty('planRevision')
    }
  })
})

describe('based_on on every change', () => {
  it('is an argument of every tool that changes the plan, and of no other', () => {
    for (const tool of GRID_TOOLS) {
      const listed = Object.hasOwn((toolDefinition(tool)['inputSchema'] as { properties: object }).properties, 'based_on')
      expect(listed, tool.name).toBe(tool.hint === 'change-plan')
      expect(Object.hasOwn(allArgs(tool), 'based_on'), tool.name).toBe(tool.hint === 'change-plan')
    }
  })

  it('writes the change when the plan is still at the revision read', async () => {
    const read = (await call('grid_describe')).data!['planRevision']
    const renamed = await call('grid_rename_room', { room: 'bed2', name: 'Study', based_on: read })
    expect(renamed.isError).toBe(false)
    expect(renamed.texts[0]).toContain('Wrote')
    expect(roomName('bed2')).toBe('Study')
  })

  it('refuses a change based on a revision the plan has moved on from, with what changed, and writes nothing', async () => {
    const read = (await call('grid_describe')).data!['planRevision'] as string
    // Another agent's change comes first.
    await call('grid_rename_room', { room: 'kitchen', name: 'Cocina' })
    const between = planText()
    const late = await call('grid_rename_room', { room: 'bed2', name: 'Study', based_on: read })
    expect(late.isError).toBe(true)
    expect(late.texts).toHaveLength(1)
    const [text] = late.texts
    expect(text).toContain('The plan changed since you read it')
    expect(text).toContain(`was at revision ${read} and is at ${revisionNow()} now, so nothing was written`)
    expect(text).toContain('What changed since then: 1 change, room by room: "Kitchen" renamed "Cocina"')
    expect(text).toContain(`with based_on=${revisionNow()}`)
    expect(planText()).toBe(between)
    expect(roomName('bed2')).toBe('Bedroom 2')
  })

  it('says what changed can\'t be listed when this server never read that version', async () => {
    const late = await call('grid_rename_room', { room: 'bed2', name: 'Study', based_on: 'abcdef012345' })
    expect(late.isError).toBe(true)
    expect(late.texts[0]).toContain('The plan changed since you read it')
    expect(late.texts[0]).toContain('no longer held by this server')
    expect(roomName('bed2')).toBe('Bedroom 2')
  })

  it('refuses a based_on that is not a revision, and one for a plan that is gone', async () => {
    const wrong = await call('grid_rename_room', { room: 'bed2', name: 'Study', based_on: 'yesterday' })
    expect(wrong.isError).toBe(true)
    expect(wrong.texts[0]).toContain('based_on takes a revision')
    const read = (await call('grid_describe')).data!['planRevision']
    rmSync(join(folder, 'plan.json'))
    const gone = await call('grid_rename_room', { room: 'bed2', name: 'Study', based_on: read })
    expect(gone.isError).toBe(true)
    expect(gone.texts[0]).toContain('is not there now, so nothing was written')
  })
})

describe('changes that come at once', () => {
  it('in one process, each works on the plan as the last one left it', async () => {
    const rooms = ['living', 'kitchen', 'hall', 'bed1', 'bath', 'bed2']
    const answers = await Promise.all(rooms.map((room) => call('grid_rename_room', { room, name: `Room ${room}` })))
    for (const answer of answers) expect(answer.isError).toBe(false)
    for (const room of rooms) expect(roomName(room)).toBe(`Room ${room}`)
    expect(existsSync(join(folder, 'plan.lock'))).toBe(false)
  })

  it('wait for another process that holds the plan, and keep its change', async () => {
    const lock = join(folder, 'plan.lock')
    writeFileSync(lock, `${JSON.stringify({ pid: process.ppid, at: new Date().toISOString() })}\n`)
    // The other process writes its change, then lets the plan go.
    const theirs = JSON.parse(planText()) as { rooms: { id: string; name: string }[] }
    theirs.rooms.find((r) => r.id === 'kitchen')!.name = 'Their kitchen'
    const script = `const fs = require('fs'); setTimeout(() => { fs.writeFileSync(${JSON.stringify(join(folder, 'plan.json'))}, ${JSON.stringify(`${JSON.stringify(theirs, null, 2)}\n`)}); fs.unlinkSync(${JSON.stringify(lock)}) }, 300)`
    const other = spawn(process.execPath, ['-e', script], { stdio: 'ignore' })
    const mine = await call('grid_rename_room', { room: 'bed2', name: 'Study' })
    await new Promise((resolve) => (other.exitCode === null ? other.on('close', resolve) : resolve(null)))
    expect(mine.isError).toBe(false)
    expect(roomName('kitchen')).toBe('Their kitchen')
    expect(roomName('bed2')).toBe('Study')
  })
})
