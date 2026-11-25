/**
 * MSG-11: one message file per language, with the same keys and the same placeholders; the room
 * uses with one label per language, read back in any of them; and `say`, which fills a wording
 * with figures in the language's decimal mark and names as the plan writes them.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { en } from '../en'
import { es, STATUS } from '../es'
import { LANGUAGE_DECIMAL, LANGUAGE_STATUS, LANGUAGES, readLanguage } from '../languages'
import { joined, name, num, placeholders, registerMessages, said, say, sayParts, valuesData } from '../say'
import { foldLabel, roomUseOfLabel, USE_LABELS } from '../uses'
import { FloorPlanSchema, ROOM_USES, readUse } from '../../types/floorplan'
import { statedDisplay } from '../../types/units'

const TABLES = { en, es } as const
registerMessages('es', es)

describe('the message files (MSG-11)', () => {
  it('have the same keys in every language', () => {
    const keys = Object.keys(en).sort()
    expect(keys.length).toBeGreaterThan(1000)
    for (const language of LANGUAGES) expect(Object.keys(TABLES[language]).sort(), language).toEqual(keys)
  })

  it('give each key the same placeholders in every language', () => {
    const differ: string[] = []
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      const want = placeholders(en[key]).sort()
      for (const language of LANGUAGES) {
        const got = placeholders(TABLES[language][key]).sort()
        if (JSON.stringify(got) !== JSON.stringify(want)) differ.push(`${language} ${key}: ${got.join(',')} for ${want.join(',')}`)
      }
    }
    expect(differ).toEqual([])
  })

  it('leave no wording empty', () => {
    for (const language of LANGUAGES) {
      const empty = Object.entries(TABLES[language]).filter(([, text]) => text === '')
      expect(empty, language).toEqual([])
    }
  })

  it('mark Spanish as a draft translation no person has reviewed, in the file and in the docs', () => {
    expect(LANGUAGE_STATUS.en).toBe('source')
    expect(LANGUAGE_STATUS.es).toBe('draft translation, not reviewed')
    expect(STATUS).toBe(LANGUAGE_STATUS.es)
    const file = readFileSync(resolve(__dirname, '../es.ts'), 'utf8')
    expect(file).toContain('Status: draft translation, not reviewed.')
    const docs = readFileSync(resolve(__dirname, '../../../../../docs/languages.md'), 'utf8')
    expect(docs).toMatch(/\| Spanish \| `es\.ts` \| draft translation, not reviewed \|/)
  })

  it('reads a language from a word, a capital or a region tag, and nothing that is no language tag', () => {
    expect(readLanguage('es')).toBe('es')
    expect(readLanguage('ES')).toBe('es')
    expect(readLanguage('es-MX')).toBe('es')
    // MSG-24: any BCP-47 tag is its primary language, Grid ships a file for it or not.
    expect(readLanguage('fr')).toBe('fr')
    expect(readLanguage('pt-BR')).toBe('pt')
    expect(readLanguage('zh-Hant-TW')).toBe('zh')
    expect(readLanguage('Deutsch')).toBeNull()
    expect(readLanguage('d')).toBeNull()
    expect(readLanguage(3)).toBeNull()
  })
})

describe('say (MSG-11)', () => {
  it('writes a figure with the language\'s decimal mark, and a name as the plan writes it', () => {
    const values = { room: name('Sala 0.5'), size: num('0.80') }
    expect(say('en', 'check.passage.door.width', { size: num('0.80') })).toBe('The door is 0.80 m wide')
    expect(say('es', 'check.passage.door.width', { size: num('0.80') })).toBe('La puerta tiene 0,80 m de ancho')
    expect(say('es', 'check.roomTooSmall', { room: values.room, minimum: num('6.5') })).toBe('"Sala 0.5" tiene menos de 6,5 m²')
    expect(say('es', 'check.roomTooSmall', { room: values.room, minimum: num('6.5') }, { decimal: 'point' })).toBe('"Sala 0.5" tiene menos de 6.5 m²')
    expect(LANGUAGE_DECIMAL.es).toBe('comma')
  })

  it('says a sentence made of parts in one language throughout', () => {
    const rooms = joined([name('A'), name('B')], 'join.and')
    expect(say('en', 'check.outOfLine.stair', { upper: rooms, upperFloors: name('1'), lower: name('C'), lowerFloors: name('0') })).toBe(
      'The stair "A" and "B" on "1" does not lie over "C" on "0", so it does not join the two floors'
    )
    expect(say('es', 'line.part.figureUsed.one', { what: said('line.part.atLeast', { what: said('line.part.area', { area: num('6.5') }) }), bases: 'X', statuses: 'ai-found' })).toBe(
      'el valor que se usa aquí, al menos 6,5 m² (X, estado ai-found)'
    )
  })

  it('sets the names apart for the notes, unquoted', () => {
    expect(sayParts('es', 'check.noExit', { floor: name('Planta baja') })).toEqual([{ text: 'Planta baja', name: true }, { text: ' no tiene ninguna puerta al exterior' }])
  })

  it('keeps the values as data: figures as numbers, names as written', () => {
    expect(valuesData({ size: num('0.80'), room: name('Cocina'), count: 2, part: said('thing.plan') })).toEqual({ size: 0.8, room: 'Cocina', count: 2 })
  })
})

describe('room uses, one list with a label per language (MSG-11)', () => {
  it('labels every use in every language, each label once', () => {
    for (const language of LANGUAGES) {
      expect(Object.keys(USE_LABELS[language]).sort(), language).toEqual([...ROOM_USES].sort())
      const folded = Object.values(USE_LABELS[language]).map(foldLabel)
      expect(new Set(folded).size, language).toBe(folded.length)
    }
  })

  it('never gives two uses one label across the languages', () => {
    for (const use of ROOM_USES) {
      for (const language of LANGUAGES) expect(roomUseOfLabel(USE_LABELS[language][use]), `${language} ${use}`).toBe(use)
    }
  })

  it('reads "dormitorio" as bedroom, whatever its capitals and accents, and keeps the room\'s name as written', () => {
    expect(readUse('dormitorio')).toBe('bedroom')
    expect(readUse('Dormitorio')).toBe('bedroom')
    expect(readUse('salón')).toBe('living')
    expect(readUse('Salon')).toBe('living')
    expect(readUse('sala de reuniones')).toBe('meeting')
    expect(readUse('cocinita')).toBe('cocinita')
    const plan = FloorPlanSchema.parse({
      version: '1',
      walls: [],
      openings: [],
      rooms: [{ id: 'r1', name: 'dormitorio de Ana', use: 'Dormitorio', boundary: [] }]
    })
    expect(plan.rooms[0]!.use).toBe('bedroom')
    expect(plan.rooms[0]!.name).toBe('dormitorio de Ana')
  })
})

describe('the language in a plan\'s display (MSG-11)', () => {
  it('is optional, and with Spanish writes a decimal comma unless the display chooses a mark', () => {
    const base = { version: '1', walls: [], openings: [], rooms: [] }
    expect(FloorPlanSchema.parse(base).display).toBeUndefined()
    const spanish = FloorPlanSchema.parse({ ...base, display: { language: 'es' } }).display!
    expect(spanish).toEqual({ language: 'es' })
    expect(statedDisplay(spanish)).toMatchObject({ length: 'm', decimal: 'comma', language: 'es' })
    expect(statedDisplay({ language: 'es', decimal: 'point' })).toMatchObject({ decimal: 'point' })
    expect(statedDisplay({ length: 'mm' })).toMatchObject({ length: 'mm', decimal: 'point' })
    // MSG-24: any language is read; a word that is no language tag is not.
    expect(FloorPlanSchema.parse({ ...base, display: { language: 'fr' } }).display).toEqual({ language: 'fr' })
    expect(FloorPlanSchema.parse({ ...base, display: { language: 'Français' } }).display).toBeUndefined()
  })
})
