/**
 * CMD-7: the guide for agents is right. `docs/agent-guide.md` is the guide as `guide.ts` writes
 * it, every rooms text in it writes a plan, every plan file in it is read, and the README's
 * quick-start and smallest plan are the guide's.
 *
 * After changing `guide.ts` or a paragraph, write the page again with
 * `GRID_WRITE_GUIDE=1 npx vitest run packages/cli/src/guide`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compileRoomsText } from '@ongrid/floorplan/rooms'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { indexPlan, roomArea } from '@ongrid/floorplan/geometry'
import { validatePlan } from '@ongrid/floorplan/geometry/validate'
import { agentGuide, quickStart, SMALLEST_PLAN_FILE, SMALLEST_ROOMS } from '../guide'

const repo = resolve(__dirname, '../../../../..')
const page = join(repo, 'docs', 'agent-guide.md')

if (process.env['GRID_WRITE_GUIDE'] === '1') writeFileSync(page, agentGuide())

/** The fenced blocks of a markdown text tagged `tag`. */
function blocks(markdown: string, tag: string): string[] {
  return [...markdown.matchAll(new RegExp('```' + tag + '\\n([\\s\\S]*?)\\n```', 'g'))].map((m) => m[1] as string)
}

describe('the guide for agents', () => {
  it('says a word that is not a use is refused by rooms text, with the uses the writer lists', () => {
    const refused = compileRoomsText('room k "Kennel" kennel 3 x 3').problems[0]
    expect(refused?.code).toBe('rooms/unknown-use')
    const guide = agentGuide()
    expect(guide).toContain('Rooms text, the way to write a plan, refuses it on its line, lists the uses it takes and writes nothing')
    const listed = /Use one of: ([^;]+);/.exec(refused?.message ?? '')?.[1]?.split(', ') ?? []
    expect(listed.length).toBeGreaterThan(20)
    for (const use of listed) expect(guide, use).toContain('| `' + use + '` |')
  })

  it('is docs/agent-guide.md, word for word', () => {
    expect(readFileSync(page, 'utf8'), 'write it again: GRID_WRITE_GUIDE=1 npx vitest run packages/cli/src/guide').toBe(agentGuide())
  })

  it('writes a plan from every rooms text it gives, with no drawing problem', () => {
    const texts = blocks(agentGuide(), 'rooms')
    expect(texts.length).toBeGreaterThanOrEqual(8)
    for (const text of texts) {
      const result = compileRoomsText(text)
      expect(result.problems, text).toEqual([])
      const plan = parseFloorPlan(result.plan)
      expect(validatePlan(plan).issues.filter((issue) => issue.severity === 'error'), text).toEqual([])
    }
  })

  it('reads its plan file by hand: one room of 4.0 by 3.0 inside, as it says, with no drawing problem', () => {
    expect(blocks(agentGuide(), 'json')).toEqual([SMALLEST_PLAN_FILE])
    const plan = parseFloorPlan(JSON.parse(SMALLEST_PLAN_FILE))
    expect(validatePlan(plan).issues).toEqual([])
    expect(roomArea(plan.rooms[0]!, indexPlan(plan))).toBeCloseTo(12, 6)
  })

  it('has the README carry its quick-start, whose smallest plan is the guide\'s and is read', () => {
    const readme = readFileSync(join(repo, 'README.md'), 'utf8')
    expect(readme).toContain(quickStart())
    const [smallest] = blocks(quickStart(), 'rooms')
    expect(smallest).toBe(SMALLEST_ROOMS.join('\n'))
    const result = compileRoomsText(smallest as string)
    expect(result.problems).toEqual([])
    expect(() => parseFloorPlan(result.plan)).not.toThrow()
  })

  it('links only to pages and sections that are there', () => {
    const slug = (heading: string): string => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-')
    const docs = join(repo, 'docs')
    for (const [, file, anchor] of agentGuide().matchAll(/\]\(([a-z-]+\.md|samples\/)?(?:#([^)]+))?\)/g)) {
      if (file !== undefined) expect(existsSync(join(docs, file)), file).toBe(true)
      if (anchor === undefined) continue
      const target = file === undefined ? agentGuide() : readFileSync(join(docs, file), 'utf8')
      expect([...target.matchAll(/^#{1,4} (.+)$/gm)].map((m) => slug(m[1]!)), `${file ?? ''}#${anchor}`).toContain(anchor)
    }
  })

  it('keeps its quick-start to five steps', () => {
    expect(quickStart().split('\n').filter((line) => /^\d\. /.test(line))).toHaveLength(5)
  })
})
