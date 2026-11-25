import { describe, expect, it } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import { el, toSvg } from '@ongrid/viewer/src/picture/svgNode'
import { planToSvg } from '@ongrid/viewer/src/picture'
import { drawPlan } from '../drawPlan'
import { ARABIC_FONT, HEBREW_FONT, SCRIPT_FONTS, scriptRuns, withScriptFonts } from '../scriptFonts'
import { twoBedFlat } from './twoBedFlat'

/**
 * VEW-7: room names in scripts the picture's font lacks (CJK, Thai, Devanagari, emoji) draw as
 * their own glyphs in a PNG, not as the box. Skia's SVG text takes one font for a whole
 * element, so each such run gets a `<tspan>` in a system font that has it.
 */

function named(name: string) {
  const plan = twoBedFlat()
  return { ...plan, rooms: plan.rooms.map((room) => (room.id === 'kitchen' ? { ...room, name } : room)) }
}

describe('script runs', () => {
  it('splits a name where its script changes, keeping spaces and digits with Latin', () => {
    expect(scriptRuns('Kitchen 家 2')).toEqual([
      { script: null, text: 'Kitchen ' },
      { script: 'cjk', text: '家' },
      { script: null, text: ' 2' }
    ])
  })
  it('knows each script it gives a font, and keeps marks and joiners in their run', () => {
    expect(scriptRuns('台所')).toEqual([{ script: 'cjk', text: '台所' }])
    expect(scriptRuns('キッチン、')).toEqual([{ script: 'cjk', text: 'キッチン、' }])
    expect(scriptRuns('부엌')).toEqual([{ script: 'hangul', text: '부엌' }])
    expect(scriptRuns('ห้องครัว')).toEqual([{ script: 'thai', text: 'ห้องครัว' }])
    expect(scriptRuns('रसोई')).toEqual([{ script: 'devanagari', text: 'रसोई' }])
    expect(scriptRuns('مطبخ')).toEqual([{ script: 'arabic', text: 'مطبخ' }])
    expect(scriptRuns('מטבח')).toEqual([{ script: 'hebrew', text: 'מטבח' }])
    // Arabic with its marks and presentation forms stays one run.
    expect(scriptRuns('كَتَبَ ﻣﻄﺒﺦ')).toEqual([
      { script: 'arabic', text: 'كَتَبَ' },
      { script: null, text: ' ' },
      { script: 'arabic', text: 'ﻣﻄﺒﺦ' }
    ])
    expect(scriptRuns('👨‍👩‍👧 🏠️ 👍🏽 🇯🇵')).toEqual([
      { script: 'emoji', text: '👨‍👩‍👧' },
      { script: null, text: ' ' },
      { script: 'emoji', text: '🏠️' },
      { script: null, text: ' ' },
      { script: 'emoji', text: '👍🏽' },
      { script: null, text: ' ' },
      { script: 'emoji', text: '🇯🇵' }
    ])
  })
  it('leaves the scripts the picture font has as they are', () => {
    expect(scriptRuns('Salle à manger · 12.5 m²')).toEqual([{ script: null, text: 'Salle à manger · 12.5 m²' }])
    expect(scriptRuns('Кухня Κουζίνα')).toEqual([{ script: null, text: 'Кухня Κουζίνα' }])
    expect(scriptRuns('')).toEqual([])
  })
})

describe('withScriptFonts', () => {
  const installed = (family: string) => family === 'Hiragino Sans' || family === 'Thonburi'
  it('puts each run in a tspan of the first installed font for its script, inside text only', () => {
    const nodes = [
      el('g', { transform: 'scale(2)' }, [
        el('text', { 'font-family': 'Helvetica', dy: '4' }, ['Kitchen 家', el('tspan', {}, ['ครัว'])]),
        el('title', {}, ['家'])
      ])
    ]
    expect(toSvg(withScriptFonts(nodes, installed))).toBe(
      '<g transform="scale(2)"><text font-family="Helvetica" dy="4">Kitchen <tspan font-family="Hiragino Sans">家</tspan>' +
        '<tspan><tspan font-family="Thonburi">ครัว</tspan></tspan></text><title>家</title></g>'
    )
  })
  it('leaves a run as it is when no font for its script is installed', () => {
    const nodes = [el('text', {}, ['रसोई 家'])]
    expect(withScriptFonts(nodes, () => false)).toEqual(nodes)
  })
})

describe('Simplified Chinese names (VEW-21)', () => {
  const installed = (family: string) => family === 'Hiragino Sans' || family === 'Hiragino Sans GB'
  it('draws Han text with no kana in a Chinese face, not the Japanese one first', () => {
    const out = toSvg(withScriptFonts([el('text', {}, ['厅卫间储'])], installed))
    expect(out).toBe('<text><tspan font-family="Hiragino Sans GB">厅卫间储</tspan></text>')
  })
  it('keeps the Japanese face for a text with kana, kanji included', () => {
    expect(toSvg(withScriptFonts([el('text', {}, ['台所 キッチン'])], installed))).toBe(
      '<text><tspan font-family="Hiragino Sans">台所</tspan> <tspan font-family="Hiragino Sans">キッチン</tspan></text>'
    )
  })
  const png = async (name: string) => Buffer.from(await drawPlan(named(name), { format: 'png' }))
  const han = SCRIPT_FONTS.han.some((family) => GlobalFonts.has(family))
  it.skipIf(!han)('draws the characters as glyphs, not the box (skipped when the machine has no Chinese face)', async () => {
    const box = await png('')
    expect((await png('厅卫间储')).equals(box)).toBe(false)
    // Each character alone is a glyph too: none falls back to the box.
    for (const char of '厅卫间储') expect((await png(char)).equals(box)).toBe(false)
  })
})

describe('drawPlan with names in other scripts (VEW-7)', () => {
  it('keeps the SVG file as it was', async () => {
    const plan = named('台所')
    expect(await drawPlan(plan, { format: 'svg' })).toBe(planToSvg(plan))
  })

  const cjk = SCRIPT_FONTS.cjk.some((family) => GlobalFonts.has(family))
  it.skipIf(!cjk)('draws a Japanese room name as its glyphs, not the box (skipped when the machine has no CJK system font)', async () => {
    const png = async (name: string) => Buffer.from(await drawPlan(named(name), { format: 'png' }))
    // Two private-use characters both draw as the font's box: the same picture.
    const box = await png('')
    expect((await png('')).equals(box)).toBe(true)
    // A Japanese name in a real font draws something else.
    expect((await png('家')).equals(box)).toBe(false)
  })
})

describe('drawPlan with Arabic and Hebrew names (VEW-18)', () => {
  it('puts each in a tspan of Grid\'s own bundled font, first in its list', () => {
    expect(SCRIPT_FONTS.arabic[0]).toBe(ARABIC_FONT)
    expect(SCRIPT_FONTS.hebrew[0]).toBe(HEBREW_FONT)
    const installed = (family: string) => family === ARABIC_FONT || family === HEBREW_FONT
    const out = toSvg(withScriptFonts([el('text', {}, ['A مطبخ מטבח'])], installed))
    // Each run is drawn in the order it is seen (VEW-18): the Hebrew reversed, the Arabic in its forms.
    expect(out).toMatch(new RegExp(`<tspan font-family="${ARABIC_FONT}">[\\ufe70-\\ufefc]+</tspan>`))
    expect(out).toContain(`<tspan font-family="${HEBREW_FONT}">חבטמ</tspan>`)
  })

  const png = async (name: string) => Buffer.from(await drawPlan(named(name), { format: 'png' }))
  it('draws the same on a machine with no Arabic or Hebrew system font: from the bundled files', async () => {
    const box = await png('')
    const arabic = await png('مطبخ')
    const hebrew = await png('מטבח')
    expect(arabic.equals(box)).toBe(false)
    expect(hebrew.equals(box)).toBe(false)
    expect(arabic.equals(hebrew)).toBe(false)
    expect(GlobalFonts.has(ARABIC_FONT)).toBe(true)
    expect(GlobalFonts.has(HEBREW_FONT)).toBe(true)
  })
  it('keeps the SVG file as it was', async () => {
    const plan = named('مطبخ מטבח')
    expect(await drawPlan(plan, { format: 'svg' })).toBe(planToSvg(plan))
  })
})
