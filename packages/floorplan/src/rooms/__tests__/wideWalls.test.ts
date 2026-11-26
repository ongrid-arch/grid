import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'

const first = 'room a "Hall" living 4 x 4 at 0,0'
const compile = (...lines: string[]) => compileRoomsText(lines.join('\n'))

describe('stated wide walls', () => {
  it.each([0.75, 0.9, 1.8, 3.2])('sets a relative placement apart by %s m', (t) => {
    const result = compile(first, `room b "Store" storage 4 x 4 east of a walls ${t}`)
    expect(result.problems).toEqual([])
    expect(result.plan?.walls.find((w) => w.id === 'w-a-b')).toMatchObject({ thickness: t, start: [4 + t / 2, -0.15], end: [4 + t / 2, 4.15] })
  })

  it('keeps rooms placed by coordinates and uses their actual gap up to the stated width', () => {
    const result = compile('wall between a and b east 1.8', first, 'room b "Store" storage 4 x 4 at 4.9,0')
    expect(result.problems).toEqual([])
    expect(result.plan?.walls.find((w) => w.id === 'w-a-b')).toMatchObject({ thickness: 0.9 })
    expect(result.warnings.map((w) => w.code)).toContain('rooms/wall-thickness')
  })

  it('does not borrow a wide statement from another pair or another side', () => {
    const result = compile('wall between a and b north 1.8', 'wall between a and c 1.8', first, 'room b "Store" storage 4 x 4 at 4.9,0', 'room c "Office" office 4 x 4 north of a')
    expect(result.problems.map((p) => p.code)).toContain('rooms/gap')
  })

  it('sets the gap with a side-specific wall line before placement', () => {
    const result = compile('wall between a and b east 1.8', first, 'room b "Store" storage 4 x 4 east of a')
    expect(result.problems).toEqual([])
    expect(result.plan?.walls.find((w) => w.id === 'w-a-b')?.thickness).toBe(1.8)
  })

  it('uses a wide floor rule for rooms placed beside one another', () => {
    const result = compile('walls outside 0.3 inside 0.9', first, 'room b "Store" storage 4 x 4 east of a')
    expect(result.problems).toEqual([])
    expect(result.plan?.walls.find((w) => w.id === 'w-a-b')?.thickness).toBe(0.9)
  })

  it('refuses a gap wider than the thickness stated for it', () => {
    const result = compile('wall between a and b 0.75', first, 'room b "Store" storage 4 x 4 at 4.9,0')
    expect(result.problems.map((p) => p.code)).toContain('rooms/gap')
  })

  it('uses an explicit pair thickness to place a room and reads it back as rooms', () => {
    const result = compile('wall between a and b 1.8', first, 'room b "Store" storage 4 x 4 east of a', 'room c "Office" office 4 x 4 west of a')
    expect(result.problems).toEqual([])
    expect(result.plan?.walls.find((w) => w.id === 'w-a-b')?.thickness).toBe(1.8)
    const reading = readRoomsText(parseFloorPlan(result.plan))
    expect(reading.text).toMatch(/wall between (a and b|b and a).*1\.8/)
    expect(reading.text).not.toMatch(/^raw room/m)
    expect(compile(reading.text).plan?.walls.find((w) => w.id === 'w-a-b')?.thickness).toBe(1.8)
  })
})
