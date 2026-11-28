/**
 * SHT-26: the day a sheet is dated, as the pages print it: a `Date` at midnight UTC of that day
 * (the pages read it by its UTC fields).
 *
 * - A date asked for (`2026-01-31`) is that day.
 * - A time asked for (`2026-01-31T23:30:00-05:00`) is the day it is written with, at its own
 *   offset, never that moment's day in UTC.
 * - `SOURCE_DATE_EPOCH` is its day in UTC, so a reproducible build dates the sheet the same
 *   anywhere.
 * - Else the clock, and the day where the person is: the machine's own time zone, so a sheet
 *   made after midnight is dated today, not yesterday in UTC.
 */
import { exportTime } from '../command/export'

export function sheetDay(date: string | undefined, env: NodeJS.ProcessEnv = process.env, now: () => Date = () => new Date()): Date {
  // The checks and the refusals are `grid export --date`'s.
  const when = exportTime(date, env)
  if (date !== undefined) return new Date(`${date.slice(0, 10)}T00:00:00Z`)
  const epoch = env['SOURCE_DATE_EPOCH']
  if (epoch !== undefined && epoch !== '') return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()))
  const clock = now()
  return new Date(Date.UTC(clock.getFullYear(), clock.getMonth(), clock.getDate()))
}
