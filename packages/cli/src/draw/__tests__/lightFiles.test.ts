/**
 * SHT-10: a picture written to a file or handed to an agent is always on light paper, whatever the
 * screen's theme: `grid draw` (a plan, a facade, a section, the 3D model), `grid sheet`'s pictures
 * (through `drawPlan` and `drawStill`),
 * `grid_view`, and the picture `grid_preview_sync` hands on while the page itself is dark. Only the
 * preview page's own drawing, which it shows on its screen, keeps the dark look.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadImage, createCanvas } from '@napi-rs/canvas'
import { DARK_LOOK, LIGHT_LOOK, fileLookOf, lookOf, relativeLuminance } from '@ongrid/viewer/src/picture'
import { SHEET_LOOK } from '../../sheet/pages'
import { runGrid } from '../../command/main'
import { openProject } from '../../fs/projectFiles'
import { handleLine } from '../../mcp/protocol'
import { GRID_TOOLS, projectResources, projectTools } from '../../mcp/serveTools'
import { drawFacade, drawPlan } from '../drawPlan'
import { drawSection } from '../drawSection'
import { drawStill } from '../drawStill'
import { facadeView, planView, sectionView } from '../views'
import { twoBedFlat } from './twoBedFlat'

const made: string[] = []
afterAll(() => {
  for (const path of made) rmSync(path, { recursive: true, force: true })
})

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'grid-light-'))
  made.push(dir)
  writeFileSync(join(dir, 'grid.json'), '{"version":1}\n')
  writeFileSync(join(dir, 'plan.json'), JSON.stringify(twoBedFlat()))
  return dir
}

/** The colour of a PNG's corner pixel, where only the paper is. */
async function corner(bytes: Uint8Array): Promise<string> {
  const image = await loadImage(Buffer.from(bytes))
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  const [r, g, b] = context.getImageData(image.width - 2, image.height - 2, 1, 1).data
  return `#${[r, g, b].map((v) => v!.toString(16).padStart(2, '0')).join('')}`
}

/** The paper of an SVG file: its first `data-part="paper"` fill. */
const paperOf = (svg: string): string => /data-part="paper"[^>]*fill="(#[0-9a-f]{6})"/.exec(svg)![1]!
const light = (colour: string): boolean => relativeLuminance(colour) > 0.5

const line = { from: { x: 0.5, y: 3 }, to: { x: 9, y: 3 }, toward: 'left' as const }

describe('a file is always on light paper (SHT-10)', () => {
  it('draws a plan, a facade and a section asked for in the dark look on light paper, as SVG and as PNG', async () => {
    const plan = twoBedFlat()
    expect(light(DARK_LOOK.paper)).toBe(false)
    expect(paperOf(await drawPlan(plan, { format: 'svg', look: 'dark' }))).toBe(LIGHT_LOOK.paper)
    expect(light(await corner(await drawPlan(plan, { format: 'png', look: 'dark' })))).toBe(true)
    expect(paperOf(await drawFacade(plan, { format: 'svg', side: 'south', look: 'dark' }))).toBe(LIGHT_LOOK.paper)
    expect(light(await corner(await drawFacade(plan, { format: 'png', side: 'south', look: 'dark' })))).toBe(true)
    const section = await drawSection(plan, line, { format: 'svg', look: 'dark' })
    expect(light(paperOf(section.file as string))).toBe(true)
  })

  it('takes the 3D model on light ground even when the dark look is asked', async () => {
    expect(light(await corner(await drawStill(twoBedFlat(), { look: 'dark', width: 120, height: 80 })))).toBe(true)
  })

  it('hands grid_view\'s pictures on on light paper, and says the dark look drew the working one', async () => {
    const plan = twoBedFlat()
    expect(light(await corner((await planView(plan, { look: 'dark', dimensions: true })).png))).toBe(true)
    expect(light(await corner((await facadeView(plan, { side: 'south', look: 'dark' })).png))).toBe(true)
    expect(light(await corner((await sectionView(plan, line, 'dark')).png))).toBe(true)
    const dir = folder()
    const view = GRID_TOOLS.find((t) => t.name === 'grid_view')!
    const answer = await view.run({ plan: 'plan.json', kind: 'plan', look: 'dark' }, { project: openProject(dir, dir) })
    expect(answer.text).toContain('working (asked as dark)')
  })

  it('refuses grid draw --look dark by name, saying why', async () => {
    const dir = folder()
    let err = ''
    const status = await runGrid(['draw', 'plan.json', '--look', 'dark'], { stdout: () => {}, stderr: (t) => (err += t), stdoutIsTerminal: false, cwd: dir })
    expect(status).toBe(2)
    expect(err).toContain("--look dark is the screen's dark theme, and a file is always drawn on light paper: use one of working, technical, simple, large.")
  })

  it('keeps the preview page\'s own drawing dark on a dark page, and hands its picture on light', async () => {
    const dir = folder()
    const tools = projectTools(openProject(dir, dir, 'project'))
    const reply = await handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'grid_preview_sync', arguments: { look: 'dark' } } }), tools, projectResources())
    const result = (JSON.parse(reply as string) as { result: { content: { type: string; data?: string }[]; structuredContent: { drawing: { svg: string } } } }).result
    // The page draws on its screen: its own drawing follows the screen's theme.
    expect(paperOf(result.structuredContent.drawing.svg)).toBe(DARK_LOOK.paper)
    const image = result.content.find((c) => c.type === 'image')!
    expect(light(await corner(Buffer.from(image.data!, 'base64')))).toBe(true)
  })

  it('draws the sheet\'s plan pictures in a light look, through drawPlan, which keeps it', () => {
    expect(fileLookOf(SHEET_LOOK)).toBe(lookOf(SHEET_LOOK))
    expect(light(fileLookOf(SHEET_LOOK).colors.paper)).toBe(true)
  })
})
