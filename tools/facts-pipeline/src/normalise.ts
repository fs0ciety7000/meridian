/** Wikidata organisations kept from the snapshot (the small, well-known ones are curated). */
export const ORGANISATIONS: Record<string, string> = {
  Q7159: 'africanUnion',
  Q7785: 'commonwealth',
  Q7172: 'arabLeague',
  Q19771: 'g20',
};

/** Major languages a prompt may use; the long tail is not needed by prompts. */
const LANGUAGES: Record<string, string> = {
  Q1860: 'english',
  Q150: 'french',
  Q13955: 'arabic',
  Q1321: 'spanish',
  Q5146: 'portuguese',
  Q188: 'german',
  Q652: 'italian',
  Q7838: 'swahili',
  Q7411: 'dutch',
  Q7737: 'russian',
  Q9237: 'malay',
};

export function normaliseLanguages(raw: string[]): string[] {
  return [
    ...new Set(
      raw.flatMap((l) => (LANGUAGES[l.split(':')[0]!] ? [LANGUAGES[l.split(':')[0]!]!] : [])),
    ),
  ].sort();
}

/** Flag colour names in Wikidata vary ("crimson", "old glory blue"): fold them into a base palette. */
const COLOURS: Record<string, string> = {};
const family = (base: string, names: string[]) => names.forEach((n) => (COLOURS[n] = base));
family('red', [
  'red',
  'crimson',
  'dark red',
  'vermilion',
  'carmine',
  'maroon',
  'old glory red',
  'scarlet',
  'cardinal',
  'burgundy',
  'ruby',
  'rust',
]);
family('blue', [
  'blue',
  'light blue',
  'sky blue',
  'cobalt blue',
  'royal blue',
  'ultramarine',
  'turquoise blue',
  'turquoise',
  'cerulean',
  'israel blue',
  'old glory blue',
  'dark blue',
  'cyan',
  'azure',
  'navy blue',
  'navy',
  'aquamarine',
  'medium blue',
  'pantone 300',
  'baby blue',
  'teal',
  'cobalt',
]);
family('green', [
  'green',
  'saudi green',
  'light green',
  'dark green',
  'emerald',
  'kelly green',
  'forest green',
  'olive green',
  'pakistan green',
  'islamic green',
  'jungle green',
  'sea green',
]);
family('yellow', [
  'yellow',
  'gold',
  'golden',
  'golden yellow',
  'amber',
  'mustard',
  'school bus yellow',
  'yellow ochre',
  'chrome yellow',
]);
family('white', ['white', 'silver']);
family('black', ['black']);
family('orange', ['orange', 'saffron', 'deep saffron', 'india saffron', 'tangerine']);
family('brown', ['brown', 'dark brown', 'copper', 'tan', 'bronze']);
family('grey', ['grey', 'gray']);
family('purple', ['purple', 'violet', 'tyrian purple']);

export function normaliseColours(raw: string[]): string[] {
  const unknown = raw.filter((c) => !COLOURS[c]);
  if (unknown.length)
    throw new Error(`unknown flag colour(s): ${unknown.join(', ')} — add them to COLOURS`);
  return [...new Set(raw.map((c) => COLOURS[c]!))].sort();
}
