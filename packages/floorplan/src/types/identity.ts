/**
 * CNT-59 (C9 widened): what another tool calls a part. A wall, an opening, a room and a floor may
 * keep the GlobalId, the name and the tag a consultant's model gave it (`identity`), so the IFC and
 * the DXF Grid writes give them back and the consultant's tools see the same elements, not new
 * ones. Grid's id stays the part's id: every tool and edit takes it, and the identity sits beside
 * it. A part's own `name` (a room's, a floor's) is the person's and is never the outside name.
 *
 * Pure: no file, no clock.
 */

/** A part's identity in another tool: its GlobalId, its name and its tag, each optional. */
export interface Identity {
  readonly guid?: string | undefined
  readonly name?: string | undefined
  readonly tag?: string | undefined
}

/** IFC's 64-character alphabet for a GlobalId, in value order. */
export const GLOBAL_ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

/** An IfcGloballyUniqueId: 22 characters of the alphabet, the first carrying 2 bits (`0`-`3`). */
const GLOBAL_ID = /^[0-3][0-9A-Za-z_$]{21}$/
/** A UUID, with or without its dashes, in either case, with or without braces. */
const UUID = /^\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?$/i

/** Whether the text is a GlobalId Grid can write into an IFC file: IFC's own form or a UUID. */
export function isOutsideGuid(text: string): boolean {
  return GLOBAL_ID.test(text) || UUID.test(text)
}

/**
 * The stated GlobalId in IFC's 22-character form: as it is when it is in that form, a UUID's 128
 * bits packed as IFC packs them (2 bits, then 6 bits a character), else null.
 */
export function ifcGlobalId(guid: string): string | null {
  if (GLOBAL_ID.test(guid)) return guid
  const uuid = UUID.exec(guid)
  if (uuid === null) return null
  const hex = uuid.slice(1).join('').toLowerCase()
  const bits = [...hex].map((digit) => parseInt(digit, 16).toString(2).padStart(4, '0')).join('')
  let out = ''
  let at = 0
  for (let group = 0; group < 22; group++) {
    const width = group === 0 ? 2 : 6
    out += GLOBAL_ID_ALPHABET[parseInt(bits.slice(at, at + width), 2)]
    at += width
  }
  return out
}

/** The identity a part states, or none. */
export function identityOf(part: { readonly identity?: Identity | undefined }): Identity {
  return part.identity ?? {}
}

/** Whether a part states any of an identity. */
export function hasIdentity(part: { readonly identity?: Identity | undefined }): boolean {
  const own = part.identity
  return own !== undefined && (own.guid !== undefined || own.name !== undefined || own.tag !== undefined)
}

/** The names an identity's values go by where they are written with the facts: the DXF, the IFC. */
export const IDENTITY_FACTS = { guid: 'GUID', name: 'name', tag: 'tag' } as const
