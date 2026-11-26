import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import { validatePlan } from '@ongrid/floorplan/geometry'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { SCRIPT_FONTS } from '../../draw/scriptFonts'
import { loadCanvas } from '../../draw/canvas'
import { registerSheetFonts, SANS, sheetFont } from '../fonts'
import { sheetPages } from '../pages'
import { sheetPdf } from '../pdf'
import { trueCodePoints, trueMap } from '../pdfText'
import { readPdf } from './readPdf'

const RADICALS = /[⺀-⿟豈-﫿]/
const han = SCRIPT_FONTS.han.some((family) => GlobalFonts.has(family)) || SCRIPT_FONTS.cjk.some((family) => GlobalFonts.has(family))

const cmapOf = (entries: string, kind = 'bfchar') => `begincmap\n1 begin${kind}\n${entries}\nend${kind}\nendcmap`

describe('the true code points of the sheet text (SHT-19)', () => {
  it('writes a radical as the ideograph it stands for, and leaves other entries as they are', () => {
    const fixed = trueMap(cmapOf('<7B> <2F29>\n<60> <2F45>\n<41> <0041>\n<42> <5C0F>'))
    expect(fixed).toContain('<7B> <5C0F>')
    expect(fixed).toContain('<60> <65B9>')
    expect(fixed).toContain('<41> <0041>')
    expect(fixed).toContain('<42> <5C0F>')
  })
  it('writes a compatibility ideograph as its unified one', () => {
    expect(trueMap(cmapOf('<01> <F900>'))).toContain('<01> <8C48>')
  })
  it('writes a range that starts at a radical as single entries', () => {
    const fixed = trueMap(cmapOf('<10> <11> <2F29>', 'bfrange'))
    expect(fixed).not.toContain('bfrange')
    expect(fixed).toContain('2 beginbfchar')
    expect(fixed).toContain('<10> <5C0F>')
  })
  it('returns a file it does not understand as it came', () => {
    const odd = new TextEncoder().encode('not a pdf')
    expect(trueCodePoints(odd)).toBe(odd)
  })

  it.skipIf(!han)('writes 小, 方 and 面 into the PDF text, not their radicals', async () => {
    const canvas = await loadCanvas()
    registerSheetFonts(canvas)
    const doc = new canvas.PDFDocument({})
    const ctx = doc.beginPage(400, 200) as unknown as import('@napi-rs/canvas').SKRSContext2D
    ctx.font = sheetFont(SANS, 20)
    ctx.fillText('小方面', 10, 50)
    doc.endPage()
    const raw = new Uint8Array(doc.close())
    expect(readPdf(raw).texts.map((t) => t.text).join('')).toMatch(RADICALS)
    const fixed = trueCodePoints(raw)
    expect(readPdf(fixed).texts.map((t) => t.text).join('')).toBe('小方面')
    expect(Buffer.from(fixed.subarray(0, 5)).toString('latin1')).toBe('%PDF-')
  }, 30_000)

  it.skipIf(!han)('searches and copies a Chinese client sheet as its own characters', async () => {
    const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures/two-floor-house.json'), 'utf8')))
    plan.name = '小方面之家'
    const loaded = { file: 'plan.json', plan, ...validatePlan(plan) }
    const sheet = sheetPages(loaded, { version: '1', name: '小方面之家' }, 'client', { name: 'plan', date: new Date('2026-11-21T12:00:00Z') })
    const { pdf } = await sheetPdf(plan, sheet)
    const text = readPdf(pdf).texts.map((t) => t.text).join(' ')
    expect(text).toContain('小方面之家')
    expect(RADICALS.test(text)).toBe(false)
  }, 60_000)
})
