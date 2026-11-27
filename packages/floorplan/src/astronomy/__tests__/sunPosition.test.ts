/**
 * CNT-58: the sun's place in the sky, against figures worked out by hand from the declination
 * (the noon elevation is 90 less the latitude plus the declination) and the published tables.
 */
import { describe, expect, it } from 'vitest'
import { addDays, daysBetween, isCalendarDay, julianMidnight, sunDay, sunPosition } from '../sunPosition'

const june21 = { year: 2026, month: 6, day: 21 }
const march20 = { year: 2026, month: 3, day: 20 }
const dec21 = { year: 2026, month: 12, day: 21 }

describe('the sun position', () => {
  it('stands due south at solar noon north of the tropics, as high as 90 - latitude + declination', () => {
    const london = { latitude: 51.5, longitude: -0.12 }
    const noon = sunPosition(june21, 720, london)
    expect(noon.azimuth).toBeCloseTo(180, 0)
    // The declination at the June solstice is 23.44°.
    expect(noon.declination).toBeCloseTo(23.44, 1)
    expect(noon.elevation).toBeCloseTo(90 - 51.5 + noon.declination, 1)
  })

  it('stands due north at solar noon south of the tropics', () => {
    const sydney = { latitude: -33.87, longitude: 151.21 }
    const noon = sunPosition(june21, 720, sydney)
    expect(Math.min(noon.azimuth, 360 - noon.azimuth)).toBeLessThan(0.5)
    expect(noon.elevation).toBeCloseTo(90 - 33.87 - 23.44, 0)
  })

  it('rises in the east and sets in the west at an equinox on the equator', () => {
    const quito = { latitude: 0, longitude: -78.5 }
    const morning = sunPosition(march20, 9 * 60, quito)
    expect(morning.azimuth).toBeGreaterThan(85)
    expect(morning.azimuth).toBeLessThan(95)
    expect(morning.elevation).toBeCloseTo(45, 0)
    const evening = sunPosition(march20, 15 * 60, quito)
    expect(evening.azimuth).toBeGreaterThan(265)
    expect(evening.azimuth).toBeLessThan(275)
    const day = sunDay(march20, quito)
    expect(day.polar).toBeNull()
    // The sun's upper edge, lifted by the air, clears the horizon a few minutes before 06:00 solar.
    expect(day.sunrise!).toBeGreaterThan(5 * 60 + 50)
    expect(day.sunrise!).toBeLessThan(6 * 60)
    expect(day.sunset!).toBeGreaterThan(18 * 60)
    expect(day.sunset!).toBeLessThan(18 * 60 + 10)
    expect(day.noon).toBe(720)
  })

  it('reads a clock time with its offset from UTC', () => {
    // Madrid keeps central European summer time (UTC+2), about 1 h 45 min ahead of its solar time in June.
    const madrid = { latitude: 40.42, longitude: -3.7 }
    const clockNoon = sunPosition(june21, 12 * 60, madrid, 2)
    expect(clockNoon.azimuth).toBeLessThan(140)
    const day = sunDay(june21, madrid, 2)
    expect(day.noon).toBeGreaterThan(14 * 60)
    expect(day.noon).toBeLessThan(14 * 60 + 20)
    const highest = sunPosition(june21, day.noon, madrid, 2)
    expect(highest.azimuth).toBeCloseTo(180, 0)
  })

  it('knows the midnight sun and the polar night', () => {
    const svalbard = { latitude: 78.2, longitude: 15.6 }
    expect(sunDay(june21, svalbard).polar).toBe('day')
    expect(sunDay(dec21, svalbard).polar).toBe('night')
    expect(sunPosition(dec21, 720, svalbard).elevation).toBeLessThan(0)
  })

  it('counts days across a year end and a leap day', () => {
    expect(julianMidnight({ year: 2000, month: 1, day: 1 })).toBe(2451544.5)
    expect(addDays({ year: 2028, month: 2, day: 28 }, 1)).toEqual({ year: 2028, month: 2, day: 29 })
    expect(addDays({ year: 2026, month: 12, day: 30 }, 3)).toEqual({ year: 2027, month: 1, day: 2 })
    expect(daysBetween(june21, dec21)).toBe(183)
    expect(isCalendarDay({ year: 2026, month: 2, day: 29 })).toBe(false)
    expect(isCalendarDay({ year: 2028, month: 2, day: 29 })).toBe(true)
  })
})
