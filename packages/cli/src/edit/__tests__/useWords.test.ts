/**
 * WRT-58: the edit tools take the use words rooms text reads (`gym` as `sport`) and say which use
 * they read each as; a word that is already a use says nothing.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { factsOffice } from '@ongrid/floorplan/test-support/facts'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { bench, type Bench } from '../../mcp/__tests__/replay/harness'

let b: Bench | undefined
afterAll(() => b?.close())

async function rename(use: string): Promise<{ use: unknown; text: string; isError: boolean }> {
  b?.close()
  b = bench({ 'p.json': factsOffice() })
  const reply = await b.call('grid_rename_room', { plan: 'p.json', room: 'g-reception', use })
  const plan = parseFloorPlan(JSON.parse(readFileSync(join(b.folder, 'p.json'), 'utf8')))
  return { use: plan.rooms.find((r) => r.id === 'g-reception')!.use, text: reply.text, isError: reply.isError === true }
}

describe('an edit reads a use word as rooms text does (WRT-58)', () => {
  it('reads gym as sport and says so', async () => {
    const done = await rename('gym')
    expect(done.isError, done.text).toBe(false)
    expect(done.use).toBe('sport')
    expect(done.text).toContain('Read "gym" as the use sport.')
  })

  it('says nothing about a use given as it is, or in other capitals', async () => {
    for (const word of ['sport', 'Sport']) {
      const done = await rename(word)
      expect(done.use).toBe('sport')
      expect(done.text).not.toMatch(/Read .* as the use/)
    }
  })

  it('still refuses a word that means no use, naming the uses', async () => {
    const done = await rename('flibbertigibbet')
    expect(done.isError).toBe(true)
    expect(done.text).toMatch(/room uses/)
  })
})
