/**
 * The names the view tool takes, apart from the drawing code, which is loaded only when a
 * picture is drawn: it brings Three and React with it.
 */

/**
 * The looks a plan view is drawn in (SHT-1): `working`, the default for every picture an agent
 * gets, `technical`, black on white as on a sheet, and `dark`; VEW-76's `simple`, a picture to
 * show a person, and `large`, its large-print form. `light` and `mono` are the older names for
 * `working` and `technical`, still taken.
 */
export const LOOKS = ['working', 'technical', 'dark', 'simple', 'large', 'light', 'mono'] as const
export type LookName = (typeof LOOKS)[number]

/** The look an older name stands for. */
export function namedLook(look: LookName): 'working' | 'technical' | 'dark' | 'simple' | 'large' {
  return look === 'light' ? 'working' : look === 'mono' ? 'technical' : look
}

/**
 * SHT-10: the look a picture handed to an agent or written to a file is drawn in: always on light
 * paper, so `dark`, the screen's theme, draws the working look. The preview page's own drawing,
 * which the page shows on its screen, keeps `namedLook`.
 */
export function pictureLook(look: LookName): 'working' | 'technical' | 'simple' | 'large' {
  const named = namedLook(look)
  return named === 'dark' ? 'working' : named
}

/** VEW-76: the look a facade, a section or a sheet of floors is drawn in: a look for people draws as working there. */
export function drawingLook(look: LookName): 'working' | 'technical' {
  const named = pictureLook(look)
  return named === 'simple' || named === 'large' ? 'working' : named
}

export const SIDES = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'above'] as const
export type Side = (typeof SIDES)[number]
