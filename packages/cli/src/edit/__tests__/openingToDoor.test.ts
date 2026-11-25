import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../../quantities/survey'
import { changeOpening, EditRefused } from '../edits'

const flat = JSON.parse(readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/edits/flat-v04.json'), 'utf8')) as Record<string, unknown>
// The living-room door, drawn as a doorless opening.
const survey = surveyPlan(parseFloorPlan({
  ...flat,
  openings: (flat['openings'] as Record<string, unknown>[]).map((o) => (o['id'] === 'door-living' ? { ...o, type: 'opening', swing: undefined, hinge: undefined } : o)),
}))

describe('turning an opening into a handed door in one call (WRT-54)', () => {
  it('applies the new type before the handing', () => {
    const patch = changeOpening(survey, 'door-living', { type: 'door', opensInto: 'living', hinged: 'left' })
    const change = (patch.openings as Map<string, { type?: string; swing?: string }>).get('door-living')!
    expect(change.type).toBe('door')
    expect(change.swing).toBeDefined()
  })

  it('still refuses a handing on what stays a doorless opening, with the right article', () => {
    expect(() => changeOpening(survey, 'door-living', { hinged: 'left' })).toThrow(EditRefused)
    try {
      changeOpening(survey, 'door-living', { hinged: 'left' })
    } catch (error) {
      expect((error as Error).message).toContain('would be an opening')
      expect((error as Error).message).not.toContain('a opening')
    }
  })
})
