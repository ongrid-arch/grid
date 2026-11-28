/**
 * VEW-7: a sheet drawn as an A3 landscape PDF, with Skia's PDF writer through
 * `@napi-rs/canvas` (MIT). Text stays vector; the floor drawings (PNG at 4x, about 288 dpi) and
 * the 3D picture are images.
 *
 * `pages.ts` decides what is on each page; this file decides what fits. `layoutSheet` measures
 * every block with the real fonts and moves whatever does not fit above the footer onto
 * continuation pages, so no text runs off a page. Every picture comes from `drawPlan` or
 * `drawStill`, never drawn here.
 */
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { decimalFor, DEFAULT_LANGUAGE, say, type Language } from '@ongrid/floorplan/messages'
import type { SKRSContext2D } from '@napi-rs/canvas'
import { loadCanvas } from '../draw/canvas'
import { drawPlan } from '../draw/drawPlan'
import { drawStill } from '../draw/drawStill'
import { trueCodePoints } from './pdfText'
import { SANS, SERIF, registerSheetFonts, sheetFont } from './fonts'
import { PLAN_BOX, planPictureOptions, SHEET_LOOK, type Sheet, type SheetPage, type SheetPicture, type SheetRow, type SheetTable } from './pages'
import { DRAWING_PIXEL_PT, DRAWINGS_BOX, keptFacadePicture, keptSectionPicture, pointsPerMetre, SECTION_NAME_PT, type PlacedDrawing } from './sideDrawings'
import { scaleBarMetres } from './drawingSheet'
import { pictureToPng } from '../draw/drawPlan'

export const A3 = { width: 1191, height: 842 } as const
const MARGIN = 48
const INK = '#2f2f2b'
const QUIET = '#77746c'
const PAPER = '#f8f7f3'
const RULE = '#d9d6ce'
const TEXT_WIDTH = A3.width - 2 * MARGIN
const SIDE_X = MARGIN + PLAN_BOX.width + 40
const SIDE_WIDTH = A3.width - SIDE_X - MARGIN
/** Nothing is drawn below this: the footer's rule is at `A3.height - MARGIN`. */
const LIMIT = A3.height - MARGIN - 6
const COVER_IMAGE = { min: 220, max: 430 } as const
const AREA_COLUMN = 64
const PLAN_SCALE = 4
/** SHT-23: an elevations or sections page's title block, its width and its rows' heights, and the scale bar's row, in points. */
const BLOCK = { width: 330, rows: [34, 28, 30] } as const
const BLOCK_HEIGHT = BLOCK.rows.reduce((a, b) => a + b, 0)

type Ctx = SKRSContext2D
type Canvas = typeof import('@napi-rs/canvas')

function font(ctx: Ctx, family: string, size: number, weight: 400 | 600 = 400): void {
  ctx.font = sheetFont(family, size, weight)
  // No ligatures: a ligature glyph has no text behind it in the PDF, so "Lift" would copy as
  // "Li". The canvas has no ligature switch of its own; this rendering hint turns them off.
  ctx.textRendering = 'optimizeSpeed'
}

/** Breaks a word that is wider than a line, by characters. */
function breakWord(ctx: Ctx, word: string, width: number): string[] {
  const parts: string[] = []
  let part = ''
  for (const char of word) {
    if (part && ctx.measureText(part + char).width > width) { parts.push(part); part = char } else part += char
  }
  if (part) parts.push(part)
  return parts
}

/**
 * Lines already wrapped, by font, width and text. `layoutSheet` measures a block that flows
 * over pages again on every page it reaches, and draws it once more; without this a long note
 * was wrapped word by word many times over. The wrapping is greedy, so the lines after a cut
 * are the rest of the lines before it (`rememberLines`).
 */
const WRAPPED = new Map<string, readonly string[]>()
const WRAPPED_MAX = 2000

function wrapKey(ctx: Ctx, text: string, width: number): string {
  return `${ctx.font}\u0000${width}\u0000${text}`
}

function rememberLines(ctx: Ctx, text: string, width: number, lines: readonly string[]): void {
  if (WRAPPED.size >= WRAPPED_MAX) WRAPPED.clear()
  WRAPPED.set(wrapKey(ctx, text, width), lines)
}

/** Wraps text to a width, by the current font's own measure. */
export function wrapLines(ctx: Ctx, text: string, width: number): string[] {
  const known = WRAPPED.get(wrapKey(ctx, text, width))
  if (known) return [...known]
  const lines = wrapWords(ctx, text, width)
  rememberLines(ctx, text, width, lines)
  return [...lines]
}

function wrapWords(ctx: Ctx, text: string, width: number): string[] {
  // SHT-25: a text that fits whole is its one line, after one measure. Every word of it then fits
  // and so does every line the greedy wrap below would try, so its lines are the same. A row of a
  // long table is most often one line, and was measured word by word on every page it reached.
  if (text !== '' && !text.startsWith(' ') && ctx.measureText(text).width <= width) return [text]
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const parts = ctx.measureText(word).width > width ? breakWord(ctx, word, width) : [word]
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

/** The words of a block that flows: what `layoutSheet` moves from page to page. */
type Piece =
  | { readonly type: 'heading'; readonly text: string }
  | { readonly type: 'row' | 'total'; readonly row: SheetRow }
  | { readonly type: 'tableNote' | 'paragraph' | 'note'; readonly text: string }

function piecesOf(page: SheetPage): Piece[] {
  const pieces: Piece[] = []
  const table = page.table
  if (table) {
    if (table.rows.length > 0 || table.total) pieces.push({ type: 'heading', text: table.heading })
    for (const row of table.rows) pieces.push({ type: 'row', row })
    if (table.total) pieces.push({ type: 'total', row: table.total })
    if (table.note !== null) pieces.push({ type: 'tableNote', text: table.note })
  }
  // On the cover, notes about the figures keep first use of the space below them.
  const notes = page.notes.map((text): Piece => ({ type: 'note', text }))
  if (page.kind === 'cover') pieces.push(...notes)
  for (const text of page.paragraphs) pieces.push({ type: 'paragraph', text })
  if (page.kind !== 'cover') pieces.push(...notes)
  return pieces
}

function rowText(row: SheetRow): string {
  return row.detail ? `${row.name} · ${row.detail}` : row.name
}

function setPieceFont(ctx: Ctx, piece: Piece): void {
  switch (piece.type) {
    case 'heading': case 'tableNote': case 'note': font(ctx, SANS, 9); break
    case 'row': font(ctx, SANS, 11); break
    case 'total': font(ctx, SANS, 11, 600); break
    case 'paragraph': font(ctx, SANS, 12); break
  }
}

/** Lines of a piece at a column width, and the height it takes, trailing space included. */
function measurePiece(ctx: Ctx, piece: Piece, width: number): { lines: string[]; height: number } {
  setPieceFont(ctx, piece)
  switch (piece.type) {
    case 'heading': return { lines: [piece.text.toUpperCase()], height: 20 }
    case 'row': case 'total': {
      const lines = wrapLines(ctx, rowText(piece.row), width - AREA_COLUMN)
      return { lines, height: (lines.length - 1) * 14 + 24 }
    }
    case 'tableNote': { const lines = wrapLines(ctx, piece.text, width); return { lines, height: 6 + lines.length * 12 + 12 } }
    case 'paragraph': { const lines = wrapLines(ctx, piece.text, width); return { lines, height: lines.length * 17 + 8 } }
    case 'note': { const lines = wrapLines(ctx, piece.text, width); return { lines, height: lines.length * 12 + 6 } }
  }
}

/** Draws (or only measures) the page's top lines and title. Returns the y below them. */
function header(ctx: Ctx, page: SheetPage, draw: boolean): number {
  font(ctx, SANS, 10)
  ctx.fillStyle = QUIET
  let y = MARGIN
  const top = wrapLines(ctx, page.topLine.toUpperCase(), TEXT_WIDTH)
  for (const [i, line] of top.entries()) { if (draw) ctx.fillText(line, MARGIN, y + i * 13) }
  y += (top.length - 1) * 13 + 40
  if (page.title) {
    font(ctx, SERIF, 34); ctx.fillStyle = INK
    const lines = wrapLines(ctx, page.title, TEXT_WIDTH)
    if (draw) lines.forEach((line, i) => ctx.fillText(line, MARGIN, y + i * 40))
    y += (lines.length - 1) * 40 + 22
  }
  if (page.subtitle) {
    font(ctx, SANS, 13); ctx.fillStyle = QUIET
    const lines = wrapLines(ctx, page.subtitle, TEXT_WIDTH)
    if (draw) lines.forEach((line, i) => ctx.fillText(line, MARGIN, y + i * 17))
    y += (lines.length - 1) * 17 + 16
  }
  return y
}

/** Where the flowing blocks start, and in which column, for a page with the given head. */
function region(ctx: Ctx, page: SheetPage, imageHeight: number): { x: number; width: number; y: number } {
  const head = header(ctx, page, false)
  if (page.kind === 'cover' && page.picture) return { x: MARGIN, width: TEXT_WIDTH, y: head + 16 + imageHeight + 100 }
  if (page.picture?.kind === 'plan') return { x: SIDE_X, width: SIDE_WIDTH, y: head + 20 }
  // SHT-23: under the drawings and their scale bar, beside the title block.
  if (page.picture?.kind === 'drawings') return { x: MARGIN, width: TEXT_WIDTH - BLOCK.width - 24, y: head + 10 + DRAWINGS_BOX.height + 18 }
  return { x: MARGIN, width: TEXT_WIDTH, y: head + (page.figures.length > 0 ? 90 : 20) }
}

function continuation(page: SheetPage, pieces: readonly Piece[], base: SheetPage): SheetPage {
  const rows = pieces.filter((p) => p.type === 'row').map((p) => (p as { row: SheetRow }).row)
  const total = pieces.find((p) => p.type === 'total')
  const note = pieces.find((p) => p.type === 'tableNote')
  const table: SheetTable | null = base.table && (rows.length > 0 || total || note)
    ? { heading: base.table.heading, rows, total: total ? (total as { row: SheetRow }).row : null, note: note ? (note as { text: string }).text : null }
    : null
  const texts = (type: Piece['type']): string[] => pieces.filter((p) => p.type === type).map((p) => (p as { text: string }).text)
  return { ...page, table, paragraphs: texts('paragraph'), notes: texts('note') }
}

/**
 * Splits each page's flowing blocks at the footer. A page that overflows keeps what fits and
 * hands the rest to continuation pages (same kind and top line, title "(continued)", no
 * picture or figures); a table is cut between rows only. Footers are numbered across the result.
 */
export async function layoutSheet(sheet: Sheet): Promise<Sheet> {
  const canvas = await loadCanvas()
  registerSheetFonts(canvas)
  const ctx = canvas.createCanvas(10, 10).getContext('2d')
  const out: SheetPage[] = []
  for (const page of sheet.pages) {
    const all = piecesOf(page)
    let queue = all
    let current = page
    let first = true
    for (;;) {
      const area = region(ctx, current, first && page.picture ? COVER_IMAGE.min : 0)
      const placed: Piece[] = []
      let y = area.y
      let i = 0
      while (i < queue.length) {
        let piece = queue[i]!
        const carried: Piece[] = []
        if (placed.length === 0 && (piece.type === 'row' || piece.type === 'total')) {
          const heading = all.find((p) => p.type === 'heading')
          if (heading) carried.push(heading)
        }
        const group = [...carried, piece]
        // A heading is never left alone at the foot of a page.
        if (piece.type === 'heading' && queue[i + 1]) group.push(queue[i + 1]!)
        const height = group.reduce((sum, p) => sum + measurePiece(ctx, p, area.width).height, 0)
        if (y + height > LIMIT && placed.length > 0) {
          // The total row never goes on alone: the last row goes with it, and its heading too
          // when that would be left alone. Not when that empties a continuation page.
          const keep = placed.length - (placed.at(-2)?.type === 'heading' ? 2 : 1)
          if (piece.type === 'total' && placed.at(-1)?.type === 'row' && (keep > 0 || first)) {
            // Last first, so each one taken back from the queue is the one before `i`.
            for (const back of placed.splice(keep).reverse()) if (queue[i - 1] === back) i--
          }
          break
        }
        if (y + height > LIMIT && (piece.type === 'paragraph' || piece.type === 'note' || piece.type === 'tableNote')) {
          // Taller than an empty page: cut it by wrapped lines, so the rest goes on.
          const { lines } = measurePiece(ctx, piece, area.width)
          const step = piece.type === 'paragraph' ? 17 : 12
          const fit = Math.max(1, Math.floor((LIMIT - y - (piece.type === 'tableNote' ? 6 : 0)) / step) - 1)
          if (fit < lines.length) {
            piece = { type: piece.type, text: lines.slice(0, fit).join(' ') }
            const rest = { type: piece.type, text: lines.slice(fit).join(' ') }
            // measurePiece left this piece's font set: both halves wrap to the lines they came from.
            rememberLines(ctx, piece.text, area.width, lines.slice(0, fit))
            rememberLines(ctx, rest.text, area.width, lines.slice(fit))
            queue = [...queue.slice(0, i), piece, rest, ...queue.slice(i + 1)]
          }
        }
        if (carried.length > 0) placed.push(...carried)
        placed.push(piece)
        y += measurePiece(ctx, piece, area.width).height + carried.reduce((sum, p) => sum + measurePiece(ctx, p, area.width).height, 0)
        i++
      }
      const rest = queue.slice(i)
      out.push(continuation(current, placed, page))
      if (rest.length === 0) break
      queue = rest
      first = false
      current = {
        ...current,
        kind: page.kind,
        title: page.title === null ? null : say(sheet.language ?? DEFAULT_LANGUAGE, 'sheet.continued', { title: page.title }),
        subtitle: null, figures: [], picture: null, paragraphs: [], notes: [], table: null,
      }
    }
  }
  const pages = out.map((page, i): SheetPage => ({ ...page, footer: { ...page.footer, page: i + 1, pages: out.length } }))
  return { ...sheet, pages }
}

function footer(ctx: Ctx, page: SheetPage): void {
  const y = A3.height - MARGIN + 18
  ctx.strokeStyle = RULE
  ctx.beginPath(); ctx.moveTo(MARGIN, y - 18); ctx.lineTo(A3.width - MARGIN, y - 18); ctx.stroke()
  font(ctx, SANS, 9)
  ctx.fillStyle = QUIET
  ctx.textAlign = 'left'
  ctx.fillText(page.footer.label, MARGIN, y)
  ctx.textAlign = 'right'
  ctx.fillText(`${String(page.footer.page).padStart(2, '0')} / ${String(page.footer.pages).padStart(2, '0')}  ·  ${page.footer.date}`, A3.width - MARGIN, y)
  ctx.textAlign = 'left'
}

function flow(ctx: Ctx, pieces: readonly Piece[], x: number, width: number, top: number): void {
  let y = top
  for (const piece of pieces) {
    const { lines, height } = measurePiece(ctx, piece, width)
    ctx.fillStyle = piece.type === 'row' || piece.type === 'total' || piece.type === 'paragraph' ? INK : QUIET
    switch (piece.type) {
      case 'heading': ctx.fillText(lines[0]!, x, y); break
      case 'row': case 'total':
        lines.forEach((line, i) => ctx.fillText(line, x, y + i * 14))
        ctx.textAlign = 'right'; ctx.fillText(piece.row.area, x + width, y); ctx.textAlign = 'left'
        ctx.strokeStyle = RULE
        ctx.beginPath(); ctx.moveTo(x, y + (lines.length - 1) * 14 + 8); ctx.lineTo(x + width, y + (lines.length - 1) * 14 + 8); ctx.stroke()
        break
      case 'tableNote': lines.forEach((line, i) => ctx.fillText(line, x, y + 6 + i * 12)); break
      case 'paragraph': lines.forEach((line, i) => ctx.fillText(line, x, y + i * 17)); break
      case 'note': lines.forEach((line, i) => ctx.fillText(line, x, y + i * 12)); break
    }
    y += height
  }
}

/**
 * Where every floor picture goes: one top, and one size for all, so every floor keeps one scale.
 * The top is set by the tallest header of any floor page (a long title wraps), and the picture
 * shrinks, aspect kept, when what is left above the footer is less than `PLAN_BOX.height`.
 */
export async function floorPictureBox(sheet: Sheet): Promise<{ top: number; width: number; height: number }> {
  const canvas = await loadCanvas()
  registerSheetFonts(canvas)
  const ctx = canvas.createCanvas(10, 10).getContext('2d')
  const heads = sheet.pages.filter((p) => p.picture?.kind === 'plan').map((p) => header(ctx, p, false))
  const top = Math.max(0, ...heads) + 10
  const scale = Math.min(1, (LIMIT - top) / PLAN_BOX.height)
  return { top, width: PLAN_BOX.width * scale, height: PLAN_BOX.height * scale }
}

type Picture = Awaited<ReturnType<Canvas['loadImage']>>

/**
 * SHT-25: a page's pictures, each drawn once by `make` and kept by its name, so a page drawn again
 * for its preview places the same image and draws nothing twice.
 */
type Pictures = (name: string, make: () => Promise<Uint8Array>) => Promise<Picture>

function picturesOnce(canvas: Canvas): Pictures {
  const made = new Map<string, Promise<Picture>>()
  return (name, make) => {
    let found = made.get(name)
    if (found === undefined) {
      found = make().then((png) => canvas.loadImage(Buffer.from(png)))
      made.set(name, found)
    }
    return found
  }
}

async function drawFloorPicture(ctx: Ctx, plan: FloorPlan, page: SheetPage, box: { top: number; width: number; height: number }, language: Language, pictures: Pictures): Promise<void> {
  if (page.picture?.kind !== 'plan') return
  // The frame is in plan metres and the box has one size on every floor: one scale throughout.
  // The picture is `grow` times the box, cut to it; its PNG has `PLAN_SCALE` pixels per point.
  const { options, grow } = planPictureOptions(page.picture, language)
  // A box shrunk to fit under a tall header prints the plan smaller: its scale's N grows.
  const paperScale = (options.paperScale! * PLAN_BOX.width) / box.width
  // SHT-7: the page has its own title and the plan its own box, so the band under the drawing
  // for the plan's title and key is left off; the notes and the sketch are drawn. The page
  // carries the label in its footer, so the picture does not (MSG-3).
  const image = await pictures('plan', () => drawPlan(plan, { format: 'png', scale: (PLAN_SCALE * PLAN_BOX.width * grow) / options.width!, ...options, paperScale, show: { title: false, key: false }, label: false }))
  const w = box.width * grow
  const h = box.height * grow
  ctx.save()
  ctx.beginPath(); ctx.rect(MARGIN, box.top, box.width, box.height); ctx.clip()
  ctx.drawImage(image, MARGIN - (w - box.width) / 2, box.top - (h - box.height) / 2, w, h)
  ctx.restore()
}

async function drawCover(ctx: Ctx, plan: FloorPlan, page: SheetPage, flowing: readonly Piece[], pictures: Pictures): Promise<void> {
  const top = header(ctx, page, true) + 16
  const room = flowing.reduce((sum, p) => sum + measurePiece(ctx, p, TEXT_WIDTH).height, 0)
  const height = Math.max(COVER_IMAGE.min, Math.min(COVER_IMAGE.max, LIMIT - top - 100 - room))
  const still = await pictures(`model ${height}`, () => drawStill(plan, { width: Math.round(TEXT_WIDTH), height, scale: 2, label: false }))
  ctx.drawImage(still, MARGIN, top, TEXT_WIDTH, height)
  const y = top + height + 50
  const column = TEXT_WIDTH / Math.max(1, page.figures.length)
  page.figures.forEach((figure, i) => {
    font(ctx, SERIF, 30); ctx.fillStyle = INK; ctx.fillText(figure.value, MARGIN + i * column, y)
    font(ctx, SANS, 11); ctx.fillStyle = QUIET; ctx.fillText(figure.label, MARGIN + i * column, y + 18)
  })
  flow(ctx, flowing, MARGIN, TEXT_WIDTH, y + 50)
}

function drawSummaryFigures(ctx: Ctx, page: SheetPage, y: number): void {
  page.figures.forEach((figure, i) => {
    font(ctx, SERIF, 26); ctx.fillStyle = INK; ctx.fillText(figure.value, MARGIN + i * 200, y)
    font(ctx, SANS, 10); ctx.fillStyle = QUIET; ctx.fillText(figure.label, MARGIN + i * 200, y + 16)
  })
}

/**
 * SHT-23: an elevations or sections page's drawings, each the viewer's picture at the page's one
 * scale, as `sideDrawings` placed it in the box under the header; under them on the right, the
 * scale bar and the title block, the notes flowing beside them.
 */
async function drawSideDrawings(ctx: Ctx, plan: FloorPlan, picture: Extract<SheetPicture, { kind: 'drawings' }>, top: number, language: Language, pictures: Pictures): Promise<void> {
  const asked = language === DEFAULT_LANGUAGE ? {} : { language }
  const pictureOf = (drawing: PlacedDrawing) => drawing.of === 'facade'
    ? keptFacadePicture(plan, { side: drawing.side, width: drawing.width, height: drawing.height, look: SHEET_LOOK, paperScale: picture.scale, ...asked })
    : keptSectionPicture(plan, drawing.cut.line, { width: drawing.width, height: drawing.height, look: SHEET_LOOK, paperScale: picture.scale, label: drawing.cut.label, dimensions: false, ...asked })
  for (const [i, drawing] of picture.drawings.entries()) {
    // A section without the band under it: its name is written under it here, what it took in the notes.
    const image = await pictures(`drawing ${i}`, () => {
      const drawn = pictureOf(drawing)
      return pictureToPng(drawing.of === 'section' ? { ...drawn, key: null } : drawn, { scale: PLAN_SCALE * DRAWING_PIXEL_PT, label: false })
    })
    const height = drawing.of === 'section' ? drawing.drawn.height - SECTION_NAME_PT : drawing.drawn.height
    ctx.drawImage(image, MARGIN + drawing.x, top + drawing.y, drawing.drawn.width, height)
    if (drawing.of === 'section') {
      font(ctx, SANS, 10, 600); ctx.fillStyle = INK
      ctx.fillText(say(language, 'drawing.section.name', { label: drawing.cut.label }), MARGIN + drawing.x, top + drawing.y + height + 12)
    }
  }
  // The scale bar: 1, 2 or 5 times a power of ten metres, in parts, as on a drawing at a scale.
  const metres = scaleBarMetres(picture.scale)
  const parts = Number(String(metres)[0]) === 2 ? 4 : 5
  const length = metres * pointsPerMetre(picture.scale)
  const x0 = A3.width - MARGIN - BLOCK.width
  const y = top + DRAWINGS_BOX.height + 8
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.5
  for (let i = 0; i < parts; i++) {
    ctx.fillStyle = i % 2 === 0 ? INK : PAPER
    ctx.fillRect(x0 + (i * length) / parts, y, length / parts, 5)
    ctx.strokeRect(x0 + (i * length) / parts, y, length / parts, 5)
  }
  font(ctx, SANS, 8)
  ctx.fillStyle = INK
  for (let i = 0; i <= parts; i++) {
    const point = String(Math.round(((metres / parts) * i) * 1000) / 1000)
    const value = decimalFor(language) === 'comma' ? point.replace('.', ',') : point
    const shown = i === parts ? say(language, 'sheet.scaleBar.metres', { length: value }) : value
    ctx.textAlign = i === parts ? 'left' : 'center'
    ctx.fillText(shown, x0 + (i * length) / parts - (i === parts ? 2 : 0), y + 15)
  }
  ctx.textAlign = 'left'
  drawTitleBlock(ctx, picture.block)
}

/** SHT-23: the title block at the foot of the page's right side: project, drawing, then scale, date and status. */
function drawTitleBlock(ctx: Ctx, block: Extract<SheetPicture, { kind: 'drawings' }>['block']): void {
  const x = A3.width - MARGIN - BLOCK.width
  const y = LIMIT - BLOCK_HEIGHT
  const [first, second] = BLOCK.rows
  ctx.strokeStyle = INK
  ctx.lineWidth = 0.8
  ctx.strokeRect(x, y, BLOCK.width, BLOCK_HEIGHT)
  ctx.lineWidth = 0.4
  const rule = (x1: number, y1: number, x2: number, y2: number): void => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke() }
  rule(x, y + first, x + BLOCK.width, y + first)
  rule(x, y + first + second, x + BLOCK.width, y + first + second)
  const third3 = BLOCK.width / 3
  rule(x + third3, y + first + second, x + third3, y + BLOCK_HEIGHT)
  rule(x + 2 * third3, y + first + second, x + 2 * third3, y + BLOCK_HEIGHT)
  const cell = (label: string, value: string, cx: number, cy: number, width: number, size: number, weight: 400 | 600 = 400): void => {
    font(ctx, SANS, 7); ctx.fillStyle = QUIET; ctx.fillText(label.toUpperCase(), cx + 5, cy + 10)
    font(ctx, SANS, size, weight); ctx.fillStyle = INK
    ctx.fillText(wrapLines(ctx, value, width - 10)[0] ?? '', cx + 5, cy + 12 + size)
  }
  cell(block.labels.project, block.project, x, y, BLOCK.width, 13, 600)
  cell(block.labels.drawing, block.drawing, x, y + first, BLOCK.width, 11)
  const row = y + first + second
  cell(block.labels.scale, block.scale, x, row, third3, 9)
  cell(block.labels.date, block.date, x + third3, row, third3, 9)
  cell(block.labels.status, block.status, x + 2 * third3, row, third3, 9)
}

async function drawPage(ctx: Ctx, plan: FloorPlan, page: SheetPage, box: { top: number; width: number; height: number }, language: Language, pictures: Pictures): Promise<void> {
  const flowing = piecesOf(page)
  if (page.kind === 'cover' && page.picture) return drawCover(ctx, plan, page, flowing, pictures)
  const head = header(ctx, page, true)
  const at = region(ctx, page, 0)
  if (page.picture?.kind === 'plan') await drawFloorPicture(ctx, plan, page, box, language, pictures)
  else if (page.picture?.kind === 'drawings') await drawSideDrawings(ctx, plan, page.picture, head + 10, language, pictures)
  else if (page.figures.length > 0) drawSummaryFigures(ctx, page, head + 30)
  flow(ctx, flowing, at.x, at.width, at.y)
}

/** VEW-62: a page's preview is this wide, in pixels. */
const PREVIEW_WIDTH = 600

/**
 * The PDF, and the laid-out sheet whose pages match the PDF's one for one. With `previews`, each
 * page is also drawn small as a PNG, for an agent to look at before the sheet is handed over.
 */
export async function sheetPdf(plan: FloorPlan, sheet: Sheet, options: { readonly previews?: boolean; readonly onPage?: (done: number, total: number) => void } = {}): Promise<{ pdf: Uint8Array; sheet: Sheet; previews: Uint8Array[] }> {
  const laid = await layoutSheet(sheet)
  const box = await floorPictureBox(laid)
  const canvas = await loadCanvas()
  const doc = new canvas.PDFDocument({ title: laid.name, creator: 'Grid', producer: 'Grid' })
  const previews: Uint8Array[] = []
  const k = PREVIEW_WIDTH / A3.width
  for (const [n, page] of laid.pages.entries()) {
    const pictures = picturesOnce(canvas)
    const ctx = doc.beginPage(A3.width, A3.height) as Ctx
    ctx.fillStyle = PAPER
    ctx.fillRect(0, 0, A3.width, A3.height)
    await drawPage(ctx, plan, page, box, laid.language ?? DEFAULT_LANGUAGE, pictures)
    footer(ctx, page)
    doc.endPage()
    if (options.previews) {
      const small = canvas.createCanvas(PREVIEW_WIDTH, Math.round(A3.height * k))
      const pctx = small.getContext('2d') as Ctx
      pctx.scale(k, k)
      pctx.fillStyle = PAPER
      pctx.fillRect(0, 0, A3.width, A3.height)
      await drawPage(pctx, plan, page, box, laid.language ?? DEFAULT_LANGUAGE, pictures)
      footer(pctx, page)
      previews.push(new Uint8Array(await small.encode('png')))
    }
    options.onPage?.(n + 1, laid.pages.length)
  }
  return { pdf: trueCodePoints(new Uint8Array(doc.close())), sheet: laid, previews }
}
