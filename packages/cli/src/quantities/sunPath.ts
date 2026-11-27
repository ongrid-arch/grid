/**
 * CNT-58: where the sun is and what it lights, in words and as data, for `grid_measure what=sun`
 * with a date, `grid_view` with `sun` and `grid_export` with `sun`. The geometry is the core's
 * (`geometry/sunShade.ts`); this reads the call's dates and times and words the answer.
 *
 * Times are the place's local solar time (12:00 is when the sun is highest) unless the call gives
 * the clock's offset from UTC; the answer says which, every time.
 */
import {
  faceSun,
  isCalendarDay,
  limit,
  planFaces,
  planFacing,
  planPlace,
  planSunAt,
  planSunDay,
  shadowsOn,
  shareInSun,
  sunCasters,
  sunMoments,
  sunSurfaces,
  type CalendarDay,
  type EarthPlace,
  type FloorPlan,
  type PlanFace,
  type PlanSun,
  type SunArea,
  type SunMoment,
  type ShadowPlan,
  type SunSurface,
} from '@ongrid/floorplan/geometry'

type MultiPolygon = ReturnType<typeof shadowsOn>
import type { Display } from '@ongrid/floorplan/types/units'
import { northData, northLine } from './facing'
import { areaText, lengthText } from './units'

/** A date, time or range the call gave that cannot be read; the tool turns it into a refusal. */
export class SunAskRefused extends Error {
  override readonly name = 'SunAskRefused'
}

export const SUN_PATH_RULE =
  'This is the sun\'s geometry over the plan, not a daylight or sunlight result, and it checks no rule. '
  + 'The sun is worked out from the site\'s latitude and longitude and turned onto the drawing by the plan\'s north. '
  + 'Shadows are cast by each floor\'s outline up to its storey\'s top (a pitched roof taken flat there), the walls round outdoor space and garden walls at their heights, site fences with a height and trees with a height and a canopy (the crown from part way up), on level ground and on each open space\'s own floor level. '
  + 'Grid holds no terrain, no neighbouring building the plan does not draw, no glass and no reflection. '
  + 'A share in sun is the open area outside every shadow over the whole area; over hours it is weighted by time.'

const pad = (n: number): string => String(n).padStart(2, '0')
const q = (text: string): string => JSON.stringify(text)
const deg = (value: number): number => Math.round(value * 10) / 10 + 0
const pct = (share: number): string => `${Math.round(share * 100)}%`
const round = (value: number): number => Math.round(value * 1000) / 1000 + 0

/** A day as the call writes it, 2026-06-21. */
export function dayText(d: CalendarDay): string {
  return `${String(d.year).padStart(4, '0')}-${pad(d.month)}-${pad(d.day)}`
}

/** Minutes from midnight as a time, 17:05; a time past midnight either way is wrapped onto the clock. */
export function timeText(minutes: number): string {
  const whole = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(whole / 60))}:${pad(whole % 60)}`
}

/** A date, YYYY-MM-DD. */
export function readDay(text: string, name: string): CalendarDay {
  const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(text)
  const day = m === null ? null : { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  if (day === null || !isCalendarDay(day)) throw new SunAskRefused(`${name} takes a date as YYYY-MM-DD, such as 2026-06-21.`)
  return day
}

/** A time, HH:MM, from 00:00 to 24:00. */
export function readTime(text: string, name: string): number {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*$/.exec(text)
  const minutes = m === null ? NaN : Number(m[1]) * 60 + Number(m[2] ?? 0)
  if (m === null || Number(m[2] ?? 0) > 59 || !(minutes >= 0 && minutes <= 1440)) throw new SunAskRefused(`${name} takes a time as HH:MM, from 00:00 to 24:00, such as 15:30.`)
  return minutes
}

/** A range of hours, HH:MM-HH:MM (or "to" between them), the first not after the second. */
export function readHours(text: string, name: string): readonly [number, number] {
  const parts = text.split(/\s*(?:-|–|to)\s*/)
  if (parts.length !== 2) throw new SunAskRefused(`${name} takes two times, the first and the last, as HH:MM-HH:MM, such as 09:00-17:00.`)
  const from = readTime(parts[0]!, name)
  const to = readTime(parts[1]!, name)
  if (to < from) throw new SunAskRefused(`${name} runs from ${timeText(from)} to ${timeText(to)}, which goes back: give the earlier time first, within one day.`)
  return [from, to]
}

/** An offset from UTC in hours, -12 to 14, in quarter hours. */
export function readOffset(value: number, name: string): number {
  if (!Number.isFinite(value) || value < -12 || value > 14 || Math.round(value * 4) !== value * 4) throw new SunAskRefused(`${name} takes the clock's offset from UTC in hours, from -12 to 14, such as 2 or 5.5.`)
  return value
}

/** One moment as the call writes it: "2026-06-21 17:30", with the clock's offset after it ("+02:00", "UTC+2", "Z") when the time is the clock's. */
export interface MomentAsk {
  readonly moment: SunMoment
  readonly utcOffset: number | null
}

export function readMoment(text: string, name: string, offset: number | null = null): MomentAsk {
  const m = /^\s*(\d{4}-\d{1,2}-\d{1,2})[ T]+(\d{1,2}(?::\d{2})?)\s*(?:(Z)|(?:UTC|GMT)?\s*([+-]\d{1,2})(?::?(\d{2}))?)?\s*$/i.exec(text)
  if (m === null) throw new SunAskRefused(`${name} takes a date and a time, "YYYY-MM-DD HH:MM" in the place's solar time, such as "2026-06-21 17:30", or with the clock's offset from UTC after it, such as "2026-06-21 17:30 +02:00".`)
  const day = readDay(m[1]!, name)
  const minutes = readTime(m[2]!, name)
  const sign = m[4]?.startsWith('-') === true ? -1 : 1
  const stated = m[3] !== undefined ? 0 : m[4] !== undefined ? sign * (Math.abs(Number(m[4])) + Number(m[5] ?? 0) / 60) : null
  if (stated !== null && offset !== null && stated !== offset) throw new SunAskRefused(`${name} gives the clock's offset as ${stated}, and utc_offset as ${offset}: give it once.`)
  const utcOffset = stated ?? offset
  return { moment: { day, minutes }, utcOffset: utcOffset === null ? null : readOffset(utcOffset, name) }
}

/** The place the plan states, or a refusal that says how to state it. */
export function placeOf(plan: FloorPlan): EarthPlace {
  const place = planPlace(plan)
  if (place === null) throw new SunAskRefused('The plan states no latitude and longitude, so Grid cannot work out where the sun is: ask the person where the site is and set them with grid_set_site (latitude, longitude), or a \'site location <latitude>,<longitude>\' line in rooms text. Grid never looks an address up.')
  return place
}

/** What `grid_measure what=sun` was asked with a date. */
export interface SunPathAsk {
  readonly from: CalendarDay
  readonly until: CalendarDay | null
  /** One time, or a range of hours; neither for the day's sunrise, noon and sunset alone. */
  readonly time: number | null
  readonly hours: readonly [number, number] | null
  readonly utcOffset: number | null
  readonly areas: readonly SunArea[]
}

export interface SunPathAnswer {
  readonly lines: readonly string[]
  readonly data: Record<string, unknown>
}

/** The words for how times are read. */
function timeWords(offset: number | null): string {
  if (offset === null) return 'Times are the site\'s local solar time: 12:00 is when the sun stands highest, which is not the clock\'s noon; pass utc_offset (the clock\'s offset from UTC, such as 2 for central European summer time) to give and read clock times.'
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return `Times are clock times at UTC${sign}${Math.floor(abs)}${abs % 1 === 0 ? '' : `:${pad(Math.round((abs % 1) * 60))}`}, as utc_offset gives them.`
}

/** The sun at a moment, in one sentence. */
export function sunSentence(sun: PlanSun, display: Display): string {
  const when = `${timeText(sun.moment.minutes)} on ${dayText(sun.moment.day)}`
  const p = sun.position
  if (p.elevation <= 0) return `At ${when} the sun is down, ${deg(-p.elevation)}° below the horizon (bearing ${deg(p.azimuth)}°, ${sun.compass}).`
  const drawing = sun.northStated ? `${deg(sun.drawing)}° clockwise from the top of the drawing` : `${deg(sun.drawing)}° clockwise from the top of the drawing, taken as north`
  const shadow = sun.shadowPerMetre === null ? 'too low to cast a shadow Grid works out, so everything is taken as in shade' : `a 1 m post casts a ${lengthText(sun.shadowPerMetre, display)} shadow`
  return `At ${when} the sun is at bearing ${deg(p.azimuth)}° (${sun.compass}), ${deg(p.elevation)}° above the horizon; on the drawing it shines from ${drawing}; ${shadow}.`
}

/** The day's sunrise, noon and sunset, in one sentence. */
function daySentence(place: EarthPlace, day: CalendarDay, offset: number | null): { line: string; data: Record<string, unknown> } {
  const d = planSunDay(place, day, offset)
  const data = { date: dayText(day), sunrise: d.sunrise === null ? null : timeText(d.sunrise), noon: timeText(d.noon), sunset: d.sunset === null ? null : timeText(d.sunset), polar: d.polar, noonElevation: deg(d.noonElevation) }
  if (d.polar === 'day') return { line: `On ${dayText(day)} the sun does not set; at its highest, ${timeText(d.noon)}, it is ${deg(d.noonElevation)}° up.`, data }
  if (d.polar === 'night') return { line: `On ${dayText(day)} the sun does not rise.`, data }
  return { line: `On ${dayText(day)}: sunrise ${timeText(d.sunrise!)}, solar noon ${timeText(d.noon)} (the sun ${deg(d.noonElevation)}° up), sunset ${timeText(d.sunset!)}.`, data }
}

/** The face as a person reads it. */
function faceLabel(face: PlanFace, display: Display): string {
  const where = face.building === null ? '' : `building ${q(face.building)} `
  return `${where}face ${face.face} (${face.inner ? 'into a courtyard, ' : ''}faces ${face.faces}, ${lengthText(face.length, display)})`
}

const faceData = (face: PlanFace) => ({
  building: face.building,
  face: face.face,
  from: [round(face.from.x), round(face.from.y)],
  to: [round(face.to.x), round(face.to.y)],
  length: round(face.length),
  faces: face.faces,
  bearing: deg(face.bearing),
  inner: face.inner,
})

/** The weight of each sample time: half the gap to each neighbour, within the day. */
function weights(minutes: readonly number[]): number[] {
  if (minutes.length === 1) return [1]
  return minutes.map((t, i) => ((minutes[i + 1] ?? t) - (minutes[i - 1] ?? t)) / 2)
}

/** The shadows on each level a surface lies on, for a sun. */
function levelShadows(plan: FloorPlan, sun: PlanSun, levels: readonly number[]): Map<number, MultiPolygon> {
  const casters = sunCasters(plan)
  const out = new Map<number, MultiPolygon>()
  for (const level of new Set([casters.ground, ...levels])) out.set(level, shadowsOn(casters, sun, level))
  return out
}

/** The whole answer of `grid_measure what=sun` with a date. */
export function sunPathAnswer(plan: FloorPlan, display: Display, ask: SunPathAsk): SunPathAnswer {
  const place = placeOf(plan)
  const until = ask.until ?? ask.from
  const facing = planFacing(plan)
  const lines = [northLine(facing), `The site is at latitude ${place.latitude}, longitude ${place.longitude}, as the plan states. ${timeWords(ask.utcOffset)}`]
  const allDays = sunMoments(ask.from, until, 720, 720).map((m) => m.day)
  const days = allDays.map((day) => daySentence(place, day, ask.utcOffset))
  if (days.length <= 3) lines.push(...days.map((d) => d.line))
  else lines.push(`${days.length} dates from ${dayText(ask.from)} to ${dayText(until)}, every ${limit('sunStepDays')} days and the last: ${days[0]!.line} ${days.at(-1)!.line}`)
  const base = { measures: 'the sun and the shadows of the plan\'s own parts, not a daylight or sunlight result', ...northData(facing), place, time: ask.utcOffset === null ? 'solar' : 'clock', utcOffset: ask.utcOffset, days: days.map((d) => d.data) }
  if (ask.time === null && ask.hours === null) {
    lines.push('Pass time (one moment) or hours (a range, such as 09:00-17:00) for where the sun is, the faces it is on and the share of each open space in sun.')
    return { lines, data: base }
  }
  const [start, end] = ask.hours ?? [ask.time!, ask.time!]
  const moments = sunMoments(ask.from, until, start, end)
  if (moments.length > limit('sunMomentsMost')) throw new SunAskRefused(`That is ${moments.length} moments (${allDays.length} dates by ${moments.length / allDays.length} times), more than the ${limit('sunMomentsMost')} one call works out: give fewer dates or a shorter range of hours.`)
  const surfaces = sunSurfaces(plan, ask.areas)
  const faces = planFaces(plan)
  const casters = sunCasters(plan)
  const perDay = moments.length / allDays.length
  const w = weights(moments.slice(0, perDay).map((m) => m.minutes))
  const suns = moments.map((m) => planSunAt(plan, place, m, ask.utcOffset))
  const shares = surfaces.map(() => [] as number[])
  const faceFacing = faces.map(() => 0)
  const faceLit = faceFacing.map(() => 0)
  const atMoment: { sun: PlanSun; faces: ReturnType<typeof faceSun>[]; shares: number[] }[] = []
  suns.forEach((sun, i) => {
    const shadows = levelShadows(plan, sun, surfaces.map((s) => s.level))
    const ground = shadows.get(casters.ground) ?? []
    const onFaces = faces.map((f) => faceSun(f, sun, ground))
    const here = surfaces.map((s) => shareInSun(s, shadows.get(s.level) ?? [], sun))
    here.forEach((share, k) => shares[k]!.push(share))
    const weight = w[i % perDay]!
    onFaces.forEach((f, k) => {
      if (f.facing) {
        faceFacing[k] += weight
        faceLit[k] += weight * (1 - f.footInShade)
      }
    })
    if (ask.hours === null) atMoment.push({ sun, faces: onFaces, shares: here })
  })

  const surfaceLabel = (s: SunSurface): string => `${q(s.name)}${s.kind === 'area' ? ' (the area given)' : s.kind === 'site' ? ` (the site's ${s.id})` : ''} (${areaText(s.area, display)}${s.floor !== null && s.floor !== 'ground' ? `, floor ${q(s.floor)}` : ''})`
  const surfaceData = (s: SunSurface, k: number, extra: Record<string, unknown>) => ({ id: s.id, kind: s.kind, name: s.name, floor: s.floor, area: round(s.area), ...extra, byMoment: shares[k]!.map(round) })

  if (ask.hours === null) {
    // One time, on each date asked.
    const moment = atMoment
    for (const { sun, faces: onFaces, shares: here } of moment.slice(0, 3)) {
      lines.push(sunSentence(sun, display))
      if (!sun.up) continue
      const lit = faces.map((f, k) => ({ f, s: onFaces[k]! })).filter((x) => x.s.facing)
      if (faces.length === 0) lines.push('No building face: no floor of the plan has an outline Grid can work out.')
      else if (lit.length === 0) lines.push('The sun is on no face of the buildings.')
      else lines.push(`The sun is on ${lit.length} of ${faces.length} faces: ${lit.slice(0, 16).map((x) => `${faceLabel(x.f, display)} at ${deg(x.s.angle!)}° off square${x.s.footInShade > 0 ? `, ${pct(x.s.footInShade)} of its foot in another's shadow` : ''}`).join('; ')}${lit.length > 16 ? `; and ${lit.length - 16} more` : ''}.`)
      if (surfaces.length === 0) lines.push('No open outdoor space, paving or pool to measure in sun: pass areas to measure a patch, such as a planting bed.')
      else lines.push(`In sun: ${surfaces.map((s, k) => `${surfaceLabel(s)} ${pct(here[k]!)}`).join('; ')}.`)
    }
    if (moment.length > 3) lines.push(`And on ${moment.length - 3} more dates, in data.`)
    if (moment.length > 1 && surfaces.length > 0) lines.push(`Over the ${moment.length} dates at ${timeText(start)}: ${surfaces.map((s, k) => `${q(s.name)} ${pct(mean(shares[k]!))} in sun on average`).join('; ')}.`)
    const data = {
      ...base,
      moments: moment.map(({ sun, faces: onFaces, shares: here }) => ({
        ...sunData(sun),
        faces: faces.map((f, k) => ({ building: f.building, face: f.face, sun: onFaces[k]!.facing, angle: onFaces[k]!.angle === null ? null : deg(onFaces[k]!.angle!), footInShade: round(onFaces[k]!.footInShade) })),
        spaces: surfaces.map((s, k) => ({ id: s.id, inSun: round(here[k]!) })),
      })),
      faces: faces.map(faceData),
      spaces: surfaces.map((s, k) => surfaceData(s, k, { inSun: round(mean(shares[k]!)) })),
      leftOut: leftOutData(plan),
    }
    lines.push(...leftOutLines(plan))
    return { lines, data }
  }

  // A range of hours, on each date asked.
  const span = (end - start) / 60
  lines.push(`From ${timeText(start)} to ${timeText(end)}, every ${limit('sunStepMinutes')} minutes and the last, on ${allDays.length === 1 ? dayText(ask.from) : `${allDays.length} dates`}: ${moments.length} moments, ${suns.filter((s) => s.up).length} with the sun up.`)
  const weighted = (k: number): number => {
    let sum = 0
    let total = 0
    shares[k]!.forEach((share, i) => {
      sum += share * w[i % perDay]!
      total += w[i % perDay]!
    })
    return total > 0 ? sum / total : mean(shares[k]!)
  }
  if (surfaces.length === 0) lines.push('No open outdoor space, paving or pool to measure in sun: pass areas to measure a patch, such as a planting bed.')
  for (const [k, s] of surfaces.entries()) {
    const firstDay = shares[k]!.slice(0, perDay).map((share, i) => `${timeText(moments[i]!.minutes)} ${pct(share)}`).join(', ')
    lines.push(`${surfaceLabel(s)}: ${pct(weighted(k))} in sun over the hours${allDays.length > 1 ? ' and dates' : ''}, weighted by time; ${allDays.length > 1 ? `on ${dayText(ask.from)}, ` : ''}${firstDay}.`)
  }
  const perDayHours = (v: number): number => v / allDays.length / 60
  if (faces.length > 0) {
    const shown = faces.map((f, k) => ({ f, facing: perDayHours(faceFacing[k]!), lit: perDayHours(faceLit[k]!) })).filter((x) => x.facing > 0)
    lines.push(shown.length === 0
      ? `The sun is on no face of the buildings in those ${deg(span)} hours.`
      : `Hours the sun is on each face${allDays.length > 1 ? ', a day on average' : ''}, and with its foot clear of other shadows: ${shown.slice(0, 16).map((x) => `${faceLabel(x.f, display)} ${deg(x.facing)} h, ${deg(x.lit)} h clear`).join('; ')}${shown.length > 16 ? `; and ${shown.length - 16} more` : ''}.`)
  }
  lines.push(...leftOutLines(plan))
  const data = {
    ...base,
    hours: { from: timeText(start), to: timeText(end), everyMinutes: limit('sunStepMinutes') },
    moments: suns.map(sunData),
    faces: faces.map((f, k) => ({ ...faceData(f), sunHours: round(perDayHours(faceFacing[k]!)), clearHours: round(perDayHours(faceLit[k]!)) })),
    spaces: surfaces.map((s, k) => surfaceData(s, k, { inSun: round(weighted(k)) })),
    leftOut: leftOutData(plan),
  }
  return { lines, data }
}

const mean = (values: readonly number[]): number => (values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length)

/** One sun as data. */
export function sunData(sun: PlanSun): Record<string, unknown> {
  return {
    date: dayText(sun.moment.day),
    time: timeText(sun.moment.minutes),
    azimuth: deg(sun.position.azimuth),
    elevation: deg(sun.position.elevation),
    compass: sun.compass,
    drawing: deg(sun.drawing),
    up: sun.up,
    shadowPerMetre: sun.shadowPerMetre === null ? null : round(sun.shadowPerMetre),
  }
}

function leftOutData(plan: FloorPlan): Record<string, unknown> {
  const casters = sunCasters(plan)
  return { floorsByWalls: casters.byWalls, noHeight: casters.noHeight, roofedSpaces: roofedSpaces(plan) }
}

function roofedSpaces(plan: FloorPlan): string[] {
  return plan.rooms.filter((r) => r.outdoor !== undefined && (r.roofed === true || (r.roofed === undefined && (r.outdoor === 'porch' || r.outdoor === 'carport')))).map((r) => r.id)
}

function leftOutLines(plan: FloorPlan): string[] {
  const casters = sunCasters(plan)
  const out: string[] = []
  if (casters.byWalls.length > 0) out.push(`Floor${casters.byWalls.length === 1 ? '' : 's'} ${casters.byWalls.map(q).join(', ')} cast${casters.byWalls.length === 1 ? 's' : ''} by ${casters.byWalls.length === 1 ? 'its' : 'their'} walls alone, as no outline could be worked out: grid_check says why.`)
  if (casters.noHeight.length > 0) out.push(`The site's ${casters.noHeight.map(q).join(', ')} cast no shadow: a fence needs its height, a tree its height and canopy.`)
  const roofed = roofedSpaces(plan)
  if (roofed.length > 0) out.push(`Roofed outdoor space is under its roof and is not measured: ${roofed.map(q).join(', ')}.`)
  return out
}

/** The sun as the 3D scene's light takes it: the way toward it in Three's axes (x, up, -y) and its elevation. */
export function sceneSunOf(sun: PlanSun): { toward: [number, number, number]; elevation: number } {
  const e = (sun.position.elevation * Math.PI) / 180
  return { toward: [Math.cos(e) * sun.toward.x, Math.sin(e), -Math.cos(e) * sun.toward.y], elevation: sun.position.elevation }
}

/** What `grid_view kind=plan` with `sun` says about the shadow plan it drew. */
export function shadowPlanLines(sun: PlanSun, shadows: ShadowPlan, display: Display): string[] {
  const lines = [sunSentence(sun, display)]
  if (!sun.up) return [...lines, 'Nothing is shaded on the drawing, as the sun casts no shadow Grid works out.']
  lines.push(shadows.onGround
    ? `The shadows the plan's floors, walls, fences and trees cast on the ground (level ${lengthText(shadows.level, display)}) are shaded dark round the building; under its roofs it is not shaded.`
    : `The shadows on the open spaces of this floor, at its level of ${lengthText(shadows.level, display)}, are shaded dark; the ground below is not drawn.`)
  if (shadows.spaces.length > 0) lines.push(`In sun then: ${shadows.spaces.map((s) => `${q(s.surface.name)} ${pct(s.inSun)} of ${areaText(s.surface.area, display)}`).join('; ')}. grid_measure what=sun with date and hours gives the share over a range of hours.`)
  return lines
}
