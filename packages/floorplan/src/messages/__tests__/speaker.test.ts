/**
 * MSG-34: an answer's words in one language with one decimal mark (`speaker.ts`), and the
 * language a plan's room names are plainly in (`languageOfNames`).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { MEASURES } from '../../geometry/areas'
import { tolerance } from '../../geometry/tolerances'
import { english, loadLanguage, num, said } from '../say'
import { keyOfWording, marked, speakerFor } from '../speaker'
import { languageOfNames } from '../uses'

beforeAll(async () => {
  await loadLanguage('es')
})

describe('a speaker', () => {
  it('says a key in its language and a figure with its decimal mark', () => {
    const s = speakerFor('es', 'comma')
    expect(s.say('tool.areas.net', { area: '41,45 m²', rule: '' })).toBe('Superficie útil: 41,45 m². ')
    expect(s.figure('22.4%')).toBe('22,4%')
    expect(speakerFor('en', 'point').figure('22.4%')).toBe('22.4%')
  })

  it('says a sentence made in English in its language when it is a key\'s whole wording, else marks its figures', () => {
    const s = speakerFor('es', 'comma')
    expect(s.text(MEASURES.net.measures)).toMatch(/^La superficie útil es/)
    expect(s.text('A note of 12.30 m² for "Room 1.2".')).toBe('A note of 12,30 m² for "Room 1.2".')
  })

  it('finds every measure\'s English words among the keys, so a change to one is a change to its key', () => {
    for (const measure of Object.values(MEASURES)) {
      expect(keyOfWording(measure.name), measure.measure).toBeDefined()
      expect(keyOfWording(measure.notTakenOff), measure.measure).toBeDefined()
      expect(keyOfWording(measure.cannotSay), measure.measure).toBeDefined()
      if (measure.measure !== 'headroom') expect(keyOfWording(measure.measures), measure.measure).toBeDefined()
    }
    expect(english(said('areas.measure.headroom.measures', { low: num(String(tolerance('headroomLow'))), full: num(String(tolerance('headroomFull'))) }))).toBe(MEASURES.headroom.measures)
  })

  it('marks no quoted name', () => {
    expect(marked('"1.5" is 1.5 m', 'comma')).toBe('"1.5" is 1,5 m')
    expect(marked('1.5 m', 'point')).toBe('1.5 m')
  })
})

describe('the language of the room names', () => {
  it('is Spanish for Spanish words for the uses', () => {
    expect(languageOfNames(['Cocina', 'Dormitorio', 'Baño', 'Estudio de Ana'])).toBe('es')
  })

  it('is none for English names, a single word, or words of two languages', () => {
    expect(languageOfNames(['Kitchen', 'Bedroom', 'Bathroom'])).toBeNull()
    expect(languageOfNames(['Cocina', 'Sala 1'])).toBeNull()
    expect(languageOfNames(['Cocina', 'Dormitorio', 'Kitchen'])).toBeNull()
    expect(languageOfNames([])).toBeNull()
  })
})
