/**
 * SHT-12: the words of a client sheet are the author's, and they print above Grid's own figures,
 * where a claim reads as Grid's. Grid refuses the ones it never says itself (MSG-3's approval
 * words: complies, passes, approved, certified) and the access claims, "accessible" and its kin:
 * Grid measures doors, corridors and turning space and never says a room or a building is
 * accessible. A word inside quotation marks is somebody else's and is left alone, as elsewhere.
 */
import { approvalWords } from '@ongrid/rules'
import { SheetWordsRefused, parseSheetWords, type SheetWords } from '@ongrid/floorplan/types/sheet'

/** Each access claim, as a pattern over lower-case text. Spanish and English. */
const ACCESS_CLAIMS: readonly RegExp[] = [
  /\b(?:in)?accessib(?:le|ility)\b/,
  /\bwheelchair[- ](?:friendly|ready|safe|usable)\b/,
  /\bbarrier[- ]free\b/,
  /\bada\b/,
  /\b(?:meets?|satisf(?:y|ies)|conforms? to|follows?) (?:the |an? |all )?(?:\w+ ){0,3}(?:standards?|requirements?)\b/,
  /(?<!\p{L})(?:sin barreras|accesible|accesibilidad)(?!\p{L})/u,
]

const QUOTED = /"(?:[^"\\]|\\.)*"|“[^”]*”/g

function accessClaims(text: string): string[] {
  const lower = text.replace(QUOTED, ' ').toLowerCase()
  const found: string[] = []
  for (const pattern of ACCESS_CLAIMS) {
    for (const hit of lower.matchAll(new RegExp(pattern.source, pattern.flags.includes('u') ? 'gu' : 'g'))) if (!found.includes(hit[0])) found.push(hit[0])
  }
  return found
}

/** The claims in each text of the words, by the field's name. */
export function sheetClaims(words: SheetWords): { field: string; found: string[] }[] {
  const texts: [string, string][] = []
  if (words.headline !== undefined) texts.push(['headline', words.headline])
  words.intro?.forEach((p, i) => texts.push([`intro[${i}]`, p]))
  // A floor is named by its place in the words, never by its key, which may be anything.
  Object.values(words.floors ?? {}).forEach((paragraphs, f) => paragraphs.forEach((p, i) => texts.push([`floors (key ${f + 1}) paragraph ${i + 1}`, p])))
  return texts
    .map(([field, text]) => ({ field, found: [...approvalWords(text), ...accessClaims(text)] }))
    .filter((t) => t.found.length > 0)
}

/** Throws `SheetWordsRefused` naming the first field with a claim and the words, never the text around them. */
export function refuseClaims(words: SheetWords): void {
  const [first] = sheetClaims(words)
  if (first === undefined) return
  const said = first.found.map((word) => `"${word}"`).join(', ')
  throw new SheetWordsRefused(
    `${first.field} says ${said}, which Grid does not print as a claim about the building. Grid measures the plan and never says it is accessible, complies or is approved; write what the plan holds (its rooms, sizes and layout) and leave the claim to the people who check it. Words in quotation marks are left alone`,
  )
}

/** The words, checked for their shape and limits (`parseSheetWords`) and then for claims. */
export function parseSheetWordsChecked(raw: unknown, floorIds: readonly string[]): SheetWords {
  const words = parseSheetWords(raw, floorIds)
  refuseClaims(words)
  return words
}
