/**
 * WRT-35: a word a room line does not take is refused with every word a room line takes, the
 * room's own floor and height among them, and the word most likely meant with its value.
 */
import { describe, expect, it } from 'vitest'
import { OUTDOOR_KINDS, ROOM_TENURES } from '../../types/floorplan'
import { compileRoomsText } from '../compile'

function refusal(roomLine: string): { code: string; message: string } {
  const result = compileRoomsText(`room h "Hall" living 6 x 4 at 0,0\n${roomLine}`)
  expect(result.plan).toBeNull()
  expect(result.problems).toHaveLength(1)
  return result.problems[0]!
}

describe("a room line's refusal of a word it does not take", () => {
  it("answers 'level 0.6' with 'floor 0.6', the room's floor above its storey's", () => {
    const p = refusal('room t "Terrace" living 6 x 2 north of h level 0.6')
    expect(p.code).toBe('rooms/syntax')
    expect(p.message).toContain("Line 2: 'level' is not understood on a room line.")
    expect(p.message).toContain("Did you mean 'floor 0.6'?")
  })

  it('names every word a room line takes, floor and height included', () => {
    const p = refusal('room t "Terrace" living 6 x 2 north of h level 0.6')
    for (const word of [
      "'floor <m>'",
      "'height <m>'",
      "'walls <t> [kind]'",
      "'wall <t> [kind]'",
      "'first-wall <wall id>'",
      "'through <floor>'",
      "'polygon x,y x,y ...'",
      "'at x,y'",
      "'align'",
      "'shift'",
      "'until'",
      "'open'",
      "'centre'",
      "'outside'",
      "'type \"<text>\"'",
      "'roofed'",
      "'unroofed'",
    ]) {
      expect(p.message, word).toContain(word)
    }
    expect(p.message).toContain(`'tenure <${ROOM_TENURES.join('|')}>'`)
    expect(p.message).toContain(`'outdoor <${OUTDOOR_KINDS.join('|')}>'`)
  })

  it('answers the other words agents write for a room word', () => {
    expect(refusal('room t "Terrace" living 6 x 2 north of h elevation -0.3').message).toContain("Did you mean 'floor -0.3'?")
    expect(refusal('room t "Terrace" living 6 x 2 north of h ceiling 3.2').message).toContain("Did you mean 'height 3.2'?")
    expect(refusal('room t "Terrace" living 6 x 2 north of h thickness 0.2').message).toContain("Did you mean 'walls 0.2'?")
  })

  it('answers a slip with the word it is a slip of', () => {
    expect(refusal('room t "Terrace" living 6 x 2 north of h hieght 3').message).toContain("Did you mean 'height 3'?")
    expect(refusal('room t "Terrace" living 6 x 2 north of h tenrue private').message).toContain("Did you mean 'tenure private'?")
  })

  it('suggests the word alone when no value follows it', () => {
    expect(refusal('room t "Terrace" living 6 x 2 north of h opne').message).toContain("Did you mean 'open'?")
    expect(refusal('room t "Terrace" living 6 x 2 north of h level').message).toContain("Did you mean 'floor <m>'?")
  })

  it('guesses nothing when no word is near, and still names every word', () => {
    const p = refusal('room t "Terrace" living 6 x 2 north of h banana')
    expect(p.message).toContain("Line 2: 'banana' is not understood on a room line.")
    expect(p.message).not.toContain('Did you mean')
    expect(p.message).toContain("'floor <m>'")
    expect(p.message).toContain("'height <m>'")
  })

  it('reads a room line with its floor and height as before', () => {
    const result = compileRoomsText('room h "Hall" living 6 x 4 at 0,0\nroom t "Terrace" living 6 x 2 north of h floor 0.6 height 2.4')
    expect(result.problems.filter((p) => p.code === 'rooms/syntax')).toEqual([])
    expect(result.plan).not.toBeNull()
  })
})
