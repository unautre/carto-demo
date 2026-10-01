export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function isValidHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#?[0-9a-fA-F]{3}$|^#?[0-9a-fA-F]{6}$/.test(v);
}
