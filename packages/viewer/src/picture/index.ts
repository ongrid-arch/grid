/**
 * Pictures of a plan without a browser or the app. Pure: no DOM, no React.
 *
 * `planToSvg(plan, options)` returns one floor as an SVG file with its colours, line widths
 * and font written in. Its elements are the ones the app's 2D view draws. For PNG, see
 * `drawPlan` in the `ongrid` package.
 */
export { planToSvg, planPicture, pictureView, pictureFrame, pictureToSvg, lookOf, fileLookOf, undecidedDoorsOf, fullHeight, fileHeight, CAPTION_PX, DEFAULT_WIDTH } from './planSvg'
export type { PictureOptions, Picture, PictureFileOptions, PictureShow, TracePicture } from './planSvg'
export type { FaultLine, PictureKey } from './faults'
export {
  LIGHT_LOOK,
  DARK_LOOK,
  PICTURE_FONT,
  LOOKS,
  LOOK_NAMES,
  WORKING_LOOK,
  TECHNICAL_LOOK,
  DARK_WORKING_LOOK,
  PAPER_PENS,
  ELEVATION_PX,
  PAPER_SCALES,
  lineMetres,
  paperScaleOf,
  penSetFor,
  fileLook,
  detailShown
} from './look'
export { CONTRAST_LEAST, contrastRatio, lookPairs, relativeLuminance } from './contrast'
export type { ColourPair } from './contrast'
export type { PlanLook, Look, LookName, PaperScale } from './look'
export type { LabelStyle } from '../canvas2d/labelPlacement'
export { facadePicture, facadeScene, facadeToSvg, facadeCaption } from './facade'
export type { FacadePicture, FacadePictureOptions } from './facade'
export { comparisonPicture, COMPARISON_COLORS, COMPARISON_LOOK, UNCHANGED_COLORS } from './comparison'
export type { ComparisonPictureOptions } from './comparison'
export { sectionPicture } from './section'
export type { SectionPicture, SectionPictureOptions } from './section'
