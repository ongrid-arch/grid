/**
 * MSG-11: the record in Spanish. The codes, kinds, things and values are the same in every
 * language; the label, each line's message, found, needed and fix are said in the language,
 * with its decimal comma, and no Spanish line reads as a pass or as approval (MSG-3's words,
 * with Spanish ones added). Room names stay as written.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { beforeAll, describe, expect, it } from 'vitest'
import { loadLanguage, say } from '@ongrid/floorplan/messages'
import { labPlan } from '@ongrid/floorplan/test-support/lab'
import { stairWindowAsWritten, stairWindowThrough } from '@ongrid/floorplan/test-support/through'
import { parseFloorPlan, type FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { approvalWords, GENERAL_GUIDANCE_LABEL, inspectPlan as inspectInLanguage, type GridResult } from '../..'
import { GROUND_FLOOR_NAME, groundFloorName } from '@ongrid/floorplan/messages'

/**
 * MSG-22: the record as these tests compare it. Every value is the same in every language but one:
 * the name Grid gives the floor a plan names in no list, which is Grid's own word, in the record's
 * language. It is read back as the English name, so the rest is held to be the same.
 */
function inspectPlan(...args: Parameters<typeof inspectInLanguage>): GridResult {
  const result = inspectInLanguage(...args)
  const language = args[1]?.language
  if (language === undefined || language === 'en') return result
  const named = JSON.stringify(groundFloorName(language))
  return JSON.parse(JSON.stringify(result).split(named).join(JSON.stringify(GROUND_FLOOR_NAME.en))) as GridResult
}

const fixtures = resolve(__dirname, '../../../../floorplan/fixtures')
const fixturePlans = readdirSync(fixtures)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, text: readFileSync(resolve(fixtures, name), 'utf8') }))

/** Every 40th lab plan, sound and broken alike, as the scoreboard stores them. */
const labPlans = gunzipSync(readFileSync(resolve(__dirname, '../../../../../scoreboard/data/lab-plans.ndjson.gz')))
  .toString('utf8')
  .split('\n')
  .filter((line) => line.length > 0)
  .map((line) => JSON.parse(line) as { name: string; text: string })
  .filter((_, i) => i % 40 === 0)

/** The plan's names and ids: the person's words, which a line may repeat as they are. */
function userText(text: string): string[] {
  try {
    const raw = JSON.parse(text) as Record<string, unknown>
    const parts = ['walls', 'rooms', 'openings', 'floors', 'items', 'stairs'].flatMap((key) => (Array.isArray(raw[key]) ? (raw[key] as Record<string, unknown>[]) : []))
    return parts.flatMap((part) => [part?.['id'], part?.['name'], part?.['label']]).filter((v): v is string => typeof v === 'string')
  } catch {
    return []
  }
}

const words = (result: GridResult): string[] => [result.label, ...result.lines.flatMap((line) => [line.message, line.found, line.needed, line.fix])]

beforeAll(async () => {
  await loadLanguage('es')
})

describe('the record in Spanish (MSG-11)', () => {
  it('reads enough plans to mean something', () => {
    expect(fixturePlans.length).toBeGreaterThan(5)
    expect(labPlans.length).toBeGreaterThan(25)
  })

  it('keeps every code, kind, thing, figure and value, and says the words in Spanish', () => {
    for (const { name, text } of [...fixturePlans, ...labPlans]) {
      const english = inspectPlan(text)
      const spanish = inspectPlan(text, { language: 'es' })
      expect(english.label, name).toBe(GENERAL_GUIDANCE_LABEL)
      expect(english.language, name).toBeUndefined()
      expect(spanish.label, name).toBe(say('es', 'label'))
      expect(spanish.language, name).toBe('es')
      const shape = (r: GridResult): unknown[] => r.lines.map((l) => [l.code, l.kind, l.thing, l.floor, l.also, l.figures ?? null, l.fixes ?? null, l.values ?? null])
      expect(shape(spanish), name).toEqual(shape(english))
      expect(spanish.count, name).toBe(english.count)
    }
  })

  it('leaves no placeholder unfilled and no English wording behind', () => {
    const left: string[] = []
    for (const { name, text } of [...fixturePlans, ...labPlans]) {
      const result = inspectPlan(text, { language: 'es' })
      for (const line of result.lines) {
        for (const said of [line.message, line.found, line.needed, line.fix]) {
          if (/\{[A-Za-z]+\}/.test(said)) left.push(`${name} ${line.code}: ${said}`)
          // A few English words Grid writes and Spanish does not: a sign of a sentence left untranslated.
          if (/\b(?:the|which|has|is not|does not|should)\b/.test(said.replace(/"(?:[^"\\]|\\.)*"/g, ''))) left.push(`${name} ${line.code} (English?): ${said}`)
        }
      }
    }
    expect(left).toEqual([])
  })

  it('writes figures with a decimal comma, and a stated decimal point when the plan asks for it', () => {
    const flat = fixturePlans.find((p) => p.name === 'madrid-flat.json')!.text
    const spanish = inspectPlan(flat, { language: 'es' })
    const found = spanish.lines.map((l) => l.found).join('\n')
    expect(found).toMatch(/\d,\d{2} m\b/)
    expect(found).not.toMatch(/\d\.\d{2} m\b/)
    const pointed = inspectPlan(flat, { language: 'es', decimal: 'point' })
    expect(pointed.lines.map((l) => l.found).join('\n')).toMatch(/\d\.\d{2} m\b/)
  })

  it('never reads as a pass or as approval, in Spanish (MSG-3)', () => {
    const found: string[] = []
    for (const { name, text } of [...fixturePlans, ...labPlans]) {
      const users = userText(text)
      for (const said of words(inspectPlan(text, { language: 'es' }))) {
        const hits = approvalWords(said, users)
        if (hits.length > 0) found.push(`${name}: ${hits.join(', ')} in ${said}`)
      }
    }
    expect(found).toEqual([])
  })

  it('names the Spanish words that read as approval, and leaves quoted names alone', () => {
    expect(approvalWords('El plano cumple la normativa')).toEqual(['cumple'])
    expect(approvalWords('Proyecto aprobado y homologado')).toEqual(['aprobado', 'homologado'])
    expect(approvalWords('Es válido; conforme a la norma; certificado')).toEqual(['conforme', 'certificado', 'válido'])
    expect(approvalWords('Estancia "Aprobado": sin uso indicado')).toEqual([])
    expect(approvalWords('Grid lee "cumple"')).toEqual([])
  })

  it('reads "dormitorio" as a bedroom and checks it as one, keeping the room\'s name as written', () => {
    const flat = JSON.parse(fixturePlans.find((p) => p.name === 'two-bed-flat.json')!.text) as { rooms: { id: string; name: string; use?: string }[] }
    const bedroom = flat.rooms.find((room) => room.use === 'bedroom')!
    bedroom.use = 'dormitorio'
    bedroom.name = 'dormitorio'
    // COD-3: the room sizes are checked only with a place stated.
    const asSpanish = inspectPlan(JSON.stringify(flat), { language: 'es', country: 'US' })
    const asEnglish = inspectPlan(JSON.stringify({ ...flat, rooms: flat.rooms.map((r) => (r.id === bedroom.id ? { ...r, use: 'bedroom' } : r)) }), { country: 'US' })
    expect(asSpanish.lines.map((l) => l.code)).toEqual(asEnglish.lines.map((l) => l.code))
    expect(asSpanish.lines.some((l) => l.code === 'plan/unknown-use')).toBe(false)
    const coverage = asSpanish.coverage.find((c) => c.ruleId === 'habitable-room-area')!
    expect(coverage.lookedAt.flatMap((g) => g.ids)).toContain(bedroom.id)
  })
})

describe('what the plan marks as needing to be accessible, in Spanish (CNT-17, after merging main at e486ccba)', () => {
  const room = {
    version: '1',
    units: 'm',
    walls: [
      { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'e', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'n', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'w', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
    ],
    rooms: [{ id: 'bath', name: 'Bathroom', use: 'bathroom', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [{ id: 'd1', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }],
    accessible: { rooms: ['bath'], routes: [{ to: 'bath' }, { from: 'bath', to: 'bath' }] },
  }

  it('says the line in Spanish, with the same code, thing and ids, and no word of approval', () => {
    const english = inspectPlan(room).lines.find((l) => l.code === 'plan/not-checked-access')!
    const spanish = inspectPlan(room, { language: 'es' }).lines.find((l) => l.code === 'plan/not-checked-access')!
    expect(spanish.message).toBe('Lo que el plano marca como que debe ser accesible (1 estancia y 2 recorridos) no se ha comprobado: Grid no tiene para ello ningún valor confirmado por una persona con nombre')
    expect(spanish.found).toBe('marcado como que debe ser accesible: 1 estancia y 2 recorridos')
    expect([spanish.kind, spanish.thing, spanish.also]).toEqual([english.kind, english.thing, english.also])
    for (const text of [spanish.message, spanish.found, spanish.needed, spanish.fix]) {
      expect(approvalWords(text)).toEqual([])
      expect(text).not.toMatch(/\{[A-Za-z]/)
    }
  })
})

describe("the firm's own standards, in Spanish (COD-8, after merging main at 4fe29edc)", () => {
  const plan = {
    version: '1',
    units: 'm',
    walls: [
      { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'e', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'n', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'w', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
    ],
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [{ id: 'd1', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }],
  }
  const firm = {
    file: 'firm-standards.json',
    problem: null,
    standards: [{ measure: 'corridor_width', value: 1.5, written: 'm', name: 'Pasillos', note: null, uses: [], kinds: [] }],
    measured: [{ standard: 0, thing: { kind: 'room', id: 'hall' }, floor: null, measured: 1.234, precision: 0, said: 'between walls', sentence: { key: 'line.part.firm.at.width' }, also: [] }],
  } as const

  it('says the line in Spanish, with the same code, firm figure and values, and no word of approval', () => {
    const english = inspectPlan(plan, { firm: firm as never }).lines.find((l) => l.code === 'firm/corridor-width')!
    const spanish = inspectPlan(plan, { firm: firm as never, language: 'es' }).lines.find((l) => l.code === 'firm/corridor-width')!
    expect(english.found).toMatch(/^1\.23 m, the widest circle the empty room holds; measured as /)
    expect(spanish.message).toBe('Estancia "Hall": el paso tiene 1,23 m de ancho en su punto más estrecho, por debajo del valor propio del estudio de 1,5 m para ancho de pasillo ("Pasillos")')
    expect(spanish.found).toMatch(/^1,23 m, el mayor círculo que admite la estancia vacía; medido como el punto más estrecho/)
    expect(spanish.needed).toContain('propio del estudio y no de ningún código ni norma')
    expect([spanish.kind, spanish.thing, spanish.firm, spanish.values]).toEqual([english.kind, english.thing, english.firm, english.values])
    expect(spanish.values).toMatchObject({ figure: 1.5, measured: 1.23, file: 'firm-standards.json' })
    for (const text of [spanish.message, spanish.found, spanish.needed, spanish.fix]) {
      expect(approvalWords(text)).toEqual([])
      expect(text).not.toMatch(/\{[A-Za-z]/)
    }
  })
})

describe('the lengths taped on site, in Spanish (HND-11, after merging main at 90a933b1)', () => {
  const plan = {
    version: '1',
    units: 'm',
    walls: [
      { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'e', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'n', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'w', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
    ],
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [{ id: 'd1', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 }],
    taped: [
      { room: 'hall', wall: 's', length: 3.7 },
      { room: 'hall', wall: 'x', length: 2 },
    ],
  }

  it('says a taped length that differs, and one not measured, in Spanish, with the same codes, rows and values', () => {
    const english = inspectPlan(plan)
    const spanish = inspectPlan(plan, { language: 'es' })
    const differs = (r: GridResult) => r.lines.find((l) => l.code === 'room/taped-differs')!
    const missing = (r: GridResult) => r.lines.find((l) => l.code === 'plan/taped-not-measured')!
    // Main's English, word for word.
    expect(differs(english).message).toBe('The side along wall "s" taped in Room "Hall" is not the length drawn')
    expect(differs(english).found).toBe('3.800 m drawn against 3.700 m taped, 0.100 m longer')
    expect(differs(english).needed).toBe('the drawing within 0.010 m of the length taped')
    expect(missing(english).message).toBe('A length taped in Room "Hall" cannot be set against the drawing: the plan has no wall "x"')
    expect(missing(english).found).toBe('the side along wall "x", taped 2.000 m')
    expect(differs(spanish).message).toBe('La medida del lado a lo largo del muro "s", tomada con cinta en Estancia "Hall", no es la longitud del dibujo')
    expect(differs(spanish).found).toBe('3,800 m en el dibujo frente a 3,700 m con cinta, 0,100 m más en el dibujo')
    expect(differs(spanish).needed).toBe('el dibujo a menos de 0,010 m de la longitud medida con cinta')
    expect(missing(spanish).message).toBe('Una longitud medida con cinta en Estancia "Hall" no se puede comparar con el dibujo: el plano no tiene ningún muro "x"')
    expect(spanish.taped).toEqual(english.taped)
    for (const pick of [differs, missing]) {
      const [en, es] = [pick(english), pick(spanish)]
      expect([es.code, es.kind, es.thing, es.also, es.values]).toEqual([en.code, en.kind, en.thing, en.also, en.values])
      for (const text of [es.message, es.found, es.needed, es.fix]) {
        expect(approvalWords(text)).toEqual([])
        expect(text).not.toMatch(/\{[A-Za-z]/)
      }
    }
    expect(differs(english).values).toMatchObject({ name: 'Hall', taped: 3.7, drawn: 3.8, off: 0.1, within: 0.01 })
  })
})

describe('existing, demolished and new, in Spanish (CNT-10, after merging main at fbe5160e)', () => {
  const plan = {
    version: '1',
    units: 'm',
    walls: [
      { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'e', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'n', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.6, kind: 'exterior', phase: 'demolished' },
      { id: 'w', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
    ],
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [
      { id: 'd1', wall: 's', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0 },
      { id: 'd2', wall: 'n', type: 'door', offset: 1, width: 0.9, height: 2.1, sill: 0, phase: 'new' },
    ],
  }

  it('says the work and a part that stands when its wall does not, in Spanish, with the same codes, things and values', () => {
    const english = inspectPlan(plan)
    const spanish = inspectPlan(plan, { language: 'es' })
    const pick = (code: string) => (r: GridResult) => r.lines.find((l) => l.code === code)!
    const work = pick('plan/read-after-work')
    const opening = pick('opening/phase-wall')
    const room = pick('room/phase-wall')
    // Main's English, word for word.
    expect(work(english).message).toBe('The plan holds work: 5 existing, 1 to be demolished, 1 new walls, openings and rooms. Its sizes, areas and checks are for the building as it will be after the work')
    expect(opening(english).message).toBe('Door "d2" stands when its wall does not, so it is left out')
    expect(opening(english).found).toBe('Opening "d2" is new, so it stands only after the work, but its wall "n" is to be demolished and stands only before the work')
    expect(room(english).found).toBe('Room "hall" is existing, so it stands before and after the work, but its wall "n" is to be demolished and stands only before the work')
    expect(work(spanish).message).toBe('El plano contiene obra: existentes 5, a demoler 1 y nuevos 1, contando muros, huecos y estancias. Sus medidas, superficies y comprobaciones son del edificio tal como quedará después de la obra')
    expect(opening(spanish).found).toBe('El hueco "d2" es de la fase de obra nueva, así que existe solo después de la obra, pero su muro "n" es de la fase de demolición y existe solo antes de la obra')
    expect(work(english).values).toMatchObject({ existing: 5, demolished: 1, new: 1 })
    for (const which of [work, opening, room]) {
      const [en, es] = [which(english), which(spanish)]
      expect([es.code, es.kind, es.thing, es.also, es.values]).toEqual([en.code, en.kind, en.thing, en.also, en.values])
      for (const text of [es.message, es.found, es.needed, es.fix]) {
        expect(approvalWords(text)).toEqual([])
        expect(text).not.toMatch(/\{[A-Za-z]/)
      }
    }
  })
})

describe("walls past a floor's outline, in Spanish (BRF-4, after merging main at 65e37ca1)", () => {
  const wall = (id: string, start: number[], end: number[]) => ({ id, start, end, thickness: 0.2, height: 2.6, kind: 'exterior', floor: 'g' })
  const plan = {
    version: '1',
    units: 'm',
    floors: [{ id: 'g', name: 'Ground', level: 0, height: 2.6, outline: [[0, 0], [3, 0], [3, 3], [0, 3]] }],
    walls: [wall('s', [0, 0], [4, 0]), wall('e', [4, 0], [4, 3]), wall('n', [4, 3], [0, 3]), wall('w', [0, 3], [0, 0])],
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', floor: 'g', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [],
  }

  it('says the line in Spanish, with the same code, thing and values', () => {
    const english = inspectPlan(plan).lines.find((l) => l.code === 'floor/past-outline')!
    const spanish = inspectPlan(plan, { language: 'es' }).lines.find((l) => l.code === 'floor/past-outline')!
    expect(english.found).toMatch(/^Floor "g"'s walls reach \d+\.\d\d m² past the outline it states\. The slab, the roof and the gross area take in both, so the floor is larger than its outline\.$/)
    expect(spanish.found).toMatch(/^Los muros de la planta "g" sobresalen \d+,\d\d m² del contorno que indica\./)
    expect([spanish.code, spanish.kind, spanish.thing, spanish.values]).toEqual([english.code, english.kind, english.thing, english.values])
    for (const text of [spanish.message, spanish.found, spanish.needed, spanish.fix]) {
      expect(approvalWords(text)).toEqual([])
      expect(text).not.toMatch(/\{[A-Za-z]/)
    }
  })
})

describe('the flats list, in Spanish (CNT-4, after merging main at ed8b9f75)', () => {
  const plan = {
    version: '1',
    units: 'm',
    walls: [
      { id: 's', start: [0, 0], end: [4, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'e', start: [4, 0], end: [4, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'n', start: [4, 3], end: [0, 3], thickness: 0.2, height: 2.6, kind: 'exterior' },
      { id: 'w', start: [0, 3], end: [0, 0], thickness: 0.2, height: 2.6, kind: 'exterior' },
    ],
    rooms: [{ id: 'hall', name: 'Hall', use: 'corridor', boundary: ['s', 'e', 'n', 'w'] }],
    openings: [],
    flatTypes: [{ id: 'one-bed', name: 'One bedroom' }],
    flats: [{ id: 'A', name: 'Flat A', type: 'two-bed', rooms: ['hall', 'hal'] }],
  }

  it('says the lines in Spanish, the flat by its name, with the same codes, things and values', () => {
    const english = inspectPlan(plan)
    const spanish = inspectPlan(plan, { language: 'es' })
    const room = (r: GridResult) => r.lines.find((l) => l.code === 'flat/unknown-room')!
    const type = (r: GridResult) => r.lines.find((l) => l.code === 'flat/unknown-type')!
    expect(room(english).message).toBe('Flat "Flat A" names a room the plan does not have')
    expect(room(english).found).toBe('Flat "A" names room "hal", which the plan does not have, so it is not counted in the flat; "hall" is the room most likely meant')
    expect(type(english).found).toBe('Flat "A" is of type "two-bed", which the plan\'s flat types do not state: they are "one-bed"')
    expect(room(spanish).message).toBe('Vivienda "Flat A" nombra una estancia que el plano no tiene')
    expect(type(spanish).found).toBe('La vivienda "A" es del tipo "two-bed", que los tipos de vivienda del plano no indican: son "one-bed"')
    for (const pick of [room, type]) {
      const [en, es] = [pick(english), pick(spanish)]
      expect([es.code, es.kind, es.thing, es.also, es.values]).toEqual([en.code, en.kind, en.thing, en.also, en.values])
      for (const text of [es.message, es.found, es.needed, es.fix]) {
        expect(approvalWords(text)).toEqual([])
        expect(text).not.toMatch(/\{[A-Za-z]/)
      }
    }
  })
})

describe('walls through floors and floors that line up, in Spanish (LVL-5, after merging main at cf8b8084)', () => {
  /** A line of a code in English and in Spanish, with the same code, kind, thing, ids and values. */
  function both(plan: unknown, code: string, id?: string): { en: GridResult['lines'][number]; es: GridResult['lines'][number] } {
    const pick = (r: GridResult) => r.lines.find((l) => l.code === code && (id === undefined || l.thing.id === id))!
    const en = pick(inspectPlan(plan))
    const es = pick(inspectPlan(plan, { language: 'es' }))
    expect([es.code, es.kind, es.thing, es.also, es.values]).toEqual([en.code, en.kind, en.thing, en.also, en.values])
    for (const text of [es.message, es.found, es.needed, es.fix]) {
      expect(approvalWords(text)).toEqual([])
      expect(text).not.toMatch(/\{[A-Za-z]/)
    }
    return { en, es }
  }

  it('says a stair moved on one floor in main\'s English and in Spanish, with the same values', () => {
    const { en, es } = both(labPlan('D/scenarios/d2-stair-shifted-floor3.json'), 'room/stair-shifted', 'L3-stair')
    expect(en.message).toMatch(/^The stair "[^"]+" on "Floor 3" is 1\.20 m east of "[^"]+" on "Floor 2" below it: it stands from \(\d+\.\d\d, \d+\.\d\d\) to \(\d+\.\d\d, \d+\.\d\d\), the one below from \(/)
    expect(en.found).toBe('moved 1.20 m east of the one below, on the drawing (north is its top)')
    expect(en.fix).toBe('Move it back over the stair room below, or, if it is meant, mark the room with overhang "meant".')
    expect(es.message).toMatch(/^La escalera "[^"]+" de "Floor 3" está 1,20 m al este de "[^"]+" de "Floor 2", debajo: ocupa de \(\d+,\d\d; \d+,\d\d\) a \(\d+,\d\d; \d+,\d\d\), y la de abajo de \(/)
    expect(es.found).toBe('desplazada 1,20 m al este respecto a la de abajo, en el dibujo (el norte está arriba)')
  })

  it('says a lift shaft with one side moved by that side, in main\'s English and in Spanish', () => {
    const raw = JSON.parse(JSON.stringify(labPlan('H/scenarios/h06b-lift-shaft-shifted.json'))) as FloorPlan
    const plan = parseFloorPlan({ ...raw, rooms: raw.rooms.map((r) => (r.name === 'Lift shaft' ? { ...r, use: 'lift' } : r)) })
    const line = inspectPlan(plan).lines.find((l) => l.code === 'room/lift-shifted')!
    const { en, es } = both(plan, 'room/lift-shifted', line.thing.id)
    expect(en.message).toBe(
      'The lift shaft "Lift shaft" on "Second floor" has its west side 0.60 m east of that of "Lift shaft" on "First floor" below it: it stands from (6.70, 3.70) to (7.85, 5.85), the one below from (6.10, 3.70) to (7.85, 5.85)'
    )
    expect(en.found).toBe("its west side 0.60 m east of the one below's, on the drawing (north is its top)")
    expect(es.message).toBe(
      'La caja del ascensor "Lift shaft" de "Second floor" tiene su lado oeste 0,60 m al este respecto al de "Lift shaft" de "First floor", debajo: ocupa de (6,70; 3,70) a (7,85; 5,85), y la de abajo de (6,10; 3,70) a (7,85; 5,85)'
    )
  })

  it('says a floor that sits back from the one below in main\'s English and in Spanish', () => {
    const box = (floor: string, east: number) => [
      { id: `${floor}-s`, start: [0, 0], end: [east, 0], thickness: 0.3, kind: 'exterior', height: 2.7, floor },
      { id: `${floor}-e`, start: [east, 0], end: [east, 6], thickness: 0.3, kind: 'exterior', height: 2.7, floor },
      { id: `${floor}-n`, start: [east, 6], end: [0, 6], thickness: 0.3, kind: 'exterior', height: 2.7, floor },
      { id: `${floor}-w`, start: [0, 6], end: [0, 0], thickness: 0.3, kind: 'exterior', height: 2.7, floor }
    ]
    const plan = {
      version: '1',
      units: 'm',
      floors: [
        { id: 'g', name: 'Ground floor', level: 0 },
        { id: 'f', name: 'First floor', level: 1 }
      ],
      walls: [...box('g', 8.3), ...box('f', 8)],
      rooms: [
        { id: 'g-r', name: 'Living', floor: 'g', boundary: ['g-s', 'g-e', 'g-n', 'g-w'], use: 'living' },
        { id: 'f-r', name: 'Bedroom', floor: 'f', boundary: ['f-s', 'f-e', 'f-n', 'f-w'], use: 'bedroom' }
      ],
      openings: [{ id: 'door', wall: 'g-s', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    }
    // LVL-10: a floor wholly inside the one below is a part floor, set back from it.
    const { en, es } = both(plan, 'floor/set-back', 'f')
    expect(en.message).toBe('Floor "First floor" is a part floor, set back from the floor below it')
    expect(en.found).toBe(
      'Floor "First floor" is a part floor over "Ground floor": it sits back from it by 0.30 m on the east, and lines up with it on the north, south and west. ' +
        'It stands from (-0.15, -0.15) to (8.15, 6.15), the floor below from (-0.15, -0.15) to (8.45, 6.15). ' +
        'If that is meant, mark the floor with overhang "meant"; if not, move its outside walls out over the edge of the floor below, or make a wall that both floors share rise through them (through).'
    )
    expect(en.fix).toContain('overhang "meant"')
    expect(es.message).toBe('Planta "First floor" es una planta parcial, retranqueada respecto a la planta de abajo')
    expect(es.found).toMatch(
      /^La planta "First floor" es una planta parcial sobre "Ground floor": queda retranqueada respecto a ella 0,30 m por el este, y está alineada con ella por el norte, sur y oeste\. Ocupa de \(-0,15; -0,15\) a \(8,15; 6,15\)/
    )
  })

  it('says a split level once in main\'s English and in Spanish', () => {
    // LVL-11: a living level 1.5 m up beside the bedroom level, north of it, with nothing under it.
    const box = (floor: string, y0: number, y1: number) => [
      { id: `${floor}-s`, start: [0, y0], end: [10, y0], thickness: 0.3, kind: 'exterior', height: 2.5, floor },
      { id: `${floor}-e`, start: [10, y0], end: [10, y1], thickness: 0.3, kind: 'exterior', height: 2.5, floor },
      { id: `${floor}-n`, start: [10, y1], end: [0, y1], thickness: 0.3, kind: 'exterior', height: 2.5, floor },
      { id: `${floor}-w`, start: [0, y1], end: [0, y0], thickness: 0.3, kind: 'exterior', height: 2.5, floor }
    ]
    const plan = {
      version: '1',
      units: 'm',
      floors: [
        { id: 'low', name: 'Bedroom level', level: 0, elevation: 0, height: 2.6 },
        { id: 'high', name: 'Living level', level: 1, elevation: 1.5, height: 2.6 }
      ],
      walls: [...box('low', 0, 7), ...box('high', 7, 15)],
      rooms: [
        { id: 'low-r', name: 'Bedroom', floor: 'low', boundary: ['low-s', 'low-e', 'low-n', 'low-w'], use: 'bedroom' },
        { id: 'high-r', name: 'Living', floor: 'high', boundary: ['high-s', 'high-e', 'high-n', 'high-w'], use: 'living' }
      ],
      openings: [{ id: 'door', wall: 'low-s', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    }
    const { en, es } = both(plan, 'floor/split-level', 'high')
    expect(en.kind).toBe('worth-a-look')
    expect(en.message).toBe('Floor "Living level" is a half level up beside the floor it steps from: a split level')
    expect(en.found).toBe(
      'The plan has split levels, each floor a half level up beside the floor it steps from, with no floor under it: "Living level" stands 1.50 m above "Bedroom level", on its north side. ' +
        'Each floor is set only against the floors under it. If a step is not meant, change that floor\'s elevation; if it is, mark the floor with overhang "meant".'
    )
    expect(es.message).toBe('Planta "Living level" está medio nivel más arriba junto a la planta de la que parte: un medio nivel')
    expect(es.found).toContain('"Living level" está 1,50 m por encima de "Bedroom level", por su lado norte.')
    expect(inspectPlan(plan).lines.filter((l) => l.code === 'floor/out-of-line' || l.code === 'floor/set-back')).toEqual([])
  })

  it('says walls that stop short of the slab over them in English and in Spanish (VEW-33)', () => {
    // A car park at -4.00 with walls 3.00 m high, under a ground floor at 0 on a 0.25 m slab.
    const box = (floor: string, height: number) => [
      { id: `${floor}-s`, start: [0, 0], end: [10, 0], thickness: 0.3, kind: 'exterior', height, floor },
      { id: `${floor}-e`, start: [10, 0], end: [10, 8], thickness: 0.3, kind: 'exterior', height, floor },
      { id: `${floor}-n`, start: [10, 8], end: [0, 8], thickness: 0.3, kind: 'exterior', height, floor },
      { id: `${floor}-w`, start: [0, 8], end: [0, 0], thickness: 0.3, kind: 'exterior', height, floor }
    ]
    const plan = {
      version: '1',
      units: 'm',
      floors: [
        { id: 'park', name: 'Car park', level: -1, elevation: -4 },
        { id: 'g', name: 'Ground floor', level: 0, elevation: 0 }
      ],
      walls: [...box('park', 3), ...box('g', 2.7)],
      rooms: [
        { id: 'park-r', name: 'Parking', floor: 'park', boundary: ['park-s', 'park-e', 'park-n', 'park-w'] },
        { id: 'g-r', name: 'Hall', floor: 'g', boundary: ['g-s', 'g-e', 'g-n', 'g-w'] }
      ],
      openings: [{ id: 'door', wall: 'g-s', type: 'door', offset: 1, width: 0.9, height: 2.1 }]
    }
    const { en, es } = both(plan, 'floor/gap-under-slab', 'park')
    expect(en.kind).toBe('worth-a-look')
    expect(en.message).toBe('Floor "Car park" stops short of the slab of the floor over it')
    expect(en.found).toBe(
      'The walls of floor "Car park" stop 0.75 m short of the slab of "Ground floor" over it: they reach -1.00 m, and the slab\'s underside is at -0.25 m. ' +
        'Sections and facades draw them up to the slab. If they are meant to meet it, give the walls the height that does, or change the elevation or the slab of one of the floors.'
    )
    expect(es.message).toBe('Planta "Car park" no llega al forjado de la planta que tiene encima')
    expect(es.found).toContain('se quedan 0,75 m por debajo del forjado de "Ground floor"')
  })

  it('says a wall that rises through a floor the plan does not have in main\'s English and in Spanish', () => {
    const raw = JSON.parse(JSON.stringify(stairWindowThrough())) as FloorPlan
    const plan = parseFloorPlan({ ...raw, walls: raw.walls.map((w) => (w.id === 'g-n' ? { ...w, through: 'roof' } : w)) })
    const { en, es } = both(plan, 'wall/through-floor', 'g-n')
    expect(en.message).toBe('Wall "g-n" rises through a floor that is not above its own, so it stands on its own floor only')
    expect(en.found).toBe('Wall "g-n" rises through floor "roof", which the plan does not have, so it stands on its own floor only. The floors above it are "first".')
    expect(es.found).toBe('El muro "g-n" sube hasta la planta "roof", que el plano no tiene, así que solo está en su propia planta. Las plantas sobre ella son "first".')
  })

  it('calls a window that cannot be drawn a window, in main\'s English and in Spanish', () => {
    const { en, es } = both(stairWindowAsWritten(), 'floor/not-checked-doors-not-drawn')
    expect(en.message).toBe('On "Ground floor", this window could not be drawn, so it and what rests on it were not checked: "g-w-stair-tall"')
    expect(en.found).toBe('a window that cannot be drawn')
    expect(en.needed).toBe('a window that can be drawn')
    expect(en.fix).toBe('Correct the lines that leave that window out. It is checked once it can be drawn, and so is what rests on it: a note held back comes back if it still holds.')
    expect(es.message).toBe('En "Ground floor" no se pudo dibujar esta ventana, así que no se comprobó ni el hueco ni lo que se apoya en él: "g-w-stair-tall"')
    expect(es.found).toBe('una ventana que no se consiguió dibujar')
  })
})
