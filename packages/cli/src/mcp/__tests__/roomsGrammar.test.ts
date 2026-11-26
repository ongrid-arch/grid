/**
 * CMD-38: the whole rooms grammar where agents read it. Every topic's example writes with no
 * problem; the rooms argument of grid_write_rooms, the resource and `docs/rooms-first.md` carry
 * it; and grid_write_rooms writes a plan from a rooms text file in the project.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { safeParseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { handleLine } from '../protocol'
import { GRID_TOOLS, projectResources } from '../serveTools'
import { toolDefinition } from '../toolkit'
import { ROOMS_GRAMMAR, ROOMS_GRAMMAR_URI, roomsGrammarMarkdown } from '../roomsGrammar'
import { bench } from './replay/harness'

const writeRooms = toolDefinition(GRID_TOOLS.find((t) => t.name === 'grid_write_rooms')!)
const roomsArg = (writeRooms.inputSchema as { properties: Record<string, { description: string }> }).properties['rooms']!.description

/** WRT-75: the shell the fit-out's example is written on, 12 x 8 m to its 0.3 m walls' centre lines, with a door. */
function shell(): FloorPlan {
  const made = compileRoomsText(['walls outside 0.3', 'room unit "Unit" office 11.7 x 7.7 at 0.15,0.15', 'door entrance in unit south, 1 from west, 1.2 wide'].join('\n'))
  return safeParseFloorPlan(made.plan)!
}

describe('the rooms grammar (CMD-38)', () => {
  for (const topic of ROOMS_GRAMMAR) {
    it(`writes the example of ${topic.topic} with no problem`, () => {
      const result = compileRoomsText(`${topic.example.join('\n')}\n`, topic.topic === 'fit-out' ? { base: { file: 'shell.json', plan: shell() } } : {})
      // A copy renames the ids it writes again, and says so: that is what a copy does.
      const said = [...result.problems.map((p) => p.message), ...result.warnings.filter((w) => w.code !== 'rooms/id-changed').map((w) => `${w.code}: ${w.message}`)]
      expect(said).toEqual([])
      expect(result.plan).not.toBeNull()
    })
  }

  it('carries every topic and its example in the rooms argument', () => {
    for (const topic of ROOMS_GRAMMAR) {
      expect(roomsArg).toContain(topic.says)
      expect(roomsArg).toContain(topic.example.join('\n'))
    }
  })

  it('names what agents did not find in the tool texts', () => {
    const text = `${writeRooms.description}\n${roomsArg}`
    for (const word of ['arc', 'sweep', 'degrees', 'centre', 'polygon', 'elevation', 'copy', 'through', 'outdoor', 'garden', 'unit', 'place', 'repeat', 'mirror', 'raw floor', 'roof', 'gable', 'open', 'height', 'roomsFile']) {
      expect(text, word).toContain(word)
    }
  })

  it('is served as markdown, and docs/rooms-first.md holds it word for word', async () => {
    const line = await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'resources/read', params: { uri: ROOMS_GRAMMAR_URI } }), [], projectResources())
    const read = (JSON.parse(line as string) as { result: { contents: { text: string }[] } }).result
    expect(read.contents[0]!.text).toBe(roomsGrammarMarkdown())
    const page = readFileSync(resolve(__dirname, '../../../../../docs/rooms-first.md'), 'utf8')
    expect(page).toContain(roomsGrammarMarkdown())
  })
})

describe('grid_write_rooms roomsFile (CMD-38)', () => {
  const b = bench({})
  afterAll(() => b.close())
  const text = ROOMS_GRAMMAR.find((t) => t.topic === 'floors')!.example.join('\n')

  it('writes the plan from a rooms text file in the project', async () => {
    writeFileSync(join(b.folder, 'building.rooms'), `${text}\n`)
    const reply = await b.call('grid_write_rooms', { roomsFile: 'building.rooms' })
    expect(reply.isError, reply.text).toBe(false)
    const plan = JSON.parse(readFileSync(join(b.folder, 'plan.json'), 'utf8')) as { floors: { id: string }[] }
    expect(plan.floors.map((f) => f.id)).toEqual(['ground', 'first', 'second'])
  })

  it('is refused with rooms, and names a file that is not there', async () => {
    const both = await b.call('grid_write_rooms', { roomsFile: 'building.rooms', rooms: text })
    expect(both.isError).toBe(true)
    expect(both.text).toContain('Pass roomsFile or rooms, not both')
    const missing = await b.call('grid_write_rooms', { roomsFile: 'nowhere.rooms', plan: 'other.json' })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('There is no file nowhere.rooms.')
  })
})
