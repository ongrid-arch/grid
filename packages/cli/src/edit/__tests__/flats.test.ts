/**
 * WRT-28 (C18): merge and split keep the plan's flats right. A flat never lists a room that a
 * merge took away, the merged room is in the flat its rooms were in, and a room split off joins
 * the flat of the room it came from. The plan is the stand-in office, with flats written on it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

type Flats = Array<{ id: string; name?: string; rooms: string[] }>
const withFlats = (flats: Flats | undefined): Record<string, unknown> => ({ ...factsOffice(), ...(flats === undefined ? {} : { flats }) })

let b: Bench | undefined
afterAll(() => b?.close())
const onDisk = (file: string): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(b!.folder, file), 'utf8')))

async function run(flats: Flats | undefined, tool: string, args: Record<string, unknown>) {
  b?.close()
  b = bench({ 'p.json': withFlats(flats) })
  const reply = await b.call(tool, { plan: 'p.json', ...args })
  expect(reply.isError, reply.text).toBe(false)
  return { reply, plan: onDisk('p.json') }
}
const merge = (flats: Flats | undefined, args: Record<string, unknown> = {}) => run(flats, 'grid_merge_rooms', { room: 'g-office', with: 'g-meeting', ...args })

describe('a merge keeps the flats right (WRT-28)', () => {
  it('takes the second room out of the flat that listed it, and says so', async () => {
    const { reply, plan } = await merge([{ id: 'A', name: 'Flat A', rooms: ['g-reception', 'g-office', 'g-meeting'] }, { id: 'B', rooms: ['f-studio'] }])
    expect(plan.flats).toEqual([{ id: 'A', name: 'Flat A', rooms: ['g-reception', 'g-office'] }, { id: 'B', rooms: ['f-studio'] }])
    expect(reply.text).toContain('Flat "Flat A" no longer lists "Meeting room".')
  })

  it('puts the merged room in the second room\'s flat when only that one was in a flat', async () => {
    const { reply, plan } = await merge([{ id: 'A', rooms: ['g-meeting', 'f-studio'] }])
    expect(plan.flats![0]!.rooms).toEqual(['g-office', 'f-studio'])
    expect(reply.text).toContain('Flat "A" lists "Open office" in place of "Meeting room".')
  })

  it('keeps the merged room in the first room\'s flat when the two were in two, and takes out a flat left empty', async () => {
    const { reply, plan } = await merge([{ id: 'A', rooms: ['g-office', 'g-reception'] }, { id: 'B', rooms: ['g-meeting'] }])
    expect(plan.flats).toEqual([{ id: 'A', rooms: ['g-office', 'g-reception'] }])
    expect(reply.text).toContain('Flat "B" is taken out: "Meeting room" was its only room.')
    const two = await merge([{ id: 'A', rooms: ['g-office'] }, { id: 'B', rooms: ['g-meeting', 'f-studio'] }])
    expect(two.plan.flats).toEqual([{ id: 'A', rooms: ['g-office'] }, { id: 'B', rooms: ['f-studio'] }])
    expect(two.reply.text).toContain('Flat "B" no longer lists "Meeting room"')
  })

  it('puts the new room of a zones merge in the flat in place of both', async () => {
    const { plan } = await merge([{ id: 'A', rooms: ['g-reception', 'g-office', 'g-meeting'] }], { zones: true })
    expect(plan.flats![0]!.rooms).toEqual(['g-reception', 'g-office-g-meeting'])
  })

  it('writes no flats for a plan with none', async () => {
    const { plan } = await merge(undefined)
    expect(plan.flats).toBeUndefined()
  })
})

describe('a split keeps the flats right (WRT-28)', () => {
  const split = (flats: Flats | undefined) => run(flats, 'grid_split_room', { room: 'g-reception', side: 'north', size: 2, new_room: 'g-store', new_name: 'Store', door_width: 0 })

  it('puts the new room in the flat of the room it was split from', async () => {
    const { reply, plan } = await split([{ id: 'A', name: 'Flat A', rooms: ['g-reception', 'g-office'] }])
    expect(plan.flats![0]!.rooms).toEqual(['g-reception', 'g-store', 'g-office'])
    expect(reply.text).toContain('Flat "Flat A" lists "Store" too.')
  })

  it('leaves a room of no flat in none, and a plan with no flats as it was', async () => {
    const { plan } = await split([{ id: 'A', rooms: ['g-office'] }])
    expect(plan.flats).toEqual([{ id: 'A', rooms: ['g-office'] }])
    expect((await split(undefined)).plan.flats).toBeUndefined()
  })
})
