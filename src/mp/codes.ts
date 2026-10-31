/** Short invite codes without confusable characters (0/O, 1/I/L). */

export const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LEN = 5;

/** Strip junk and uppercase; only alphabet characters kept. */
export function cleanCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^23456789ABCDEFGHJKMNPQRSTUVWXYZ]/g, '')
    .slice(0, CODE_LEN);
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LEN && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export function generateCode(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[(rng() * CODE_ALPHABET.length) | 0]!;
  }
  return out;
}

/** Durable Object id name from room code. */
export function roomObjectName(code: string): string {
  return `room:${cleanCode(code)}`;
}
