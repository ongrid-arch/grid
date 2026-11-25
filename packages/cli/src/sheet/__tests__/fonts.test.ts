import { resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import { describe, expect, it, vi } from 'vitest'
import { GlobalFonts } from '@napi-rs/canvas'
import * as canvas from '@napi-rs/canvas'
import { ARABIC_FONT, HEBREW_FONT } from '../../draw/scriptFonts'
import { CJK_FONTS, fontsFolder, sheetFont, SANS, SERIF, registerSheetFonts } from '../fonts'

describe('the sheet fonts (VEW-7)', () => {
  it('registers a serif and a sans under Grid\'s own names', () => {
    registerSheetFonts(canvas)
    const families = GlobalFonts.families.map((f) => f.family)
    expect(families).toContain(SERIF)
    expect(families).toContain(SANS)
  })
  it('registers each of the four sheet faces and the two script faces once', async () => {
    // A fresh copy of the module, so its first call registers; the canvas counts every face.
    vi.resetModules()
    const fresh = await import('../fonts')
    const faces: string[] = []
    const counting = {
      GlobalFonts: {
        registerFromPath: (file: string, family?: string) => {
          const key = canvas.GlobalFonts.registerFromPath(file, family)
          // QAR-4: the folder ends in `\` on Windows, so the name is taken by either separator.
          if (key !== null) faces.push(file.split(/[\\/]/).pop()!)
          return key
        },
      },
    } as unknown as typeof canvas
    fresh.registerSheetFonts(counting)
    fresh.registerSheetFonts(counting)
    fresh.registerSheetFonts(counting)
    expect(faces.sort()).toEqual([
      'NotoSansArabic.woff2',
      'NotoSansHebrew-Regular.woff2',
      'SourceSans3-Regular.otf',
      'SourceSans3-Semibold.otf',
      'SourceSerif4-Regular.otf',
      'SourceSerif4-Semibold.otf',
    ])
  })
  it('reads the fonts from the install\'s own folder only', () => {
    const at = (file: string) => pathToFileURL(resolve(file)).href
    const folder = (dir: string) => `${resolve(dir)}${sep}`
    expect(fontsFolder(at('/x/node_modules/ongrid/grid.mjs'))).toBe(folder('/x/node_modules/ongrid/fonts'))
    expect(fontsFolder(at('/x/node_modules/ongrid/chunks/sheet-AB12.mjs'))).toBe(folder('/x/node_modules/ongrid/fonts'))
    expect(fontsFolder(at('/x/server/grid.mjs'))).toBe(folder('/x/server/fonts'))
    expect(fontsFolder(at('/x/packages/cli/src/sheet/fonts.ts'))).toBe(folder('/x/packages/cli/fonts'))
  })

  it('sets each sheet font with the system\'s fonts after it, for what the bundled ones lack', () => {
    for (const family of [SANS, SERIF]) {
      const font = sheetFont(family, 12, 600)
      expect(font.startsWith(`600 12px "${family}", `)).toBe(true)
      expect(font.endsWith(', sans-serif')).toBe(true)
    }
  })
  const cjk = CJK_FONTS.some((family) => GlobalFonts.has(family))
  it.skipIf(!cjk)('draws a CJK name in a system font, not as the box (skipped when the machine has no CJK system font)', () => {
    registerSheetFonts(canvas)
    const ctx = canvas.createCanvas(10, 10).getContext('2d')
    ctx.font = sheetFont(SANS, 40)
    const box = ctx.measureText('\uE000').width
    const name = ctx.measureText('家').width
    expect(name).not.toBeCloseTo(box, 1)
    // An ideograph is one em wide in every CJK face.
    expect(name).toBeCloseTo(40, 0)
  })

  it('draws an Arabic and a Hebrew name in Grid\'s bundled fonts, not as the box, on any machine (VEW-18)', () => {
    registerSheetFonts(canvas)
    expect(GlobalFonts.has(ARABIC_FONT)).toBe(true)
    expect(GlobalFonts.has(HEBREW_FONT)).toBe(true)
    const ctx = canvas.createCanvas(10, 10).getContext('2d')
    ctx.font = sheetFont(SANS, 40)
    const box = ctx.measureText('\uE000').width
    expect(ctx.measureText('مطبخ').width).not.toBeCloseTo(box, 1)
    expect(ctx.measureText('מטבח').width).not.toBeCloseTo(box, 1)
    // The font that draws them is the bundled one: its own widths, not another font's.
    ctx.font = `40px "${ARABIC_FONT}"`
    const own = ctx.measureText('مطبخ').width
    ctx.font = sheetFont(SANS, 40)
    expect(ctx.measureText('مطبخ').width).toBeCloseTo(own, 3)
  })
})
