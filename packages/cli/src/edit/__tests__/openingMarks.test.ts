import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { openingSchedule } from '../../quantities/schedule'
import { surveyPlan } from '../../quantities/survey'

/** WRT-23: a mark an opening states, or its id when that is already a mark, is the schedule's. */
const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/edits/flat-v04.json'), 'utf8')) as Record<string, unknown>
const plan = (change: (openings: Record<string, unknown>[]) => Record<string, unknown>[]): FloorPlan =>
  parseFloorPlan({ ...flat, openings: change((flat['openings'] as Record<string, unknown>[]).map((o) => ({ ...o }))) })
const marks = (p: FloorPlan): Record<string, string> => Object.fromEntries(openingSchedule(surveyPlan(p)).rows.map((r) => [r.id, r.mark]))
const rename = (o: Record<string, unknown>[], from: string, to: string): Record<string, unknown>[] => o.map((x) => (x['id'] === from ? { ...x, id: to } : x))

describe('opening marks that stay put (WRT-23)', () => {
  it('shows an id that already is a mark, so a window taken out before it does not move it', () => {
    const named = (o: Record<string, unknown>[]) => rename(rename(o, 'win-living-west', 'W2'), 'win-kitchen', 'W3')
    const whole = marks(plan(named))
    expect(whole['W2']).toBe('W2')
    expect(whole['W3']).toBe('W3')
    const without = marks(plan((o) => named(o).filter((x) => x['id'] !== 'win-living-south')))
    expect(without['W3']).toBe('W3')
  })

  it('shows a mark the opening states, and counts the others round it', () => {
    const got = marks(plan((o) => o.map((x) => (x['id'] === 'win-bed2' ? { ...x, properties: { mark: 'W9' } } : x))))
    expect(got['win-bed2']).toBe('W9')
    expect(new Set(Object.values(got)).size).toBe(Object.keys(got).length)
  })

  it('gives a mark two openings claim to the first', () => {
    const got = marks(plan((o) => o.map((x) => (x['id'] === 'win-bed2' || x['id'] === 'win-bath' ? { ...x, properties: { mark: 'W1' } } : x))))
    expect(Object.values(got).filter((m) => m === 'W1')).toHaveLength(1)
    expect(new Set(Object.values(got)).size).toBe(Object.keys(got).length)
  })
})
