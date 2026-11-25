/**
 * CMD-17: every answer a tool gives matches the output schema `tools/list` showed for it, checked
 * the way a strict host checks it (JSON Schema draft-07, every error reported). A host that finds
 * one answer off its schema refuses it, and an agent that sees that once stops using the tool.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv from 'ajv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { duplexHouse } from '@ongrid/floorplan/test-support/plans'
import { GRID_TOOLS } from '../serveTools'
import { toolDefinition } from '../toolkit'
import { bench, type Bench } from './replay/harness'

const FLOORPLAN_FIXTURES = resolve(__dirname, '../../../../floorplan/fixtures')
const FIXTURES = resolve(__dirname, '../../../fixtures')
const raw = (file: string): FloorPlan => JSON.parse(readFileSync(file, 'utf8')) as FloorPlan
const FOUR_FLATS = readFileSync(resolve(FLOORPLAN_FIXTURES, 'rooms/four-flats.rooms'), 'utf8')

const ajv = new Ajv({ allErrors: true, schemaId: 'auto' })
const schemaOf = (name: string): Record<string, unknown> =>
  toolDefinition(GRID_TOOLS.find((t) => t.name === name)!)['outputSchema'] as Record<string, unknown>

/** What a strict host would report for this answer, or an empty list. */
function problems(tool: string, data: unknown): string[] {
  const validate = ajv.compile(schemaOf(tool))
  return validate(data) ? [] : (validate.errors ?? []).map((e) => `${e.dataPath || '/'} ${e.message}${e.params ? ` ${JSON.stringify(e.params)}` : ''}`)
}

const PLANS = ['two-bed.json', 'loft.json', 'duplex.json', 'four.json'] as const

/** One call for every variant of the tools whose answers are the ones agents lost. */
const CALLS: readonly (readonly [string, Record<string, unknown>])[] = [
  ['grid_check', {}],
  ['grid_check', { full: true }],
  ...['ES', 'GB', 'US', 'DE', 'JP', 'FR'].map((country) => ['grid_check', { country }] as const),
  ['grid_check', { country: 'GB', full: true }],
  ['grid_check', { language: 'es' }],
  ['grid_areas', { country: 'GB' }],
  ['grid_areas', { gross: 'both' }],
  ['grid_describe', { length: 'walk' }],
  ['grid_schedule', {}],
  ['grid_schedule', { types: ['door'] }],
  ['grid_schedule', { types: ['fixture'] }],
  ['grid_schedule', { narrower_than: 0.8 }],
  ...(['rooms', 'openings', 'flats', 'doors', 'windows', 'finishes'] as const).flatMap((of) => [
    ['grid_schedule', { of }] as const,
    ['grid_schedule', { of, format: 'csv' }] as const,
  ]),
]

describe('CMD-17 every answer matches its own output schema', () => {
  let b: Bench
  beforeAll(async () => {
    b = bench({ 'two-bed.json': raw(resolve(FLOORPLAN_FIXTURES, 'two-bed-flat.json')), 'loft.json': raw(resolve(FIXTURES, 'tiny-loft.json')), 'duplex.json': duplexHouse() })
    const wrote = await b.call('grid_write_rooms', { plan: 'four.json', rooms: FOUR_FLATS })
    expect(wrote.isError, wrote.text).toBe(false)
  })
  afterAll(() => b.close())

  for (const plan of PLANS) {
    for (const [tool, args] of CALLS) {
      it(`${tool} ${JSON.stringify(args)} on ${plan}`, async () => {
        const reply = await b.call(tool, { plan, ...args })
        if (reply.isError) return
        expect(problems(tool, reply.data)).toEqual([])
      })
    }
  }

  // Every other tool that reads and needs nothing but a plan: its plain call, on each plan.
  const PLAIN = GRID_TOOLS.filter((t) => t.hint === 'read' && !CALLS.some(([name, args]) => name === t.name && Object.keys(args).length === 0) && Object.values(t.args).every((spec) => spec.required !== true))
  for (const tool of PLAIN) {
    for (const plan of PLANS) {
      it(`${tool.name} with no arguments but the plan, on ${plan}`, async () => {
        const reply = await b.call(tool.name, { plan })
        if (reply.isError || reply.data === undefined) return
        expect(problems(tool.name, reply.data)).toEqual([])
      })
    }
  }

  it('lists the same tools with an object output schema each', () => {
    for (const tool of GRID_TOOLS) expect(schemaOf(tool.name)['type'], tool.name).toBe('object')
  })
})
