import { readFileSync } from 'fs'
import { resolve } from 'path'
import { gunzipSync } from 'zlib'
import { describe, expect, it } from 'vitest'
import { floorOf, planFloors, validatePlan } from '@ongrid/floorplan/geometry'
import { areaText, sumText } from '@ongrid/floorplan/geometry/rounding'
import { FloorPlanSchema } from '@ongrid/floorplan/types/floorplan'
import { said } from '@ongrid/floorplan/messages'
import { GENERAL_GUIDANCE_LABEL } from '@ongrid/rules'
import { checkOnFloor, checkPlan, NOTHING_FOUND } from '../../command/check'
import type { LoadedPlan } from '../../command/plan'
import { planAreas } from '../../quantities/areas'
import { surveyPlan } from '../../quantities/survey'
import { planPicture } from '@ongrid/viewer/src/picture'
import { buildFloorPlan, planForFloor } from '@ongrid/floorplan/geometry'
import { pointInPolygon } from '@ongrid/floorplan/geometry/innerPoint'
import { pictureView, type Picture } from '@ongrid/viewer/src/picture'
import { findingLine, floorFrames, LEFT_OUT_LIMIT, MIN_LABEL_PT, PLAN_BOX, planPictureOptions, sheetPages, type SheetPicture } from '../pages'
import { TEXT_PX } from '@ongrid/viewer/src/picture/look'
import { fitTo } from '@ongrid/viewer/src/canvas2d/viewport'

function fixture(name: string): LoadedPlan {
  const plan = FloorPlanSchema.parse(JSON.parse(readFileSync(resolve(__dirname, '../../../fixtures', name), 'utf8')))
  const { issues, broken } = validatePlan(plan)
  return { file: name, plan, issues, broken }
}

const house = fixture('two-floor-house.json')
const date = new Date('2026-11-21T12:00:00Z')
const words = { version: '1' as const, name: 'Solace House', headline: 'A retreat', intro: ['Intro.'], floors: { ground: ['Ground words.'] } }

describe('the plan name on the sheet (SHT-14)', () => {
  const named = { ...house, plan: { ...house.plan, name: 'Harbour Lofts' } }
  it('heads every page with the name the plan states, not the file name', () => {
    const sheet = sheetPages(named, null, 'client', { name: 'plan', date })
    expect(sheet.pages.every((p) => p.topLine.startsWith('Harbour Lofts'))).toBe(true)
    expect(sheetPages(named, null, 'check', { name: 'plan', date }).pages.every((p) => p.topLine.startsWith('Harbour Lofts'))).toBe(true)
  })
  it('lets the sheet words name the sheet over the plan name, and falls back to the file name', () => {
    expect(sheetPages(named, words, 'client', { name: 'plan', date }).pages[0]!.topLine).toContain('Solace House')
    expect(sheetPages(house, null, 'client', { name: 'two-floor-house', date }).pages[0]!.topLine).toContain('two-floor-house')
  })
})

describe('the client layout (VEW-7)', () => {
  const sheet = sheetPages(house, words, 'client', { name: 'two-floor-house', date })

  it('is a cover, then one page per floor, lowest first', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['cover', 'floor', 'floor'])
    expect(sheet.pages.map((p) => p.picture && p.picture.kind === 'plan' ? p.picture.floor : null)).toEqual([null, 'ground', 'first'])
  })

  it('puts the label, the page number and the date on every page', () => {
    sheet.pages.forEach((page, i) => {
      expect(page.footer.label).toBe(GENERAL_GUIDANCE_LABEL)
      expect(page.footer.page).toBe(i + 1)
      expect(page.footer.pages).toBe(3)
      expect(page.footer.date).toBe('21 NOV 2026')
    })
  })

  it('uses the words of sheet.json', () => {
    const [cover, ground, first] = sheet.pages
    expect(cover!.title).toBe('Solace House')
    expect(cover!.subtitle).toBe('A retreat')
    expect(cover!.paragraphs).toEqual(['Intro.'])
    expect(ground!.paragraphs).toEqual(['Ground words.'])
    expect(first!.paragraphs).toEqual([])
  })

  it('takes the area table from planAreas, every room on its floor', () => {
    const areas = planAreas(surveyPlan(house.plan))
    for (const floor of areas.floors) {
      const page = sheet.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === floor.floor)!
      expect(page.table!.rows.map((r) => r.name)).toEqual(floor.rooms.map((r) => r.name))
    }
  })

  it.each(['client', 'check'] as const)('shows every area as planAreas gives it, through sumText and areaText (%s)', (layout) => {
    const areas = planAreas(surveyPlan(house.plan))
    const made = sheetPages(house, words, layout, { name: 'two-floor-house', date })
    for (const floor of areas.floors) {
      const page = made.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === floor.floor)!
      const shown = sumText(floor.rooms.map((r) => r.net ?? 0), floor.net, 1)
      expect(page.table!.rows.map((r) => [r.name, r.area])).toEqual(floor.rooms.map((r, i) => [r.name, shown.parts[i]]))
      expect(page.table!.total).toMatchObject({ name: 'Net area', area: shown.total })
    }
    const figure = (label: string) => made.pages[0]!.figures.find((f) => f.label === label)?.value
    expect(areas.grossInternal).not.toBeNull()
    expect(figure('gross internal area')).toBe(`${areaText(areas.grossInternal!, 1)} m²`)
    if (layout === 'check') {
      expect(figure('net area')).toBe(`${areaText(areas.net, 1)} m²`)
      expect(figure('gross external area')).toBe(`${areaText(areas.grossExternal!, 1)} m²`)
    }
  })

  it('shows its figures on the cover, made by Grid', () => {
    const labels = sheet.pages[0]!.figures.map((f) => f.label)
    expect(labels).toContain('floors')
    expect(labels).toContain('bedrooms')
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'floors')!.value).toBe('2')
    // The fixture's rooms have no use, so it has no bedroom.
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'bedrooms')!.value).toBe('0')
  })

  it('writes no words in the author\'s place without sheet.json', () => {
    const bare = sheetPages(house, null, 'client', { name: 'two-floor-house', date })
    expect(bare.pages[0]!.title).toBe('two-floor-house')
    expect(bare.pages[0]!.subtitle).toBeNull()
    expect(bare.pages.every((p) => p.paragraphs.length === 0)).toBe(true)
  })

  it('gives the same pages twice', () => {
    expect(sheetPages(house, words, 'client', { name: 'two-floor-house', date })).toEqual(sheet)
  })
})

/** The house with its first floor larger and shifted, so the two floors differ in size and place. */
function skewedHouse(): LoadedPlan {
  const plan = structuredClone(house.plan)
  for (const wall of plan.walls) {
    if (wall.floor !== 'first') continue
    wall.start = [wall.start[0] * 1.5 + 3, wall.start[1] * 1.5 + 2]
    wall.end = [wall.end[0] * 1.5 + 3, wall.end[1] * 1.5 + 2]
  }
  const { issues, broken } = validatePlan(plan)
  return { file: 'skewed', plan, issues, broken }
}

describe('one scale for every floor (VEW-7)', () => {
  const skewed = skewedHouse()
  const box = { width: PLAN_BOX.width, height: PLAN_BOX.height }
  const shown = [...floorFrames(skewed)].map(([floor, frame]) => ({
    frame,
    own: planPicture(skewed.plan, { floor, ...box }).view,
    framed: planPicture(skewed.plan, { floor, ...box, frame }).view,
  }))

  it('has floors of different size and place', () => {
    expect(shown[1]!.own.width).not.toBeCloseTo(shown[0]!.own.width, 3)
  })

  it('shows every floor at one size', () => {
    expect(shown.length).toBe(2)
    for (const { framed } of shown) {
      expect(framed.width).toBeCloseTo(shown[0]!.framed.width, 9)
      expect(framed.height).toBeCloseTo(shown[0]!.framed.height, 9)
    }
  })

  it('cuts nothing off', () => {
    const e = 1e-9
    for (const { own, framed } of shown) {
      expect(framed.x).toBeLessThanOrEqual(own.x + e)
      expect(framed.y).toBeLessThanOrEqual(own.y + e)
      expect(framed.x + framed.width).toBeGreaterThanOrEqual(own.x + own.width - e)
      expect(framed.y + framed.height).toBeGreaterThanOrEqual(own.y + own.height - e)
    }
  })

  it('centres each frame on its own floor, Y up', () => {
    const [a, b] = shown
    expect(a!.frame.min.x + a!.frame.width / 2).not.toBeCloseTo(b!.frame.min.x + b!.frame.width / 2, 3)
    for (const { frame, own } of shown) {
      expect(frame.min.x + frame.width / 2).toBeCloseTo(own.x + own.width / 2, 9)
      expect(frame.min.y + frame.height / 2).toBeCloseTo(-(own.y + own.height / 2), 9)
    }
  })
})

describe('the check layout (VEW-7)', () => {
  const sheet = sheetPages(house, words, 'check', { name: 'two-floor-house', date })

  it('is a summary, then one page per floor, then the room schedule, the door and window schedule (ARE-12) and their types (ARE-15)', () => {
    expect(sheet.pages.map((p) => p.kind)).toEqual(['summary', 'floor', 'floor', 'summary', 'summary', 'summary'])
    expect(sheet.pages.slice(3).map((p) => p.title)).toEqual(['Room schedule', 'Door and window schedule', 'Door and window types'])
  })

  it('takes nothing from sheet.json', () => {
    const text = JSON.stringify(sheet)
    for (const word of ['Solace House', 'A retreat', 'Intro.', 'Ground words.']) expect(text).not.toContain(word)
  })

  it('draws ids', () => {
    expect(sheet.pages[1]!.picture).toMatchObject({ kind: 'plan', ids: true })
  })

  it('lists ceiling height and which walls carry load among what the checks never look at (COD-4)', () => {
    const notes = sheet.pages[0]!.notes
    expect(notes).toContainEqual(expect.stringMatching(/^Ceiling height is not checked\b/))
    expect(notes).toContainEqual(expect.stringMatching(/^Which walls carry load is not known\b/))
  })

  it('gives each room its use, and the client cover counts bedrooms', () => {
    const plan = structuredClone(house.plan)
    const room = plan.rooms.find((r) => r.id === 'hall')!
    room.use = 'bedroom'
    const { issues, broken } = validatePlan(plan)
    const withUse: LoadedPlan = { file: 'use', plan, issues, broken }
    const check = sheetPages(withUse, null, 'check', { name: 'x', date })
    const rows = check.pages.flatMap((p) => p.table?.rows ?? [])
    expect(rows.find((r) => r.name === 'Hall')!.detail).toBe('bedroom')
    const client = sheetPages(withUse, null, 'client', { name: 'x', date })
    expect(client.pages[0]!.figures.find((f) => f.label === 'bedroom')!.value).toBe('1')
  })

  it('lists a drawing problem on no floor once, on the summary', () => {
    const issue = { code: 'test', entity: 'plan' as const, id: 'p', message: 'A plan-wide problem.', said: said('issue.part.error', { error: 'A plan-wide problem.' }), severity: 'warning' as const }
    const loaded: LoadedPlan = { ...house, issues: [...house.issues, issue] }
    const made = sheetPages(loaded, null, 'check', { name: 'x', date })
    const line = 'Worth a look, plan "p": A plan-wide problem.'
    expect(made.pages[0]!.notes).toContain(line)
    for (const page of made.pages.slice(1)) expect(page.notes).not.toContain(line)
  })

  it('lists the notices of its floor, and the whole-plan ones once on the summary', () => {
    const lines = (p: { notes: readonly string[] }) => p.notes.filter((n) => n.startsWith('Not checked: '))
    const whole = checkPlan(house, {})
    for (const page of sheet.pages.slice(1)) {
      const floorId = page.picture?.kind === 'plan' ? page.picture.floor : ''
      const own = whole.report.notChecked.filter((n) => n.floor === floorId)
      expect(lines(page)).toEqual(own.map((n) => `Not checked: ${n.message}`))
    }
    expect(lines(sheet.pages[0]!)).toEqual(whole.report.notChecked.filter((n) => n.floor === '').map((n) => `Not checked: ${n.message}`))
  })

  it('lists every finding on its own floor', () => {
    // Bedroom 2 loses its only door, so the check finds it shut off (as grid.e2e.test.ts does).
    const flat = fixture('two-bed-flat.json')
    const plan = { ...flat.plan, openings: flat.plan.openings.filter((o) => o.id !== 'bed2-door') }
    const { issues, broken } = validatePlan(plan)
    const shut: LoadedPlan = { file: 'shut', plan, issues, broken }
    const findings = checkPlan(shut, {}).report.findings
    expect(findings.length).toBeGreaterThan(0)
    const made = sheetPages(shut, null, 'check', { name: 'shut', date })
    expect(made.pages[0]!.figures.find((f) => f.label === 'findings')!.value).toBe(String(findings.length))
    expect(made.pages[1]!.notes).toContain('Finding, room "bed2": "Bedroom 2" has no door or opening to another space')
    for (const finding of findings) {
      const page = made.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === finding.floor)!
      const line = findingLine(finding)
      expect(page.notes).toContain(line)
      for (const id of [...finding.rooms, ...finding.openings]) expect(line).toContain(`"${id}"`)
      for (const other of made.pages.filter((p) => p !== page)) expect(other.notes).not.toContain(line)
    }
  })

  it('names a finding by the ids it carries, rooms then openings', () => {
    const finding = { rooms: ['bed1'], openings: ['w1', 'w2'], message: 'The window is too high.' }
    expect(findingLine(finding)).toBe('Finding, room "bed1", openings "w1", "w2": The window is too high.')
    expect(findingLine({ rooms: ['a', 'b'], openings: [], message: 'M.' })).toBe('Finding, rooms "a", "b": M.')
    expect(findingLine({ rooms: [], openings: [], message: 'M.' })).toBe('Finding: M.')
  })

  it('keeps the client layout\'s floor pages free of findings', () => {
    const flat = fixture('two-bed-flat.json')
    const plan = { ...flat.plan, openings: flat.plan.openings.filter((o) => o.id !== 'bed2-door') }
    const { issues, broken } = validatePlan(plan)
    const client = sheetPages({ file: 'shut', plan, issues, broken }, null, 'client', { name: 'shut', date })
    expect(JSON.stringify(client)).not.toContain('Finding')
  })

  it('says how many findings there are, and never that the plan passes', () => {
    const summary = sheet.pages[0]!
    expect(summary.figures.map((f) => f.label)).toContain('findings')
    expect(JSON.stringify(sheet)).not.toMatch(/\b(complies|compliant|approved|passes)\b/i)
  })
})

/** The house with the study's walls gone from its boundary, so the study cannot be drawn. */
function brokenStudy(): LoadedPlan {
  const plan = structuredClone(house.plan)
  plan.rooms.find((r) => r.id === 'study')!.boundary = ['nope-a', 'nope-b', 'nope-c']
  const { issues, broken } = validatePlan(plan)
  return { file: 'broken', plan, issues, broken }
}

describe('a part that cannot be drawn (VEW-7)', () => {
  const broken = brokenStudy()
  const floorPage = (sheet: ReturnType<typeof sheetPages>, floor: string) =>
    sheet.pages.find((p) => p.picture?.kind === 'plan' && p.picture.floor === floor)!

  it('is left out of the plan as read', () => {
    expect([...broken.broken]).toEqual(['study'])
  })

  it('is said on its floor of a client sheet, and only there', () => {
    const sheet = sheetPages(broken, null, 'client', { name: 'x', date })
    expect(floorPage(sheet, 'first').notes).toContain(LEFT_OUT_LIMIT)
    expect(floorPage(sheet, 'ground').notes).not.toContain(LEFT_OUT_LIMIT)
    const whole = sheetPages(house, null, 'client', { name: 'x', date })
    expect(whole.pages.every((p) => !p.notes.includes(LEFT_OUT_LIMIT))).toBe(true)
  })

  it('is listed on its floor of a check sheet', () => {
    const sheet = sheetPages(broken, null, 'check', { name: 'x', date })
    expect(floorPage(sheet, 'first').notes.some((n) => n.startsWith('Left out, room "study": '))).toBe(true)
    expect(floorPage(sheet, 'ground').notes.some((n) => n.startsWith('Left out, '))).toBe(false)
  })
})

/** A few of the lab's plans, read from the scoreboard's data: a basement, three and four floors, a part left out, ids that clash. */
const LAB_SAMPLE = [
  'A/scenarios/basement-flat.json',
  'A/scenarios/townhouse.json',
  'AU2/scenarios/H-h06-lift-four-floors/plan.json',
  'AU1/scenarios/AR-12/room-narrower-than-its-walls.json',
  'A/scenarios/probes/townhouse-v1-id-clash.json',
]

function labPlans(names: readonly string[] = LAB_SAMPLE): Map<string, LoadedPlan> {
  const repo = resolve(__dirname, '../../../../..')
  const lines = gunzipSync(readFileSync(resolve(repo, 'scoreboard/data/lab-plans.ndjson.gz'))).toString('utf8').split('\n')
  const found = new Map<string, LoadedPlan>()
  for (const line of lines) {
    if (!line) continue
    const row = JSON.parse(line) as { name: string; text: string }
    if (!names.includes(row.name)) continue
    const plan = FloorPlanSchema.parse(JSON.parse(row.text))
    const { issues, broken } = validatePlan(plan)
    found.set(row.name, { file: row.name, plan, issues, broken })
  }
  return found
}

describe('the page list on the lab\'s plans (VEW-7)', () => {
  const plans = labPlans()

  it('finds every plan of the sample', () => {
    expect([...plans.keys()].sort()).toEqual([...LAB_SAMPLE].sort())
  })

  describe.each(LAB_SAMPLE)('%s', (name) => {
    const loaded = plans.get(name)!
    const floors = planFloors(loaded.plan)
    const labWords = { version: '1' as const, name: 'Lab Words House', headline: 'Lab headline words', intro: ['Lab intro words.'], floors: Object.fromEntries(floors.map((f) => [f.id, [`Lab words for ${f.id}.`]])) }
    const sheets = {
      client: sheetPages(loaded, labWords, 'client', { name: 'lab', date }),
      check: sheetPages(loaded, labWords, 'check', { name: 'lab', date }),
    }
    const floorPages = (sheet: ReturnType<typeof sheetPages>) => sheet.pages.filter((p) => p.picture?.kind === 'plan')

    it.each(['client', 'check'] as const)('has a page for every floor, every room in its floor\'s table (%s)', (layout) => {
      const pages = floorPages(sheets[layout])
      expect(pages.map((p) => (p.picture as { floor: string }).floor)).toEqual(floors.map((f) => f.id))
      for (const floor of floors) {
        const page = pages.find((p) => (p.picture as { floor: string }).floor === floor.id)!
        const rows = page.table?.rows.map((r) => r.name) ?? []
        const rooms = loaded.plan.rooms.filter((r) => floorOf(r) === floor.id && !loaded.broken.has(r.id)).map((r) => r.name)
        for (const room of rooms) expect(rows).toContain(room)
      }
    })

    it.each(['client', 'check'] as const)('puts the label on every page (%s)', (layout) => {
      for (const page of sheets[layout].pages) expect(page.footer.label).toBe(GENERAL_GUIDANCE_LABEL)
    })

    it('takes nothing from sheet.json on the check layout', () => {
      expect(JSON.stringify(sheets.check)).not.toMatch(/Lab (Words House|headline words|intro words|words for)/)
    })

    it.each(['client', 'check'] as const)('draws every floor at one scale (%s)', (layout) => {
      const box = { width: PLAN_BOX.width, height: PLAN_BOX.height }
      const views = floorPages(sheets[layout]).map((p) => {
        const picture = p.picture as Extract<SheetPicture, { kind: 'plan' }>
        return planPicture(loaded.plan, { floor: picture.floor, ...box, frame: picture.frame }).view
      })
      for (const view of views) {
        expect(view.width).toBeCloseTo(views[0]!.width, 9)
        expect(view.height).toBeCloseTo(views[0]!.height, 9)
      }
    })
  })
})

describe('small things a sheet says (VEW-7)', () => {
  it('says "1 floor" for one floor', () => {
    const flat = fixture('two-bed-flat.json')
    const figure = sheetPages(flat, null, 'client', { name: 'x', date }).pages[0]!.figures.find((f) => f.value === '1' && f.label.startsWith('floor'))
    expect(figure?.label).toBe('floor')
  })

  it('says "1 bedroom" for one, and "bedrooms" otherwise', () => {
    const withBedrooms = (count: number): LoadedPlan => {
      const plan = structuredClone(house.plan)
      plan.rooms.slice(0, count).forEach((room) => { room.use = 'bedroom' })
      const { issues, broken } = validatePlan(plan)
      return { file: 'beds', plan, issues, broken }
    }
    const label = (count: number) => sheetPages(withBedrooms(count), null, 'client', { name: 'x', date }).pages[0]!.figures.find((f) => f.value === String(count) && f.label.startsWith('bedroom'))?.label
    expect(label(1)).toBe('bedroom')
    expect(label(2)).toBe('bedrooms')
    expect(label(0)).toBe('bedrooms')
  })

  it('shows a gross area it cannot work out as not known, with the reason', () => {
    // ARE-9: which walls face outside is worked out from the rooms beside them (MSG-13), so a
    // plan whose walls all say interior still has both gross areas. With no rooms, no wall faces
    // outside, and the inside face of the outer walls is not known.
    const plan = structuredClone(house.plan)
    plan.rooms = []
    for (const wall of plan.walls) wall.kind = 'interior'
    const { issues, broken } = validatePlan(plan)
    const open: LoadedPlan = { file: 'open', plan, issues, broken }
    const areas = planAreas(surveyPlan(plan))
    expect(areas.grossInternal).toBeNull()
    expect(areas.grossExternal).not.toBeNull()
    expect(areas.grossWhy).toMatch(/^No gross internal area: Floor .*no wall on this floor faces outside/)
    const client = sheetPages(open, null, 'client', { name: 'x', date }).pages[0]!
    expect(client.figures.find((f) => f.label === 'gross internal area')!.value).toBe('not known')
    expect(client.notes).toContain(areas.grossWhy)
    const summary = sheetPages(open, null, 'check', { name: 'x', date }).pages[0]!
    expect(summary.figures.find((f) => f.label === 'gross internal area')!.value).toBe('not known')
    expect(summary.figures.find((f) => f.label === 'gross external area')!.value).not.toBe('not known')
    expect(summary.notes).toContain(areas.grossWhy)
    expect(planAreas(surveyPlan(house.plan)).grossWhy).toBeNull()
    expect(sheetPages(house, null, 'check', { name: 'x', date }).pages[0]!.notes.some((n) => n.startsWith('No gross'))).toBe(false)
  })

  it('says a floor with no findings found nothing, even with notices, and so does the summary', () => {
    // LVL-1 (lab VE-8): the house's balcony door upstairs, with nothing drawn outside it, is now
    // a finding, so this case takes the house without it.
    const quiet = { ...house, plan: { ...house.plan, openings: house.plan.openings.filter((o) => o.id !== 'balcony') } }
    const sheet = sheetPages(quiet, null, 'check', { name: 'x', date })
    expect(checkPlan(quiet, {}).report.findings).toEqual([])
    expect(sheet.pages[0]!.notes).toContain(`Findings: none. ${NOTHING_FOUND}`)
    const floors = sheet.pages.filter((p) => p.kind === 'floor')
    expect(floors.some((p) => p.notes.some((n) => n.startsWith('Not checked: ')))).toBe(true)
    for (const page of floors) expect(page.notes).toContain(`Findings on this floor: none. ${NOTHING_FOUND}`)
  })

  it('finds on each floor what a check of that floor finds, from one run of the rules', () => {
    const flat = fixture('two-bed-flat.json')
    const shutPlan = { ...flat.plan, openings: flat.plan.openings.filter((o) => o.id !== 'bed2-door') }
    const { issues, broken } = validatePlan(shutPlan)
    for (const loaded of [house, brokenStudy(), { file: 'shut', plan: shutPlan, issues, broken }]) {
      const whole = checkPlan(loaded, {})
      for (const floor of planFloors(loaded.plan)) expect(checkOnFloor(loaded, whole, floor.id)).toEqual(checkPlan(loaded, { floor: floor.id }))
    }
  })
})

/** Where each room's label is drawn on a picture, in plan metres (Y up), by room id. */
function labelsOf(picture: Picture): Map<string, { x: number; y: number }> {
  const found = new Map<string, { x: number; y: number }>()
  for (const node of picture.nodes) {
    if (!node.key?.startsWith('label:')) continue
    const at = /^translate\((\S+) (\S+)\)/.exec(String(node.attrs['transform']))!
    found.set(node.key.slice('label:'.length), { x: Number(at[1]), y: -Number(at[2]) })
  }
  return found
}

describe('room labels on a floor page (VEW-7)', () => {
  // Labels moved into other rooms on these (the outside test): a tall townhouse, and long names with ids.
  const TOWNHOUSE = 'A/scenarios/probes/townhouse-stair-misaligned.json'
  const DOOR_TO_AIR = 'D/scenarios/d2-door-to-air-floor3.json'
  const plans = labPlans([TOWNHOUSE, DOOR_TO_AIR, ...LAB_SAMPLE])
  // Where grid draw's zoom printed names smallest (an attic, a warehouse mezzanine, a shop), and empty floors.
  const SMALL = [
    'A/scenarios/probes/townhouse-ghost-floor.json', 'AU1/scenarios/AR-1/warehouse.json', 'C/scenarios/shop.json',
    'AU1/scenarios/MS-10/f15b-room-floor-does-not-exist.json', 'H/scenarios/h11c-empty-roof-floor.json',
  ]
  const small = labPlans(SMALL)

  function pictures(loaded: LoadedPlan, layout: 'client' | 'check') {
    return sheetPages(loaded, null, layout, { name: 'x', date }).pages.flatMap((page) => {
      if (page.picture?.kind !== 'plan') return []
      const { options, grow } = planPictureOptions(page.picture)
      const rooms = buildFloorPlan(planForFloor(loaded.plan, page.picture.floor)).rooms
      return [{
        rooms, grow, width: options.width!,
        // A room name's size on paper: its pixels, at the box's points per picture pixel.
        namePt: (TEXT_PX.roomName * PLAN_BOX.width * grow) / options.width!,
        drawPt: (() => {
          const drawn = pictureView(loaded.plan, { floor: page.picture.floor })
          return (TEXT_PX.roomName * PLAN_BOX.width * (drawn.view.width / drawn.width)) / fitTo(page.picture.frame, PLAN_BOX.width / PLAN_BOX.height).width
        })(),
        sheet: planPicture(loaded.plan, options),
        draw: planPicture(loaded.plan, { floor: page.picture.floor, ...(options.labels ? { labels: options.labels } : {}) }),
      }]
    })
  }
  const inside = (at: { x: number; y: number } | undefined, polygon: readonly { x: number; y: number }[]) => at !== undefined && pointInPolygon(at, polygon)

  it('draws each room\'s label inside that room on the townhouse (client)', () => {
    const floors = pictures(plans.get(TOWNHOUSE)!, 'client')
    for (const { rooms, sheet } of [floors[0]!, floors[2]!]) {
      const labels = labelsOf(sheet)
      for (const room of rooms) expect(inside(labels.get(room.id), room.polygon), room.id).toBe(true)
    }
  })

  it('never draws a label in another room on the townhouse (check): a name with its id that does not fit goes out, with a leader', () => {
    // At 5 pt, "Landing [g-landing]" no longer fits the narrow landing, as at grid draw's smaller zoom.
    for (const { rooms, sheet } of pictures(plans.get(TOWNHOUSE)!, 'check')) {
      const labels = labelsOf(sheet)
      for (const room of rooms) {
        const at = labels.get(room.id)
        if (inside(at, room.polygon)) continue
        expect(sheet.nodes.some((node) => node.key === `leader:${room.id}`), room.id).toBe(true)
        expect(rooms.filter((other) => inside(at, other.polygon)), room.id).toEqual([])
      }
    }
  })

  it('finds grid draw\'s zoom readable on the door-to-air plan, and too small on the townhouse', () => {
    for (const { drawPt } of pictures(plans.get(DOOR_TO_AIR)!, 'check')) expect(drawPt).toBeGreaterThanOrEqual(MIN_LABEL_PT)
    for (const { drawPt, namePt } of pictures(plans.get(TOWNHOUSE)!, 'check')) {
      expect(drawPt).toBeLessThan(MIN_LABEL_PT)
      expect(namePt).toBeCloseTo(MIN_LABEL_PT, 9)
    }
  })

  it.each(['client', 'check'] as const)('prints every room name at least 5 pt, with a bounded picture, empty floors too (%s)', (layout) => {
    expect(MIN_LABEL_PT).toBe(5)
    for (const [name, loaded] of [...plans, ...small]) {
      for (const { namePt, width } of pictures(loaded, layout)) {
        expect(namePt, name).toBeGreaterThanOrEqual(MIN_LABEL_PT * (1 - 1e-9))
        expect(width, name).toBeLessThanOrEqual((TEXT_PX.roomName * PLAN_BOX.width) / MIN_LABEL_PT + 35)
      }
    }
    expect(small.size).toBe(SMALL.length)
  })

  it.each(['client', 'check'] as const)('puts every label where grid draw puts it, at the same size against the rooms, where that is readable (%s)', (layout) => {
    for (const [name, loaded] of plans) {
      for (const { rooms, sheet, draw, drawPt } of pictures(loaded, layout)) {
        if (drawPt < MIN_LABEL_PT) continue
        expect((sheet.view.width / sheet.width) / (draw.view.width / draw.width), name).toBeCloseTo(1, 9)
        const ours = labelsOf(sheet)
        const theirs = labelsOf(draw)
        expect([...ours.keys()].sort(), name).toEqual([...theirs.keys()].sort())
        for (const room of rooms) {
          const [a, b] = [ours.get(room.id), theirs.get(room.id)]
          if (!a || !b) continue
          expect(Math.hypot(a.x - b.x, a.y - b.y), `${name} ${room.id}`).toBeLessThan(1e-6)
        }
      }
    }
  })

  it.each(['client', 'check'] as const)('draws every floor at one scale on the paper, a little past its frame (%s)', (layout) => {
    for (const [name, loaded] of plans) {
      const floors = pictures(loaded, layout)
      const metresPerPoint = floors.map(({ sheet, grow }) => sheet.view.width / (PLAN_BOX.width * grow))
      for (const each of metresPerPoint) expect(each / metresPerPoint[0]!, name).toBeCloseTo(1, 9)
      for (const { grow } of floors) { expect(grow).toBeGreaterThanOrEqual(1); expect(grow).toBeLessThan(1.05) }
    }
  })
})

describe('floors with the same name (VEW-7)', () => {
  /** The house with its two floors both called "Ground", and a third named apart. */
  function sameNames(third: boolean): LoadedPlan {
    const plan = structuredClone(house.plan)
    for (const floor of plan.floors!) floor.name = 'Ground'
    if (third) plan.floors!.push({ id: 'roof', name: 'Roof', level: 5 })
    const { issues, broken } = validatePlan(plan)
    return { file: 'same', plan, issues, broken }
  }
  const titles = (sheet: ReturnType<typeof sheetPages>) => sheet.pages.filter((p) => p.kind === 'floor').map((p) => p.title)

  it('gives each floor\'s id in its title on the check layout, as room labels carry theirs', () => {
    const sheet = sheetPages(sameNames(false), null, 'check', { name: 'x', date })
    expect(titles(sheet)).toEqual(['Ground [ground]', 'Ground [first]'])
    expect(sheet.pages[1]!.topLine).toBe('x / Ground [ground]')
    expect(titles(sheetPages(house, null, 'check', { name: 'x', date }))).toEqual(house.plan.floors!.map((f) => `${f.name} [${f.id}]`))
  })

  it('numbers the floors that share a name on the client layout, and never gives an id', () => {
    const sheet = sheetPages(sameNames(true), null, 'client', { name: 'x', date })
    expect(titles(sheet)).toEqual(['Ground, floor 1', 'Ground, floor 2', 'Roof'])
    expect(sheet.pages[1]!.topLine).toBe('x / Ground, floor 1')
    for (const page of sheet.pages) expect(`${page.title} ${page.topLine}`).not.toContain('[')
  })

  it('leaves the client titles of floors with their own names as they are', () => {
    expect(titles(sheetPages(house, null, 'client', { name: 'x', date }))).toEqual(house.plan.floors!.map((f) => f.name))
  })

  it.each(['client', 'check'] as const)('says which floor a floor page is, continued or not (%s)', (layout) => {
    const sheet = sheetPages(sameNames(false), null, layout, { name: 'x', date })
    // The check set ends with its two schedules (ARE-12), which belong to no floor.
    expect(sheet.pages.map((p) => p.floor)).toEqual(layout === 'check' ? [null, 'ground', 'first', null, null, null] : [null, 'ground', 'first'])
  })
})

describe("the person's units on the sheet (WRT-7)", () => {
  const inFeet: LoadedPlan = { ...house, plan: { ...house.plan, display: { length: 'ft-in' } } }
  const areas = planAreas(surveyPlan(house.plan))
  const sqFt = (m2: number): number => m2 / (0.3048 * 0.3048)

  it('writes the areas in square feet and the heights in feet and inches when the plan reads in feet', () => {
    const sheet = sheetPages(inFeet, words, 'client', { name: 'two-floor-house', date })
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'gross internal area')!.value).toBe(`${areaText(sqFt(areas.grossInternal!), 0)} sq ft`)
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'floor to floor')!.value).toMatch(/^\d+'-\d+"$/)
    const floor = sheet.pages[1]!
    expect(floor.table!.heading).toBe('Rooms / sq ft')
    const shown = sumText(areas.floors[0]!.rooms.filter((r) => r.zoneOf === undefined && r.countedWith === undefined).map((r) => sqFt(r.net ?? 0)), sqFt(areas.floors[0]!.net), 0)
    expect(floor.table!.total!.area).toBe(shown.total)
  })

  it('keeps metres for a plan with no display, as before', () => {
    const sheet = sheetPages(house, words, 'client', { name: 'two-floor-house', date })
    expect(sheet.pages[1]!.table!.heading).toBe('Rooms / m²')
    expect(sheet.pages[0]!.figures.find((f) => f.label === 'gross internal area')!.value).toMatch(/ m²$/)
  })
})
