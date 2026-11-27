/**
 * MSG-33: a call with several mistakes is refused with every one of them, so the agent mends
 * them all in one more call: each required argument left out, the arguments the tool does not
 * take and each value it cannot read. One mistake keeps its old words. The brief names every
 * fault of a wish, and a field it does not take is a line it could not keep, not the whole brief.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { asOptions } from '../../command/edit'
import { parseBriefLines } from '../../brief/brief'
import { GRID_TOOLS } from '../serveTools'
import { readArgs, ToolRefusal, type GridTool } from '../toolkit'
import { bench, type Bench } from './replay/harness'

const tool = (name: string): GridTool => GRID_TOOLS.find((t) => t.name === name)!

function refusal(name: string, raw: unknown): string {
  try {
    readArgs(tool(name), raw)
  } catch (error) {
    if (error instanceof ToolRefusal) return error.message
    throw error
  }
  throw new Error('the call was not refused')
}

describe('every fault of a call in one refusal (MSG-33)', () => {
  it('names each required argument left out', () => {
    const text = refusal('grid_split_room', {})
    for (const name of ['room', 'side', 'size', 'new_room', 'new_name']) expect(text).toMatch(new RegExp(`^- Pass ${name}:`, 'm'))
    expect(text.split('\n')[0]).toMatch(/^grid_split_room was not run: put these 5 right/)
  })

  it('names an argument it does not take with a value it cannot read and one left out', () => {
    const text = refusal('grid_merge_rooms', { room: 'a b', colour: 'red' })
    expect(text).toMatch(/^- grid_merge_rooms takes .*, not "colour"\./m)
    expect(text).toMatch(/^- room must be an id of the plan/m)
    expect(text).toMatch(/^- Pass with:/m)
    expect(text.split('\n')).toHaveLength(4)
  })

  it('keeps the old words for one fault', () => {
    expect(refusal('grid_merge_rooms', { room: 'kitchen' })).toMatch(/^Pass with: /)
    expect(refusal('grid_merge_rooms', { room: 'kitchen' })).not.toContain('\n')
  })

  it('reads a call with no fault as before', () => {
    expect(readArgs(tool('grid_merge_rooms'), { room: 'kitchen', with: 'dining' })).toMatchObject({ room: 'kitchen', with: 'dining' })
  })

  it('turns every line into the command\'s options for grid edit', () => {
    const split = tool('grid_split_room')
    const text = asOptions(refusal('grid_split_room', {}), split)
    expect(text).toMatch(/^- Pass --new-room:/m)
    expect(text).toMatch(/^- Pass --room:/m)
  })

  it('writes the brief from a call whose brief has several faults, naming each', () => {
    const text = refusal('grid_write_brief', { brief: { rooms: [{ name: 'Study', area: -1, level: 'maybe', source: 'given' }] }, colour: 1 })
    expect(text).toMatch(/not "colour"/)
    expect(text).toMatch(/rooms\[0\]\.area/)
    expect(text).toMatch(/rooms\[0\]\.level/)
  })
})

describe('every fault of a brief (MSG-33)', () => {
  const ok = { level: 'must', source: 'given', quote: 'as said' }

  it('names every fault of one wish, not the first', () => {
    const { refused } = parseBriefLines({ rooms: [{ name: 'Study', area: -1, count: 1.5, level: 'maybe', source: 'heard' }], open: [{ quote: 'q' }] }, { versionNeeded: false })
    expect(refused).toHaveLength(1)
    const problem = refused[0]!.problem
    for (const part of ['rooms[0].area', 'rooms[0].count', 'rooms[0].level', 'rooms[0].source']) expect(problem).toContain(part)
  })

  it('names a field of a wish it does not take beside its other faults', () => {
    const { refused } = parseBriefLines({ rooms: [{ name: 'Study', size: 9, ...ok, level: 'nope' }], open: [{ quote: 'q' }] }, { versionNeeded: false })
    expect(refused[0]!.problem).toMatch(/field Grid does not know \("size"\)/)
    expect(refused[0]!.problem).toContain('rooms[0].level')
  })

  it('keeps the brief when it holds a field it does not take, and lists the field', () => {
    const { brief, refused } = parseBriefLines({ rooms: [{ name: 'Study', area: 9, ...ok }], notes: 'quiet', touch: 'kitchen' }, { versionNeeded: false })
    expect(brief.rooms.map((r) => r.name)).toEqual(['Study'])
    expect(refused.map((r) => r.where)).toEqual(['notes', 'touch'])
    expect(refused[0]!.problem).toContain('"notes"')
  })

  it('names every fault of the footprint and of a figure', () => {
    const { refused } = parseBriefLines({
      footprint: { width: 10, level: 'avoid', source: 'assumed' },
      figures: { door_width: { value: 0, measure: 'wide', level: 'must', source: 'given' } },
      open: [{ quote: 'q' }],
    }, { versionNeeded: false })
    expect(refused[0]!.problem).toMatch(/width and depth together.*footprint\.level/)
    expect(refused[1]!.problem).toMatch(/figures\.door_width\.value.*figures\.door_width\.measure.*quote/)
  })
})

describe('every independent problem of rooms text in the tool\'s refusal (MSG-33)', () => {
  let b: Bench
  beforeAll(() => {
    b = bench({})
  })
  afterAll(() => b.close())

  it('lists the size, the unknown room and the unit, and leaves out the room placed off a refused one', async () => {
    const rooms = [
      'walls outside 0.3 inside 0.1 height 2.6',
      'room living "Living" living 4.4 x 0',
      'room kitchen "Kitchen" kitchen 4.4 x 3.0 north of living',
      'room hall "Hall" corridor 1.3 x 3 east of nowhere',
      'room bath "Bath" bathroom 2 x 2qq at 20,0',
    ].join('\n')
    const answer = await b.call('grid_write_rooms', { plan: 'many.json', rooms })
    expect(answer.isError).toBe(true)
    expect(answer.text).toMatch(/3 problems:/)
    expect(answer.text).toMatch(/Line 2:/)
    expect(answer.text).toMatch(/Line 4:/)
    expect(answer.text).toMatch(/Line 5:/)
    expect(answer.text).not.toMatch(/Line 3:/)
  })
})
