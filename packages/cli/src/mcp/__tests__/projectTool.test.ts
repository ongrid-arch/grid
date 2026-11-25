import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'
import { bench } from './replay/harness'
import { twoBedFlat } from './replay/plans'

/** CMD-18: the first call works in any folder, and says what the folder holds. */

const benches: Array<ReturnType<typeof bench>> = []
afterAll(() => benches.forEach((b) => b.close()))
function make(plans: Record<string, unknown>, gridProject: boolean): ReturnType<typeof bench> {
  const b = bench(plans, gridProject)
  benches.push(b)
  return b
}

describe('grid_project', () => {
  it('lists plans, the default plan and the files beside each, without grid.json', async () => {
    const b = make({ 'plan.json': twoBedFlat(), 'other.json': twoBedFlat(), 'plan.brief.json': { version: '1' }, 'other.markers.json': { version: '1' }, 'notes.json': { hello: 1 } }, false)
    const reply = await b.call('grid_project', {})
    expect(reply.isError).toBe(false)
    const data = reply.data as { project: boolean; defaultPlan: string; defaultPlanThere: boolean; plans: Array<{ file: string; default: boolean; beside: Array<{ kind: string; file: string }> }> }
    expect(data.project).toBe(false)
    expect(data.defaultPlan).toBe('plan.json')
    expect(data.defaultPlanThere).toBe(true)
    expect(data.plans.map((p) => p.file)).toEqual(['other.json', 'plan.json'])
    expect(data.plans.find((p) => p.file === 'plan.json')!.default).toBe(true)
    expect(data.plans.find((p) => p.file === 'plan.json')!.beside).toEqual([{ kind: 'brief', file: 'plan.brief.json' }])
    expect(data.plans.find((p) => p.file === 'other.json')!.beside).toEqual([{ kind: 'markers', file: 'other.markers.json' }])
    expect(reply.text).toContain('holds no grid.json')
  })

  it('says the default plan is not written yet in an empty folder', async () => {
    const reply = await make({}, false).call('grid_project', {})
    const data = reply.data as { defaultPlanThere: boolean; plans: unknown[] }
    expect(data.defaultPlanThere).toBe(false)
    expect(data.plans).toEqual([])
    expect(reply.text).toContain('not written yet')
  })
})

describe('no plan named, no grid.json', () => {
  it('reads plan.json in the folder', async () => {
    const reply = await make({ 'plan.json': twoBedFlat() }, false).call('grid_describe', {})
    expect(reply.isError, reply.text).toBe(false)
  })

  it('says where it looked when there is none', async () => {
    const reply = await make({}, false).call('grid_describe', {})
    expect(reply.isError).toBe(true)
    expect(reply.text).toContain('holds no plan.json')
    expect(reply.text).toContain('no grid.json')
  })

  it('writes plan.json there with grid_write_rooms', async () => {
    const b = make({}, false)
    const rooms = 'walls outside 0.3 inside 0.1 height 2.6\nroom living "Living" living 4 x 4\n'
    const reply = await b.call('grid_write_rooms', { rooms })
    expect(reply.isError, reply.text).toBe(false)
    expect(((await b.call('grid_project', {})).data as { defaultPlanThere: boolean }).defaultPlanThere).toBe(true)
  })
})

describe('grid_write_brief keeps a brief that is there', () => {
  const brief = (area: number): Record<string, unknown> => ({ rooms: [{ name: 'Bathroom', area, level: 'must', source: 'given', quote: 'a bathroom' }] })

  it('refuses to replace it unless asked, and leaves the file as it was', async () => {
    const b = make({ 'plan.json': twoBedFlat() }, false)
    expect((await b.call('grid_write_brief', { brief: brief(4) })).isError).toBe(false)
    const file = join(b.folder, 'plan.brief.json')
    const before = (await import('fs')).readFileSync(file, 'utf8')
    const again = await b.call('grid_write_brief', { brief: brief(6) })
    expect(again.isError).toBe(true)
    expect(again.text).toContain('already a brief')
    expect(again.text).toContain('replace: true')
    expect((await import('fs')).readFileSync(file, 'utf8')).toBe(before)
    const replaced = await b.call('grid_write_brief', { brief: brief(6), replace: true })
    expect(replaced.isError, replaced.text).toBe(false)
    expect((await import('fs')).readFileSync(file, 'utf8')).not.toBe(before)
  })
})
