import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { refurbishmentRaw } from '@ongrid/floorplan/test-support/phases'
import { bench } from './replay/harness'

const data = refurbishmentRaw()
const walls = data['walls'] as { id: string; properties?: Record<string, string> }[]
walls.find((wall) => wall.id === 'wst')!.properties = { phase: 'Extension' }
const b = bench({ 'plan.json': data })
afterAll(() => b.close())

async function call(tool: string, args: Record<string, unknown>) {
  const reply = await b.call(tool, args)
  expect(reply.isError, reply.text).toBe(false)
  return reply.data!
}

it('discovers both field names and counts phases including demolition', async () => {
  const fields = await call('grid_fields', { kind: ['wall'] })
  expect(fields['fields']).toEqual(expect.arrayContaining(['phase', 'stage'].map((name) => expect.objectContaining({ name }))))
  const count = await call('grid_count', { kind: ['wall'], by: 'phase' })
  expect(count['groups']).toEqual(expect.arrayContaining([
    expect.objectContaining({ value: 'existing', count: 6 }),
    expect.objectContaining({ value: 'demolished', ids: ['wk'] }),
    expect.objectContaining({ value: 'new', ids: ['wst'] }),
  ]))
  expect((await call('grid_count', { kind: ['wall'] }))['total']).toMatchObject({ count: 7 })
  const stage = await call('grid_count', { kind: ['wall'], by: 'stage' })
  expect(stage['groups']).toEqual(count['groups'])
  const painted = await call('grid_view', { ...count['view'] as object, out: 'phases.svg' })
  expect(painted['painted']).toEqual(expect.arrayContaining([
    expect.objectContaining({ value: 'demolished', ids: expect.arrayContaining(['wk', 'd-kitchen']) }),
    expect.objectContaining({ value: 'new', ids: expect.arrayContaining(['wst']) }),
  ]))
})

it('finds inherited opening phases and passes demolished rooms to the plan highlight', async () => {
  const doors = await call('grid_find', { kind: ['door'], room: 'kitchen', where: ['stage = demolished'], fields: ['phase', 'stage'] })
  expect(doors['rows']).toContainEqual({ id: 'd-kitchen', phase: 'demolished', stage: 'demolished' })
  const rooms = await call('grid_find', { kind: ['room'], where: ['phase = demolished'] })
  expect(rooms['ids']).toContain('kitchen')
  await call('grid_view', { ...rooms['view'] as object, out: 'highlight.svg' })
  const svg = readFileSync(join(b.folder, 'exports', 'highlight.svg'), 'utf8')
  expect(svg).toMatch(/data-part="picked" data-id="kitchen"/)
})

it('keeps a personal fact named phase available for grouping and colouring', async () => {
  const count = await call('grid_count', { kind: ['wall'], by: 'properties.phase' })
  expect(count['view']).toMatchObject({ colour: 'properties.phase' })
  expect(count['groups']).toContainEqual(expect.objectContaining({ value: 'Extension', ids: ['wst'] }))
})
