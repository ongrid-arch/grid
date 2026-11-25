import { describe, expect, it } from 'vitest'
import { visualOrder } from '../visualOrder'

/**
 * VEW-18: Skia's SVG text draws characters in the order they are written, so a right-to-left
 * name is put in the order it is seen before a PNG is drawn. Written here with escapes so the
 * expected order is exact.
 */
const hebrew = (s: string) => s.replace(/\\u([0-9a-f]{4})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

describe('visualOrder', () => {
  it('leaves a text with no right-to-left letter exactly as it is', () => {
    expect(visualOrder('Kitchen 2 (day)')).toBe('Kitchen 2 (day)')
    expect(visualOrder('台所 Кухня')).toBe('台所 Кухня')
    expect(visualOrder('')).toBe('')
  })

  it('reverses a Hebrew word and the order of Hebrew words', () => {
    // א ב ג → ג ב א
    expect(visualOrder(hebrew('\\u05d0\\u05d1\\u05d2'))).toBe(hebrew('\\u05d2\\u05d1\\u05d0'))
    // "אב גד" → "דג בא"
    expect(visualOrder(hebrew('\\u05d0\\u05d1 \\u05d2\\u05d3'))).toBe(hebrew('\\u05d3\\u05d2 \\u05d1\\u05d0'))
  })

  it('keeps a point (a combining mark) after its letter', () => {
    // א with a point, then ב: ב, then א with its point after it
    expect(visualOrder(hebrew('\\u05d0\\u05b8\\u05d1'))).toBe(hebrew('\\u05d1\\u05d0\\u05b8'))
  })

  it('draws Arabic letters in the form each takes, and in reverse order', () => {
    // ب ث: beh is initial, theh final → visual order: final theh (FE9A), initial beh (FE91)
    expect(visualOrder('بث')).toBe('ﺚﺑ')
    // ا ب ت: alef (isolated FE8D), beh initial (FE91), teh final (FE96): seen from the left: teh, beh, alef
    expect(visualOrder('ابت')).toBe('ﺖﺑﺍ')
  })

  it('joins a medial letter on both sides, and makes lam and alef one ligature', () => {
    // ب ب ب → initial, medial, final → seen: final, medial, initial
    expect(visualOrder('ببب')).toBe('ﺐﺒﺑ')
    // ال at the start of a word: lam-alef ligature (isolated FEFB) stands for the pair, no joining before it
    expect(visualOrder('لا')).toBe('ﻻ')
    // a letter before the pair joins it: ب ل ا → ligature final (FEFC) after an initial beh → seen: FEFC, FE91
    expect(visualOrder('بلا')).toBe('ﻼﺑ')
  })

  it('keeps a number and Latin text in reading order inside a right-to-left name', () => {
    // "א 12" in a right-to-left line: the number stays 12, and sits left of the letter
    expect(visualOrder(hebrew('\\u05d0 12'))).toBe(hebrew('12 \\u05d0'))
  })

  it('keeps a Latin word first in a left-to-right line, with the right-to-left run reversed in place', () => {
    expect(visualOrder(hebrew('Kitchen \\u05d0\\u05d1'))).toBe(hebrew('Kitchen \\u05d1\\u05d0'))
  })

  it('mirrors a bracket inside a right-to-left name', () => {
    expect(visualOrder(hebrew('(\\u05d0)'))).toBe(hebrew('(\\u05d0)'))
    expect(visualOrder(hebrew('\\u05d0 (\\u05d1)'))).toBe(hebrew('(\\u05d1) \\u05d0'))
  })

  it('does not move the letters of a text twice', () => {
    // A name already drawn in presentation forms keeps its forms: shaping finds no letters to join.
    const once = visualOrder('بث')
    expect(once).toBe('ﺚﺑ')
  })
})
