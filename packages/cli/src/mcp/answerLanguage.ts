/**
 * MSG-34: every tool answers in one language: the call's `language`, else the plan's own
 * (`display.language`, set by `grid_set_plan`), else English.
 *
 * The server adds `language` beside a tool's own arguments, as it adds `whole` and `page`, unless
 * the tool has a `language` of its own (`grid_check`, `grid_view`, `grid_set_plan`…), which keeps
 * its meaning. The call's language is read once by the server and travels in the call's
 * `ToolContext`, never in the tool's arguments; `readPlan` records the display of the plan the
 * call reads, so a tool that says nothing of language still answers in the plan's.
 */
import { DEFAULT_LANGUAGE, LANGUAGES, loadLanguage, readLanguage, setPlanWords, type Language } from '@ongrid/floorplan/messages'
import type { ArgSpec, GridTool, ToolContext } from './toolkit'

export const LANGUAGE_ARG_NAME = 'language'

/** The language every tool takes beside its own arguments. */
export const ANSWER_LANGUAGE_ARG: ArgSpec = {
  type: 'string',
  maxLength: 35,
  description: `The language of the answer's own words, as a language tag (${LANGUAGES.join(', ')}, de, pt-BR); a region is its language. The plan's own display.language when left out, else en. Codes, ids and figures are the same in every language.`,
  examples: ['es'],
}

/** What a call learns of the plan it reads: its display, for the language and the decimal mark. */
export interface Spoken {
  display?: { readonly language?: Language | undefined; readonly words?: unknown; readonly decimal?: string | undefined } | undefined
}

/** `language`, for a tool that has none of its own. */
export function languageArgs(tool: Pick<GridTool, 'args'>): Readonly<Record<string, ArgSpec>> {
  return Object.hasOwn(tool.args, LANGUAGE_ARG_NAME) ? {} : { [LANGUAGE_ARG_NAME]: ANSWER_LANGUAGE_ARG }
}

/** Whether the server reads the call's `language` itself: the tool has none of its own. */
export function serverReadsLanguage(tool: Pick<GridTool, 'args'>): boolean {
  return !Object.hasOwn(tool.args, LANGUAGE_ARG_NAME)
}

/** The language a call asked for, or null when the word is no language tag. */
export function askedAnswerLanguage(value: unknown): Language | null | undefined {
  if (value === undefined) return undefined
  return readLanguage(value)
}

/** Every language Grid ships loaded, so a plan's own language can be said with no wait. */
export async function loadShipped(asked?: Language): Promise<void> {
  await Promise.all([...LANGUAGES, ...(asked === undefined ? [] : [asked])].map((language) => loadLanguage(language)))
}

/** Records the display of the plan a call reads (the first it reads). */
export function heardPlan(context: ToolContext, display: Spoken['display']): void {
  if (context.spoken !== undefined && context.spoken.display === undefined) context.spoken.display = display ?? {}
}

/**
 * The language a tool answers in: the call's, else the plan's (`plan`, or the plan the call
 * read), else English. The plan's own words for the language are handed to `say` (MSG-24).
 */
export function toolLanguage(context: ToolContext, plan?: { readonly display?: Spoken['display'] }): Language {
  const display = plan?.display ?? context.spoken?.display
  if (plan !== undefined) setPlanWords(plan.display?.words)
  return context.language ?? display?.language ?? DEFAULT_LANGUAGE
}
