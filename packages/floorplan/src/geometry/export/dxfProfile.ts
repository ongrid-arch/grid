/**
 * HND-1: the DXF's export profile. Which layer each of Grid's categories goes on, and the pen of
 * that layer: its colour, line weight and line type, and the scale the file's paper layout and
 * text sizes are for.
 *
 * Grid has one neutral profile, `NEUTRAL_DXF_PROFILE`: its own `GRID-` layer names, every line in
 * the drawing's foreground colour, and line weights from the technical look's pens at 1:100. An
 * office that wants its own names and pens writes them once, in a profile file (the command reads
 * `dxf-layers.json` in the project folder); `readDxfProfile` reads it. A category the file leaves
 * out keeps its neutral pen, so a profile may name only the layers the office cares about.
 *
 * The categories, the names and the pens are Grid's own, in its own words: no office's or
 * standard's layer naming is copied here. Pure: a value in, a profile or the problems out.
 */

/** Grid's categories, in the order the layer table lists them. */
export const DXF_CATEGORIES = [
  'walls-outside',
  'walls-inside',
  'dividing-lines',
  'wall-fill',
  // CNT-10: a plan with phases puts each wall on its phase's layer, and a new wall's fill apart.
  'walls-existing',
  'walls-new',
  'walls-demolished',
  'wall-fill-new',
  'rooms',
  'room-tags',
  'doors',
  'door-swings',
  'windows',
  'openings',
  'openings-above',
  // CNT-10: an opening to be demolished, as a dashed outline where it stood.
  'openings-demolished',
  'fixtures',
  // CNT-55: an item hung above the plan's cut (a wall unit, a hood), dashed.
  'fixtures-above',
  // CNT-16: the columns, cut through as the walls are, and the structural grid's lines and names.
  'columns',
  'structural-grid',
  'dimensions',
  'notes',
  'sketch',
  'facts',
  'left-out',
  'label',
  'sheet',
  'viewport'
] as const

export type DxfCategory = (typeof DXF_CATEGORIES)[number]

/** The line types a profile may name, as the file spells them, and their names in the DXF. */
export const DXF_LINETYPES = { continuous: 'Continuous', dashed: 'DASHED', dotted: 'DOTTED', 'dash-dot': 'DASHDOT' } as const

export type DxfLinetype = keyof typeof DXF_LINETYPES

/**
 * The line weights a DXF can hold, in millimetres: the format stores one of these, in hundredths
 * of a millimetre, and nothing in between.
 */
export const DXF_LINEWEIGHTS = [0, 0.05, 0.09, 0.13, 0.15, 0.18, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 0.53, 0.6, 0.7, 0.8, 0.9, 1, 1.06, 1.2, 1.4, 1.58, 2, 2.11] as const

/** One layer's name and pen. `colour` is a drawing colour number, 1 to 255 (7 is the foreground). */
export interface DxfPen {
  readonly layer: string
  readonly colour: number
  /** Millimetres on paper, one of `DXF_LINEWEIGHTS`. */
  readonly lineweight: number
  readonly linetype: DxfLinetype
}

export interface DxfProfile {
  /** The scale the paper layout shows the plan at, and the text is sized for: 100 is 1:100. */
  readonly scale: number
  readonly pens: Readonly<Record<DxfCategory, DxfPen>>
}

const pen = (layer: string, lineweight: number, colour = 7, linetype: DxfLinetype = 'continuous'): DxfPen => ({ layer, colour, lineweight, linetype })

/**
 * Grid's neutral profile. The layer names that were in the file before HND-1 are kept, so a tool
 * keyed to them still finds them. The sketch's layer is a prefix: each category goes on
 * `GRID-SKETCH-` and its name. The viewport's layer is not plotted.
 */
export const NEUTRAL_DXF_PROFILE: DxfProfile = {
  scale: 100,
  pens: {
    'walls-outside': pen('GRID-WALLS-EXTERIOR', 0.5),
    'walls-inside': pen('GRID-WALLS-INTERIOR', 0.35),
    'dividing-lines': pen('GRID-WALLS-VIRTUAL', 0.18, 7, 'dashed'),
    'wall-fill': pen('GRID-WALLS-FILL', 0, 8),
    'walls-existing': pen('GRID-WALLS-EXISTING', 0.35),
    'walls-new': pen('GRID-WALLS-NEW', 0.5),
    'walls-demolished': pen('GRID-WALLS-DEMOLISHED', 0.25, 7, 'dashed'),
    'wall-fill-new': pen('GRID-WALLS-FILL-NEW', 0),
    rooms: pen('GRID-ROOMS', 0.13),
    'room-tags': pen('GRID-ROOM-TAGS', 0.18),
    doors: pen('GRID-DOORS', 0.25),
    'door-swings': pen('GRID-DOOR-SWINGS', 0.13),
    windows: pen('GRID-WINDOWS', 0.18),
    openings: pen('GRID-OPENINGS', 0.18),
    // CNT-14: what a door's or window's symbol shows above the cut or hidden in the wall, dashed,
    // in the technical look's pen for what lies above (fine, 0.18 at 1:100).
    'openings-above': pen('GRID-OPENINGS-ABOVE', 0.18, 7, 'dashed'),
    'openings-demolished': pen('GRID-OPENINGS-DEMOLISHED', 0.18, 7, 'dashed'),
    fixtures: pen('GRID-FIXTURES', 0.13),
    // CNT-55: what hangs above the cut, dashed, as what an opening's symbol shows above it.
    'fixtures-above': pen('GRID-FIXTURES-ABOVE', 0.13, 7, 'dashed'),
    // CNT-16: a column with the outside walls' pen, filled; the grid's lines a fine chain line.
    columns: pen('GRID-COLUMNS', 0.5),
    'structural-grid': pen('GRID-STRUCTURAL-GRID', 0.13, 7, 'dash-dot'),
    dimensions: pen('GRID-DIMENSIONS', 0.13),
    notes: pen('GRID-NOTES', 0.18),
    sketch: pen('GRID-SKETCH', 0.18),
    facts: pen('GRID-FACTS', 0.13),
    'left-out': pen('GRID-LEFT-OUT', 0.18),
    label: pen('GRID-LABELS', 0.18),
    sheet: pen('GRID-SHEET', 0.35),
    viewport: pen('GRID-VIEWPORT', 0.13)
  }
}

/** The scales a profile may state: 1:1 to 1:1000. */
export const DXF_SCALE_RANGE = { min: 1, max: 1000 } as const

/** The longest layer name a profile may give, in characters. */
export const DXF_LAYER_NAME_MAX = 255

/** What a layer name may not hold: the characters CAD programs keep for themselves. */
const LAYER_NAME_REFUSED = /[<>/\\":;?*|=,`\p{Cc}\p{Cf}]/u

/** One reading of a profile: the profile, or every problem with it, each naming the part. */
export type DxfProfileReading = { readonly profile: DxfProfile } | { readonly problems: readonly string[] }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * A profile as a file states it: `{ "scale": 100, "layers": { "<category>": { "layer", "colour",
 * "lineweight", "linetype" } } }`, every part optional. Every unknown key and every value out of
 * range is a problem, named by where it is (`layers.doors.colour`) and what it may be; the text
 * of the value is never repeated.
 */
export function readDxfProfile(value: unknown): DxfProfileReading {
  const problems: string[] = []
  if (!isRecord(value)) return { problems: ['the profile must be an object with "scale" and "layers"'] }
  for (const key of Object.keys(value)) if (key !== 'scale' && key !== 'layers') problems.push(`"${keyName(key)}" is not a part of a profile: use "scale" and "layers"`)

  let scale = NEUTRAL_DXF_PROFILE.scale
  if (value['scale'] !== undefined) {
    const given = value['scale']
    if (typeof given !== 'number' || !Number.isInteger(given) || given < DXF_SCALE_RANGE.min || given > DXF_SCALE_RANGE.max) {
      problems.push(`scale must be a whole number from ${DXF_SCALE_RANGE.min} to ${DXF_SCALE_RANGE.max} (100 is 1:100)`)
    } else scale = given
  }

  const pens: Record<DxfCategory, DxfPen> = { ...NEUTRAL_DXF_PROFILE.pens }
  const layers = value['layers']
  if (layers !== undefined && !isRecord(layers)) problems.push('layers must be an object, one entry per category')
  if (isRecord(layers)) {
    for (const [category, given] of Object.entries(layers)) {
      if (!(DXF_CATEGORIES as readonly string[]).includes(category)) {
        problems.push(`layers."${keyName(category)}" is not one of Grid's categories: ${DXF_CATEGORIES.join(', ')}`)
        continue
      }
      const read = readPen(`layers.${category}`, given, NEUTRAL_DXF_PROFILE.pens[category as DxfCategory], problems)
      if (read !== null) pens[category as DxfCategory] = read
    }
  }

  // One layer, one pen: two categories may share a layer only when they draw it alike.
  const byLayer = new Map<string, DxfCategory>()
  for (const category of DXF_CATEGORIES) {
    const name = pens[category].layer.toUpperCase()
    const first = byLayer.get(name)
    if (first === undefined) byLayer.set(name, category)
    else if (!samePen(pens[first], pens[category])) problems.push(`layers.${first} and layers.${category} name the same layer with different pens: give them one pen, or a layer each`)
  }
  return problems.length > 0 ? { problems } : { profile: { scale, pens } }
}

/** A key as a problem names it: cut short, and without what could break the line. */
function keyName(key: string): string {
  const plain = key.replace(/[\p{Cc}\p{Cf}"\\]/gu, '?')
  return plain.length > 40 ? `${plain.slice(0, 40)}…` : plain
}

const samePen = (a: DxfPen, b: DxfPen): boolean => a.colour === b.colour && a.lineweight === b.lineweight && a.linetype === b.linetype

function readPen(where: string, given: unknown, neutral: DxfPen, problems: string[]): DxfPen | null {
  if (!isRecord(given)) {
    problems.push(`${where} must be an object with "layer", "colour", "lineweight" or "linetype"`)
    return null
  }
  const before = problems.length
  for (const key of Object.keys(given)) {
    if (!['layer', 'colour', 'lineweight', 'linetype'].includes(key)) problems.push(`${where}."${keyName(key)}" is not a part of a layer: use "layer", "colour", "lineweight" or "linetype"`)
  }
  const { layer = neutral.layer, colour = neutral.colour, lineweight = neutral.lineweight, linetype = neutral.linetype } = given
  if (typeof layer !== 'string' || layer.trim() !== layer || layer.length === 0 || [...layer].length > DXF_LAYER_NAME_MAX || LAYER_NAME_REFUSED.test(layer)) {
    problems.push(`${where}.layer must be a name of 1 to ${DXF_LAYER_NAME_MAX} characters, with no space at either end and none of < > / \\ " : ; ? * | = , \` or a control character`)
  }
  if (typeof colour !== 'number' || !Number.isInteger(colour) || colour < 1 || colour > 255) problems.push(`${where}.colour must be a whole number from 1 to 255 (7 is the drawing's foreground)`)
  if (typeof lineweight !== 'number' || !(DXF_LINEWEIGHTS as readonly number[]).includes(lineweight)) problems.push(`${where}.lineweight must be one of these millimetres: ${DXF_LINEWEIGHTS.join(', ')}`)
  if (typeof linetype !== 'string' || !Object.hasOwn(DXF_LINETYPES, linetype)) problems.push(`${where}.linetype must be one of ${Object.keys(DXF_LINETYPES).join(', ')}`)
  return problems.length > before ? null : { layer: layer as string, colour: colour as number, lineweight: lineweight as number, linetype: linetype as DxfLinetype }
}
