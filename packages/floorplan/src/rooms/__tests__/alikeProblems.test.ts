/**
 * MSG-36: a mistake in a unit repeated along a row is one problem of the refusal, with the ids of
 * the others; a problem that differs in a figure is one of its own.
 */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '../compile'
import { everyProblem } from '../everyProblem'
import { problemLines } from '../answer'

const text = (door: string): string =>
  [
    'walls outside 0.3 inside 0.15 height 2.8',
    'floor l1 "First floor" level 1',
    'unit key flat "Studio" "Flat {n}"',
    '  room room "Room {n}" bedroom 3.2 x 4',
    `  door door between room and corridor, ${door}`,
    'end',
    'room corridor "Corridor {level}" corridor 13.5 x 1.5 at 0.15,0.15',
    'repeat key 4 east as {level}01 north of corridor',
  ].join('\n')

describe('a refusal of a mistake repeated', () => {
  it('says it once, with the ids of the others', () => {
    const t = text('centred, 0.9 wide, height 3.2')
    const lines = problemLines(everyProblem(t, compileRoomsText(t)))
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatch(/^rooms\/opening-too-high: Line 5: door 'door-101' reaches 3\.20 m .* \(the same for 3 more: 'door-102' to 'door-104'\)$/)
  })
})
