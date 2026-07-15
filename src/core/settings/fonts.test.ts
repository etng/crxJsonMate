import { describe, expect, it } from 'vitest';
import {
  buildCodeFontFamilyStack,
  codeFontSizePresets,
  defaultCodeFontSize,
  detectAvailableLocalFonts,
  fallbackFontFamily,
  genericFontFamilies,
  getCodeFontLineHeightCssValue,
  getCodeFontSizeCssValue,
  localFontCandidates,
  normalizeCodeFontSizeSetting,
  normalizeFontFamilySetting,
  probeLocalFontCandidate,
  type FontFaceConstructorLike
} from './fonts';

describe('font settings', () => {
  it('keeps valid generic families and normalizes legacy named values', () => {
    expect(normalizeFontFamilySetting('JetBrains Mono')).toBe('JetBrains Mono');
    expect(normalizeFontFamilySetting('Microsoft Yahei')).toBe('Microsoft YaHei');
    expect(normalizeFontFamilySetting('Serif')).toBe('serif');
    expect(normalizeFontFamilySetting('fantasy')).toBe('fantasy');
    expect(normalizeFontFamilySetting('cursive')).toBe('cursive');
    expect(normalizeFontFamilySetting('url(https://example.test/font.woff2)')).toBe(fallbackFontFamily);
  });

  it('preserves the original CSS generic font choices', () => {
    expect(genericFontFamilies).toEqual([
      'monospace',
      'serif',
      'cursive',
      'fantasy'
    ]);
  });

  it('builds quoted named-font stacks with an unquoted generic fallback', () => {
    expect(buildCodeFontFamilyStack('JetBrains Mono')).toBe(
      '"JetBrains Mono", "SFMono-Regular", "Cascadia Code", "Consolas", monospace'
    );
    expect(buildCodeFontFamilyStack('monospace')).toBe(
      'monospace, "SFMono-Regular", "Cascadia Code", "Consolas"'
    );
  });

  it('normalizes code font size presets and exposes rem-based metrics', () => {
    expect(codeFontSizePresets.map((preset) => preset.value)).toEqual([
      'compact',
      'comfortable',
      'large'
    ]);
    expect(normalizeCodeFontSizeSetting('large')).toBe('large');
    expect(normalizeCodeFontSizeSetting('13px')).toBe(defaultCodeFontSize);
    expect(getCodeFontSizeCssValue('comfortable')).toBe('1rem');
    expect(getCodeFontLineHeightCssValue('large')).toBe('1.75rem');
  });

  it('keeps available local fonts in the curated catalog order', async () => {
    const availableNames = new Set(['Fira Code', 'IBM Plex Mono', 'Menlo']);
    const result = await detectAvailableLocalFonts(async (candidate) => (
      availableNames.has(candidate.value)
    ));

    expect(result.map((candidate) => candidate.value)).toEqual([
      'Fira Code',
      'IBM Plex Mono',
      'Menlo'
    ]);
  });

  it('treats probe failures as unavailable fonts', async () => {
    const result = await detectAvailableLocalFonts(async (candidate) => {
      if (candidate === localFontCandidates[0]) {
        throw new Error('probe unavailable');
      }
      return false;
    });

    expect(result).toEqual([]);
  });

  it('loads a local FontFace source without enumerating installed fonts', async () => {
    class LoadedFontFace {
      status = 'unloaded';

      async load() {
        this.status = 'loaded';
        return this;
      }
    }

    const result = await probeLocalFontCandidate(localFontCandidates[0]!, {
      FontFaceApi: LoadedFontFace as FontFaceConstructorLike,
      timeoutMs: 10
    });

    expect(result).toBe(true);
  });
});
