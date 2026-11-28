/**
 * MSG-37: the answer to writing rooms text gives its figures in the plan's display units, as the
 * drawing and the areas do; a plan in metres reads as it always has.
 */
import { describe, expect, it } from 'vitest'
import { displayOf, METRES } from '../../types/units'
import { roomsAnswer } from '../answer'
import { compileRoomsText } from '../compile'

const HOUSE = [
  'walls outside 0.3 inside 0.1143 height 2.7',
  'room living "Living" living 8.4 x 9.4 at 0.3,0.3',
  'room bed "Bed" bedroom 3 x 2.5 east of living',
  'door d1 between living and bed, centred, 0.8128 wide',
  'window w1 in bed east, centred, 1.2 wide, sill 0.9'
].join('\n')

const answer = (display = METRES): string => roomsAnswer(compileRoomsText(HOUSE), true, display).join('\n')

describe('the write answer in the display units (MSG-37)', () => {
  it('writes feet and inches, a wall thickness in inches and square feet beside square metres', () => {
    const text = answer(displayOf('ft-in'))
    expect(text).toContain('930.6 sq ft (86.46 m²) inside in all')
    expect(text).toContain(`living "Living": 27'-7" x 30'-10", 849.9 sq ft (78.96 m²) inside (written 27'-7" x 30'-10" to the inside faces)`)
    expect(text).toContain(`w-living-bed: interior 4 1/2", 9'-2", living | bed`)
    expect(text).toContain(`ext-south: exterior 11 3/4", 38'-9", living | bed`)
    // The door's width is the plan's own, 32"; its place is the line's figure.
    expect(text).toContain(`d1: door 2'-8" in w-living-bed, joins living and bed; 2'-9" from living's south corner`)
    expect(text.split('Guessed')[0]).not.toMatch(/\d m(?!²)\b/)
  })

  it('writes millimetres, the opening widths exact', () => {
    const text = answer(displayOf('mm'))
    expect(text).toContain('living "Living": 8400 x 9400 mm, 78.96 m² inside (written 8400 x 9400 to the inside faces)')
    expect(text).toContain('w-living-bed: interior 114 mm, 2800 mm, living | bed')
    expect(text).toContain('d1: door 813 mm in w-living-bed')
    expect(text).toContain("w1: window 1200 mm in ext-east-1, joins bed and the outside; 650 mm from bed's south corner")
  })

  it('writes the decimal comma when the display has it', () => {
    expect(answer(displayOf('m', 'comma'))).toContain('living "Living": 8,40 x 9,40 m, 78,96 m² inside')
  })

  it('reads in metres as before', () => {
    const text = answer()
    expect(text).toContain('living "Living": 8.40 x 9.40 m, 78.96 m² inside (written 8.40 x 9.40 to the inside faces)')
    expect(text).toContain('w-living-bed: interior 0.1143 m, 2.80 m, living | bed')
    expect(text).toContain('d1: door 0.81 m in w-living-bed')
  })
})
