/**
 * VEW-85: the site plan as a picture, and the site drawn faint under a floor. Every building of the
 * plan is drawn in poche with its name, storeys and height; the things the person labelled carry
 * their labels; the set-back lines, the street's word, the scale bar and the north arrow are drawn.
 */
import { describe, expect, it } from 'vitest'
import { loadLanguage } from '@ongrid/floorplan/messages'
import { sitePlanFixture } from '@ongrid/floorplan/test-support/sitePlan'
import { pictureToSvg, planPicture } from '../index'
import { roundLength, sitePlanPicture } from '../sitePlan'

describe('the site plan picture (VEW-85)', () => {
  it('draws every building in poche with its words, and the labels, set-backs, street, scale bar and north', () => {
    const picture = sitePlanPicture(sitePlanFixture())
    const svg = pictureToSvg(picture)
    expect(svg.match(/data-part="site-building"/g)).toHaveLength(3)
    for (const words of ['House', '2 storeys', 'Studio', 'Garage', '1 storey', 'Old oak', 'Assembly point', 'Street', 'set-back 4.00 m', 'set-back 2.00 m']) expect(svg, words).toContain(`>${words}`)
    expect(svg).toMatch(/data-part="scale-bar" data-metres="(5|10)"/)
    expect(svg).toContain('data-part="north-arrow"')
    expect(svg).toContain('Site plan, Garden Court, 1 Example Lane')
    expect(picture.title).toBe('Site plan of the plot, 3 buildings')
    // The buildings over the site's ground, their words over the buildings.
    expect(svg.indexOf('data-part="site"')).toBeLessThan(svg.indexOf('data-part="site-building"'))
    expect(svg.lastIndexOf('data-part="site-building"')).toBeLessThan(svg.indexOf('data-part="site-building-name"'))
  })

  it('frames the whole plot, not one building', () => {
    const { view } = sitePlanPicture(sitePlanFixture())
    expect(view.x).toBeLessThan(0)
    expect(view.x + view.width).toBeGreaterThan(40)
    expect(-view.y).toBeGreaterThan(30)
  })

  it('writes its words in the language asked', async () => {
    await loadLanguage('es')
    const svg = pictureToSvg(sitePlanPicture(sitePlanFixture(), { language: 'es' }))
    expect(svg).toContain('>2 plantas')
    expect(svg).toContain('>Calle')
    expect(svg).toContain('retranqueo 4,00 m')
  })

  it('draws the site faint under an upper floor, framed with it, only when asked', () => {
    const plan = sitePlanFixture()
    const plain = planPicture(plan, { floor: 'up' })
    expect(pictureToSvg(plain)).not.toContain('data-part="site-under"')
    const under = planPicture(plan, { floor: 'up', site: true })
    const svg = pictureToSvg(under)
    expect(svg).toContain('data-part="site-under" opacity="0.35"')
    expect(svg).toContain('>Assembly point')
    expect(svg.match(/data-part="site-building"/g)).toHaveLength(3)
    // Framed with the plot, so it is wider than the floor alone.
    expect(under.view.width).toBeGreaterThan(plain.view.width)
    // Under the floor's own drawing.
    expect(svg.indexOf('data-part="site-under"')).toBeLessThan(svg.indexOf('data-part="room"'))
  })

  it('takes a round length for the scale bar', () => {
    expect(roundLength(13)).toBe(10)
    expect(roundLength(4.2)).toBe(2)
    expect(roundLength(60)).toBe(50)
  })
})

describe('street names on the site plan (VEW-88)', () => {
  /** The fixture with its south street named and an east street left unnamed; the names are invented. */
  const named = () => {
    const plan = sitePlanFixture()
    return { ...plan, site: { ...plan.site!, streets: [1, 2], streetNames: [{ edge: 1, name: 'Harbour Road' }] } }
  }

  it('writes a named street along its edge, outside the plot, and the word Street on an unnamed one', () => {
    const svg = pictureToSvg(sitePlanPicture(named()))
    const streets = [...svg.matchAll(/data-part="site-street-name" transform="translate\(([-\d.]+) ([-\d.]+)\)[^"]*"[^>]*>(?:<[^>]+>)*?<text[^>]*>([^<]+)</g)].map((m) => ({ x: Number(m[1]), y: -Number(m[2]), words: m[3] }))
    expect(streets.map((s) => s.words)).toEqual(['Harbour Road', 'Street'])
    // Harbour Road is south of the plot's south edge, the unnamed street east of its east edge.
    expect(streets[0]!.y).toBeLessThan(0)
    expect(streets[1]!.x).toBeGreaterThan(40)
  })

  it('keeps the name as written in the picture, escaped as text', () => {
    const plan = named()
    const svg = pictureToSvg(sitePlanPicture({ ...plan, site: { ...plan.site, streetNames: [{ edge: 1, name: 'Quay & <Mill> Lane' }] } }))
    expect(svg).toContain('Quay &amp; &lt;Mill&gt; Lane')
  })
})
