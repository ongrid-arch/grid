import { fileHeight, type Picture } from '@ongrid/viewer/src/picture'

export interface PixelTransform {
  readonly space: 'plan' | 'facade' | 'section'
  /** [a, b, c, d, e, f]: (a*x + b*y + e, c*x + d*y + f), from pixel edges. */
  readonly coefficients: readonly [number, number, number, number, number, number]
  /** Drawing area in image pixels, excluding keys and captions. */
  readonly area: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
}

export function pixelTransform(
  picture: Pick<Picture, 'view' | 'width' | 'height' | 'key'>,
  space: PixelTransform['space'],
  { x = 0, y = 0, scale = 1 }: { x?: number; y?: number; scale?: number } = {},
): PixelTransform {
  const { view, width, height } = picture
  const total = fileHeight(picture)
  // The SVG centres the drawing in its frame. It also centres the whole sheet when rounding
  // the output size at a fractional scale changes the aspect ratio.
  const inner = Math.min(width / view.width, height / view.height)
  const outerWidth = Math.round(width * scale)
  const outerHeight = Math.round(total * scale)
  const outer = Math.min(outerWidth / width, outerHeight / total)
  const left = x + (outerWidth - width * outer) / 2 + (width - view.width * inner) * outer / 2
  const top = y + (outerHeight - total * outer) / 2 + (height - view.height * inner) * outer / 2
  const metres = 1 / (inner * outer)
  return {
    space,
    coefficients: [metres, 0, 0, -metres, view.x - left * metres, -view.y + top * metres],
    area: { x: left, y: top, width: view.width / metres, height: view.height / metres },
  }
}

/** A world file starts at the centre of the first pixel and lists the coefficients by column. */
export function worldFileText({ coefficients: [a, b, c, d, e, f] }: PixelTransform): string {
  return [a, c, b, d, e + (a + b) / 2, f + (c + d) / 2].join('\n') + '\n'
}
