/**
 * CMD-44: the change log's, undo's and restore's words, by key, with named placeholders filled
 * as `say` fills them (`sayValue`: a name quoted, a number with the decimal point).
 *
 * They are kept here, not in `messages/en.ts`: one more block of keys there takes the message
 * key type past what the type checker compares (TS2859 across every package). They are in
 * English only for now, like the other tool answers not moved yet; moving them is the same
 * as for any sentence (`docs/languages.md`) once the key type is split.
 */
import { sayValue, type Value } from '@ongrid/floorplan/messages'

const WORDS = {
  'tool.history.field.changed': '{path}: {before} → {after}',
  'tool.history.field.added': '{path} added: {after}',
  'tool.history.field.removed': '{path} removed, was {before}',
  'tool.history.rolledOff': 'The plan at revision {revision} is in the change log, but its checkpoint has rolled off: only the latest are kept. Name a marker, a later revision or git instead.',
  'tool.history.noRevision': 'Grid keeps no version of the plan at revision {revision}: not the plan now, no checkpoint and no marker. grid_diff show=history lists the revisions the log has.',
  'tool.history.noLog': 'The plan has no change log yet, so there is no earlier version by date or by last: every change Grid makes from now on is kept in it.',
  'tool.history.noPlanThen': 'The change log starts at {first}, when the plan was first written, so there was no plan at {date}.',
  'tool.history.lastWrote': 'The last change in the log, {tool}, wrote the plan where there was none, so there is no plan before it.',
  'tool.history.badDate': '{date} is not a date Grid reads: write it as 2026-11-26 or 2026-11-26T10:00, UTC unless a zone such as +01:00 is given.',
  'tool.history.noMarkers': 'it has none',
  'tool.history.markers': 'it has {names}',
  'tool.history.unknown': 'The plan has no marker {name}: {there}. Nor does Grid read {name} as another version: a version is a marker\'s name, git, git~1, a commit by its first 7 hex digits, last, a revision of 12 hex digits or a date such as 2026-11-26. Set a marker with grid mark (the tool grid_mark_start).',
  'tool.history.elsewhere': '{file} changed outside the changes in its log: the log last wrote revision {logged}, with {tool}, and the plan is at {now}. Undoing now would lose that change, so nothing was written. grid_diff since={logged} says what changed; grid_restore with force=true puts back a version all the same.',
  'tool.history.elsewhereRestore': '{file} changed outside the changes in its log: the log last wrote revision {logged}, with {tool}, and the plan is at {now}. Restoring would replace that change, so nothing was written. grid_diff since={logged} says what changed; pass force=true to restore all the same, keeping the plan as it is now as a checkpoint.',
  'tool.history.notThere': 'not there',
  'tool.history.nothingToUndo': 'There is nothing to undo: the plan has no change log yet. Every change Grid makes from now on is kept, and grid_undo takes it back.',
  'tool.history.allUndone': 'There is nothing left to undo: each of the {count} entries in the change log is undone, or an undo.',
  'tool.history.notAfter': 'Change #{seq}, {tool}, wrote revision {revision}, but the plan is at {now}, so it can\'t be undone by itself: grid_restore puts back a version by its revision or date.',
  'tool.history.undoWrote': 'The change to undo, {tool}, wrote {file} where there was none, so there is no plan before it to put back.',
  'tool.history.already': 'The plan is already as {name} has it, so nothing was written.',
  'tool.history.undone': 'Undid change #{seq}, {tool}{by}, made {at}: {file} is back at revision {revision}, as it was before it.',
  'tool.history.undoLeft': '{count} earlier changes in the log can still be undone; grid_undo again takes back the one before.',
  'tool.history.undoNoneLeft': 'No earlier change in the log is left to undo.',
  'tool.history.restored': 'Restored {file} to {version}: it is at revision {revision} now.',
  'tool.history.keptFrom': 'The plan it replaced, revision {from}, is kept as a checkpoint: grid_undo takes this back.',
  'tool.history.forced': 'The plan had changed outside its log; that version is the checkpoint kept.',
  'tool.history.backWhat': 'What changed back: {verdict}',
  'tool.history.noStart': 'There is nothing named to compare the plan with: it has no start marker, and the last committed version can\'t be read ({why}). Its change log keeps the plan before each change: pass since=last for the plan before the last change, a revision or a date.',
  'tool.history.named.marker': '{file} at marker {name}',
  'tool.history.named.git': '{file} at commit {commit}',
  'tool.history.named.revision': '{file} at revision {revision}',
  'tool.history.toPhase': 'to compares two versions of the file, and phase is no version of it: compare since=phase with the plan as it is now, without to.',
  'tool.history.words.by': ' by {by}',
  'tool.history.words.note': ' ({note})',
  'tool.history.words.date': ', as it stood at {date}',
  'tool.history.words.last': ', before the last change',
  'tool.history.words.revision': 'the plan at revision {revision}{asked}',
  'tool.history.words.replaced': 'the plan at revision {revision}{asked}, replaced {at}',
  'tool.history.words.now': 'the plan as it is now, revision {revision}',
  'tool.history.words.commit': 'the plan as committed in {commit} ({ref})',
  'tool.history.toLine': 'The later version is {to}, not the plan as it is now.',
  'tool.history.fieldsMore': '… {count} more, in the data with show=facts.',
  'tool.history.noneStands': 'Changes{where}: none to what stands; {count} fields changed, {facts} of them facts or numbers.',
  'tool.history.factsHeading': 'Facts and numbers that changed ({count}):',
  'tool.history.othersHeading': 'Other fields that changed: {count}; show=facts lists them.',
  'tool.history.fieldsHeading': 'Fields that changed ({count}):',
  'tool.history.noFields': 'Fields that changed: none. The two files hold the same values.',
  'tool.history.noEntries': 'Change log since then: no entries. Grid logs its own changes; one made by hand or by another program is in no entry.',
  'tool.history.entriesHeading': 'Change log since then ({count}), oldest first:',
  'tool.history.entry': '#{seq} {at}, {tool}{by}: {what} ({before} → {after})',
  'tool.history.entry.undid': 'undid #{seq}',
  'tool.history.entry.restored': 'restored {name}',
  'tool.history.entry.more': 'and {count} more',
  'tool.history.markerRolled': 'Marker {name}, the oldest, rolled off: a plan keeps the latest {max}.',
  // CMD-57: the brief kept with a marker, and how it changed.
  'tool.brief.field': '{field} {before} → {after}',
  'tool.brief.added': '{where} added: {wish}',
  'tool.brief.removed': '{was} removed: {wish}',
  'tool.brief.moved': '{where} (was {was})',
  'tool.brief.weakened': '{where} weakened, it asks for less: {fields}',
  'tool.brief.tightened': '{where} tightened: {fields}',
  'tool.brief.changed': '{where} changed: {fields}',
  'tool.brief.more': '… {count} more, in the data.',
  'tool.brief.diffHeading': 'Brief, since then ({count} changed, {less} weakened or removed):',
  'tool.brief.diffSame': 'Brief: the same wishes as then.',
  'tool.brief.notKept': 'Brief: not compared, {why}.',
  'tool.brief.whyOld': 'the marker keeps no brief: it was set before markers kept one, or the brief could not be read then',
  'tool.brief.whyNoMarker': 'only a marker keeps the brief, and {version} is not one',
  'tool.brief.whyNow': 'the brief beside the plan can\'t be read ({problem})',
  'tool.brief.markKept': 'The brief beside the plan is kept with the marker, so a comparison since {name} says how the brief changed too.',
  'tool.brief.markNone': 'There is no brief beside the plan, so the marker keeps none.',
  'tool.brief.markUnread': 'The brief beside the plan can\'t be read, so the marker keeps none.',
  'tool.brief.replacedHeading': 'It replaced the brief kept before ({count} changed, {less} weakened or removed):',
  'tool.brief.replacedSame': 'The brief kept before held the same wishes.',
  'tool.brief.replacedBack': 'The brief it replaced is in the data as replaced.previous: pass it as brief with replace: true to put it back.',
} as const

export type HistoryKey = keyof typeof WORDS

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g

/** One sentence of the change log's, with its values. */
export function historySay(key: HistoryKey, values: Readonly<Record<string, Value>> = {}): string {
  return WORDS[key].replace(PLACEHOLDER, (whole, name: string) => (Object.hasOwn(values, name) ? sayValue('en', values[name]!) : whole))
}
