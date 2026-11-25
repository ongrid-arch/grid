/**
 * MSG-11: the one fixed list of room uses (`ROOM_USES`), with its label in each language.
 *
 * A use is one of the list, whatever the language: a room written with the use "dormitorio" is a
 * `bedroom`, and is checked as one. A label is the use's own name in a language, not a word Grid
 * guesses a use from (`USE_WORDS`), so even the uses no guessed word is read as (bedroom, living,
 * dining) are read from their labels. A room's name is never a use and never translated: it is
 * the person's own word for the room, and stays as written.
 *
 * The Spanish labels are a draft translation, not reviewed, as the rest of `es.ts` is.
 *
 * MSG-22: a person writes a use in their own words, in their own language, whether Grid writes
 * that language or not (`USE_WORDS_BY_LANGUAGE`): `cocineta`, `Flur`, `chambre`, `卧室`. Each is a
 * word that means one use and nothing else in its language; a word that means two things (`sala`,
 * `habitación`, `entrée`, `Keller`) is left out, as `hall` is in English. A word that is a use's own
 * name in a language (`Schlafzimmer`, `chambre`, `卧室`) is read as that use, `bedroom`, `living`
 * and `dining` too, as the labels are: the person chose the use in their own words.
 */
import type { RoomUse } from '../types/floorplan'
import type { Language } from './languages'

export const USE_LABELS: Readonly<Record<Language, Readonly<Record<RoomUse, string>>>> = {
  en: {
    bedroom: 'bedroom',
    living: 'living',
    dining: 'dining',
    kitchen: 'kitchen',
    bathroom: 'bathroom',
    toilet: 'toilet',
    utility: 'utility',
    study: 'study',
    office: 'office',
    meeting: 'meeting',
    reception: 'reception',
    retail: 'retail',
    classroom: 'classroom',
    treatment: 'treatment',
    waiting: 'waiting',
    sport: 'sport',
    changing: 'changing',
    staff: 'staff',
    worship: 'worship',
    assembly: 'assembly',
    corridor: 'corridor',
    stair: 'stair',
    lift: 'lift',
    storage: 'storage',
    plant: 'plant',
    parking: 'parking',
    other: 'other'
  },
  es: {
    bedroom: 'dormitorio',
    living: 'salón',
    dining: 'comedor',
    kitchen: 'cocina',
    bathroom: 'baño',
    toilet: 'aseo',
    utility: 'lavadero',
    study: 'estudio',
    office: 'oficina',
    meeting: 'sala de reuniones',
    reception: 'recepción',
    retail: 'tienda',
    classroom: 'aula',
    treatment: 'consulta',
    waiting: 'sala de espera',
    sport: 'sala de deporte',
    changing: 'vestuario',
    staff: 'sala de personal',
    worship: 'sala de culto',
    assembly: 'salón de actos',
    corridor: 'pasillo',
    stair: 'escalera',
    lift: 'ascensor',
    storage: 'almacén',
    plant: 'instalaciones',
    parking: 'aparcamiento',
    other: 'otro'
  }
}

/** A use's label in a language: `dormitorio` for `bedroom` in Spanish. */
export function labelOfUse(language: Language, use: RoomUse): string {
  return USE_LABELS[language][use]
}

/**
 * MSG-22: words for a use in a few languages, Grid's own among them, each meaning that use and
 * nothing else, keyed by the language's tag. Read as `roomUseOfLabel` reads a label. The words are
 * Grid's own choice, not reviewed by a speaker of each language: a word missing here is read as no
 * use stated, with a line that names it.
 */
export const USE_WORDS_BY_LANGUAGE: Readonly<Record<string, Readonly<Record<string, RoomUse>>>> = {
  es: {
    'recámara': 'bedroom',
    'sala de estar': 'living',
    'cocineta': 'kitchen',
    'cuarto de baño': 'bathroom',
    'baño completo': 'bathroom',
    'medio baño': 'toilet',
    'lavandería': 'utility',
    'cuarto de lavado': 'utility',
    'sala de juntas': 'meeting',
    'local comercial': 'retail',
    'gimnasio': 'sport',
    'vestíbulo': 'corridor',
    'recibidor': 'corridor',
    'distribuidor': 'corridor',
    'escaleras': 'stair',
    'elevador': 'lift',
    'trastero': 'storage',
    'despensa': 'storage',
    'alacena': 'storage',
    'bodega': 'storage',
    'vestidor': 'storage',
    'cuarto de máquinas': 'plant',
    'garaje': 'parking',
    'cochera': 'parking'
  },
  de: {
    'Schlafzimmer': 'bedroom',
    'Schlafen': 'bedroom',
    'Kinderzimmer': 'bedroom',
    'Kind': 'bedroom',
    'Wohnzimmer': 'living',
    'Wohnen': 'living',
    'Esszimmer': 'dining',
    'Essen': 'dining',
    'Küche': 'kitchen',
    'Kochen': 'kitchen',
    'Bad': 'bathroom',
    'Badezimmer': 'bathroom',
    'Duschbad': 'bathroom',
    'Gäste-WC': 'toilet',
    'Toilette': 'toilet',
    'Hauswirtschaftsraum': 'utility',
    'HWR': 'utility',
    'Waschküche': 'utility',
    'Arbeitszimmer': 'study',
    'Büro': 'office',
    'Flur': 'corridor',
    'Diele': 'corridor',
    'Treppe': 'stair',
    'Treppenhaus': 'stair',
    'Aufzug': 'lift',
    'Abstellraum': 'storage',
    'Speisekammer': 'storage',
    'Heizraum': 'plant',
    'Technikraum': 'plant'
  },
  fr: {
    'chambre': 'bedroom',
    'séjour': 'living',
    'salle à manger': 'dining',
    'cuisine': 'kitchen',
    'salle de bains': 'bathroom',
    'salle de bain': 'bathroom',
    "salle d'eau": 'bathroom',
    'toilettes': 'toilet',
    'buanderie': 'utility',
    'bureau': 'office',
    'couloir': 'corridor',
    'dégagement': 'corridor',
    'escalier': 'stair',
    'ascenseur': 'lift',
    'cellier': 'storage',
    'rangement': 'storage',
    'placard': 'storage',
    'chaufferie': 'plant'
  },
  zh: {
    '卧室': 'bedroom',
    '主卧': 'bedroom',
    '次卧': 'bedroom',
    '客厅': 'living',
    '起居室': 'living',
    '餐厅': 'dining',
    '厨房': 'kitchen',
    '卫生间': 'bathroom',
    '浴室': 'bathroom',
    '厕所': 'toilet',
    '洗手间': 'toilet',
    '洗衣房': 'utility',
    '书房': 'study',
    '办公室': 'office',
    '会议室': 'meeting',
    '走廊': 'corridor',
    '过道': 'corridor',
    '玄关': 'corridor',
    '楼梯': 'stair',
    '电梯': 'lift',
    '储藏室': 'storage',
    '储物间': 'storage',
    '衣帽间': 'storage',
    '车库': 'parking'
  }
}

/**
 * A label as it is matched: lower case, accents taken off, letters and digits only, of any script
 * (MSG-22), so `客厅` is matched as written and never as nothing.
 */
export function foldLabel(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
}

const BY_LABEL: ReadonlyMap<string, RoomUse> = new Map([
  ...Object.values(USE_WORDS_BY_LANGUAGE).flatMap((words) => Object.entries(words).map(([word, use]) => [foldLabel(word), use] as const)),
  ...Object.values(USE_LABELS).flatMap((labels) => Object.entries(labels).map(([use, label]) => [foldLabel(label), use as RoomUse] as const))
])

/**
 * The use a label names in any language Grid writes, whatever its capitals and accents:
 * `Dormitorio` is `bedroom`; and MSG-22, a word for a use in a language of
 * `USE_WORDS_BY_LANGUAGE`: `Flur` is `corridor`, `卧室` is `bedroom`. Null for any other word.
 */
export function roomUseOfLabel(word: string): RoomUse | null {
  const folded = foldLabel(word)
  return folded === '' ? null : (BY_LABEL.get(folded) ?? null)
}
