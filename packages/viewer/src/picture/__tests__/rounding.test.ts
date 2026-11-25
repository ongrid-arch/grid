import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { dimensionText, dimensionTextBox, formatArea } from '../../canvas2d/labelPlacement'
import { planToSvg } from '../planSvg'

/**
 * ARE-7 in the drawing: the numbers on a plan are rounded the way the report rounds them, by
 * the core's one formatter, so identical rooms read the same.
 */

const DATA = resolve(__dirname, '../../../../../scoreboard/data')

function labPlan(name: string): unknown {
  const found = gunzipSync(readFileSync(resolve(DATA, 'lab-plans.ndjson.gz')))
    .toString('utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { name: string; text: string })
    .find((p) => p.name === name)
  if (found === undefined) throw new Error(`no lab plan named ${name}`)
  return JSON.parse(found.text)
}

describe('ARE-7 the numbers on the drawing', () => {
  it('AR-11 labels the ten 1.875 m bathroom widths of the hotel floor with one figure', () => {
    const svg = planToSvg(parseFloorPlan(labPlan('C/scenarios/hotel-floor.json')))
    const texts = [...svg.matchAll(/data-part="dimension-text"[^>]*>([^<]*)</g)].map((m) => m[1])
    expect(texts.filter((t) => t === '1.87')).toEqual([])
    // VEW-51: a bathroom's width line that a door swings across or its name sits on is left out,
    // so none of the ten need be drawn; the number each would carry is the one figure.
    expect(dimensionText(1.875, 'room')).toBe('1.88')
    expect(dimensionText(1.8749999999999982, 'room')).toBe('1.88')
  })

  it('formats an area with the core’s rounding', () => {
    expect(formatArea(4.2249999999999996)).toBe('4.23 m²')
    expect(formatArea(-0.001)).toBe('0.00 m²')
    expect(formatArea(13.95, 1)).toBe('14.0 m²')
  })

  it('measures a dimension’s number as it is printed', () => {
    const at = { x: 0, y: 0 }
    expect(dimensionTextBox(at, { kind: 'room', value: 1.8749999999999982 }, 0.01)).toEqual(
      dimensionTextBox(at, { kind: 'room', value: 1.875 }, 0.01)
    )
  })
})
