import { describe, expect, it } from 'vitest'
import { displayOf, LengthRefused, readLength, showArea, showLength } from '../units'

describe('reading a length (WRT-7)', () => {
  it('stores 12\'6", 3810 mm, 381 cm and 3,81 with the decimal comma as 3.81 m', () => {
    for (const text of [`12'6"`, `12' 6"`, `12'-6"`, '12 ft 6 in', '150"', '150 in', '3810 mm', '381 cm', '3.81 m', '3.81']) {
      expect(readLength(text), text).toBeCloseTo(3.81, 9)
    }
    expect(readLength('3,81', 'comma')).toBeCloseTo(3.81, 9)
    expect(readLength('381,0 cm', 'comma')).toBeCloseTo(3.81, 9)
    expect(readLength(3.81)).toBe(3.81)
    expect(readLength('6 1/2"')).toBeCloseTo(6.5 * 0.0254, 12)
  })

  it('reads kilometres (WRT-22)', () => {
    for (const text of ['10km', '10 km', '10 kilometres', '10 kilometers']) expect(readLength(text), text).toBeCloseTo(10000, 9)
    expect(readLength('0,25 km', 'comma')).toBeCloseTo(250, 9)
  })

  it('names the decimal comma when it is not chosen', () => {
    expect(() => readLength('3,45')).toThrow(/decimal comma/)
  })

  it('refuses what it cannot read, and a length past the largest, in words', () => {
    expect(() => readLength('three metres')).toThrow(LengthRefused)
    expect(() => readLength('1e9 m')).toThrow(LengthRefused)
    expect(() => readLength(2e7)).toThrow(/past the largest length/)
    expect(() => readLength(`12'13"`)).toThrow(/inches after the feet/)
  })
})

describe('showing a length (WRT-7)', () => {
  it('prints feet and inches, a sill in inches, millimetres and the decimal comma', () => {
    const feet = displayOf('ft-in')
    expect(showLength(3.81, feet)).toBe(`12'-6"`)
    expect(showLength(1.2192, feet, { kind: 'height' })).toBe('48"')
    expect(showLength(2.86, displayOf('mm'), { unit: false })).toBe('2860')
    expect(showLength(2.86, displayOf('mm'))).toBe('2860 mm')
    expect(showLength(2.4, displayOf('m', 'comma'))).toBe('2,40 m')
    expect(showLength(2.4)).toBe('2.40 m')
    expect(showLength(0.0254 * 7.5, displayOf('ft-in', 'point', undefined, 1))).toBe(`0'-7 1/2"`)
  })

  it('rounds a half away from zero, whatever the float behind it (MSG-37)', () => {
    const feet = displayOf('ft-in')
    // 1 1/2" and 1'-0 1/2" summed from feet and inches land a hair under the half.
    expect(showLength(0.0254 + 0.0127, feet, { kind: 'height' })).toBe('2"')
    expect(showLength(0.3048 + 0.0127, feet)).toBe(`1'-1"`)
    expect(showLength(0.1143, feet, { kind: 'height' })).toBe('5"')
    // 0.5005 m is 500.49999… mm in floating point.
    expect(showLength(0.5005, displayOf('mm'))).toBe('501 mm')
    expect(showLength(-0.5005, displayOf('mm'))).toBe('-501 mm')
    expect(showLength(0, displayOf('mm'))).toBe('0 mm')
  })

  it('prints areas in square metres or square feet', () => {
    expect(showArea(12.4)).toBe('12.40 m²')
    expect(showArea(12.4, displayOf('m', 'comma'))).toBe('12,40 m²')
    expect(showArea(10, displayOf('ft-in'))).toBe('107.6 sq ft')
  })
})
