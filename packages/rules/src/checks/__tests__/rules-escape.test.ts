import { describe, expect, it } from 'vitest'
import { openingsBelowGround, type FloorPlan, type Opening, type Room, type Wall } from '@ongrid/floorplan/geometry'
import { ESCAPE_TOP_LEVEL, FIGURES, RULES, checkLocalRules } from '..'
import { messages } from '../messages'
import { inspectPlan } from '../../result'

/**
 * The bedroom escape-opening rule (US model codes: IBC 2024 1031, IRC 2024 R319).
 *
 * A free-standing 3 × 3.5 m room on one floor at `level`. Its walls are exterior unless
 * `interiorBottom`, and listed counter-clockwise (C3). Openings go on the bottom wall
 * (`b-w0`, running +X, so the room is on its left side). With `interiorBottom` a hall is drawn
 * on the other side of that wall: since MSG-13 an inside wall is one with rooms on both sides,
 * worked out from the outlines, and a wall that only says `interior` with nothing behind it
 * faces outside. The plan states its place, the US (COD-3).
 */
function bedroom(
  openings: Omit<Opening, 'wall'>[],
  { level = 0, use = 'bedroom', interiorBottom = false }: { level?: number; use?: string; interiorBottom?: boolean } = {}
): FloorPlan {
  const corners: [number, number][] = [[-0.1, -0.1], [3.1, -0.1], [3.1, 3.6], [-0.1, 3.6]]
  const walls = corners.map(
    (start, i): Wall => ({
      id: `b-w${i}`,
      start,
      end: corners[(i + 1) % 4]!,
      thickness: 0.2,
      height: 2.7,
      kind: i === 0 && interiorBottom ? 'interior' : 'exterior',
      floor: 'f'
    })
  )
  const room = { id: 'b', name: 'Bedroom 2', boundary: walls.map((w) => w.id), floor: 'f', use } as Room
  const hallCorners: [number, number][] = [[-0.1, -2.1], [3.1, -2.1], [3.1, -0.1], [-0.1, -0.1]]
  const hallWalls: Wall[] = interiorBottom
    ? [0, 1, 3].map((i) => ({
        id: `h-w${i}`,
        start: hallCorners[i]!,
        end: hallCorners[(i + 1) % 4]!,
        thickness: 0.2,
        height: 2.7,
        kind: 'exterior',
        floor: 'f'
      }))
    : []
  const hall = { id: 'h', name: 'Hall', boundary: ['h-w0', 'h-w1', 'b-w0', 'h-w3'], floor: 'f', use: 'corridor' } as Room
  // COD-3: the plan states its place, so the US figures apply.
  return {
    version: '1',
    units: 'm',
    site: { country: 'US' },
    floors: [{ id: 'f', name: 'Floor', level }],
    walls: [...walls, ...hallWalls],
    rooms: interiorBottom ? [room, hall] : [room],
    openings: openings.map((o) => ({ ...o, wall: 'b-w0' }) as Opening)
  }
}

const win = (id: string, width: number, height: number, sill: number, offset = 0.5): Omit<Opening, 'wall'> => ({
  id,
  type: 'window',
  offset,
  width,
  height,
  sill
})
const door = (id: string, offset = 2.0): Omit<Opening, 'wall'> => ({ id, type: 'door', offset, width: 0.9, sill: 0, height: 2.1 })

const ESCAPE = ['no_escape_opening', 'escape_window_too_small', 'escape_window_too_high']
const escapes = (p: FloorPlan) => checkLocalRules(p).findings.filter((f) => ESCAPE.includes(f.code))

describe('the escape-opening rule', () => {
  it('is in the catalogue as a rule from US model codes, citing both documents', () => {
    const rule = RULES.find((r) => r.id === 'escape-opening')!
    expect(rule.source.kind).toBe('building-code')
    expect(rule.source.label).toBe('US model codes: IBC 2024 and IRC 2024')
    expect(rule.source.citations).toContainEqual({ document: 'IBC', edition: '2024', clause: '1031.2' })
    expect(rule.source.citations).toContainEqual({ document: 'IRC', edition: '2024', clause: 'R319.2.3' })
  })

  it("uses the sources' own metric figures, one value each", () => {
    expect([
      FIGURES.escapeOpeningMinWidth.baseline,
      FIGURES.escapeOpeningMinHeight.baseline,
      FIGURES.escapeOpeningMinArea.baseline,
      FIGURES.escapeOpeningMinAreaGrade.baseline,
      FIGURES.escapeOpeningMaxSill.baseline,
      ESCAPE_TOP_LEVEL.level
    ]).toEqual([0.508, 0.61, 0.53, 0.46, 1.118, 2])
  })

  it('reads its messages from fixed templates', () => {
    expect(messages.noEscapeOpening('Bedroom 2')).toBe('"Bedroom 2" has no window or door to escape through')
    expect(messages.escapeWindowTooSmall('Bedroom 2')).toBe('The window of "Bedroom 2" is too small to escape through')
    expect(messages.escapeWindowTooHigh('Bedroom 2')).toBe('The window of "Bedroom 2" is too high to escape through')
  })
})

describe('which bedrooms pass', () => {
  it('a good window', () => {
    expect(escapes(bedroom([win('o1', 1.0, 1.2, 0.9)]))).toEqual([])
  })

  it('a door to the garden, with no window', () => {
    expect(escapes(bedroom([door('d1')]))).toEqual([])
  })

  it('a small window on level 0 that would fail upstairs', () => {
    expect(escapes(bedroom([win('o1', 0.7, 0.7, 0.9)], { level: 0 }))).toEqual([])
  })
})

describe('MS-11 a bedroom whose walls state no kind', () => {
  // A wall that states no kind reads as interior. Since MSG-13 a window with the bedroom on one
  // side and no room or enclosed floor on the other faces outside, whatever the kind says.
  it('escapes through its window, as one with exterior walls does', () => {
    const plan = bedroom([win('o1', 1.0, 1.2, 0.9)])
    const unstated = { ...plan, walls: plan.walls.map((w) => ({ ...w, kind: 'interior' as const })) }
    expect(escapes(unstated)).toEqual(escapes(plan))
    expect(escapes(unstated)).toEqual([])
  })
})

describe('which bedrooms are reported', () => {
  it('windows only onto the hall', () => {
    const [finding, ...rest] = escapes(bedroom([win('o1', 1.0, 1.2, 0.9)], { interiorBottom: true }))
    expect(rest).toEqual([])
    expect(finding).toMatchObject({ code: 'no_escape_opening', ruleId: 'escape-opening', floor: 'f', rooms: ['b'], openings: [] })
    expect(finding!.message).toBe('"Bedroom 2" has no window or door to escape through')
  })

  it('no window at all, in a basement', () => {
    expect(escapes(bedroom([], { level: -1 })).map((f) => f.code)).toEqual(['no_escape_opening'])
  })

  it('a small window upstairs', () => {
    const [finding] = escapes(bedroom([win('o1', 0.7, 0.7, 0.9)], { level: 1 }))
    expect(finding).toMatchObject({
      code: 'escape_window_too_small',
      openings: ['o1'],
      area: 0.49,
      minimum: 0.53,
      width: 0.7,
      height: 0.7
    })
  })

  it('a narrow window, even though its area is enough', () => {
    expect(escapes(bedroom([win('o1', 0.45, 1.4, 0.9)], { level: 1 })).map((f) => f.code)).toEqual(['escape_window_too_small'])
  })

  it('a high sill', () => {
    const [finding] = escapes(bedroom([win('o1', 1.0, 1.0, 1.2)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_high', openings: ['o1'], sill: 1.2, maximum: 1.118 })
    expect(finding!.figures).toMatchObject([{ key: 'escapeOpeningMaxSill', origin: 'baseline', status: 'ai-found' }])
  })

  it('figures at the limit: width, height and sill pass, the area fails', () => {
    const [finding] = escapes(bedroom([win('o1', 0.508, 0.61, 1.118)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_small', area: 0.31, width: 0.508, height: 0.61 })
    expect(finding!.figures!.map((f) => f.key)).toEqual(['escapeOpeningMinAreaGrade', 'escapeOpeningMinWidth', 'escapeOpeningMinHeight'])
  })

  it('just over the sill, to the millimetre', () => {
    const [finding] = escapes(bedroom([win('o1', 1.0, 1.0, 1.12)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_high', sill: 1.12, maximum: 1.118 })
    expect(escapes(bedroom([win('o1', 1.0, 1.0, 1.118)]))).toEqual([])
  })

  it('just under the width, to the millimetre', () => {
    expect(escapes(bedroom([win('o1', 0.507, 1.4, 0.9)])).map((f) => f.code)).toEqual(['escape_window_too_small'])
    expect(escapes(bedroom([win('o1', 0.508, 1.4, 0.9)]))).toEqual([])
  })

  it('describes the largest window, and the sill only when some window is big enough', () => {
    const tooHigh = escapes(bedroom([win('o1', 0.6, 0.6, 0.9), win('o2', 1.0, 1.0, 1.3, 1.5)]))
    expect(tooHigh).toMatchObject([{ code: 'escape_window_too_high', openings: ['o2'] }])
    const tooSmall = escapes(bedroom([win('o1', 0.4, 0.5, 0.9), win('o2', 0.6, 0.6, 0.9, 1.5)], { level: 1 }))
    expect(tooSmall).toMatchObject([{ code: 'escape_window_too_small', openings: ['o2'], area: 0.36 }])
  })
})

describe('figures looked up for another country', () => {
  const source = { url: 'https://example.org/rules', quote: 'at least 0.33 m2', retrievedAt: '2026-11-14T10:00:00.000Z' }
  const lookedUp = {
    escapeOpeningMinArea: { value: 0.33, source },
    escapeOpeningMinWidth: { value: 0.45, source },
    escapeOpeningMinHeight: { value: 0.45, source },
    escapeOpeningMaxSill: { value: 1.1, source }
  }
  const abroad = (p: FloorPlan, figures: Parameters<typeof checkLocalRules>[1] = { country: 'GB', figures: lookedUp }) =>
    checkLocalRules(p, figures).findings.filter((f) => ESCAPE.includes(f.code))

  it('are what the window is measured against, in place of the carried ones', () => {
    // 0.5 x 0.7 m is under the carried 0.53 m² upstairs, and over the looked-up 0.33 m².
    const small = bedroom([win('o1', 0.5, 0.7, 0.9)], { level: 1 })
    expect(escapes(small).map((f) => f.code)).toEqual(['escape_window_too_small'])
    expect(abroad(small)).toEqual([])
  })

  it('can be stricter too: a sill the carried figure allows is too high for the looked-up one', () => {
    const [finding] = abroad(bedroom([win('o1', 1.0, 1.0, 1.11)]))
    expect(finding).toMatchObject({ code: 'escape_window_too_high', sill: 1.11, maximum: 1.1 })
    expect(finding!.figures).toMatchObject([{ key: 'escapeOpeningMaxSill', origin: 'lookup', status: 'ai-found', source }])
    expect(escapes(bedroom([win('o1', 1.0, 1.0, 1.11)]))).toEqual([])
  })

  it('test only what was found: with a width alone, nothing is said about area, height or sill', () => {
    const only = { country: 'DE', figures: { escapeOpeningMinWidth: { value: 0.9, source } } }
    expect(abroad(bedroom([win('o1', 0.95, 0.3, 1.9)]), only)).toEqual([])
    const [finding] = abroad(bedroom([win('o1', 0.8, 1.4, 0.9)]), only)
    expect(finding).toMatchObject({ code: 'escape_window_too_small', width: 0.8 })
    expect(finding!.minimum).toBeUndefined()
    expect(finding!.figures!.map((f) => f.key)).toEqual(['escapeOpeningMinWidth'])
  })

  it('with none found, the check does not run and the report says so', () => {
    const report = checkLocalRules(bedroom([]), { country: 'ES' })
    expect(report.findings.filter((f) => ESCAPE.includes(f.code))).toEqual([])
    expect(report.notChecked.map((n) => n.message)).toContain(
      'Escape openings were not checked: the figures here are from US model codes, and this plan is for Spain'
    )
  })
})

describe('which rooms are not checked', () => {
  // MSG-2 (lab CH-4, M-2): it used to pass in silence, with no notice; now it is said.
  it('a bedroom on level 3 gets no finding, and a notice that names it as not checked', () => {
    const report = checkLocalRules(bedroom([], { level: 3 }))
    expect(report.findings.filter((f) => ESCAPE.includes(f.code))).toEqual([])
    const above = report.notChecked.filter((n) => n.reason === 'above_escape_storeys')
    expect(above).toHaveLength(1)
    expect(above[0]!.rooms).toHaveLength(1)
    expect(above[0]!.message).toMatch(/escape openings were not checked in bedrooms: the figures here cover bedrooms up to the third storey: 1$/)
    const coverage = report.coverage.find((c) => c.ruleId === 'escape-opening')!
    expect(coverage.lookedAtCount).toBe(0)
    expect(coverage.skipped.map((s) => s.reason)).toEqual(['above_escape_storeys'])
  })

  it('a bedroom on level 2 is looked at, and gets no such notice', () => {
    const report = checkLocalRules(bedroom([], { level: 2 }))
    expect(report.notChecked.filter((n) => n.reason === 'above_escape_storeys')).toEqual([])
    expect(report.coverage.find((c) => c.ruleId === 'escape-opening')!.lookedAtCount).toBe(1)
  })

  it.each(['living', 'other'])('a room whose use is %s', (use) => {
    expect(escapes(bedroom([], { use }))).toEqual([])
  })

  it('a room called Bedroom that states no use', () => {
    const p = bedroom([])
    delete (p.rooms[0] as { use?: string }).use
    expect(escapes(p)).toEqual([])
  })
})

describe('invariants', () => {
  const cases: [string, FloorPlan][] = [
    ['good', bedroom([win('o1', 1.0, 1.2, 0.9), door('d1')])],
    ['hall', bedroom([win('o1', 1.0, 1.2, 0.9)], { interiorBottom: true })],
    ['small', bedroom([win('o1', 0.6, 0.6, 0.9), win('o2', 0.5, 0.7, 0.9, 1.5)], { level: 1 })],
    ['high', bedroom([win('o1', 1.0, 1.0, 1.2)])]
  ]

  it.each(cases)('%s: the report is byte-identical when every list is reversed', (_name, p) => {
    const reversed: FloorPlan = {
      ...p,
      walls: [...p.walls].reverse(),
      rooms: p.rooms.map((r) => ({ ...r, boundary: [...r.boundary.slice(1), r.boundary[0]!] })),
      openings: [...p.openings].reverse()
    }
    expect(JSON.stringify(checkLocalRules(reversed))).toBe(JSON.stringify(checkLocalRules(p)))
  })

  // A side test on a mirrored basis would read the room on the wrong face of its wall. The
  // mirror flips X, reverses each wall (so offsets are measured from the other end) and
  // reverses each boundary (so it stays counter-clockwise): the same building, drawn backwards.
  it.each(cases)('%s: mirroring the plan keeps the findings', (_name, p) => {
    const lengths = new Map(p.walls.map((w) => [w.id, Math.hypot(w.end[0] - w.start[0], w.end[1] - w.start[1])]))
    const mirrored: FloorPlan = {
      ...p,
      walls: p.walls.map((w) => ({ ...w, start: [-w.end[0], w.end[1]], end: [-w.start[0], w.start[1]] })),
      rooms: p.rooms.map((r) => ({ ...r, boundary: [...r.boundary].reverse() })),
      openings: p.openings.map((o) => ({ ...o, offset: lengths.get(o.wall)! - o.offset - o.width }))
    }
    const summary = (q: FloorPlan) => escapes(q).map((f) => [f.code, f.rooms, f.openings])
    expect(summary(mirrored)).toEqual(summary(p))
  })

  it.each([0.3, 0.9, 1.6, 2.1])('a window moved along the wall to %d m keeps its finding', (offset) => {
    const at = (o: number) => escapes(bedroom([win('o1', 0.6, 0.6, 0.9, o)], { level: 1 })).map((f) => f.code)
    expect(at(offset)).toEqual(at(0.5))
  })
})

describe('order in the report', () => {
  it('puts exit findings first, then escape findings, then room sizes', () => {
    // A tiny bedroom on level 0 with no openings: no exit, no door, no escape, too small.
    const p = bedroom([])
    const corners: [number, number][] = [[-0.1, -0.1], [2.1, -0.1], [2.1, 2.1], [-0.1, 2.1]]
    p.walls = p.walls.map((w, i) => ({ ...w, start: corners[i]!, end: corners[(i + 1) % 4]! }))
    const codes = checkLocalRules(p).findings.map((f) => f.code)
    const group = (code: string) => (ESCAPE.includes(code) ? 1 : code === 'room_too_small' ? 2 : 0)
    expect(codes).toContain('no_escape_opening')
    expect(codes).toContain('room_too_small')
    expect(codes.map(group)).toEqual([...codes.map(group)].sort((a, b) => a - b))
  })
})

describe('the place, read through Grid\'s list (COD-3, lab CH-3)', () => {
  // Lab CH-3: "USA" was read as another country, so the US escape rule was skipped in silence.
  // rules-figures.test.ts 'is false for any other country' lists ES, GB, DE, IT and Spain,
  // never USA, and still holds.
  it('CH-3 "USA" is read as the same place as "US", or refused', () => {
    const plan = bedroom([])
    const codes = (country: string) => checkLocalRules(plan, { country }).findings.map((f) => f.code)
    expect(codes('US')).toContain('no_escape_opening')
    for (const country of ['USA', 'United States', ' united states ', 'u.s.a.', 'United States of America']) expect(codes(country), country).toEqual(codes('US'))
    expect(() => codes('the moon')).toThrow(/^country names no place Grid knows/)
  })
})

describe('the escape window line in the record (MSG-7, lab MS-13)', () => {
  it('names the measure that fails, 0.60 m high against 0.61 m, before the area that passes', () => {
    const plan = bedroom([win('o1', 1.0, 0.6, 0.9)], { level: 1 })
    const [finding] = escapes(plan)
    const line = inspectPlan(plan).lines.find((l) => l.code === 'room/escape-window-too-small')!
    expect(line.found).toBe('0.6 m high, under the 0.61 m needed; 0.6 m² in area and 1 m wide, which are enough')
    // The figures, their sources and their status are the check's own, as before.
    expect(line.figures).toEqual(finding!.figures)
    expect(inspectPlan(plan).label).toBe('General guidance, not your local rules')
  })
})

describe('CNT-14: the part of a window that opens', () => {
  it('measures a window by the part that opens when the plan states one', () => {
    // 1.0 × 1.2 m passes as a whole; a 0.4 m wide casement in it does not.
    expect(escapes(bedroom([{ ...win('o1', 1.0, 1.2, 0.9), opens: { width: 0.4 } }])).map((f) => [f.code, f.width, f.height])).toEqual([['escape_window_too_small', 0.4, 1.2]])
    expect(escapes(bedroom([{ ...win('o1', 1.0, 1.2, 0.9), opens: { width: 0.8, height: 1.0 } }]))).toEqual([])
  })

  it('takes a fixed window as opening nothing', () => {
    expect(escapes(bedroom([{ ...win('o1', 1.0, 1.2, 0.9), kind: 'fixed' }])).map((f) => [f.code, f.area])).toEqual([['escape_window_too_small', 0]])
  })
})

describe('ARE-19 an opening below the ground is not a way out', () => {
  const dug = (openings: Omit<Opening, 'wall'>[], ground: number | null = 3, well = false): FloorPlan => {
    const plan = bedroom(openings, { interiorBottom: well })
    if (well) plan.rooms = plan.rooms.map((r) => (r.id === 'h' ? ({ ...r, name: 'Light well', use: undefined, outdoor: 'light-well' } as Room) : r))
    return ground === null ? plan : { ...plan, site: { ...plan.site, ground } }
  }
  const good = win('o1', 1.0, 1.2, 0.9)

  it('is counted when the plan states no ground, as before', () => {
    expect(escapes(dug([good], null))).toEqual([])
  })

  it('is left out when the below-ground check names it, and the finding points at it', () => {
    const found = escapes(dug([good]))
    expect(found.map((f) => [f.code, f.openings])).toEqual([['no_escape_opening', ['o1']]])
    expect(found[0]!.message).toBe('"Bedroom 2" has no window or door to escape through: its windows and doors in outside walls lie below the ground')
  })

  it('is counted again when the ground is below it', () => {
    expect(escapes(dug([good], 0.2))).toEqual([])
  })

  it('leaves a window above the ground to count', () => {
    expect(escapes(dug([win('o1', 1.0, 1.2, 0.2), win('o2', 1.0, 1.2, 0.9, 1.8)], 0.5))).toEqual([])
  })

  it('is counted when a drawn outdoor space, a light well, is in front of it', () => {
    const plan = dug([good], 3, true)
    // The wall to the well is stated interior, so the below-ground check may not name it at all;
    // make it exterior so both checks read it, and the well alone keeps it counted.
    const exterior = { ...plan, walls: plan.walls.map((w) => (w.id === 'b-w0' ? { ...w, kind: 'exterior' as const } : w)) }
    expect(openingsBelowGround(exterior).map((o) => o.opening)).toEqual(['o1'])
    expect(escapes(exterior)).toEqual([])
  })

  it('says the same in the result line, which names the note on the opening', () => {
    const lines = inspectPlan(dug([good])).lines
    const line = lines.find((l) => l.code === 'room/no-escape-opening')!
    expect(line.found).toBe('its outside openings lie below the ground level the site states: see the note on each')
    expect(lines.some((l) => l.code === 'opening/below-ground' && l.thing.id === 'o1')).toBe(true)
  })
})
