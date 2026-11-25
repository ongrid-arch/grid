/**
 * MSG-19: every kind of seen mark Grid writes is read back, one mark that cannot be read never
 * discards the others, and Marked is said only for a mark that can be read.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResultLine, ThingKind } from '@ongrid/rules'
import { openProject, type Project } from '../../fs/projectFiles'
import { loadPlan } from '../../command/plan'
import { madeNewAgain, markSeen, parseSeen, parseSeenLoose, readSeen, SeenRefused } from '../marks'

const FLAT = readFileSync(resolve(__dirname, '../../../../floorplan/fixtures/two-bed-flat.json'), 'utf8')

let dir: string
let project: Project
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'grid-seen-marks-'))
  writeFileSync(join(dir, 'plan.json'), FLAT)
  project = openProject(dir, dir)
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const KINDS: readonly ThingKind[] = ['plan', 'floor', 'wall', 'room', 'opening', 'item', 'stair', 'pattern', 'flat']

function mark(kind: string, id: string): Record<string, unknown> {
  return { code: 'flat/note', thing: { kind, id }, also: [], parts: [{ kind, id, hash: 'abc' }], reason: 'Kept on purpose', by: 'A. Person', at: '2026-11-22T10:00:00.000Z' }
}

function lineOf(kind: ThingKind, id: string): ResultLine {
  return { code: 'flat/note', kind: 'finding', thing: { kind, id }, floor: null, also: [], message: 'A note', found: '', needed: '', fix: '' } as unknown as ResultLine
}

describe('a mark on every kind of thing', () => {
  it.each(KINDS)('is read back: %s', (kind) => {
    const file = { version: '1', marks: [mark(kind, kind === 'plan' ? '' : 'x1')] }
    expect(parseSeen(file).marks[0]!.thing.kind).toBe(kind)
  })

  it.each(['flat', 'pattern'] as const)('written for a %s is read by the next check', (kind) => {
    const loaded = loadPlan(project, 'plan.json')
    const done = markSeen(project, 'plan.json', loaded, lineOf(kind, 'x1'), { reason: 'Kept on purpose', by: 'A. Person' })
    expect(done.mark.thing.kind).toBe(kind)
    const read = readSeen(project, 'plan.json')
    expect(read.problem).toBeNull()
    expect(read.marks.map((m) => m.thing)).toEqual([{ kind, id: 'x1' }])
  })
})

describe('one mark that cannot be read', () => {
  const file = (marks: unknown[]): string => JSON.stringify({ version: '1', marks })

  it('leaves the others readable, and says how many were left out', () => {
    writeFileSync(join(dir, 'plan.seen.json'), file([mark('flat', 'f1'), mark('galaxy', 'g1'), mark('room', 'r1')]))
    const read = readSeen(project, 'plan.json')
    expect(read.marks.map((m) => m.thing.id)).toEqual(['f1', 'r1'])
    expect(read.problem).toBe('plan.seen.json holds a mark Grid could not read (marks[1].thing must be an object with a kind and an id)')
  })

  it('counts several, and never quotes a reason or a name', () => {
    writeFileSync(join(dir, 'plan.seen.json'), file([{ ...mark('room', 'r1'), reason: '' }, mark('galaxy', 'g1'), mark('room', 'r2')]))
    const read = readSeen(project, 'plan.json')
    expect(read.marks).toHaveLength(1)
    expect(read.problem).toContain('2 marks Grid could not read')
    expect(read.problem).not.toContain('A. Person')
  })

  it('still refuses a file whose frame is wrong, as before', () => {
    expect(() => parseSeenLoose({ version: '2', marks: [] })).toThrow(SeenRefused)
    writeFileSync(join(dir, 'plan.seen.json'), '{"version":"2","marks":[]}')
    expect(readSeen(project, 'plan.json').marks).toEqual([])
  })

  it('is not written over: marking another note is refused and the file is kept', () => {
    const text = file([mark('flat', 'f1'), mark('galaxy', 'g1')])
    writeFileSync(join(dir, 'plan.seen.json'), text)
    const loaded = loadPlan(project, 'plan.json')
    expect(() => markSeen(project, 'plan.json', loaded, lineOf('room', 'r9'), { reason: 'Kept', by: 'A. Person' })).toThrow(/Nothing was marked/)
    expect(readFileSync(join(dir, 'plan.seen.json'), 'utf8')).toBe(text)
  })
})

describe('MSG-29: the notes a change made new again', () => {
  const room = (id: string): ResultLine => ({ ...lineOf('room', id), code: 'room/note' }) as ResultLine
  const flat = JSON.parse(FLAT) as { rooms: { id: string; name?: string }[] }
  const planWith = (name: string): ReturnType<typeof loadPlan> => {
    const changed = { ...flat, rooms: flat.rooms.map((r) => (r.id === 'bed2' ? { ...r, name } : r)) }
    writeFileSync(join(dir, 'plan.json'), JSON.stringify(changed))
    return loadPlan(project, 'plan.json')
  }

  it('names a note that held before and is new again after, with its number counted for its country', () => {
    const before = loadPlan(project, 'plan.json')
    const us = markSeen(project, 'plan.json', before, room('bed2'), { reason: 'Kept small', by: 'A. Person', country: 'US' }).mark
    expect(us.country).toBe('US')
    expect(readSeen(project, 'plan.json').marks[0]!.country).toBe('US')
    const after = planWith('Box room')
    // The note is the second of the US report, and in no report counted without a country.
    const lines = (country: string | undefined): ResultLine[] => (country === 'US' ? [room('bed1'), room('bed2')] : [])
    const made = madeNewAgain(readSeen(project, 'plan.json').marks, { source: before, lines }, { source: after, lines })
    expect(made.map((m) => [m.number, m.line.thing.id, m.mark.country])).toEqual([[2, 'bed2', 'US']])
    expect(made[0]!.changed.map((p) => p.id)).toEqual(['bed2'])
  })

  it('names no note that already did not hold, none the change took away, and none still seen', () => {
    const before = loadPlan(project, 'plan.json')
    const lines = (): ResultLine[] => [room('bed2')]
    const mark = markSeen(project, 'plan.json', before, room('bed2'), { reason: 'Kept small', by: 'A. Person' }).mark
    expect(mark.country).toBeUndefined()
    // Still seen: nothing it is about changed.
    expect(madeNewAgain([mark], { source: before, lines }, { source: before, lines })).toEqual([])
    const after = planWith('Box room')
    // Gone: the change took the note away.
    expect(madeNewAgain([mark], { source: before, lines }, { source: after, lines: () => [] })).toEqual([])
    // Already new again before the change: it is not news.
    const later = planWith('Study')
    expect(madeNewAgain([mark], { source: after, lines }, { source: later, lines })).toEqual([])
  })
})
