/** MSG-22: a room's use in the person's own words, in their own language. */
import { describe, expect, it } from 'vitest'
import { readUse, ROOM_USES, USE_WORDS } from '../../types/floorplan'
import { foldLabel, roomUseOfLabel, USE_LABELS, USE_WORDS_BY_LANGUAGE } from '../uses'

describe('use words in other languages', () => {
  it('reads plain words of Spanish, German, French and Chinese as the use they mean', () => {
    const cases: Array<[string, string]> = [
      ['cocina', 'kitchen'],
      ['Cocineta', 'kitchen'],
      ['lavandería', 'utility'],
      ['Recámara', 'bedroom'],
      ['Flur', 'corridor'],
      ['Bad', 'bathroom'],
      ['Wohnen', 'living'],
      ['Kind', 'bedroom'],
      ['Küche', 'kitchen'],
      ['kuche', 'kitchen'],
      ['Gäste-WC', 'toilet'],
      ['Salle de bains', 'bathroom'],
      ['chambre', 'bedroom'],
      ['客厅', 'living'],
      ['卧室', 'bedroom'],
      ['卫生间', 'bathroom'],
    ]
    for (const [word, use] of cases) expect(readUse(word), word).toBe(use)
  })

  it('leaves a word that means two things, and a word of no script it knows, as written', () => {
    for (const word of ['sala', 'habitación', 'entrée', 'Keller', '阳台', '—']) expect(readUse(word), word).toBe(word)
    expect(roomUseOfLabel('')).toBeNull()
    expect(roomUseOfLabel('!!')).toBeNull()
  })

  it('names only Grid\'s uses, and no two words fold to the same word for different uses', () => {
    const seen = new Map<string, string>()
    const add = (word: string, use: string): void => {
      expect(ROOM_USES as readonly string[]).toContain(use)
      const folded = foldLabel(word)
      expect(folded, word).not.toBe('')
      if (seen.has(folded)) expect(seen.get(folded), `${word} folds as another word does`).toBe(use)
      seen.set(folded, use)
    }
    for (const words of Object.values(USE_WORDS_BY_LANGUAGE)) for (const [word, use] of Object.entries(words)) add(word, use)
    for (const labels of Object.values(USE_LABELS)) for (const [use, label] of Object.entries(labels)) add(label, use)
    // An English word Grid reads keeps its use: no other language's word folds onto it for another.
    for (const [word, use] of Object.entries(USE_WORDS)) if (seen.has(word)) expect(seen.get(word), word).toBe(use)
  })
})
