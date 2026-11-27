/**
 * CNT-58: where the sun is in the sky, for a day, a time and a place on the earth.
 *
 * The low-precision solar series every almanac's sun calculator uses: the sun's mean longitude
 * and mean anomaly, the equation of centre, the nutation in longitude, the obliquity of the
 * ecliptic and the equation of time, worked from the Julian century of the moment. It is good to
 * about a hundredth of a degree for the centuries either side of 2000, far finer than a drawing
 * needs. The figures in it are the series' own coefficients, astronomy and not a check on the
 * drawing, so they live here and not in the tolerance table (`geometry/tolerances.ts`); this
 * folder is not one the tolerance-literal test reads, for that reason alone.
 *
 * A time is the place's local solar time unless a UTC offset is given: 12:00 solar is when the
 * sun stands highest, whatever the clocks say. With `utcOffset` (hours east of UTC, such as 2 for
 * a summer clock in central Europe) the time is the clock's. The elevation is the apparent one,
 * as seen through the air (refraction added), so sunrise and sunset fall where the sun's upper
 * edge meets a level horizon.
 *
 * Pure: no clock is read, no time zone is looked up, nothing is fetched.
 */

const RAD = Math.PI / 180
const DEG = 180 / Math.PI

/** A calendar day, as the person names it. */
export interface CalendarDay {
  readonly year: number
  readonly month: number
  readonly day: number
}

/** Where on the earth, in degrees: north and east positive. */
export interface EarthPlace {
  readonly latitude: number
  readonly longitude: number
}

export interface SunPosition {
  /** Degrees clockwise from true north, from 0 up to 360: the compass bearing toward the sun. */
  readonly azimuth: number
  /** Degrees above the horizon, apparent (refraction added); below 0 the sun is down. */
  readonly elevation: number
  /** The sun's declination, degrees. */
  readonly declination: number
  /** The equation of time, minutes: apparent solar time less mean solar time. */
  readonly equationOfTime: number
  /** The local apparent solar time of the moment, minutes from midnight. */
  readonly solarMinutes: number
  /** The moment in UTC, minutes from the day's midnight (below 0 or past 1440 on the next or last day). */
  readonly utcMinutes: number
}

export interface SunDay {
  /** Sunrise, solar noon and sunset in the time the day was asked in (solar, or the clock's), minutes from midnight. Null on a day the sun never rises or never sets. */
  readonly sunrise: number | null
  readonly noon: number
  readonly sunset: number | null
  /** `day` when the sun never sets, `night` when it never rises, null on an ordinary day. */
  readonly polar: 'day' | 'night' | null
  /** The sun's elevation at solar noon, degrees. */
  readonly noonElevation: number
}

/** Whether a calendar day exists (the Gregorian calendar, years 1 to 9999). */
export function isCalendarDay(d: CalendarDay): boolean {
  if (!Number.isInteger(d.year) || !Number.isInteger(d.month) || !Number.isInteger(d.day)) return false
  if (d.year < 1 || d.year > 9999 || d.month < 1 || d.month > 12 || d.day < 1) return false
  const leap = (d.year % 4 === 0 && d.year % 100 !== 0) || d.year % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][d.month - 1]!
  return d.day <= days
}

/** The Julian day number of the day's midnight, UTC. */
export function julianMidnight(d: CalendarDay): number {
  const a = Math.floor((14 - d.month) / 12)
  const y = d.year + 4800 - a
  const m = d.month + 12 * a - 3
  const number = d.day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045
  return number - 0.5
}

/** The calendar day `days` after `d` (before it when negative). */
export function addDays(d: CalendarDay, days: number): CalendarDay {
  const jd = julianMidnight(d) + 0.5 + days
  // The Julian day number back to a Gregorian date.
  const a = jd + 32044
  const b = Math.floor((4 * a + 3) / 146097)
  const c = a - Math.floor((146097 * b) / 4)
  const e = Math.floor((4 * c + 3) / 1461)
  const f = c - Math.floor((1461 * e) / 4)
  const g = Math.floor((5 * f + 2) / 153)
  return { day: f - Math.floor((153 * g + 2) / 5) + 1, month: g + 3 - 12 * Math.floor(g / 10), year: 100 * b + e - 4800 + Math.floor(g / 10) }
}

/** Days from `a` to `b`. */
export function daysBetween(a: CalendarDay, b: CalendarDay): number {
  return Math.round(julianMidnight(b) - julianMidnight(a))
}

interface Orbit {
  readonly declination: number
  readonly equationOfTime: number
}

/** The sun's declination (degrees) and the equation of time (minutes) at a Julian day. */
function orbitAt(jd: number): Orbit {
  const t = (jd - 2451545) / 36525
  const meanLongitude = (((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360) + 360) % 360
  const meanAnomaly = 357.52911 + t * (35999.05029 - 0.0001537 * t)
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
  const m = meanAnomaly * RAD
  const centre = Math.sin(m) * (1.914602 - t * (0.004817 + 0.000014 * t)) + Math.sin(2 * m) * (0.019993 - 0.000101 * t) + Math.sin(3 * m) * 0.000289
  const trueLongitude = meanLongitude + centre
  const node = (125.04 - 1934.136 * t) * RAD
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(node)
  const meanObliquity = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
  const obliquity = (meanObliquity + 0.00256 * Math.cos(node)) * RAD
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(apparentLongitude * RAD)) * DEG
  const y = Math.tan(obliquity / 2) ** 2
  const l0 = meanLongitude * RAD
  const equation =
    y * Math.sin(2 * l0) - 2 * eccentricity * Math.sin(m) + 4 * eccentricity * y * Math.sin(m) * Math.cos(2 * l0) - 0.5 * y * y * Math.sin(4 * l0) - 1.25 * eccentricity * eccentricity * Math.sin(2 * m)
  return { declination, equationOfTime: 4 * equation * DEG }
}

/** The air's bending of the light near the horizon, degrees, added to a true elevation. */
function refraction(elevation: number): number {
  if (elevation > 85) return 0
  const te = Math.tan(elevation * RAD)
  const arcSeconds =
    elevation > 5
      ? 58.1 / te - 0.07 / te ** 3 + 0.000086 / te ** 5
      : elevation > -0.575
        ? 1735 + elevation * (-518.2 + elevation * (103.4 + elevation * (-12.79 + elevation * 0.711)))
        : -20.772 / te
  return arcSeconds / 3600
}

/** The UTC minutes of a local time: the clock's with an offset, else solar (worked twice, as the equation of time moves with the moment). */
function utcOf(day: CalendarDay, minutes: number, place: EarthPlace, utcOffset: number | null): number {
  if (utcOffset !== null) return minutes - utcOffset * 60
  let utc = minutes - 4 * place.longitude
  for (let i = 0; i < 2; i++) utc = minutes - 4 * place.longitude - orbitAt(julianMidnight(day) + utc / 1440).equationOfTime
  return utc
}

/** Where the sun is at `minutes` past midnight of `day` at `place`: solar time, or the clock's with `utcOffset`. */
export function sunPosition(day: CalendarDay, minutes: number, place: EarthPlace, utcOffset: number | null = null): SunPosition {
  const utc = utcOf(day, minutes, place, utcOffset)
  const { declination, equationOfTime } = orbitAt(julianMidnight(day) + utc / 1440)
  const solar = utc + equationOfTime + 4 * place.longitude
  const hourAngle = (solar / 4 - 180) * RAD
  const lat = place.latitude * RAD
  const dec = declination * RAD
  const cosZenith = Math.min(1, Math.max(-1, Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)))
  const trueElevation = 90 - Math.acos(cosZenith) * DEG
  const azimuth = (Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) * DEG + 180) % 360
  return { azimuth: azimuth + 0, elevation: trueElevation + refraction(trueElevation), declination, equationOfTime, solarMinutes: solar, utcMinutes: utc }
}

/** The zenith of sunrise and sunset: the sun's upper edge on the horizon, through the air. */
const HORIZON_ZENITH = 90.833

/** Sunrise, solar noon and sunset on `day` at `place`, in solar time, or the clock's with `utcOffset`. */
export function sunDay(day: CalendarDay, place: EarthPlace, utcOffset: number | null = null): SunDay {
  const noonPosition = sunPosition(day, 720, place, null)
  const lat = place.latitude * RAD
  const dec = noonPosition.declination * RAD
  const cosHour = Math.cos(HORIZON_ZENITH * RAD) / (Math.cos(lat) * Math.cos(dec)) - Math.tan(lat) * Math.tan(dec)
  // Solar time to the time asked in: the clock's is solar less the equation of time and the longitude, plus the offset.
  const asked = (solar: number): number => (utcOffset === null ? solar : solar - noonPosition.equationOfTime - 4 * place.longitude + utcOffset * 60)
  const noon = asked(720)
  if (!Number.isFinite(cosHour) || cosHour > 1) return { sunrise: null, noon, sunset: null, polar: 'night', noonElevation: noonPosition.elevation }
  if (cosHour < -1) return { sunrise: null, noon, sunset: null, polar: 'day', noonElevation: noonPosition.elevation }
  const half = Math.acos(cosHour) * DEG * 4
  return { sunrise: asked(720 - half), noon, sunset: asked(720 + half), polar: null, noonElevation: noonPosition.elevation }
}
