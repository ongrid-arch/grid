/**
 * MSG-24 (C32): the plan's own words for Grid's keys, in a language Grid ships no file for or in
 * one it does: the plan's word first, then the language's file, then English; each word checked
 * against the English key, and a word the reader cannot take left out alone with its line.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { flat } from '../../test-support/plans'
import { es } from '../es'
import { en } from '../en'
import { decimalFor, hasWording, num, registerMessages, say, sayParts } from '../say'
import { labelOfUse } from '../uses'
import { listenForKeys, readPlanWords, usePlanWords, wordProblem } from '../words'
import { parseFloorPlan } from '../../types/floorplan'
import { readPlanParts } from '../../types/readParts'
import { statedDisplay } from '../../types/units'

registerMessages('es', es)
afterEach(() => usePlanWords(undefined))

describe('the plan\'s own words (MSG-24)', () => {
  it('are said in their language, before the language\'s file and English', () => {
    usePlanWords({ de: { 'check.passage.door.width': 'Die Tür ist {size} m breit' }, es: { 'check.passage.door.width': 'La puerta mide {size} m' } })
    expect(say('de', 'check.passage.door.width', { size: num('0.80') })).toBe('Die Tür ist 0.80 m breit')
    expect(say('de', 'check.passage.door.width', { size: num('0.80') }, { decimal: 'comma' })).toBe('Die Tür ist 0,80 m breit')
    expect(say('es', 'check.passage.door.width', { size: num('0.80') })).toBe('La puerta mide 0,80 m')
    // A key the plan gives no word for: the language's file, else English.
    expect(say('es', 'label')).toBe(es.label)
    expect(say('de', 'label')).toBe(en.label)
    expect(say('en', 'check.passage.door.width', { size: num('0.80') })).toBe('The door is 0.80 m wide')
    expect(sayParts('de', 'check.passage.door.width', { size: num('0.80') })).toEqual([{ text: 'Die Tür ist 0.80 m breit' }])
  })

  it('are one plan\'s at a time', () => {
    usePlanWords({ de: { label: 'Allgemeine Hinweise' } })
    expect(say('de', 'label')).toBe('Allgemeine Hinweise')
    usePlanWords(undefined)
    expect(say('de', 'label')).toBe(en.label)
  })

  it('tell which keys a language has a wording for', () => {
    usePlanWords({ de: { label: 'Allgemeine Hinweise' } })
    expect(hasWording('de', 'label')).toBe(true)
    expect(hasWording('de', 'join.and')).toBe(false)
    expect(hasWording('es', 'join.and')).toBe(true)
    expect(hasWording('en', 'join.and')).toBe(true)
  })

  it('refuse a word whose placeholders differ from the English key\'s, a key Grid does not have, and a second line', () => {
    expect(wordProblem('check.passage.door.width', 'Die Tür ist {size} m breit')).toBeNull()
    expect(wordProblem('check.passage.door.width', 'Die Tür ist {breite} m breit')).toEqual({ kind: 'placeholders', needed: ['size'], found: ['breite'] })
    expect(wordProblem('check.passage.door.width', 'Die Tür')).toEqual({ kind: 'placeholders', needed: ['size'], found: [] })
    expect(wordProblem('no.such.key', 'x')).toEqual({ kind: 'unknown-key' })
    expect(wordProblem('label', 'a\nb')).toMatchObject({ kind: 'text' })
    expect(wordProblem('label', 3)).toEqual({ kind: 'not-text' })
  })

  it('keep the sound words and leave out the rest, English and a language tag that is not one', () => {
    const read = readPlanWords({ de: { label: 'Hinweise', 'check.passage.door.width': 'Tür {width}' }, en: { label: 'x' }, 'de-DE': { label: 'y' } })
    expect(read.words).toEqual({ de: { label: 'Hinweise' } })
    expect(read.leftOut.map((left) => [left.at, left.problem.kind])).toEqual([
      [['de', 'check.passage.door.width'], 'placeholders'],
      [['en'], 'language'],
      [['de-DE'], 'language'],
    ])
    // A word that is refused is never said: the English is.
    usePlanWords({ de: { 'check.passage.door.width': 'Tür {width}' } })
    expect(say('de', 'check.passage.door.width', { size: num('0.80') })).toBe('The door is 0.80 m wide')
  })

  it('are listened for: the keys an output said in a language other than English', async () => {
    const { keys } = await listenForKeys(() => {
      say('de', 'label')
      say('en', 'join.and')
      say('de', 'check.passage.door.width', { size: num('1') })
    })
    expect([...keys.get('de')!].sort()).toEqual(['check.passage.door.width', 'label'])
    expect(keys.has('en')).toBe(false)
  })

  it('never set the decimal mark: a language Grid ships no file for writes a point unless the display says otherwise', () => {
    expect(decimalFor('de')).toBe('point')
    expect(decimalFor('de', 'comma')).toBe('comma')
    expect(decimalFor('es')).toBe('comma')
    expect(statedDisplay({ language: 'de' }).decimal).toBe('point')
  })

  it('leave room uses in English in a language Grid ships no file for', () => {
    expect(labelOfUse('de', 'bedroom')).toBe('bedroom')
    expect(labelOfUse('es', 'bedroom')).toBe('dormitorio')
  })
})

describe('display.words in the plan file (C32)', () => {
  const plan = (display: unknown): Record<string, unknown> => ({ ...JSON.parse(JSON.stringify(flat())), display })

  it('takes any language and its words', () => {
    const read = parseFloorPlan(plan({ language: 'de-AT', decimal: 'comma', words: { de: { label: 'Allgemeine Hinweise' } } }))
    expect(read.display).toEqual({ language: 'de', decimal: 'comma', words: { de: { label: 'Allgemeine Hinweise' } } })
  })

  it('leaves out a word with a wrong placeholder, with a line that names it, and keeps the rest of the display', () => {
    const result = readPlanParts(plan({ language: 'de', words: { de: { label: 'Hinweise', 'check.passage.door.width': 'Tür {breite}' } } }))
    expect(result.plan).not.toBeNull()
    if (result.plan === null) return
    expect(result.plan.display).toEqual({ language: 'de', words: { de: { label: 'Hinweise' } } })
    expect(result.faults).toEqual([
      {
        kind: 'value-left-out',
        part: null,
        path: ['display', 'words', 'de', 'check.passage.door.width'],
        found: 'a wording with the placeholders {breite}',
        wants: 'a wording with the placeholders {size}, as the English has',
        used: null,
      },
    ])
  })

  it('leaves out words that are no map, keeping the language', () => {
    const result = readPlanParts(plan({ language: 'fr', words: 'bonjour' }))
    if (result.plan === null) throw new Error('refused')
    expect(result.plan.display).toEqual({ language: 'fr' })
    expect(result.faults.map((f) => f.path)).toEqual([['display', 'words']])
  })

  it('reads a plan with no words as before', () => {
    const result = readPlanParts(plan({ language: 'es' }))
    expect(result.plan?.display).toEqual({ language: 'es' })
    expect(result.plan === null ? null : result.faults).toEqual([])
  })
})
