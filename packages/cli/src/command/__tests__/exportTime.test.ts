import { describe, expect, it } from 'vitest'
import { exportTime } from '../export'
import { UsageError } from '../options'

/** CMD-26: the time an export is stamped with, so two runs write the same bytes. */
describe('exportTime', () => {
  it('reads a date as midnight UTC and a time as given', () => {
    expect(exportTime('2026-01-31', {}).toISOString()).toBe('2026-01-31T00:00:00.000Z')
    expect(exportTime('2026-01-31T09:30:00Z', {}).toISOString()).toBe('2026-01-31T09:30:00.000Z')
  })

  it('reads SOURCE_DATE_EPOCH in seconds when --date is left out, and --date wins', () => {
    expect(exportTime(undefined, { SOURCE_DATE_EPOCH: '1700000000' }).toISOString()).toBe('2023-11-14T22:13:20.000Z')
    expect(exportTime('2026-01-31', { SOURCE_DATE_EPOCH: '1700000000' }).toISOString()).toBe('2026-01-31T00:00:00.000Z')
  })

  it('uses the clock when neither is given', () => {
    expect(Math.abs(exportTime(undefined, {}).getTime() - Date.now())).toBeLessThan(5000)
  })

  it('refuses a value it cannot read, naming it', () => {
    expect(() => exportTime('tomorrow', {})).toThrow(UsageError)
    expect(() => exportTime('tomorrow', {})).toThrow('--date "tomorrow"')
    expect(() => exportTime(undefined, { SOURCE_DATE_EPOCH: 'soon' })).toThrow('SOURCE_DATE_EPOCH')
  })
})
