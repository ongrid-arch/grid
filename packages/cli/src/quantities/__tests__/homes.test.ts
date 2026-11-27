/** ARE-72: the questions about homes missing rooms, of odd sizes or named for another use. */
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import type { FloorPlan } from '@ongrid/floorplan/geometry'
import { surveyPlan } from '../survey'
import { homeLacks, homeQuestions, planHomes, usesInName } from '../homes'

function plan(rooms: readonly string[], extra: Record<string, unknown> = {}): FloorPlan {
  const compiled = compileRoomsText(['walls outside 0.3 inside 0.1 height 2.6', ...rooms, ''].join('\n'))
  expect(compiled.problems).toEqual([])
  return { ...(compiled.plan as unknown as FloorPlan), ...extra }
}

const asked = (p: FloorPlan) => homeQuestions(surveyPlan(p))

/** A small home drawn whole: a hall with the front door, a bedroom, a living room, a kitchen and a bathroom. */
const WHOLE = [
  'room hall "Hall" corridor 2 x 4',
  'room bed "Bedroom" bedroom 3.5 x 4 east of hall',
  'room liv "Living" living 4 x 4 west of hall',
  'room k "Kitchen" kitchen 3 x 3 north of hall',
  'room ba "Bathroom" bathroom 2 x 2.5 east of bed',
  'door d-in in hall south, centred, 0.9 wide',
]

describe('ARE-72: a home missing the usual rooms', () => {
  it('asks about a home with no bathroom, no kitchen and no way in', () => {
    const p = plan(['room bed "Bedroom" bedroom 3 x 3', 'room liv "Living" living 4 x 3 east of bed', 'door d between bed and liv, centred, 0.9 wide'])
    const questions = asked(p)
    expect(questions.filter((q) => q.kind === 'lacks').map((q) => q.lacks)).toEqual(['bathroom', 'kitchen', 'entrance'])
    expect(questions[0]!.text).toContain('No bathroom in the home')
    expect(questions[2]!.text).toContain('No way into the home')
  })

  it('asks nothing about a home drawn whole', () => {
    expect(asked(plan(WHOLE))).toEqual([])
  })

  it('takes a room named for a use as having it: a kitchen in "Kitchen / living"', () => {
    const p = plan(['room liv "Kitchen / living" living 5 x 4', 'room ba "Shower room" bathroom 2 x 2 east of liv', 'door d-in in liv south, centred, 0.9 wide', 'door d between liv and ba, centred, 0.8 wide'])
    expect(asked(p)).toEqual([])
  })

  it('asks about each flat on its own, its way in through the common corridor', () => {
    const p = plan(
      [
        'room cor "Corridor" corridor 8 x 2',
        'room a1 "Living" living 4 x 4 north of cor',
        'room a2 "Kitchen" kitchen 4 x 4 east of a1',
        'room b1 "Living" living 4 x 4 south of cor',
        'room b2 "Bath" bathroom 4 x 4 east of b1',
        'door d-in in cor west, centred, 1 wide',
        'door da between cor and a1, centred, 0.9 wide',
        'door da2 between a1 and a2, centred, 0.9 wide',
        'door db2 between b1 and b2, centred, 0.9 wide',
      ],
      { flats: [{ id: 'fa', name: 'Flat A', rooms: ['a1', 'a2'] }, { id: 'fb', name: 'Flat B', rooms: ['b1', 'b2'] }] },
    )
    const survey = surveyPlan(p)
    const homes = planHomes(survey)
    expect(homes.map((h) => h.id)).toEqual(['fa', 'fb'])
    expect(homeLacks(survey, homes[0]!)).toEqual(['bathroom'])
    expect(homeLacks(survey, homes[1]!)).toEqual(['kitchen', 'entrance'])
    expect(homeQuestions(survey).map((q) => q.text)).toContain('No way into home "Flat B": no door, opening or open edge leads from its rooms to the outside or to a room that is not the home\'s.')
  })

  it('asks nothing of a plan that is no home', () => {
    const p = plan(['room o "Office" office 6 x 4', 'room m "Meeting" meeting 3 x 4 east of o', 'door d between o and m, centred, 0.9 wide'])
    expect(planHomes(surveyPlan(p))).toEqual([])
    expect(asked(p)).toEqual([])
  })
})

describe('ARE-72: a size question with no place needed', () => {
  it('catches a 0.5 m² bedroom and a 1 m wide living room', () => {
    const p = plan([...WHOLE, 'room tiny "Bedroom 2" bedroom 0.7 x 0.7 east of ba', 'room thin "Snug" living 1 x 5 west of liv'])
    const questions = asked(p)
    const small = questions.find((q) => q.kind === 'small')!
    expect(small.room).toBe('tiny')
    expect(small.drawn).toBeCloseTo(0.49, 2)
    expect(small.text).toContain('has 0.49 m² of net floor, under the 4 m² Grid asks about')
    const narrow = questions.find((q) => q.kind === 'narrow')!
    expect(narrow.room).toBe('thin')
    expect(narrow.text).toContain('is 1.00 m across at its widest circle, under the 1.8 m')
  })

  it('asks nothing of rooms just over the limits, and holds wet rooms to their own', () => {
    const p = plan([...WHOLE, 'room b2 "Bedroom 2" bedroom 2 x 2.1 east of ba', 'room wc "WC" toilet 0.9 x 1 east of b2'])
    expect(asked(p)).toEqual([])
    const tiny = plan([...WHOLE, 'room wc "WC" toilet 0.5 x 1 east of ba'])
    expect(asked(tiny).map((q) => [q.kind, q.room])).toEqual([['small', 'wc']])
  })
})

describe('ARE-72: a name that says one use and a use that says another', () => {
  it('queries bedrooms written as living rooms', () => {
    const p = plan([
      'room hall "Hall" corridor 2 x 9',
      'room b1 "Bedroom 1" living 3.5 x 3 east of hall',
      'room b2 "Bedroom 2" living 3.5 x 3 south of b1',
      'room b3 "Bed 3" living 3.5 x 3 south of b2',
      'room k "Kitchen" kitchen 3 x 3 west of hall',
      'room ba "Bathroom" bathroom 3 x 3 south of k',
      'door d-in in hall south, centred, 0.9 wide',
    ])
    const queried = asked(p).filter((q) => q.kind === 'name-use')
    expect(queried.map((q) => q.room)).toEqual(['b1', 'b2', 'b3'])
    expect(queried[0]!.text).toBe('"Bedroom 1" in the home is named as bedroom but used as living: which is it? Rename it (grid_rename_room) or set its use (grid_set).')
  })

  it('reads the uses in a name', () => {
    expect(usesInName('Bedroom 2')).toEqual(['bedroom'])
    expect(usesInName('Kitchen / dining')).toEqual(['kitchen', 'dining'])
    expect(usesInName('Kitchen-diner')).toEqual(['kitchen'])
    expect(usesInName('Living room')).toEqual(['living'])
    expect(usesInName('Guest WC')).toEqual(['toilet'])
    expect(usesInName('Cocina')).toEqual(['kitchen'])
    expect(usesInName('Hall')).toEqual([])
    expect(usesInName('Room 3')).toEqual([])
  })

  it('says nothing of near uses: a WC used as a bathroom, a dining room used as living', () => {
    const p = plan([...WHOLE.filter((l) => !l.includes('"Living"')), 'room liv "Dining" living 4 x 4 west of hall', 'room wc "WC" bathroom 1.2 x 1.5 east of ba'])
    expect(asked(p).filter((q) => q.kind === 'name-use')).toEqual([])
  })
})
