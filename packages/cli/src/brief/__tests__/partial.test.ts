/** ARE-52: one wrong line of a brief refuses that line, not the whole brief. */
import { describe, expect, it } from 'vitest'
import { BriefRefused, parseBrief, parseBriefLines } from '../brief'

const ok = { level: 'must', source: 'given' }

describe('a brief read line by line', () => {
  it('keeps the valid lines and returns the one with no quote', () => {
    const raw = {
      rooms: [
        { name: 'Kitchen', area: 10, ...ok, quote: 'a kitchen of 10' },
        { name: 'Study', area: 8, ...ok },
        { use: 'bedroom', count: 2, ...ok, quote: 'two bedrooms' },
      ],
      figures: { door_width: { value: 0.8, ...ok, quote: 'doors' }, step: { value: 0.1, level: 'must', source: 'given' } },
    }
    const { brief, refused } = parseBriefLines(raw, { versionNeeded: false })
    expect(brief.rooms.map((r) => r.name ?? r.use)).toEqual(['Kitchen', 'bedroom'])
    expect(brief.figures.map((f) => f.figure)).toEqual(['door_width'])
    expect(refused.map((r) => r.where)).toEqual(['rooms[1]', 'figures.step'])
    expect(refused[0]!.problem).toContain('quote')
    expect(JSON.parse(refused[0]!.line)).toMatchObject({ name: 'Study' })
  })

  it('refuses a figure Grid does not know on its own line', () => {
    const { brief, refused } = parseBriefLines({ open: [{ quote: 'a study' }], figures: { colour: { value: 1, ...ok, quote: 'x' } } }, { versionNeeded: false })
    expect(brief.open).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect(refused[0]!.problem).toContain('door_width')
  })

  it('returns a wrong footprint and keeps the rest', () => {
    const { brief, refused } = parseBriefLines({ footprint: { width: 10, level: 'must', source: 'assumed' }, open: [{ quote: 'q' }] }, { versionNeeded: false })
    expect(brief.footprint).toBeNull()
    expect(refused.map((r) => r.where)).toEqual(['footprint'])
  })

  it('still refuses the whole brief for a fault in the whole, or with nothing valid', () => {
    expect(() => parseBriefLines({ rooms: [], extra: 1 })).toThrow(BriefRefused)
    expect(() => parseBriefLines({ version: '2', open: [{ quote: 'q' }] })).toThrow(/version/)
    expect(() => parseBriefLines({ rooms: [{ name: 'A', area: 1, ...ok }] }, { versionNeeded: false })).toThrow(/rooms\[0\].*quote/)
  })

  it('leaves the strict reading, used for the file, strict', () => {
    expect(() => parseBrief({ version: '1', rooms: [{ name: 'A', area: 1, ...ok }, { name: 'B', area: 2, ...ok, quote: 'b' }] })).toThrow(BriefRefused)
  })
})
