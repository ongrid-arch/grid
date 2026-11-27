import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { loadCanvas } from '../../draw/canvas'
import { registerSheetFonts, SANS, SERIF } from '../fonts'
import { sheetPages, type Sheet, type SheetPage } from '../pages'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { A3, floorPictureBox, layoutSheet, sheetPdf, wrapLines } from '../pdf'

const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-floor-house.json'), 'utf8')))
const loaded = { file: 'two-floor-house.json', plan, ...validatePlan(plan) }
const date = new Date('2026-11-21T12:00:00Z')

/** Pages in a PDF, by its page objects. Skia writes each page as its own object. */
function pageCount(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length
}

const clientSheet = () => sheetPages(loaded, { version: '1', name: 'Solace House' }, 'client', { name: 'two-floor-house', date })
const checkSheet = () => sheetPages(loaded, null, 'check', { name: 'two-floor-house', date })

/** A check sheet whose first floor page holds 80 long notes. */
function crowded(): { sheet: Sheet; notes: string[] } {
  const base = checkSheet()
  const notes = Array.from({ length: 80 }, (_, i) => `Note ${i}: ${'a long sentence about what was found on this floor '.repeat(3)}${i}`)
  const pages = base.pages.map((page, i): SheetPage => (i === 1 ? { ...page, notes } : page))
  return { sheet: { ...base, pages }, notes }
}

describe('the sheet as a PDF (VEW-7)', () => {
  it('writes one PDF page for each page of the client sheet', async () => {
    const sheet = clientSheet()
    const result = await sheetPdf(plan, sheet)
    expect(Buffer.from(result.pdf.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
    expect(pageCount(result.pdf)).toBe(sheet.pages.length)
    expect(result.sheet.pages).toHaveLength(sheet.pages.length)
  }, 30_000)

  it('writes one PDF page for each page of the check sheet', async () => {
    const sheet = checkSheet()
    // SHT-23: what the sections took may run onto a continuation page of the sections page.
    const result = await sheetPdf(plan, sheet)
    expect(pageCount(result.pdf)).toBe(result.sheet.pages.length)
    expect(result.sheet.pages.length).toBeGreaterThanOrEqual(sheet.pages.length)
  }, 30_000)

  it('moves what does not fit onto continuation pages, with every note once', async () => {
    const { sheet, notes } = crowded()
    const result = await sheetPdf(plan, sheet)
    expect(result.sheet.pages.length).toBeGreaterThan(sheet.pages.length)
    expect(pageCount(result.pdf)).toBe(result.sheet.pages.length)
    const shown = result.sheet.pages.flatMap((p) => p.notes)
    for (const note of notes) expect(shown.filter((n) => n === note)).toHaveLength(1)
    const more = result.sheet.pages.filter((p) => p.title === `${sheet.pages[1]!.title} (continued)`)
    expect(more.length).toBeGreaterThan(0)
    for (const page of more) { expect(page.picture).toBeNull(); expect(page.figures).toEqual([]) }
    expect(more.every((page) => page.floor === sheet.pages[1]!.floor && page.floor !== null)).toBe(true)
  }, 60_000)

  it('numbers the footers 1 to n of n', async () => {
    const laid = await layoutSheet(crowded().sheet)
    expect(laid.pages.map((p) => p.footer.page)).toEqual(laid.pages.map((_, i) => i + 1))
    for (const page of laid.pages) expect(page.footer.pages).toBe(laid.pages.length)
  }, 30_000)

  it('wraps a 120-character name and a 200-character headline inside the page width', async () => {
    const name = 'Wide name '.repeat(12).slice(0, 120)
    const headline = 'A headline that goes on and on about the house '.repeat(5).slice(0, 200)
    const canvas = await loadCanvas()
    registerSheetFonts(canvas)
    const ctx = canvas.createCanvas(10, 10).getContext('2d')
    const width = A3.width - 96
    for (const [text, family, size] of [[name, SERIF, 34], [headline, SANS, 13], ['U'.repeat(150), SERIF, 34]] as const) {
      ctx.font = `${size}px "${family}"`
      expect(ctx.measureText(text).width).toBeGreaterThan(width)
      const lines = wrapLines(ctx, text, width)
      expect(lines.length).toBeGreaterThan(1)
      for (const line of lines) expect(ctx.measureText(line).width).toBeLessThanOrEqual(width)
      expect(lines.join('').replace(/ /g, '')).toBe(text.replace(/ /g, ''))
    }
    const words = { version: '1', name, headline } as never
    const sheet = sheetPages(loaded, words, 'client', { name: 'x', date })
    expect(pageCount((await sheetPdf(plan, sheet)).pdf)).toBe((await layoutSheet(sheet)).pages.length)
  }, 60_000)

  it('wraps a text that fits its line whole to that one line, and every text to the lines word by word gives (SHT-25)', async () => {
    const canvas = await loadCanvas()
    registerSheetFonts(canvas)
    const ctx = canvas.createCanvas(10, 10).getContext('2d')
    // The greedy wrap word by word, as the sheet wrapped every text before SHT-25.
    const byWords = (text: string, width: number): string[] => {
      const lines: string[] = []
      let line = ''
      for (const word of text.split(' ')) {
        const parts: string[] = []
        if (ctx.measureText(word).width > width) {
          let part = ''
          for (const char of word) {
            if (part && ctx.measureText(part + char).width > width) { parts.push(part); part = char } else part += char
          }
          if (part) parts.push(part)
        } else parts.push(word)
        for (const [i, part] of parts.entries()) {
          const joined = line ? `${line} ${part}` : part
          if (i === 0 && ctx.measureText(joined).width <= width) { line = joined; continue }
          if (line) lines.push(line)
          line = part
        }
      }
      if (line) lines.push(line)
      return lines
    }
    const texts = ['Office · office 16.00 m² · r0_1_2', 'Kitchen', '', ' A leading space', 'Two  spaces between', 'A trailing space ', 'Wall w12 meets wall w13 at a corner that is not drawn, so the room is left open on that side.', 'W'.repeat(60)]
    for (const width of [40, 120, 300, 900]) {
      for (const [family, size] of [[SANS, 11], [SERIF, 34]] as const) {
        ctx.font = `${size}px "${family}"`
        for (const text of texts) expect(wrapLines(ctx, text, width), `${text} at ${width}`).toEqual(byWords(text, width))
      }
    }
    ctx.font = `11px "${SANS}"`
    expect(wrapLines(ctx, 'Office · office 16.00 m²', 900)).toEqual(['Office · office 16.00 m²'])
  }, 30_000)

  it('keeps every floor picture above the footer, at one size, when a floor title wraps', async () => {
    const base = checkSheet()
    const long = 'Wide floor name '.repeat(8).slice(0, 120)
    const sheet = { ...base, pages: base.pages.map((p, i) => (i === 1 ? { ...p, title: long } : p)) }
    const box = await floorPictureBox(await layoutSheet(sheet))
    expect(box.top + box.height).toBeLessThanOrEqual(A3.height - 48)
    expect(box.height).toBeLessThan(640)
    expect(box.width / box.height).toBeCloseTo(700 / 640, 5)
    const same = await floorPictureBox(await layoutSheet(base))
    expect(same.height).toBeGreaterThanOrEqual(box.height)
    expect(pageCount((await sheetPdf(plan, sheet)).pdf)).toBeGreaterThan(0)
  }, 60_000)

  it('cuts a note taller than a page by its lines, each kept once and in order', async () => {
    const base = checkSheet()
    const words = Array.from({ length: 8000 }, (_, i) => `w${i}`)
    const note = words.join(' ')
    const sheet = { ...base, pages: base.pages.map((p, i) => (i === 0 ? { ...p, notes: [note] } : p)) }
    const laid = await layoutSheet(sheet)
    const plain = (await layoutSheet(base)).pages.length
    expect(laid.pages.length).toBeGreaterThan(plain + 1)
    const shown = laid.pages.slice(0, laid.pages.length - (plain - 1)).flatMap((p) => p.notes)
    expect(shown.length).toBeGreaterThan(2)
    expect(shown.join(' ')).toBe(note)
    expect(pageCount((await sheetPdf(plan, sheet)).pdf)).toBe(laid.pages.length)
  }, 60_000)

  it('splits a long table between rows, repeating its heading and ending with the total', async () => {
    const base = checkSheet()
    const rows = Array.from({ length: 60 }, (_, i) => ({ name: `Room ${i}`, detail: 'bedroom', area: `${i}.0` }))
    const total = { name: 'Net area', detail: null, area: '999.0' }
    const table = { heading: 'Rooms / m²', rows, total, note: 'Net area note.' }
    const sheet = { ...base, pages: base.pages.map((p, i) => (i === 1 ? { ...p, table } : p)) }
    const laid = await layoutSheet(sheet)
    const parts = laid.pages.filter((p) => p.title?.startsWith(base.pages[1]!.title!)).map((p) => p.table).filter((t) => t !== null)
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.flatMap((t) => t.rows)).toEqual(rows)
    expect(parts.flatMap((t) => (t.total ? [t.total] : []))).toEqual([total])
    expect(parts[parts.length - 1]!.total).toEqual(total)
    for (const part of parts) expect(part.heading).toBe('Rooms / m²')
    expect(parts.slice(1).every((t) => t.rows.length > 0 || t.total || t.note)).toBe(true)
  }, 60_000)

  it('never leaves the total row alone on a page, whatever the number of rows', async () => {
    const base = checkSheet()
    const total = { name: 'Net area', detail: null, area: '999.0' }
    const alone: number[] = []
    for (let n = 20; n <= 140; n++) {
      const rows = Array.from({ length: n }, (_, i) => ({ name: `Room ${i}`, detail: 'bedroom', area: `${i}.0` }))
      const table = { heading: 'Rooms / m²', rows, total, note: 'Net area note.' }
      const sheet = { ...base, pages: base.pages.map((p, i) => (i === 1 ? { ...p, table } : p)) }
      const parts = (await layoutSheet(sheet)).pages.filter((p) => p.floor === base.pages[1]!.floor).map((p) => p.table)
      if (parts.some((t) => t?.total && t.rows.length === 0)) alone.push(n)
      expect(parts.flatMap((t) => t?.rows ?? [])).toEqual(rows)
    }
    expect(alone).toEqual([])
  }, 120_000)

  it('puts the general guidance label in the footer of every page', async () => {
    for (const sheet of [crowded().sheet, clientSheet()]) {
      for (const page of (await layoutSheet(sheet)).pages) expect(page.footer.label).toBe(GENERAL_GUIDANCE_LABEL)
    }
  }, 30_000)
})
