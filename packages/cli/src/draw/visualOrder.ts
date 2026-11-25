/**
 * VEW-18: a right-to-left text (Arabic, Hebrew) written the way Skia's SVG text draws it.
 *
 * Skia's SVG text draws a text's characters left to right in the order they are written, with no
 * reordering, so an Arabic or Hebrew name came out with its letters and words backwards, and an
 * Arabic one with its letters joined the wrong way round. A browser, and the canvas the sheet
 * draws with, reorder it themselves. So before a picture is rasterised, a text that holds such
 * letters is put in the order it is seen: its right-to-left stretches reversed, Arabic letters
 * turned into the form each takes where it stands (the presentation forms every Noto Sans Arabic
 * has), and the stretches of a right-to-left name in reverse order. It is the part of the Unicode
 * bidirectional rules a room name needs: letters, digits, spaces and brackets, one line. Only the
 * PNG gets this: the SVG file a person keeps is the picture as it is, and a browser reads it right.
 */

const RTL_ANY = /[\p{sc=Arabic}\p{sc=Hebrew}]/u
const CLUSTER = /\P{M}\p{M}*/gu

type Direction = 'ltr' | 'rtl'
type Class = 'R' | 'L' | 'N'

function classOf(cluster: string): Class {
  const base = cluster[0]!
  if (base === 'ـ' || (RTL_ANY.test(base) && /\p{L}/u.test(base))) return 'R'
  return /[\p{L}\p{N}]/u.test(base) ? 'L' : 'N'
}

const MIRROR: Readonly<Record<string, string>> = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«' }

/** Each Arabic letter's forms, isolated, final, then (for a letter that joins on) initial, medial. */
let forms: Map<string, readonly string[]> | null = null
/** What lam and each alef make together: isolated, final. */
let ligatures: Map<string, readonly string[]> | null = null

function build(): void {
  forms = new Map()
  ligatures = new Map()
  const found = new Map<string, string[]>()
  const range = (from: number, to: number) => {
    for (let code = from; code <= to; code++) {
      const letter = String.fromCodePoint(code)
      const base = letter.normalize('NFKC')
      if ([...base].length === 1 && base !== letter) found.set(base, [...(found.get(base) ?? []), letter])
    }
  }
  range(0xfb50, 0xfbff)
  range(0xfe80, 0xfef4)
  for (const [base, list] of found) if (list.length === 2 || list.length === 4) forms.set(base, list)
  for (let code = 0xfef5; code <= 0xfefc; code += 2) {
    const alef = [...String.fromCodePoint(code).normalize('NFKC')][1]!
    ligatures.set(alef, [String.fromCodePoint(code), String.fromCodePoint(code + 1)])
  }
}

function formsOf(base: string): readonly string[] | undefined {
  if (forms === null) build()
  return forms!.get(base)
}

/** True when the letter takes the previous letter's join (right-joining and dual-joining letters). */
function joinsBefore(cluster: string): boolean {
  const base = cluster[0]!
  return base === 'ـ' || formsOf(base) !== undefined
}
/** True when the letter joins the next one (dual-joining letters only). */
function joinsAfter(cluster: string): boolean {
  const base = cluster[0]!
  return base === 'ـ' || formsOf(base)?.length === 4
}

/** An Arabic stretch's letters in the form each takes where it stands, one cluster per entry. */
function shapeArabic(clusters: readonly string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]!
    const base = cluster[0]!
    const marks = cluster.slice(base.length)
    const before = i > 0 && joinsAfter(clusters[i - 1]!)
    const next = clusters[i + 1]
    const ligature = base === 'ل' && next !== undefined ? ligatures!.get(next[0]!) : undefined
    if (ligature !== undefined && next !== undefined) {
      // Lam with the alef after it, as one letter; the marks of both stay after it.
      out.push(ligature[before ? 1 : 0]! + marks + next.slice(next[0]!.length))
      i++
      continue
    }
    const own = formsOf(base)
    if (own === undefined) {
      out.push(cluster)
      continue
    }
    const after = next !== undefined && joinsBefore(next) && own.length === 4
    const form = own.length === 4 ? (before && after ? 3 : before ? 1 : after ? 2 : 0) : before ? 1 : 0
    out.push(own[form]! + marks)
  }
  return out
}

/** The text as it is seen from the left, for the text-anchor and the `x` the picture gives it. */
export function visualOrder(text: string): string {
  if (!RTL_ANY.test(text)) return text
  if (forms === null) build()
  const clusters = text.match(CLUSTER) ?? []
  const classes = clusters.map(classOf)
  const paragraph: Direction = classes.find((c) => c !== 'N') === 'R' ? 'rtl' : 'ltr'

  // A stretch of neutrals (spaces, punctuation) goes with the letters on both sides when they
  // agree, and with the line's own direction when they do not.
  const directions: Direction[] = classes.map((c) => (c === 'R' ? 'rtl' : c === 'L' ? 'ltr' : paragraph))
  for (let i = 0; i < classes.length; ) {
    if (classes[i] !== 'N') {
      i++
      continue
    }
    let end = i
    while (end < classes.length && classes[end] === 'N') end++
    const before = i > 0 ? directions[i - 1]! : paragraph
    const after = end < classes.length ? directions[end]! : paragraph
    if (before === after) for (let k = i; k < end; k++) directions[k] = before
    i = end
  }

  const segments: { direction: Direction; clusters: string[] }[] = []
  clusters.forEach((cluster, i) => {
    const direction = directions[i]!
    const last = segments[segments.length - 1]
    if (last?.direction === direction) last.clusters.push(cluster)
    else segments.push({ direction, clusters: [cluster] })
  })
  const seen = segments.map(({ direction, clusters: own }) => {
    if (direction === 'ltr') return own.join('')
    const mirrored = own.map((cluster) => MIRROR[cluster] ?? cluster)
    return shapeArabic(mirrored).reverse().join('')
  })
  return (paragraph === 'rtl' ? seen.reverse() : seen).join('')
}
