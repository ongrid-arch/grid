/**
 * VEW-78: the look of glass and of the sky behind it. The colour a finish is drawn in is the
 * core's (`finishTint`, CMD-55), so the 3D view and the 3D files tint a finish alike.
 */

export { finishTint } from '@ongrid/floorplan/geometry'

/** Glass as the 3D view draws it, in every theme: a pale green-blue that lets most of what is behind show. */
export const GLASS = Object.freeze({ color: '#bfd8dc', opacity: 0.28 })

/**
 * The sky a still taken in a room shows through its glass (`RasteriseOptions.sky`): its colour
 * overhead and at the horizon, and the ground's below it.
 */
export const SKY = Object.freeze({ zenith: '#9fbfdc', horizon: '#e4ecf1', ground: '#b5ae9c' })
