/** ARE-67: seats, desks and covers counted from the furniture, per item, room, zone, floor and plan. */
import { describe, expect, it } from 'vitest'
import { parseFloorPlan } from '@ongrid/floorplan/types/floorplan'
import { surveyPlan } from '../survey'
import { itemSeats, labelSeats, planSeating, SEATING } from '../seats'
import { chair, seatingPlan, SEATING_ITEMS } from './seatingPlan'

const survey = (items: unknown[] = SEATING_ITEMS) => surveyPlan(parseFloorPlan(seatingPlan(items)))

describe('ARE-67: the seats one piece gives', () => {
  it('gives a chair, a stool, an armchair and a fixed seat one each, and a desk none', () => {
    for (const kind of ['chair', 'stool', 'armchair', 'seat']) expect(itemSeats({ kind, size: [0.5, 0.5] })).toEqual({ seats: 1, from: 'kind' })
    expect(itemSeats({ kind: 'desk', size: [1.4, 0.7] })).toEqual({ seats: 0, from: null })
    expect(itemSeats({ kind: 'bed', size: [1.6, 2] }).seats).toBe(0)
  })

  it('gives a sofa or a pew one seat per seat width, at least one', () => {
    expect(SEATING.seatWidth).toBe(0.6)
    expect(itemSeats({ kind: 'sofa', size: [1.8, 0.8] })).toEqual({ seats: 3, from: 'width' })
    expect(itemSeats({ kind: 'pew', size: [4.2, 0.5] }).seats).toBe(7)
    expect(itemSeats({ kind: 'sofa', size: [0.5, 0.8] }).seats).toBe(1)
  })

  it('reads the seats a label states first', () => {
    expect(labelSeats('3-seat sofa')).toBe(3)
    expect(labelSeats('Banquette, 6 seats')).toBe(6)
    expect(labelSeats('Booth for 4')).toBe(4)
    expect(labelSeats('Sofa')).toBeNull()
    expect(itemSeats({ kind: 'sofa', size: [1.8, 0.8], label: '2 seater' })).toEqual({ seats: 2, from: 'label' })
  })
})

describe('ARE-67: the plan\'s seats, desks and covers', () => {
  const counted = planSeating(survey())

  it('counts the plan once', () => {
    // 5 desk chairs, 4 at the table, 3 on the sofa, the stool.
    expect(counted.plan).toEqual({ seats: 13, desks: 5, covers: 4 })
    expect(counted.floors.get('ground')).toEqual(counted.plan)
    expect(counted.outside).toBe(0)
  })

  it('counts each room with its zones\' pieces, and each zone with its own', () => {
    expect(counted.rooms.get('open')).toMatchObject({ seats: 5, desks: 5, covers: 0 })
    expect(counted.rooms.get('cafe')).toMatchObject({ seats: 8, desks: 0, covers: 4 })
    expect(counted.zones.get('team-a')).toMatchObject({ seats: 3, desks: 3 })
    expect(counted.zones.get('team-b')).toMatchObject({ seats: 2, desks: 2 })
    expect(counted.rooms.has('team-a')).toBe(false)
  })

  it('makes a cover only of a seat at a table', () => {
    const covers = counted.rows.filter((row) => row.covers > 0).map((row) => row.id).sort()
    expect(covers).toEqual(['t1-e', 't1-n', 't1-s', 't1-w'])
    // Moved a metre off the table, a chair is a seat and no cover.
    const away = planSeating(survey([{ id: 't1', kind: 'table', at: [8, 2], size: [1.2, 0.8], height: 0.75 }, chair('c', 8, 3.6)]))
    expect(away.plan).toEqual({ seats: 1, desks: 0, covers: 0 })
  })

  it('gives every item its zone', () => {
    expect(counted.itemZones.get('a1')).toBe('team-a')
    expect(counted.itemZones.get('b2')).toBe('team-b')
    expect(counted.itemZones.get('sofa')).toBeNull()
  })
})
