import { describe, expect, it } from 'vitest'
import type { Bounds, Dimension, PlanSite } from '@ongrid/floorplan/geometry'
import { siteLabels } from '../site'
import { isSiteScale, withoutSiteClutter } from '../siteScale'

/** VEW-32: a site's named things are labelled, and a site-sized picture leaves out what it cannot read. */
const square = (x: number, y: number, s: number) => [{ x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s }]
const site = (labels: [string, string][]): PlanSite => ({
  boundary: null,
  streets: [],
  things: labels.map(([kind, label], i) => ({ id: `t${i}`, kind: kind as 'pool', label, rings: kind === 'pool' || kind === 'paving' ? [square(i * 10, 0, 4)] : [], lines: kind === 'fence' ? [[{ x: 0, y: 0 }, { x: 10, y: 0 }]] : [], tree: kind === 'tree' ? { at: { x: 1, y: 1 }, radius: null } : null }))
})

const dim = (id: string, kind: Dimension['kind'], chain = 'a'): Dimension => ({ id, kind, from: { x: 0, y: 0 }, to: { x: 3, y: 0 }, value: 3, normal: { x: 0, y: -1 }, offset: 0.5, labelAt: { x: 1.5, y: -0.5 }, measuredTo: ['wall-face', 'wall-face'], side: 'south', chain } as unknown as Dimension)
const bounds = (w: number, h: number): Bounds => ({ min: { x: 0, y: 0 }, max: { x: w, y: h }, width: w, height: h })

describe('site labels', () => {
  it('labels a thing the person named, at its middle, and not one with its kind\'s word', () => {
    const labels = siteLabels(site([['paving', 'Sprinkler tank'], ['pool', 'pool'], ['tree', 'Oak'], ['fence', 'fence'], ['fence', 'North fence']]))
    expect(labels.map((l) => l.text)).toEqual(['Sprinkler tank', 'Oak', 'North fence'])
    expect(labels[0]!.at).toEqual({ x: 2, y: 2 })
    expect(labels[2]!.at).toEqual({ x: 5, y: 0 })
  })
})

describe('a site-sized picture', () => {
  it('is a drawing 100 m or more across', () => {
    expect(isSiteScale(bounds(99, 20))).toBe(false)
    expect(isSiteScale(bounds(30, 120))).toBe(true)
  })

  it('leaves out room sizes and an opening chain of more than six, and keeps the rest', () => {
    const chain = Array.from({ length: 60 }, (_, i) => dim(`o${i}`, 'opening'))
    const short = Array.from({ length: 3 }, (_, i) => dim(`s${i}`, 'opening', 'b'))
    const kept = withoutSiteClutter([dim('r', 'room'), dim('w', 'wall'), dim('all', 'overall'), ...chain, ...short])
    expect(kept.map((d) => d.id)).toEqual(['w', 'all', 's0', 's1', 's2'])
  })
})
