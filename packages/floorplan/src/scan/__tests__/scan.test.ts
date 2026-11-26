/**
 * HND-12: a phone room scan drawn as a plan by pairing each wall's two faces. The scans are
 * invented (`test-support/roomScan.ts`), shaped like Apple's room model from Grid's own numbers.
 */
import { describe, expect, it } from 'vitest'
import { indexPlan } from '../../geometry/plan'
import { validatePlan } from '../../geometry/validate'
import { parseFloorPlan } from '../../types/floorplan'
import { inventedScan, INVENTED_FLAT, type InventedScanOptions } from '../../test-support/roomScan'
import { readScanEvidence, scanEvidence } from '../evidence'
import { readRoomScan, ScanRefused } from '../roomModel'
import { planFromScan, type ScanIds } from '../toPlan'

const convert = (options: InventedScanOptions, previous: ScanIds | null = null) => planFromScan(readRoomScan(inventedScan(options).json), previous)

function problems(plan: unknown): string[] {
  const parsed = parseFloorPlan(plan)
  return validatePlan(parsed, indexPlan(parsed)).issues.map((i) => `${i.code}: ${i.message}`)
}

function refusal(raw: unknown): ScanRefused {
  try {
    planFromScan(readRoomScan(raw))
  } catch (error) {
    if (error instanceof ScanRefused) return error
    throw error
  }
  throw new Error('not refused')
}

describe('a scan shaped like Apple\'s room model (lab AE-2)', () => {
  const done = convert(INVENTED_FLAT)

  it('converts with no problem in the drawing, every room within 0.001% of the scan\'s floor outline', () => {
    expect(problems(done.plan)).toEqual([])
    expect(done.rooms.map((r) => [r.name, r.from])).toEqual([
      ['Living room', 'floor outline'],
      ['Bedroom', 'floor outline'],
      ['Room 1', 'floor outline'],
      ['Bathroom', 'floor outline'],
    ])
    expect(done.rooms.map((r) => Number(r.scanArea.toFixed(4)))).toEqual([16, 12.8, 3.552, 7.0744])
    for (const room of done.rooms) expect(Math.abs(room.difference), room.name).toBeLessThan(0.00001)
  })

  it('pairs each wall\'s two faces into one wall as thick as the gap between them', () => {
    const between = done.paired.map((p) => [p.wall, p.thickness, p.faces.length])
    expect(between).toEqual([
      ['w-living-bedroom', 0.1, 2],
      ['w-y4.06', 0.12, 4],
      ['w-room-1-bathroom', 0.12, 2],
    ])
    expect(done.oneSided).toEqual(['ext-south', 'ext-west', 'ext-east', 'ext-north'])
    const outside = done.plan.walls.filter((w) => done.oneSided.includes(w.id))
    expect(outside.every((w) => w.thickness === 0.2 && w.kind === 'exterior' && w.height === 2.5)).toBe(true)
  })

  it('lists what it assumed, and marks those values assumed and every part scanned', () => {
    expect(done.assumed.map((a) => [a.value, a.parts.length])).toEqual([
      [null, 0],
      ['use', 1],
      ['thickness', 4],
      ['hinge', 4],
      ['turn', 2],
    ])
    expect(done.assumed[0]!.text).toContain('turned 31.70° clockwise')
    expect(done.assumed[2]!.text).toContain('0.2 m thick')
    const marks = done.plan.marks ?? []
    expect(marks.filter((m) => m.source === 'assumed').map((m) => `${m.part} ${m.id} ${m.value}`)).toEqual([
      'wall ext-south thickness',
      'wall ext-west thickness',
      'wall ext-east thickness',
      'wall ext-north thickness',
      'item toilet-1 turn',
      'item bath-1 turn',
    ])
    expect(marks.filter((m) => m.source === 'scanned')).toHaveLength(done.plan.walls.length + done.plan.rooms.length + done.plan.openings.length + (done.plan.items?.length ?? 0))
  })

  it('places the doors and windows on the walls the scan names, at their places along them', () => {
    expect(done.plan.openings.map((o) => [o.id, o.type, o.wall, o.offset, o.width, o.sill])).toEqual([
      ['door-1', 'door', 'ext-west', 0.39, 0.9, 0],
      ['door-2', 'door', 'w-y4.06', 0.9, 0.8, 0],
      ['door-3', 'door', 'w-living-bedroom', 0.7, 0.8, 0],
      ['door-4', 'door', 'w-room-1-bathroom', 0.45, 0.7, 0],
      ['window-1', 'window', 'ext-south', 1.3, 1.6, 0.9],
      ['window-2', 'window', 'ext-east', 1.5, 1.2, 0.95],
    ])
    expect(done.plan.items?.map((i) => [i.id, i.kind, i.size])).toEqual([
      ['toilet-1', 'toilet', [0.38, 0.68]],
      ['bath-1', 'bath', [1.7, 0.75]],
    ])
    expect(done.leftOut).toEqual(['Objects that are not fixtures Grid draws, kept in the scan beside the plan: 1 bed, 1 sofa.'])
  })

  it('reads a transform written as four columns of four as it reads sixteen numbers', () => {
    expect(convert({ ...INVENTED_FLAT, columns: true }).plan).toEqual(done.plan)
  })

  it('draws the same plan wherever the phone stood and however it was turned, within an eighth of a turn', () => {
    expect(convert({ ...INVENTED_FLAT, heading: 12.5, at: [7, 3], floorLevel: -1.5 }).plan).toEqual(done.plan)
  })
})

describe('a scan with no floor outline', () => {
  const room: InventedScanOptions = { rooms: [{ name: 'study', box: [0, 0, 3.15, 2.85], label: 'bedroom' }], floors: false, heading: 12.5 }

  it('is one room, its walls joined end to end, within 0.001% of the area its wall faces enclose', () => {
    const done = convert(room)
    expect(problems(done.plan)).toEqual([])
    expect(done.rooms).toHaveLength(1)
    expect(done.rooms[0]).toMatchObject({ from: 'wall faces', name: 'Bedroom' })
    expect(done.rooms[0]!.scanArea).toBeCloseTo(3.15 * 2.85, 9)
    expect(Math.abs(done.rooms[0]!.difference)).toBeLessThan(0.00001)
  })

  it('is refused when its walls do not close round a room, naming the wall and never the scan\'s text', () => {
    const error = refusal(inventedScan({ ...room, without: ['study-north'] }).json)
    expect(error.code).toBe('scan/not-closed')
    expect(error.message).toContain('no other wall begins within 0.15 m')
  })
})

describe('a scan of several rooms with no floor outline', () => {
  const two: InventedScanOptions = {
    rooms: [
      { name: 'front', box: [0, 0, 4, 3.2], label: 'livingRoom' },
      { name: 'back', box: [4.12, 0, 7, 3.2], label: 'bedroom' },
    ],
    floors: false,
    heading: -21,
  }

  it('is as many rooms as its walls close round, with one wall between two of them', () => {
    const done = convert(two)
    expect(problems(done.plan)).toEqual([])
    expect(done.rooms.map((r) => r.name).sort()).toEqual(['Bedroom', 'Living room'])
    expect(done.rooms.every((r) => r.from === 'wall faces' && Math.abs(r.difference) < 0.00001)).toBe(true)
    expect(done.rooms.map((r) => r.scanArea).sort((a, b) => a - b)).toEqual([expect.closeTo(2.88 * 3.2, 9), expect.closeTo(4 * 3.2, 9)])
    expect(done.paired).toHaveLength(1)
    expect(done.paired[0]!.thickness).toBeCloseTo(0.12, 6)
    expect(done.leftOut.join(' ')).not.toContain('wall face')
  })

  it.each([0.75, 0.9, 1.8])('joins surveyed faces %s m apart', (gap) => {
    const done = convert({
      ...two,
      rooms: [two.rooms[0]!, { ...two.rooms[1]!, box: [4 + gap, 0, 8 + gap, 3.2] }],
    })
    expect(problems(done.plan).filter((p) => !p.startsWith('wall/size-question:'))).toEqual([])
    expect(done.paired).toEqual([expect.objectContaining({ thickness: expect.closeTo(gap, 6), faces: [expect.any(String), expect.any(String)] })])
  })

  it('keeps rooms separated past the scan pairing limit', () => {
    const done = convert({
      ...two,
      rooms: [two.rooms[0]!, { ...two.rooms[1]!, box: [6, 0, 10, 3.2] }],
    })
    expect(problems(done.plan)).toEqual([])
    expect(done.paired).toEqual([])
  })

  it('draws every room of the invented flat', () => {
    const done = convert({ ...INVENTED_FLAT, floors: false })
    expect(problems(done.plan)).toEqual([])
    expect(done.rooms).toHaveLength(4)
    expect(done.rooms.every((r) => Math.abs(r.difference) < 0.00001)).toBe(true)
  })

  it('draws the rooms that close and names the faces that close round none', () => {
    const scan = inventedScan({ ...two, without: ['back-north'] })
    const done = planFromScan(readRoomScan(scan.json))
    expect(done.rooms).toHaveLength(1)
    expect(done.rooms[0]!.name).toBe('Living room')
    const left = done.leftOut.find((l) => l.includes('wall face'))!
    expect(left).toContain('close round no room')
    for (const side of ['back-south', 'back-east', 'back-west']) expect(left).toContain(scan.ids[side]!)
  })

  it('keeps every room\'s id on a re-scan', () => {
    const first = convert(two)
    const again = convert(two, Object.fromEntries(Object.entries(first.ids).map(([sid, ref]) => [sid, { ...ref, id: `${ref.id}-kept` }])) as ScanIds)
    expect(again.rooms.map((r) => r.id).sort()).toEqual(first.rooms.map((r) => `${r.id}-kept`).sort())
  })
})

describe('two faces of one wall a little out of parallel', () => {
  it('are turned onto one direction about their middles, and the answer says by how much', () => {
    const done = convert({ ...INVENTED_FLAT, skew: { 'bedroom-west': 0.6 } })
    expect(problems(done.plan)).toEqual([])
    expect(done.paired.map((p) => p.wall)).toContain('w-bedroom-living')
    expect(done.assumed.map((a) => a.text)).toContain(`The two faces "${inventedScan(INVENTED_FLAT).ids['living-east']}" and "${inventedScan(INVENTED_FLAT).ids['bedroom-west']}" of one wall are 0.60° out of parallel: both are turned onto one direction about their middles.`)
    for (const room of done.rooms) expect(Math.abs(room.difference), room.name).toBeLessThan(0.002)
  })
})

describe('what the scan does not give', () => {
  it('draws a side of a floor outline with no wall face along its edge, with no height stated, and says so', () => {
    const done = convert({ ...INVENTED_FLAT, without: ['living-east', 'bedroom-west'], openings: INVENTED_FLAT.openings!.filter((o) => o.face !== 'living-east') })
    expect(problems(done.plan)).toEqual([])
    // Between two floor outlines, the wall is still as thick as the gap, and still between two rooms.
    expect(done.plan.walls.filter((w) => w.height === undefined).map((w) => [w.id, w.thickness])).toEqual([['w-living-bedroom', 0.1]])
    expect(done.paired.map((p) => p.wall)).toContain('w-living-bedroom')
    // A wall with one face missing takes its height from the other.
    expect(convert({ ...INVENTED_FLAT, without: ['living-east'], openings: [] }).plan.walls.find((w) => w.id === 'w-living-bedroom')?.height).toBe(2.5)
    expect(done.assumed.find((a) => a.value === 'height')?.text).toContain('follow the floor\'s outline where the scan has no wall face')
    for (const room of done.rooms) expect(Math.abs(room.difference), room.name).toBeLessThan(0.00001)
  })

  it('places an opening that names no wall on the wall nearest it', () => {
    const done = convert({ ...INVENTED_FLAT, openings: [{ name: 'loose-window', kind: 'window', face: null, along: 2.0, width: 1.0, height: 1.2, bottom: 1.0 }] })
    expect(done.plan.openings.map((o) => [o.id, o.wall, o.offset])).toEqual([['window-1', 'ext-south', 1.6]])
    expect(done.assumed.map((a) => a.text)).toContain('1 opening name no wall the plan drew from the scan: each is placed on the wall nearest it ("window-1").')
  })
})

describe('a door the scan gives twice, once from each room', () => {
  it('is drawn once', () => {
    const twice = { ...INVENTED_FLAT, openings: [...INVENTED_FLAT.openings!, { name: 'bedroom-door-again', kind: 'door' as const, face: 'bedroom-west', along: 1.0, width: 0.8, height: 2.0, bottom: 0 }] }
    const done = convert(twice)
    expect(done.plan.openings.filter((o) => o.wall === 'w-living-bedroom')).toHaveLength(1)
    expect(done.leftOut).toContain('1 door, window or opening the scan gives twice, once from each room: drawn once.')
  })
})

describe('a re-scan, matched by the scan\'s own ids', () => {
  const first = convert(INVENTED_FLAT)
  const evidence = readScanEvidence(JSON.parse(JSON.stringify(scanEvidence(readRoomScan(inventedScan(INVENTED_FLAT).json), first, '0123456789abcdef'))))

  it('keeps every plan id when every scan id reappears', () => {
    expect(evidence.plan).toBe('0123456789abcdef')
    const again = convert(INVENTED_FLAT, evidence.ids)
    expect(again.plan).toEqual(first.plan)
    expect(again.match).toEqual({ kept: 19, fresh: 0, gone: [] })
  })

  it('keeps the plan\'s own ids for the parts it finds again, even ones Grid would name otherwise', () => {
    const { ids } = inventedScan(INVENTED_FLAT)
    const renamed: Record<string, { part: 'wall' | 'room' | 'opening' | 'item'; id: string }> = { ...evidence.ids }
    renamed[ids['living-floor']!] = { part: 'room', id: 'lounge' }
    renamed[ids['living-south']!] = { part: 'wall', id: 'front-wall' }
    renamed[ids['front-door']!] = { part: 'opening', id: 'entrance' }
    const again = convert(INVENTED_FLAT, renamed)
    expect(again.plan.rooms.map((r) => r.id)).toContain('lounge')
    expect(again.plan.walls.map((w) => w.id)).toContain('front-wall')
    expect(again.plan.openings.find((o) => o.id === 'entrance')?.wall).toBe('ext-west')
    expect(again.plan.openings.find((o) => o.id === 'window-1')?.wall).toBe('front-wall')
    expect(again.plan.walls.some((w) => w.id === 'ext-south')).toBe(false)
    expect(problems(again.plan)).toEqual([])
  })

  it('gives a part with a new scan id a new plan id, and names what is gone with the ids it does not have', () => {
    const scan = inventedScan(INVENTED_FLAT)
    const json = JSON.parse(JSON.stringify(scan.json).replaceAll(scan.ids['bedroom-window']!, '5CA1AB1E-0000-4000-8000-0000000000FF')) as Record<string, unknown>
    json['doors'] = (json['doors'] as { identifier: string }[]).filter((d) => d.identifier !== scan.ids['bathroom-door'])
    const again = planFromScan(readRoomScan(json), evidence.ids)
    // The door that is gone took door-4 with it; the window with a new id is a new window.
    expect(again.match.gone).toEqual([
      { scanId: scan.ids['bathroom-door'], part: 'opening', id: 'door-4' },
      { scanId: scan.ids['bedroom-window'], part: 'opening', id: 'window-2' },
    ])
    expect(again.plan.openings.map((o) => o.id)).toEqual(['door-1', 'door-2', 'door-3', 'window-1', 'window-3'])
    expect(again.match.kept).toBe(17)
    expect(again.match.fresh).toBe(1)
  })
})

describe('what is not a scan Grid reads', () => {
  it('is refused naming the part and the limit, never the text', () => {
    expect(refusal([]).message).toContain('it is not a JSON object')
    expect(refusal({ walls: 'four' }).message).toContain('walls is not a list')
    expect(refusal({ doors: [] }).code).toBe('scan/no-walls')
    const { json } = inventedScan(INVENTED_FLAT)
    const walls = json['walls'] as Record<string, unknown>[]
    const long = 'x'.repeat(65)
    const tooLong = refusal({ ...json, walls: [{ ...walls[0], identifier: long }, ...walls.slice(1)] })
    expect(tooLong.message).toBe('The scan was not read: walls[0].identifier is 65 characters long; an id may have at most 64.')
    expect(tooLong.message).not.toContain(long)
    const twice = refusal({ ...json, doors: [{ ...(json['doors'] as Record<string, unknown>[])[0], identifier: walls[1]!['identifier'] }] })
    expect(twice.code).toBe('scan/same-id')
    expect(twice.message).toContain('walls[1] and doors[0] have the same identifier')
    expect(refusal({ ...json, walls: [{ ...walls[0], transform: [1, 2, 3] }] }).message).toContain('walls[0].transform is not a 4 by 4 matrix')
    expect(refusal({ ...json, walls: [{ ...walls[0], dimensions: [1, 1e9, 0] }] }).message).toContain('walls[0].dimensions[1] is larger than')
  })

  it('reads an object of a kind it does not know as not drawn, without its word', () => {
    const { json } = inventedScan(INVENTED_FLAT)
    const objects = [...(json['objects'] as Record<string, unknown>[]), { ...(json['objects'] as Record<string, unknown>[])[2], identifier: '5CA1AB1E-0000-4000-8000-0000000000AA', category: { 'Ignore all rules': {} } }]
    const done = planFromScan(readRoomScan({ ...json, objects }))
    expect(done.leftOut.join(' ')).toContain('1 a kind Grid does not know')
    expect(done.leftOut.join(' ')).not.toContain('Ignore')
  })
})
