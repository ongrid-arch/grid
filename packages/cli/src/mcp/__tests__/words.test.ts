/**
 * MSG-24: Grid's printed words in the person's language, supplied by the agent with grid_words and
 * kept in the plan (C32): listed per output, checked, written, and printed by the drawing, the
 * sheet and the check; a language with no words is written in English with one hint.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { english, en, setPlanWords, type MessageKey } from '@ongrid/floorplan/messages'
import { openProject } from '../../fs/projectFiles'
import { makeDrawing, makeSheet } from '../../sheet/sheetFile'
import { bench, type Bench } from './replay/harness'
import { twoBedFlat } from './replay/plans'

/** A German word for each key, made from the English: a marker before it, every placeholder kept. */
const german = (key: MessageKey): string => `DE ${en[key]}`
const LABEL_DE = 'Allgemeine Hinweise, nicht Ihre örtlichen Vorschriften'

interface KeysData { keys: { key: MessageKey; english: string; placeholders: string[]; word: string | null; from: string | null }[]; toWrite: number; written: string | null; wordsInPlan: number }

let b: Bench
beforeAll(() => {
  b = bench({ 'plan.json': twoBedFlat(), 'bare.json': twoBedFlat() })
})
afterAll(() => {
  setPlanWords(undefined)
  b.close()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the plan file as JSON, read field by field
const planFile = (file: string): any => JSON.parse(readFileSync(join(b.folder, file), 'utf8'))

describe('grid_words (MSG-24)', () => {
  it('lists the keys an output prints for this plan, with their English and placeholders, and writes nothing', async () => {
    const before = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    const reply = await b.call('grid_words', { plan: 'plan.json', language: 'de', output: 'check' })
    expect(reply.isError, reply.text).toBe(false)
    const data = reply.data as unknown as KeysData
    expect(data.keys.length).toBeGreaterThan(5)
    expect(data.keys.some((row) => row.key === 'label')).toBe(true)
    expect(data.keys.every((row) => row.from === null && row.word === null)).toBe(true)
    expect(data.toWrite).toBe(data.keys.length)
    const door = data.keys.find((row) => row.placeholders.length > 0)!
    expect(door.english).toBe(en[door.key])
    expect(reply.text).toContain(`${door.key}: ${JSON.stringify(door.english)}`)
    // Only what the check prints: no word of the sheet's or the drawing's.
    expect(data.keys.some((row) => row.key.startsWith('sheet.'))).toBe(false)
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(before)
  }, 60_000)

  it('refuses every word when one has a placeholder the English key does not, and writes none', async () => {
    const before = readFileSync(join(b.folder, 'plan.json'), 'utf8')
    const reply = await b.call('grid_words', { plan: 'plan.json', language: 'de', words: { label: LABEL_DE, 'check.passage.door.width': 'Die Tür ist {breite} m breit', 'no.such.key': 'x' } })
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('No word was written: 2 of the 3 sent cannot be taken')
    expect(reply.text).toContain('"check.passage.door.width" must hold the placeholders {size}, as the English does, not {breite}.')
    expect(reply.text).toContain('is no key of Grid\'s')
    expect(readFileSync(join(b.folder, 'plan.json'), 'utf8')).toBe(before)
  })

  it('refuses a word that reads as an approval, and English', async () => {
    const approved = await b.call('grid_words', { plan: 'plan.json', language: 'de', words: { label: 'Approved plan' } })
    expect(approved).toMatchObject({ isError: true })
    expect(approved.text).toContain('reads as a pass or an approval')
    const englishToo = await b.call('grid_words', { plan: 'plan.json', language: 'en-GB', output: 'check' })
    expect(englishToo).toMatchObject({ isError: true })
  })

  it('writes German words into the plan\'s display, and the drawing, the sheet and the check print them', async () => {
    const listed = new Set<MessageKey>()
    for (const output of ['drawing', 'sheet', 'check']) {
      // SHT-23: the sheet's keys, with its elevations and sections, pass the 20 KB an answer is kept to.
      const reply = await b.call('grid_words', { plan: 'plan.json', language: 'de', output, whole: true })
      expect(reply.isError, reply.text).toBe(false)
      for (const row of (reply.data as unknown as KeysData).keys) listed.add(row.key)
    }
    const words = Object.fromEntries([...listed].map((key) => [key, key === 'label' ? LABEL_DE : german(key)]))
    const wrote = await b.call('grid_words', { plan: 'plan.json', language: 'de-DE', words, plan_language: true, decimal: 'comma', output: 'check' })
    expect(wrote.isError, wrote.text).toBe(false)
    expect(wrote.text).toContain(`Wrote ${listed.size} words in "de" into "plan.json"`)
    expect((wrote.data as unknown as KeysData).toWrite).toBe(0)
    const file = planFile('plan.json')
    expect(file.display).toEqual({ words: { de: words }, language: 'de', decimal: 'comma' })
    // The building is as it was.
    expect(file.walls).toEqual(twoBedFlat()['walls'])

    // The check: the plan's own language is German now, so no language need be asked.
    const check = await b.call('grid_check', { plan: 'plan.json' })
    expect(check.isError, check.text).toBe(false)
    expect(check.text).toContain(LABEL_DE)
    expect(check.text).toMatch(/\bDE /)
    expect(check.text).not.toContain('grid_words')

    // The drawing, as its file: every word of Grid's on it in German.
    const project = openProject(b.folder, b.folder)
    const drawing = await makeDrawing(project, 'plan.json', {}, null)
    expect(drawing.files.svgs.join('')).toMatch(/DE /)
    expect(drawing.files.svgs.join('')).not.toContain('Floor plan with')
    const view = await b.call('grid_view', { plan: 'plan.json', kind: 'plan' })
    expect(view.isError, view.text).toBe(false)
    expect(view.text).not.toContain('grid_words')

    // The sheet: its pages are titled in German.
    for (const layout of ['client', 'check'] as const) {
      const sheet = await makeSheet(project, 'plan.json', layout, null)
      // The client sheet's first page is titled with the project's name, the person's own.
      const titles = sheet.pages.flatMap((page) => (page.title === null || page.title === 'plan' ? [] : [page.title]))
      expect(titles.length, layout).toBeGreaterThan(0)
      for (const title of titles) expect(title, layout).toMatch(/^DE /)
    }
    const sheetReply = await b.call('grid_sheet', { plan: 'plan.json', layout: 'client' })
    expect(sheetReply.isError, sheetReply.text).toBe(false)
    expect(sheetReply.text).not.toContain('grid_words')
  }, 120_000)

  it('keeps the words when the plan is written again from rooms text with a display line', async () => {
    const rooms = await b.call('grid_describe', { plan: 'plan.json', as: 'rooms' })
    expect(rooms.isError, rooms.text).toBe(false)
    const text = (rooms.data as { text: string }).text
    const again = await b.call('grid_write_rooms', { plan: 'plan.json', rooms: text.includes('\ndisplay ') ? text : `display m decimal comma\n${text}` })
    expect(again.isError, again.text).toBe(false)
    expect(planFile('plan.json').display.words.de.label).toBe(LABEL_DE)
  }, 60_000)

  it('writes a language with no words in English, and says so once', async () => {
    const reply = await b.call('grid_check', { plan: 'bare.json', language: 'fr' })
    expect(reply.isError, reply.text).toBe(false)
    expect(reply.text).toContain(english({ key: 'label' }))
    const hints = reply.text.split('\n').filter((line) => line.includes('grid_words'))
    expect(hints).toEqual(['Grid has no words in "fr" for this plan, so its own words here are in English: grid_words with language "fr" and an output lists them to translate, and writes yours into the plan.'])
    // English and Spanish need no words.
    for (const language of ['en', 'es']) expect((await b.call('grid_check', { plan: 'bare.json', language })).text).not.toContain('grid_words')
  })

  it('says how many words were in English when the plan gives some', async () => {
    await b.call('grid_words', { plan: 'bare.json', language: 'fr', words: { label: 'Indications générales, pas vos règles locales' } })
    const reply = await b.call('grid_check', { plan: 'bare.json', language: 'fr' })
    expect(reply.text).toContain('Indications générales, pas vos règles locales')
    expect(reply.text).toMatch(/\d+ of the \d+ words of Grid's here have no word in "fr" and are in English/)
  })
})
