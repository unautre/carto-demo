import { describe, expect, it } from 'vitest';
import { hslToRgb } from './colors';

describe('hslToRgb', () => {
  it('returns the primary colours at full saturation', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
  });

  it('is grayscale at zero saturation, regardless of hue', () => {
    expect(hslToRgb(0, 0, 0.5)).toEqual([128, 128, 128]);
    expect(hslToRgb(200, 0, 0.5)).toEqual([128, 128, 128]);
  });

  it('is black at lightness 0 and white at lightness 1, regardless of hue/saturation', () => {
    expect(hslToRgb(90, 1, 0)).toEqual([0, 0, 0]);
    expect(hslToRgb(90, 1, 1)).toEqual([255, 255, 255]);
  });

  it('wraps a hue outside [0, 360)', () => {
    expect(hslToRgb(-120, 1, 0.5)).toEqual(hslToRgb(240, 1, 0.5));
    expect(hslToRgb(480, 1, 0.5)).toEqual(hslToRgb(120, 1, 0.5));
  });
});
