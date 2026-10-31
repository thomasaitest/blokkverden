/** Display names: letters only (incl. Norwegian), short, no free text. */

export const NAME_MAX = 12;
export const NAME_MIN = 2;

/** Allow A–Z, ÆØÅ, and spaces between words — letters only as requested. */
const NAME_RE = /^[A-Za-zÆØÅæøå]+(?:[ -][A-Za-zÆØÅæøå]+)?$/;

const BLOCKED = new Set(
  [
    'admin',
    'moderator',
    'system',
    'server',
    'null',
    'undefined',
    'idiot',
    'fuck',
    'shit',
    'helvete',
    'faen',
    'homo',
    'hore',
    'fitte',
    'pikk',
    'nazi',
    'hitler',
  ].map((s) => s.toLowerCase()),
);

export function filterName(raw: string): string | null {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return null;
  if (!NAME_RE.test(trimmed)) return null;
  const key = trimmed.toLowerCase().replace(/[ -]/g, '');
  if (BLOCKED.has(key) || [...BLOCKED].some((b) => key.includes(b))) return null;
  // Title-case first letter of each word for display consistency
  return trimmed
    .split(/([ -])/)
    .map((part) => (/^[A-Za-zÆØÅæøå]/.test(part) ? part[0]!.toUpperCase() + part.slice(1) : part))
    .join('');
}

export function nameError(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < NAME_MIN) return 'Navnet må ha minst 2 bokstaver.';
  if (trimmed.length > NAME_MAX) return `Navnet kan ha maks ${NAME_MAX} bokstaver.`;
  if (!NAME_RE.test(trimmed.replace(/\s+/g, ' '))) return 'Bare bokstaver (og mellomrom).';
  if (!filterName(raw)) return 'Velg et annet navn.';
  return null;
}
