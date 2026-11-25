/**
 * `grid_words` (MSG-24, C32): Grid's printed words in the person's language, written by the agent.
 *
 * Grid ships its words in English and Spanish only. For any other language the agent, who already
 * speaks it, asks this tool for the keys an output prints for this plan (the drawing, the sheet,
 * the check, describe), each with its English wording and its placeholders, translates them, and
 * writes them back with the same tool into the plan's `display.words`. Every output then prints
 * them. The list is made by making the output and listening for the keys it says
 * (`listenForKeys`), so it holds only what that output prints for this plan.
 *
 * Writing changes the plan file's `display` only, never a wall, room or opening.
 */
import { en, isMessageKey, listenForKeys, ownWording, placeholders, readLanguage, WORD_MAX, wordProblem, type Language, type MessageKey, type WordProblem } from '@ongrid/floorplan/messages'
import { approvalWords } from '@ongrid/rules'
import { CanvasMissing } from '../draw/canvas'
import { PlanRefused } from '../command/plan'
import { UsageError } from '../command/options'
import { PathRefused, type Project } from '../fs/projectFiles'
import { FontsMissing } from '../sheet/fonts'
import { makeDrawing, makeSheet } from '../sheet/sheetFile'
import { SHEET_LAYOUTS } from '../sheet/pages'
import { READ_TOOLS } from './readTools'
import { asRefusal, listSchema, NULLABLE_STRING, NUMBER, objectSchema, PLAN_ARG, readArgs, readPlan, STRING, ToolRefusal, type GridTool, type ToolContext } from './toolkit'

export const WORDS_TOOL_NAME = 'grid_words'

/** The outputs whose words the tool lists. */
export const WORD_OUTPUTS = ['drawing', 'sheet', 'check', 'describe'] as const
type WordOutput = (typeof WORD_OUTPUTS)[number]

/** The most words one call writes: more than any output prints. */
const WORDS_MAX = 3_000
/** The most refused words a refusal names one by one. */
const REFUSED_SHOWN = 20

/** A sibling tool's own answer, made as the agent would ask for it, its refusals set aside. */
async function runTool(name: string, raw: Record<string, unknown>, context: ToolContext): Promise<void> {
  const tool = READ_TOOLS.find((one) => one.name === name)
  if (tool === undefined) return
  try {
    await tool.run(readArgs(tool, raw), context)
  } catch (error) {
    if (!setAside(error)) throw error
  }
}

/** A refusal of one picture or page: the keys said before it are kept, and the list goes on. */
function setAside(error: unknown): boolean {
  return error instanceof ToolRefusal || error instanceof PlanRefused || error instanceof UsageError || error instanceof CanvasMissing || error instanceof FontsMissing
}

/** Makes one output of the plan in the language, as the tools and the sheet make it. */
async function makeOutput(output: WordOutput, project: Project, file: string, plan: string | undefined, language: Language, context: ToolContext): Promise<void> {
  const asked = { ...(plan === undefined ? {} : { plan }), language }
  switch (output) {
    case 'drawing':
      await runTool('grid_view', { ...asked, kind: 'plan', look: 'working' }, context)
      await runTool('grid_view', { ...asked, kind: 'plan', look: 'technical' }, context)
      await runTool('grid_view', { ...asked, kind: 'facade', side: 'south' }, context)
      try {
        await makeDrawing(project, file, {}, null, language)
      } catch (error) {
        if (!setAside(error)) throw error
      }
      return
    case 'sheet':
      for (const layout of SHEET_LAYOUTS) {
        try {
          await makeSheet(project, file, layout, null, language)
        } catch (error) {
          if (!setAside(error)) throw error
        }
      }
      return
    case 'check':
      // The short answer and the whole one print some words of their own.
      for (const full of [false, true]) await runTool('grid_check', { ...asked, full }, context)
      return
    case 'describe':
      for (const length of ['line', 'rooms', 'walls', 'walk']) await runTool('grid_describe', { ...asked, length, for: 'person' }, context)
  }
}

/** One key an output prints, with its English, its placeholders and the language's word now. */
interface KeyRow {
  readonly key: MessageKey
  readonly english: string
  readonly placeholders: readonly string[]
  readonly word: string | null
  readonly from: 'plan' | 'grid' | null
}

function rowOf(language: Language, key: MessageKey): KeyRow {
  const own = ownWording(language, key)
  return { key, english: en[key], placeholders: placeholders(en[key]), word: own?.text ?? null, from: own?.from ?? null }
}

/** Why a word was refused, in one line for the agent. */
function refusedLine(key: string, problem: WordProblem | { readonly kind: 'approval'; readonly words: readonly string[] }): string {
  const named = isMessageKey(key) ? JSON.stringify(key) : 'a key'
  switch (problem.kind) {
    case 'unknown-key':
      return `${JSON.stringify(key.slice(0, 80))} is no key of Grid's: grid_words with output lists the keys.`
    case 'not-text':
      return `${named} takes its wording as text.`
    case 'text':
      return `${named}: the wording ${problem.problem}.`
    case 'placeholders': {
      const list = (names: readonly string[]): string => (names.length === 0 ? 'none' : names.map((n) => `{${n}}`).join(', '))
      return `${named} must hold the placeholders ${list(problem.needed)}, as the English does, not ${list(problem.found)}.`
    }
    case 'approval':
      return `${named} reads as a pass or an approval (${problem.words.join(', ')}): Grid never says a plan complies or is allowed.`
  }
}

/** Checks every word sent; refuses them all, naming each refused one, when one cannot be taken. */
function checkedWords(words: Readonly<Record<string, unknown>>): Record<MessageKey, string> {
  const refused: string[] = []
  const kept: Record<string, string> = {}
  for (const [key, text] of Object.entries(words)) {
    const problem = wordProblem(key, text)
    if (problem !== null) {
      refused.push(refusedLine(key, problem))
      continue
    }
    // MSG-3: no word Grid prints reads as a pass; the English is held to the same rule.
    const found = approvalWords((text as string).replace(/\{[A-Za-z][A-Za-z0-9]*\}/g, ' ')).filter((word) => !approvalWords(en[key as MessageKey]).includes(word))
    if (found.length > 0) refused.push(refusedLine(key, { kind: 'approval', words: found }))
    else kept[key] = text as string
  }
  if (refused.length > 0) {
    const more = refused.length > REFUSED_SHOWN ? [`and ${refused.length - REFUSED_SHOWN} more.`] : []
    throw new ToolRefusal([`No word was written: ${refused.length} of the ${Object.keys(words).length} sent cannot be taken. Send them all again with these put right.`, ...refused.slice(0, REFUSED_SHOWN), ...more].join('\n'))
  }
  return kept as Record<MessageKey, string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Writes the words (and the language and decimal mark, when asked) into the plan file's display, and nothing else. */
function writeWords(project: Project, file: string, language: Language, words: Record<MessageKey, string> | undefined, options: { readonly replace: boolean; readonly planLanguage: boolean; readonly decimal: string | undefined }): { written: string; total: number } {
  let raw: Record<string, unknown>
  try {
    const read = JSON.parse(project.readText(file).text) as unknown
    if (!isRecord(read)) throw new Error('not an object')
    raw = read
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`${file} could not be read again to write the words; nothing was written.`)
  }
  const display: Record<string, unknown> = isRecord(raw['display']) ? { ...raw['display'] } : {}
  const all: Record<string, unknown> = isRecord(display['words']) ? { ...display['words'] } : {}
  const before = options.replace || !isRecord(all[language]) ? {} : (all[language] as Record<string, unknown>)
  const mine = words === undefined ? before : { ...before, ...words }
  if (Object.keys(mine).length > 0) all[language] = mine
  else delete all[language]
  if (Object.keys(all).length > 0) display['words'] = all
  else delete display['words']
  if (options.planLanguage) display['language'] = language
  if (options.decimal !== undefined) display['decimal'] = options.decimal
  const next = { ...raw, display }
  if (Object.keys(display).length === 0) delete (next as Record<string, unknown>)['display']
  try {
    return { written: project.relative(project.writeFile(file, `${JSON.stringify(next, null, 2)}\n`)), total: Object.keys(mine).length }
  } catch (error) {
    if (error instanceof PathRefused) throw new ToolRefusal(error.message)
    throw new ToolRefusal(`Can't write ${JSON.stringify(file)}: ${String((error as Error).message).replace(/\s+/g, ' ')}`)
  }
}

const KEY_ROW = objectSchema({ key: STRING, english: STRING, placeholders: listSchema(STRING), word: NULLABLE_STRING, from: NULLABLE_STRING })

export const wordsTool: GridTool = {
  name: WORDS_TOOL_NAME,
  title: 'Grid\'s words in the person\'s language',
  hint: 'write-file',
  description:
    'Use this when the person wants the drawing, the sheet, the check or the description in a language Grid has no words of its own for (any but en and es), or a tool\'s answer says its words were in English. '
    + 'First call it with language and output (drawing, sheet, check or describe): it makes that output for this plan and lists only the keys it prints, each with its English wording, its placeholders and the word the language has now; it writes nothing. '
    + 'Translate each into the person\'s language yourself, keeping every placeholder such as {size} exactly as it is and adding none, and call it again with the same language and words, a map from each key to its wording. Grid checks every word: a key it does not have, a placeholder that differs from the English key\'s, a line break, or a word that reads as a pass or an approval is refused by name, and then no word is written. '
    + 'The words go into the plan file\'s display.words for that language and every output then prints them; a key with no word stays in English. plan_language=true also makes the language the plan\'s own, so every output is in it when no language is asked. '
    + 'The decimal mark is not a word: pass decimal (comma or point) to set the plan\'s. Room and floor names are the person\'s own words and never translated. Do not use for Spanish words Grid already has, for English (Grid\'s source, never replaced), to rename a room (grid_rename_room) or to change the building.',
  args: {
    plan: PLAN_ARG,
    language: { type: 'string', required: true, maxLength: 35, description: 'The person\'s language, as a language tag: de, fr, pt-BR, zh. A region is its language (pt-BR is pt). Not en.', examples: ['de', 'fr', 'pt-BR'] },
    output: { type: 'string', enum: WORD_OUTPUTS, description: 'The output whose words to list for this plan: drawing (the plan, facade and scaled drawing pictures), sheet (the PDF sheets), check (grid_check) or describe (grid_describe). With words, listed after they are written.', examples: ['drawing', 'check'] },
    words: {
      type: 'object',
      description: 'The words to write: each key, as output listed it, with its wording in the language and exactly the English key\'s placeholders. Merged with the words the plan has for the language unless replace is true.',
      examples: [{ 'drawing.picture': 'Grundriss mit {count} Räumen', 'join.and': ' und ' }],
      schema: { type: 'object', properties: {}, additionalProperties: { type: 'string', maxLength: WORD_MAX }, maxProperties: WORDS_MAX },
      read: (value) => {
        if (Object.keys(value as object).length > WORDS_MAX) throw new ToolRefusal(`words takes at most ${WORDS_MAX} keys in one call.`)
        return checkedWords(value as Record<string, unknown>)
      },
    },
    replace: { type: 'boolean', description: 'true to replace every word the plan has for the language with words (an empty words takes them all out). false when left out: the words sent are added and replace only the same keys.', examples: [true] },
    plan_language: { type: 'boolean', description: 'true to make the language the plan\'s own (display.language), so every drawing, sheet and check is in it when no language is asked. false when left out.', examples: [true] },
    decimal: { type: 'string', enum: ['point', 'comma'], description: 'The plan\'s decimal mark (display.decimal), point (2.40) or comma (2,40), for every language. Left as it is when left out.', examples: ['comma'] },
  },
  outputSchema: objectSchema({
    language: STRING,
    written: NULLABLE_STRING,
    wordsInPlan: NUMBER,
    output: NULLABLE_STRING,
    keys: listSchema(KEY_ROW),
    toWrite: NUMBER,
  }),
  async run(args, context) {
    const language = readLanguage(args['language'])
    if (language === null) throw new ToolRefusal(`language takes a language tag, such as de, fr or pt-BR: ${JSON.stringify(String(args['language']).slice(0, 32))} is none.`)
    if (language === 'en') throw new ToolRefusal('English is the language Grid\'s words are written in, and they are never replaced: pass the person\'s language.')
    const output = args['output'] as WordOutput | undefined
    const words = args['words'] as Record<MessageKey, string> | undefined
    const replace = args['replace'] === true
    const planLanguage = args['plan_language'] === true
    const decimal = args['decimal'] as string | undefined
    const writes = words !== undefined || planLanguage || decimal !== undefined || replace
    if (!writes && output === undefined) throw new ToolRefusal('Pass output (drawing, sheet, check or describe) to list the words it prints, or words to write them.')
    if (replace && words === undefined) throw new ToolRefusal('replace takes the words to put in place of the plan\'s: pass words, {} to take them all out.')
    const { project, file } = readPlan(context, args['plan'])
    const lines: string[] = []
    let written: string | null = null
    let total = 0
    try {
      if (writes) {
        const done = writeWords(project, file, language, words, { replace, planLanguage, decimal })
        written = done.written
        total = done.total
        const sent = words === undefined ? 0 : Object.keys(words).length
        lines.push(`Wrote ${sent} word${sent === 1 ? '' : 's'} in ${JSON.stringify(language)} into ${JSON.stringify(written)}, ${total} in all for the language; the building is as it was.`)
        if (planLanguage) lines.push(`${JSON.stringify(language)} is now the plan's own language: every output is in it when no language is asked.`)
        if (decimal !== undefined) lines.push(`The plan's decimal mark is now the ${decimal}.`)
      } else {
        // The words the plan has now, for the count, as the reader takes them.
        total = Object.keys(readPlan(context, args['plan']).loaded.plan.display?.words?.[language] ?? {}).length
      }
      let rows: KeyRow[] = []
      if (output !== undefined) {
        const { keys } = await listenForKeys(() => makeOutput(output, project, file, args['plan'] as string | undefined, language, context))
        rows = [...(keys.get(language) ?? [])].sort().map((key) => rowOf(language, key))
        const toWrite = rows.filter((row) => row.from === null)
        lines.push(`The ${output} of this plan prints ${rows.length} of Grid's keys in ${JSON.stringify(language)}: ${rows.length - toWrite.length} have a word, ${toWrite.length} are in English.`)
        if (toWrite.length > 0) {
          lines.push('Translate each into the person\'s language, keep every {placeholder} as it is, and pass them back as words with the same language:')
          for (const row of toWrite) lines.push(`${row.key}: ${JSON.stringify(row.english)}`)
        }
      }
      const toWrite = rows.filter((row) => row.from === null).length
      return { text: lines.join('\n'), data: { language, written, wordsInPlan: total, output: output ?? null, keys: rows, toWrite } }
    } catch (error) {
      throw asRefusal(error)
    }
  },
}

/**
 * MSG-24: the one line a tool's answer adds when some of Grid's words it printed in a language
 * had no word there and were said in English. Null when none was.
 */
export function wordsHint(keys: ReadonlyMap<Language, ReadonlySet<MessageKey>>, hasWord: (language: Language, key: MessageKey) => boolean): string | null {
  for (const [language, said] of keys) {
    const missing = [...said].filter((key) => !hasWord(language, key)).length
    if (missing === 0) continue
    return missing === said.size
      ? `Grid has no words in ${JSON.stringify(language)} for this plan, so its own words here are in English: grid_words with language ${JSON.stringify(language)} and an output lists them to translate, and writes yours into the plan.`
      : `${missing} of the ${said.size} words of Grid's here have no word in ${JSON.stringify(language)} and are in English: grid_words with language ${JSON.stringify(language)} and an output lists them.`
  }
  return null
}
