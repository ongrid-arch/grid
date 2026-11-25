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
import { markSeen, parseSeen, parseSeenLoose, readSeen, SeenRefused } from '../marks'

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
