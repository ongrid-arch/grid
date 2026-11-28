import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '@ongrid/floorplan/types/floorplan'
import { estimateTextWidth } from '../../canvas2d/labelPlacement'
import { house } from '../../canvas2d/__tests__/fixtures'
import type { FaultLine } from '../faults'
import { faultsOnFloor, wrapText } from '../faults'
import { TEXT_PX } from '../look'
import { fileHeight, fullHeight, pictureToSvg, planPicture, planToSvg } from '../planSvg'

/** MSG-8, in the viewer: numbering, the key and the file a picture with faults writes. */

const line = (kind: FaultLine['thing']['kind'], id: string, floor: string | null, message = `${kind} ${id}`): FaultLine => ({
  thing: { kind, id },
  floor,
  message
})

describe('faultsOnFloor', () => {
  it('keeps the floor\'s lines and the plan\'s, numbered in the whole list', () => {
    const lines = [line('plan', '', null), line('room', 'a', 'up'), line('room', 'b', 'ground'), line('opening', 'd', 'ground')]
    const faults = faultsOnFloor(lines, 'ground', new Map([['d', 'w1']]))
    expect(faults.map((f) => f.number)).toEqual([1, 3, 4])
    expect(faults[2]!.wall).toBe('w1')
    expect(faults[1]!.wall).toBeUndefined()
  })

  it('keeps a line said once for several floors on each of them (MSG-36)', () => {
    const lines: FaultLine[] = [line('floor', 'l1', 'l1'), { ...line('floor', 'l2', 'l2'), floors: ['l2', 'l3', 'l4'] }]
    expect(faultsOnFloor(lines, 'l3').map((f) => f.number)).toEqual([2])
    expect(faultsOnFloor(lines, 'l2').map((f) => f.number)).toEqual([2])
    expect(faultsOnFloor(lines, 'l1').map((f) => f.number)).toEqual([1])
  })
})

describe('wrapText', () => {
  it('breaks by words within the width, and keeps a long word whole', () => {
    const width = estimateTextWidth('a'.repeat(20), TEXT_PX.warning)
    const lines = wrapText('one two three four five six seven eight nine ten', TEXT_PX.warning, width)
    expect(lines.join(' ')).toBe('one two three four five six seven eight nine ten')
    for (const text of lines) expect(estimateTextWidth(text, TEXT_PX.warning)).toBeLessThanOrEqual(width)
    expect(wrapText('x'.repeat(40), TEXT_PX.warning, width)).toEqual(['x'.repeat(40)])
  })
})

describe('a picture given faults', () => {
  const plan = (): FloorPlan => house()
  const firstRoom = (): string => plan().rooms[0]!.id

  it('is the same picture with no key when no line is about its floor', () => {
    const bare = planPicture(plan(), { width: 800, height: 600 })
    const given = planPicture(plan(), { width: 800, height: 600, faults: [] })
    expect(given.key).toBeNull()
    expect(pictureToSvg(given)).toBe(pictureToSvg(bare))
  })

  it('grows by its key, and writes the plan above it in its own frame', () => {
    const picture = planPicture(plan(), { width: 800, height: 600, faults: [line('room', firstRoom(), 'ground', 'Something to look at')] })
    expect(picture.key).not.toBeNull()
    expect(fullHeight(picture)).toBe(600 + picture.key!.height)
    const svg = planToSvg(plan(), { width: 800, height: 600, faults: [line('room', firstRoom(), 'ground', 'Something to look at')] })
    expect(svg).toMatch(new RegExp(`^<svg xmlns="http://www.w3.org/2000/svg" width="800" height="${fileHeight(picture)}" viewBox="0 0 800 ${fileHeight(picture)}"`))
    expect(svg).toContain('data-part="key"')
    expect(svg).toContain('>Something to look at</text>')
    expect(svg).toContain(`data-part="fault-mark" data-thing="room" data-id="${firstRoom()}" data-numbers="1"`)
  })

  it('counts the lines of other floors in the key without listing them', () => {
    const picture = planPicture(plan(), { faults: [line('room', 'x', 'elsewhere'), line('room', 'y', 'elsewhere')] })
    const svg = pictureToSvg(picture)
    expect(svg).toContain('>2 more on other floors.</text>')
    expect(svg).not.toContain('data-part="fault-mark"')
  })
})
