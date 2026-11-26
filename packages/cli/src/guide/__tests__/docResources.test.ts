/**
 * CMD-40: every page of `docs/` reaches an agent that installed Grid from npm: as a resource of
 * the tool server and as a file the package's README links to.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { packageManifest, packageReadme } from '../../distribution/listing'
import { handleLine } from '../../mcp/protocol'
import { projectResources } from '../../mcp/serveTools'
import { DOC_PAGES, DOCS_URI_PREFIX } from '../docPages'

const docs = resolve(__dirname, '../../../../../docs')
const pages = readdirSync(docs).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -3))

async function rpc(method: string, params: Record<string, unknown> = {}): Promise<{ result: Record<string, any> }> {
  return JSON.parse((await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), [], projectResources())) as string)
}

describe('the pages of docs/ as resources', () => {
  it('lists a page for every file of docs/ but the guide, which is grid://guide', () => {
    expect(Object.keys(DOC_PAGES).sort()).toEqual(pages.filter((page) => page !== 'agent-guide').sort())
  })

  it('lists each one with its heading as the title, and its own description', async () => {
    const listed = (await rpc('resources/list')).result['resources'] as { uri: string; title: string; description: string; mimeType: string }[]
    for (const [page, { title, description }] of Object.entries(DOC_PAGES)) {
      const first = readFileSync(join(docs, `${page}.md`), 'utf8').split('\n')[0]
      expect(first, page).toBe(`# ${title}`)
      expect(listed.find((r) => r.uri === `${DOCS_URI_PREFIX}${page}`), page).toMatchObject({ title, description, mimeType: 'text/markdown' })
    }
  })

  it('reads each one back as the page, word for word', async () => {
    for (const page of Object.keys(DOC_PAGES)) {
      const read = await rpc('resources/read', { uri: `${DOCS_URI_PREFIX}${page}` })
      expect(read.result['contents'], page).toEqual([{ uri: `${DOCS_URI_PREFIX}${page}`, mimeType: 'text/markdown', text: readFileSync(join(docs, `${page}.md`), 'utf8') }])
    }
  })
})

describe('the package README', () => {
  const readme = packageReadme()

  it('links every page of docs/ and names every resource', () => {
    for (const page of pages) expect(readme, page).toContain(`(docs/${page}.md`)
    for (const uri of ['grid://guide', 'grid://guide/rooms', 'grid://schema/plan', ...Object.keys(DOC_PAGES).map((p) => `${DOCS_URI_PREFIX}${p}`)]) expect(readme, uri).toContain(`\`${uri}\``)
    expect(readme).toContain('plan.schema.json')
  })

  it('ships docs/ in the package', () => {
    expect(packageManifest('1.0.0')['files']).toContain('docs/')
  })

  it('links the recipes, and its relative links all lead to a page of docs/', () => {
    expect(readme).toContain('(docs/recipes.md)')
    for (const [, target] of readme.matchAll(/\]\((docs\/[^)#]+)/g)) expect(pages, target).toContain((target as string).slice(5, -3))
  })
})

describe('the pages an npm reader is sent from', () => {
  it('do not point at a source file the package does not carry', () => {
    for (const page of ['rooms-first', 'agent-guide']) {
      const text = readFileSync(join(docs, `${page}.md`), 'utf8')
      expect(text, page).not.toMatch(/packages\/floorplan\/(src|fixtures)\//)
      expect(text, page).not.toContain('roomsGrammar.ts')
    }
  })
})
