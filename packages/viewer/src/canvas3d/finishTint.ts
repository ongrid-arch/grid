/**
 * VEW-78: the colour a finish is drawn in, read from the words of its name, and the look of glass
 * and of the sky behind it.
 *
 * A finish is the person's own name ("Oak boards", "Sage green paint"), never a colour, so its
 * tint is read from the words in it: a colour word wins ("Grey porcelain tile" is grey), then a
 * material word ("Oak boards" is oak). A name with neither has no tint, and the part keeps the
 * model's own colour. The tints are muted, as the model's own colours are: they say what a
 * surface is, not its exact colour.
 */

/** Colour words, tried first. Each is a word of the name, any case. */
const COLOUR_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(white|snow)\b/, '#f2f0eb'],
  [/\b(cream|ivory|magnolia)\b/, '#eee4cf'],
  [/\b(beige|sand|taupe)\b/, '#d8cab0'],
  [/\b(charcoal|anthracite|graphite)\b/, '#5a5b5e'],
  [/\b(black|ebony)\b/, '#3b3b3a'],
  [/\b(grey|gray|silver)\b/, '#b8b7b2'],
  [/\b(navy)\b/, '#44546e'],
  [/\b(blue|teal)\b/, '#8ea7bf'],
  [/\b(sage)\b/, '#b3bea2'],
  [/\b(olive)\b/, '#8b8a5e'],
  [/\b(green)\b/, '#98ad8c'],
  [/\b(terracotta|rust)\b/, '#bd7655'],
  [/\b(red|burgundy)\b/, '#ab5a4b'],
  [/\b(pink|blush)\b/, '#ddb4ab'],
  [/\b(ochre|mustard)\b/, '#c69f4d'],
  [/\b(yellow)\b/, '#e0cd82'],
  [/\b(brown|chocolate)\b/, '#87684b']
]

/** Material words, tried when no colour word is in the name. */
const MATERIAL_WORDS: readonly (readonly [RegExp, string])[] = [
  [/\b(walnut|mahogany|teak)\b/, '#7d5839'],
  [/\b(oak)\b/, '#c8a06d'],
  [/\b(timber|wood|wooden|parquet|boards?|planks?|engineered|ash|beech|birch|maple|pine|bamboo|herringbone)\b/, '#c5a273'],
  [/\b(cork)\b/, '#b88f60'],
  [/\b(terrazzo)\b/, '#d7d1c3'],
  [/\b(marble)\b/, '#e6e2db'],
  [/\b(slate)\b/, '#6c7074'],
  [/\b(granite|basalt)\b/, '#8c8985'],
  [/\b(limestone|stone|travertine|sandstone|flagstones?)\b/, '#d5cbb4'],
  [/\b(concrete|screed|cement|microcement)\b/, '#b2afa9'],
  [/\b(brick|bricks|brickwork)\b/, '#a65f47'],
  [/\b(tiles?|tiled|tiling|porcelain|ceramic|mosaic)\b/, '#d8d5ce'],
  [/\b(carpet|carpeted|rug)\b/, '#a7a093'],
  [/\b(vinyl|lino|linoleum|rubber|lvt)\b/, '#c3beb3'],
  [/\b(resin|epoxy)\b/, '#c8c6c1'],
  [/\b(steel|metal|aluminium|aluminum|zinc)\b/, '#a4a7aa'],
  [/\b(render|rendered|plaster|plastered|skim)\b/, '#ebe5db'],
  [/\b(paint|painted|emulsion)\b/, '#eeebe5']
]

/** The tint a finish named `name` is drawn in, as `#rrggbb`, or null when its name says none. */
export function finishTint(name: string | null | undefined): string | null {
  if (name === null || name === undefined) return null
  const words = name.toLowerCase()
  for (const [pattern, tint] of COLOUR_WORDS) if (pattern.test(words)) return tint
  for (const [pattern, tint] of MATERIAL_WORDS) if (pattern.test(words)) return tint
  return null
}

/** Glass as the 3D view draws it, in every theme: a pale green-blue that lets most of what is behind show. */
export const GLASS = Object.freeze({ color: '#bfd8dc', opacity: 0.28 })

/**
 * The sky a still taken in a room shows through its glass (`RasteriseOptions.sky`): its colour
 * overhead and at the horizon, and the ground's below it.
 */
export const SKY = Object.freeze({ zenith: '#9fbfdc', horizon: '#e4ecf1', ground: '#b5ae9c' })
