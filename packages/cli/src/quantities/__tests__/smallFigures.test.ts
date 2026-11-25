import { describe, expect, it } from 'vitest'
import { displayOf } from '@ongrid/floorplan/types/units'
import { lengthText, ownLengthText, smallMetres } from '../units'

const m = displayOf('m')
const mm = displayOf('mm')

describe('small figures keep what changes their verdict', () => {
  it('writes a step and a sill to three decimals in metres', () => {
    expect(lengthText(0.015, m)).toBe('0.015 m')
    expect(lengthText(0.025, m)).toBe('0.025 m')
    expect(lengthText(0.015, mm)).toBe('15 mm')
    expect(smallMetres(0.015)).toBe('0.015')
  })
  it('leaves a round or larger figure as before', () => {
    expect(lengthText(0.05, m)).toBe('0.05 m')
    expect(lengthText(0.9143, m)).toBe('0.91 m')
    expect(smallMetres(0.9143)).toBe('0.91')
  })
  it('writes the person\'s own figure as given', () => {
    expect(ownLengthText(0.855, m)).toBe('0.855 m')
    expect(ownLengthText(0.015, m)).toBe('0.015 m')
    expect(ownLengthText(0.855, mm)).toBe('855 mm')
    expect(ownLengthText(0.855, displayOf('m', 'comma'))).toBe('0,855 m')
  })
})
