import { create } from 'zustand';

export type Locale = 'fr' | 'en';

const STRINGS = {
  appName: { fr: 'Meridian', en: 'Meridian' },
  tagline: { fr: 'Atlas d’expédition', en: 'Expedition atlas' },
  newExpedition: { fr: 'Nouvelle expédition', en: 'New expedition' },
  easy: { fr: 'Facile', en: 'Easy' },
  normal: { fr: 'Normal', en: 'Normal' },
  expert: { fr: 'Expert', en: 'Expert' },
  catalog: { fr: 'Carnet d’expéditions', en: 'Expedition logbook' },
  catalogEmpty: { fr: 'Le carnet se remplit bientôt.', en: 'The logbook is being written.' },
  haveCode: { fr: 'J’ai un code', en: 'I have a code' },
  codeInvalid: {
    fr: 'Code illisible : vérifiez chaque caractère.',
    en: 'Unreadable code: check each character.',
  },
  go: { fr: 'Partir', en: 'Set off' },
  inProgress: { fr: 'En cours', en: 'In progress' },
  resume: { fr: 'Reprendre', en: 'Resume' },
  passport: { fr: 'Passeport', en: 'Passport' },
  atlas: { fr: 'Atlas', en: 'Atlas' },
  home: { fr: 'Accueil', en: 'Home' },
  legOf: { fr: 'Étape {n} / 6 · Consigne', en: 'Leg {n} / 6 · Prompt' },
  plant: { fr: 'Planter le camp', en: 'Plant the camp' },
  spyglass: { fr: 'Longue-vue', en: 'Spyglass' },
  spyglassLeft: { fr: 'Longue-vue ({n})', en: 'Spyglass ({n})' },
  spyglassNote: {
    fr: 'La longue-vue révèle les régions où chercher. Palier maximal : Confins.',
    en: 'The spyglass reveals where to look. Best tier: Frontier.',
  },
  tapMap: {
    fr: 'Touchez la carte pour poser un camp provisoire',
    en: 'Tap the map to pitch a provisional camp',
  },
  atSea: {
    fr: 'En mer : rapprochez-vous d’une côte, ou maintenez le doigt pour la loupe.',
    en: 'At sea: move closer to a coast, or press and hold for the loupe.',
  },
  unplantable: {
    fr: 'Territoire non plantable (statut contesté ou non membre de l’ONU).',
    en: 'Unplantable territory (disputed or not a UN member).',
  },
  alreadyUsed: { fr: 'Vous avez déjà campé : {name}.', en: 'You already camped in {name}.' },
  snapped: {
    fr: 'Camp recalé sur la terre la plus proche.',
    en: 'Camp moved to the nearest land.',
  },
  falseTrail: { fr: 'Fausse piste : {name}.', en: 'False trail: {name}.' },
  meridianCrossed: { fr: 'Méridien franchi !', en: 'Meridian crossed!' },
  missions: { fr: 'Ordres de mission', en: 'Mission orders' },
  log: { fr: 'Carnet de route', en: 'Route log' },
  distance: { fr: 'Distance parcourue', en: 'Distance travelled' },
  renown: { fr: 'Renommée', en: 'Renown' },
  meridian: { fr: 'Méridien {lon}', en: 'Meridian {lon}' },
  departure: { fr: 'Départ : {name}', en: 'Departure: {name}' },
  completed: { fr: 'Expédition terminée', en: 'Expedition complete' },
  abandoned: { fr: 'Expédition abandonnée', en: 'Expedition abandoned' },
  abandon: { fr: 'Abandonner', en: 'Abandon' },
  abandonConfirm: {
    fr: 'Abandonner cette expédition ? Les étapes restantes ne compteront pas.',
    en: 'Abandon this expedition? Remaining legs will not count.',
  },
  replay: { fr: 'Rejouer', en: 'Replay' },
  replayNote: {
    fr: 'Rejeu : score affiché, sans tampon ni encrage de l’atlas.',
    en: 'Replay: score shown, no stamps, no atlas ink.',
  },
  share: { fr: 'Envoyer la carte postale', en: 'Send the postcard' },
  copied: { fr: 'Lien copié.', en: 'Link copied.' },
  challengeFrom: {
    fr: 'Un ami vous défie · {code} · {km} km',
    en: 'A friend challenges you · {code} · {km} km',
  },
  acceptChallenge: { fr: 'Relever le défi', en: 'Take up the challenge' },
  you: { fr: 'Vous', en: 'You' },
  friend: { fr: 'Ami', en: 'Friend' },
  estimated: { fr: 'estimé', en: 'estimated' },
  freshInk: { fr: 'encre fraîche', en: 'fresh ink' },
  dryInk: { fr: 'encre sèche', en: 'dry ink' },
  notFound: { fr: 'Expédition introuvable.', en: 'Expedition not found.' },
  loading: { fr: 'Chargement de l’atlas…', en: 'Loading the atlas…' },
  loadError: { fr: 'Impossible de charger l’atlas : {e}', en: 'Could not load the atlas: {e}' },
  countriesStamped: {
    fr: '{n} pays tamponnés sur {total}',
    en: '{n} countries stamped out of {total}',
  },
  noStamp: { fr: 'Aucun tampon pour l’instant.', en: 'No stamp yet.' },
  theme: { fr: 'Thème', en: 'Theme' },
  language: { fr: 'English', en: 'Français' },
  skip: { fr: 'Toucher pour passer', en: 'Tap to skip' },
  falseTrailShort: { fr: 'fausse piste', en: 'false trail' },
  notPlayed: { fr: 'non jouée', en: 'not played' },
  tierKnown: { fr: 'Route connue', en: 'Known route' },
  tierTrail: { fr: 'Sentier', en: 'Trail' },
  tierFrontier: { fr: 'Confins', en: 'Frontier' },
  tierIncognita: { fr: 'Terra incognita', en: 'Terra incognita' },
  mission_continentHopper: {
    fr: 'Change de continent au moins {n} fois',
    en: 'Change continent at least {n} times',
  },
  mission_equatorShuttle: {
    fr: 'Franchis l’équateur à l’aller et au retour',
    en: 'Cross the equator there and back',
  },
  mission_southernSoul: {
    fr: 'Ne quitte jamais l’hémisphère sud',
    en: 'Never leave the southern hemisphere',
  },
  mission_northernSoul: {
    fr: 'Ne quitte jamais l’hémisphère nord',
    en: 'Never leave the northern hemisphere',
  },
  mission_longHaul: { fr: 'Une étape de plus de {km} km', en: 'One leg longer than {km} km' },
  mission_noFalseTrail: { fr: 'Aucune fausse piste', en: 'No false trail' },
  mission_meridianWeaver: { fr: 'Franchis deux fois le méridien', en: 'Cross the meridian twice' },
} as const;

export type StringKey = keyof typeof STRINGS;

const initialLocale = (): Locale => {
  try {
    const saved = localStorage.getItem('meridian.locale');
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    /* storage unavailable */
  }
  return navigator.language.toLowerCase().startsWith('fr') ? 'fr' : 'en';
};

export const useLocale = create<{ locale: Locale; setLocale: (l: Locale) => void }>((set) => ({
  locale: initialLocale(),
  setLocale: (locale) => {
    try {
      localStorage.setItem('meridian.locale', locale);
    } catch {
      /* storage unavailable */
    }
    document.documentElement.lang = locale;
    set({ locale });
  },
}));

export function translate(
  locale: Locale,
  key: StringKey,
  vars: Record<string, string | number> = {},
) {
  return STRINGS[key][locale].replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ''));
}

export function useT() {
  const locale = useLocale((s) => s.locale);
  return (key: StringKey, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

const numberFormats = new Map<string, Intl.NumberFormat>();
export function formatNumber(locale: Locale, n: number) {
  let f = numberFormats.get(locale);
  if (!f)
    numberFormats.set(
      locale,
      (f = new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
        maximumFractionDigits: 0,
      })),
    );
  return f.format(Math.round(n));
}
