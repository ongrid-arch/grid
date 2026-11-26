/**
 * ARE-62: the site's ground level in rooms text, `ground <m>`, the field LVL-4's checks, the
 * sections and the 3D ground read (`site.ground`). A 9 × 10 m house, as in `site.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { safeParseFloorPlan } from '../../types/floorplan'
import { compileRoomsText } from '../compile'
import { readRoomsText } from '../read'
import { groundOfWords } from '../ground'

const HOUSE = ['walls outside 0.3 inside 0.1 height 2.7', 'room living "Living" living 8.4 x 9.4 at 0.3,0.3', 'door front in living south, centred, 0.9 wide, opens in']
const write = (...lines: string[]): ReturnType<typeof compileRoomsText> => compileRoomsText([...HOUSE, ...lines].join('\n'))
const ground = (...lines: string[]): number | undefined => {
  const result = write(...lines)
  expect(result.problems).toEqual([])
  return result.plan!.site?.ground
}
const refused = (...lines: string[]): string => {
  const result = write(...lines)
  expect(result.plan).toBeNull()
  return result.problems[0]!.message
}

describe('the ground level in rooms text', () => {
  it('sets site.ground from a ground line, signed or with its way', () => {
    expect(ground('ground -0.15')).toBe(-0.15)
    expect(ground('ground 0')).toBe(0)
    expect(ground('ground level -1.2')).toBe(-1.2)
    expect(ground('ground at 2.8')).toBe(2.8)
    expect(ground('ground 0.15 below')).toBe(-0.15)
    expect(ground('ground 1.2 above the ground floor')).toBe(1.2)
    expect(ground('ground -15cm')).toBe(-0.15)
    expect(ground('site ground 0')).toBe(0)
    expect(ground('site ground 0.3 below')).toBe(-0.3)
  })

  it('reads plain numbers as the display line reads lengths', () => {
    expect(compileRoomsText(['display mm numbers mm', 'walls outside 300 inside 100 height 2700', 'room living "Living" living 8400 x 9400 at 300,300', 'ground -150'].join('\n')).plan?.site?.ground).toBe(-0.15)
  })

  it('needs no plot, and leaves the rest of the site unwritten', () => {
    expect(write('ground -0.15').plan!.site).toEqual({ ground: -0.15 })
  })

  it('refuses a line it cannot read, naming the line and the forms it takes', () => {
    expect(refused('ground')).toMatch(/^Line 4: write 'ground <m>', the level of the ground outside in metres from the ground floor's floor level/)
    expect(refused('ground -0.15 m below grade')).toMatch(/^Line 4: write 'ground <m>'/)
    expect(refused('ground -0.15 below')).toBe("Line 4: with below or above, the figure is a distance, 0 or more: write 'ground 0.15 below' or 'ground 0.15 above', or the level alone, 'ground -0.15'.")
    expect(refused('ground -0.15', 'site ground 0')).toBe("Line 5: the ground level is written on line 4 already: write it once, as 'ground <m>'.")
  })

  it('is read back as a ground line, and writing it again gives the same plan', () => {
    const first = write('plot 15 x 30 at -3,-10', 'ground 0.15 below', 'north 0')
    const plan = safeParseFloorPlan(first.plan)!
    const back = readRoomsText(plan)
    expect(back.text).toContain('site boundary -3,-10 12,-10 12,20 -3,20\nground -0.15')
    expect(back.text).not.toContain('site ground')
    const again = compileRoomsText(back.text)
    expect(again.problems).toEqual([])
    expect(again.plan!.site).toEqual(plan.site)
  })

  it('reads the words after ground on their own', () => {
    expect(groundOfWords(['-0.4'], 1)).toBe(-0.4)
    expect(groundOfWords(['2', 'below', 'ground', 'floor'], 1)).toBe(-2)
    expect(() => groundOfWords(['x'], 3)).toThrow(/line 3/)
  })
})
