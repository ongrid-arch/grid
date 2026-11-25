import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { compareBuildings } from '@ongrid/floorplan/geometry'
import { comparisonPicture, COMPARISON_COLORS, UNCHANGED_COLORS } from '../comparison'
import { pictureToSvg } from '../planSvg'

/**
 * WRT-8: the picture of a comparison draws what the core says changed, in three colours, over the
 * later plan in pale, and works nothing out itself.
 */
const flat = (): FloorPlan => parseFloorPlan(JSON.parse(readFileSync(join(resolve(__dirname, '../../../../floorplan/fixtures'), 'two-bed-flat.json'), 'utf8')))

describe('the picture of a comparison', () => {
  it('marks the wall that moved in amber at its new place with its old place outlined, and the rooms that changed with their areas', () => {
    const before = flat()
    // The wall between the kitchen and the living room moved 0.5 m north.
    const after: FloorPlan = { ...before, walls: before.walls.map((w) => (w.id === 'living-north' ? { ...w, start: [w.start[0], w.start[1] + 0.5], end: [w.end[0], w.end[1] + 0.5] } : w)) }
    const compared = compareBuildings(before, after)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, after, compared.marks))
    // WRT-12: a wall that moved is a change, not one taken out and one built.
    expect(svg).toMatch(new RegExp(`data-part="changed-wall" data-id="living-north"[^>]*fill="${COMPARISON_COLORS.changed}"`))
    expect(svg).toMatch(/data-part="changed-was-wall" data-id="living-north"[^>]*fill="none"/)
    expect(svg).not.toMatch(/data-part="(removed|added)-wall" data-id="living-north"/)
    expect(svg).toContain('Living room: 18.48 m² to 20.68 m²')
    expect(svg).toContain('data-part="comparison-key"')
    // What stayed is drawn in the pale look.
    expect(svg).toContain(UNCHANGED_COLORS.wallExterior)
  })

  it('marks the wall taken out in red and the one built in green', () => {
    const before = flat()
    const after: FloorPlan = {
      ...before,
      walls: [...before.walls.filter((w) => w.id !== 'bath-north'), { id: 'new-wall', start: [6, 6], end: [9.2, 6], thickness: 0.1, height: 2.6, kind: 'interior' }],
      rooms: before.rooms.map((r) => ({ ...r, boundary: r.boundary.map((id) => (id === 'bath-north' ? 'new-wall' : id)) }))
    }
    const compared = compareBuildings(before, after)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, after, compared.marks))
    expect(svg).toMatch(new RegExp(`data-part="removed-wall" data-id="bath-north"[^>]*fill="${COMPARISON_COLORS.removed}"`))
    expect(svg).toMatch(new RegExp(`data-part="added-wall" data-id="new-wall"[^>]*fill="${COMPARISON_COLORS.added}"`))
  })

  it('draws a widened door as changed, not as added (WRT-12)', () => {
    const before = flat()
    const after: FloorPlan = { ...before, openings: before.openings.map((o) => (o.id === 'door-bed1' ? { ...o, width: 0.9 } : o)) }
    const compared = compareBuildings(before, after)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, after, compared.marks))
    expect(svg).toMatch(new RegExp(`data-part="changed-opening" data-id="door-bed1"[^>]*fill="${COMPARISON_COLORS.changedFill}"`))
    expect(svg).not.toMatch(/data-part="(removed|added)-/)
  })

  it('draws no mark when nothing changed', () => {
    const plan = flat()
    const compared = compareBuildings(plan, plan)
    const svg = pictureToSvg(comparisonPicture(compared.aligned, plan, compared.marks))
    expect(svg).not.toMatch(/data-part="(removed|added|changed)-/)
  })
})
