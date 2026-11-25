/**
 * VEW-7: the words of a client sheet (`sheet.json`), written by the author, never by Grid.
 *
 * Every string follows the plan's own text rule (MSG-9): no line break, control character,
 * direction character or lone surrogate. One paragraph is one string. A refusal names the
 * field and the limit, never the text.
 *
 * A text is taken in its composed form (NFC), and its length is counted in characters (code
 * points) of that form: an emoji, or a letter written with a combining accent, is one
 * character, and the sheet prints the composed form. JSON Schema's `maxLength` counts code
 * points of the text as sent, so the schema a tool shows and this check agree for text already
 * in NFC; a decomposed text may pass here and not there.
 */
import { z } from 'zod'
import { NAME_MAX, quoted, UNSAFE_TEXT } from './planText'

export const SHEET_HEADLINE_MAX = 200
export const SHEET_PARAGRAPH_MAX = 1200
export const SHEET_PARAGRAPHS_MAX = 3

export interface SheetWords {
  readonly version: '1'
  readonly name?: string
  readonly headline?: string
  /** SHT-18: the title of a drawing at a scale, in its title block; Grid's own title when left out. */
  readonly drawing?: string
  readonly intro?: readonly string[]
  readonly floors?: Readonly<Record<string, readonly string[]>>
}

export class SheetWordsRefused extends Error {
  override readonly name = 'SheetWordsRefused'
}

/** A sheet text's length: the characters (code points) of its composed form. */
function textLength(text: string): number {
  return [...text.normalize('NFC')].length
}

function textProblem(where: string, value: unknown, max: number): string | null {
  if (typeof value !== 'string') return `${where} must be text`
  if (value.length === 0) return `${where} is empty`
  if (textLength(value) > max) return `${where} is longer than ${max} characters`
  if (UNSAFE_TEXT.test(value)) {
    return `${where} holds a character Grid does not take: a line break, a control or direction character, or half of a character pair`
  }
  return null
}

function paragraphsProblem(where: string, value: unknown): string | null {
  if (!Array.isArray(value)) return `${where} must be a list of paragraphs`
  if (value.length > SHEET_PARAGRAPHS_MAX) return `${where} has more than ${SHEET_PARAGRAPHS_MAX} paragraphs`
  for (let i = 0; i < value.length; i++) {
    const problem = textProblem(`${where}[${i}]`, value[i], SHEET_PARAGRAPH_MAX)
    if (problem) return problem
  }
  return null
}

const FIELDS = new Set(['version', 'name', 'headline', 'drawing', 'intro', 'floors'])
/** A key short and plain enough to print back; anything else is named without its text. */
const PLAIN_KEY = /^[A-Za-z0-9_.-]{1,64}$/

/**
 * Null when the words are fine; else one line naming the field and the limit. With `floorIds`
 * null only the shape and limits are checked: the caller does not know the plan's floors yet.
 */
export function sheetWordsProblem(raw: unknown, floorIds: readonly string[] | null): string | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return 'it must be a JSON object'
  const given = raw as Record<string, unknown>
  for (const key of Object.keys(given)) {
    if (!FIELDS.has(key)) return PLAIN_KEY.test(key) ? `${quoted(key)} is not a field of a sheet` : 'it holds a field a sheet does not have'
  }
  if (given['version'] !== '1') return 'version must be "1"'
  if ('name' in given) {
    const problem = textProblem('name', given['name'], NAME_MAX)
    if (problem) return problem
  }
  if ('headline' in given) {
    const problem = textProblem('headline', given['headline'], SHEET_HEADLINE_MAX)
    if (problem) return problem
  }
  if ('drawing' in given) {
    const problem = textProblem('drawing', given['drawing'], NAME_MAX)
    if (problem) return problem
  }
  if ('intro' in given) {
    const problem = paragraphsProblem('intro', given['intro'])
    if (problem) return problem
  }
  if ('floors' in given) {
    const floors = given['floors']
    if (typeof floors !== 'object' || floors === null || Array.isArray(floors)) return 'floors must be an object keyed by floor id'
    for (const [i, [id, paragraphs]] of Object.entries(floors).entries()) {
      if (floorIds !== null && !floorIds.includes(id)) {
        return PLAIN_KEY.test(id) ? `floors names ${quoted(id)}, which is not a floor of the plan` : 'floors names a floor the plan does not have'
      }
      // A key that is not plain may be anything the author or an agent wrote: it is named by its place.
      const problem = paragraphsProblem(PLAIN_KEY.test(id) ? `floors[${quoted(id)}]` : `floors (key ${i + 1})`, paragraphs)
      if (problem) return problem
    }
  }
  return null
}

/** The length limits of each sheet text, for `jsonSchemaOf`: zod keeps them inside a function. */
const TEXT_LIMITS = new WeakMap<z.ZodTypeAny, { readonly min: number; readonly max: number }>()

/** A sheet text: its composed form, of 1 to `max` characters counted as `textLength` counts. */
function sheetText(max: number): z.ZodTypeAny {
  const text = z
    .string()
    .transform((value) => value.normalize('NFC'))
    .superRefine((value, ctx) => {
      const length = [...value].length
      if (length < 1) ctx.addIssue({ code: z.ZodIssueCode.too_small, minimum: 1, type: 'string', inclusive: true })
      if (length > max) ctx.addIssue({ code: z.ZodIssueCode.too_big, maximum: max, type: 'string', inclusive: true })
    })
  TEXT_LIMITS.set(text, { min: 1, max })
  return text
}

const PARAGRAPHS = z.array(sheetText(SHEET_PARAGRAPH_MAX)).max(SHEET_PARAGRAPHS_MAX)

export const SheetWordsSchema = z
  .object({
    version: z.literal('1'),
    name: sheetText(NAME_MAX).optional(),
    headline: sheetText(SHEET_HEADLINE_MAX).optional(),
    drawing: sheetText(NAME_MAX).optional(),
    intro: PARAGRAPHS.optional(),
    floors: z.record(z.string(), PARAGRAPHS).optional(),
  })
  .strict()

/** The words of a sheet, or throws `SheetWordsRefused` naming the field and the limit. */
export function parseSheetWords(raw: unknown, floorIds: readonly string[]): SheetWords {
  const problem = sheetWordsProblem(raw, floorIds)
  if (problem !== null) throw new SheetWordsRefused(problem)
  return SheetWordsSchema.parse(raw) as SheetWords
}

type Json = Record<string, unknown>

/**
 * JSON Schema for the zod types the sheet schema uses: a strict object, a string with limits, a
 * sheet text, a literal, an array with a limit, a record, and optional fields. Any other zod type throws, so a
 * new kind of field fails a test instead of being left out of the schema a tool shows.
 */
export function jsonSchemaOf(schema: z.ZodTypeAny): Json {
  const def = schema._def as { typeName: string } & Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
  switch (def.typeName) {
    case 'ZodObject': {
      if (def.unknownKeys !== 'strict') throw new Error('jsonSchemaOf: only a strict object is handled')
      const shape = (schema as z.AnyZodObject).shape as Record<string, z.ZodTypeAny>
      const required = Object.entries(shape).filter(([, field]) => field._def.typeName !== 'ZodOptional').map(([key]) => key)
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(shape).map(([key, field]) => [key, jsonSchemaOf(field)])),
        ...(required.length > 0 ? { required } : {}),
        additionalProperties: false,
      }
    }
    case 'ZodOptional':
      return jsonSchemaOf(def.innerType)
    case 'ZodString': {
      const out: Json = { type: 'string' }
      for (const check of def.checks as { kind: string; value: number }[]) {
        if (check.kind === 'min') out['minLength'] = check.value
        else if (check.kind === 'max') out['maxLength'] = check.value
        else throw new Error(`jsonSchemaOf: a string check "${check.kind}" is not handled`)
      }
      return out
    }
    case 'ZodEffects': {
      // Only a sheet text: a string whose limits are kept beside it.
      const limits = TEXT_LIMITS.get(schema)
      if (!limits) throw new Error('jsonSchemaOf: a zod effect is handled only on a sheet text')
      return { type: 'string', minLength: limits.min, maxLength: limits.max }
    }
    case 'ZodLiteral':
      return { type: typeof def.value, const: def.value }
    case 'ZodArray':
      return {
        type: 'array',
        items: jsonSchemaOf(def.type),
        ...(def.maxLength ? { maxItems: def.maxLength.value } : {}),
        ...(def.minLength ? { minItems: def.minLength.value } : {}),
      }
    case 'ZodRecord':
      return { type: 'object', additionalProperties: jsonSchemaOf(def.valueType) }
    default:
      throw new Error(`jsonSchemaOf: the zod type ${def.typeName} is not handled`)
  }
}

/** The schema of a sheet file as JSON Schema, for a tool that takes the words as an argument. */
export function sheetWordsJsonSchema(): Json {
  return jsonSchemaOf(SheetWordsSchema)
}
