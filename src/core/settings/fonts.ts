export interface LocalFontCandidate {
  value: string;
  label: string;
  localNames: readonly string[];
}

interface FontFaceLike {
  status: string;
  load: () => Promise<FontFaceLike>;
}

export type FontFaceConstructorLike = new (
  family: string,
  source: string,
  descriptors?: FontFaceDescriptors
) => FontFaceLike;

export type LocalFontProbe = (candidate: LocalFontCandidate) => Promise<boolean>;

export type CodeFontSize = 'compact' | 'comfortable' | 'large';

export interface CodeFontSizePreset {
  value: CodeFontSize;
  fontSize: string;
  lineHeight: string;
}

export const fallbackFontFamily = 'monospace';

export const genericFontFamilies = [
  'monospace',
  'serif',
  'cursive',
  'fantasy'
] as const;

export const defaultCodeFontSize: CodeFontSize = 'comfortable';

export const codeFontSizePresets: readonly CodeFontSizePreset[] = [
  {
    value: 'compact',
    fontSize: '0.875rem',
    lineHeight: '1.5rem'
  },
  {
    value: 'comfortable',
    fontSize: '1rem',
    lineHeight: '1.625rem'
  },
  {
    value: 'large',
    fontSize: '1.125rem',
    lineHeight: '1.75rem'
  }
];

export const localFontCandidates: readonly LocalFontCandidate[] = [
  {
    value: 'JetBrains Mono',
    label: 'JetBrains Mono',
    localNames: ['JetBrains Mono', 'JetBrainsMono-Regular']
  },
  {
    value: 'Fira Code',
    label: 'Fira Code',
    localNames: ['Fira Code', 'FiraCode-Regular']
  },
  {
    value: 'Cascadia Code',
    label: 'Cascadia Code',
    localNames: ['Cascadia Code', 'CascadiaCode-Regular']
  },
  {
    value: 'Source Code Pro',
    label: 'Source Code Pro',
    localNames: ['Source Code Pro', 'SourceCodePro-Regular']
  },
  {
    value: 'IBM Plex Mono',
    label: 'IBM Plex Mono',
    localNames: ['IBM Plex Mono', 'IBMPlexMono-Regular']
  },
  {
    value: 'Hack',
    label: 'Hack',
    localNames: ['Hack', 'Hack-Regular']
  },
  {
    value: 'Iosevka',
    label: 'Iosevka',
    localNames: ['Iosevka', 'Iosevka-Regular']
  },
  {
    value: 'Ubuntu Mono',
    label: 'Ubuntu Mono',
    localNames: ['Ubuntu Mono', 'UbuntuMono-Regular']
  },
  {
    value: 'SFMono-Regular',
    label: 'SF Mono',
    localNames: ['SFMono-Regular', 'SF Mono']
  },
  {
    value: 'Menlo',
    label: 'Menlo',
    localNames: ['Menlo', 'Menlo-Regular']
  },
  {
    value: 'Consolas',
    label: 'Consolas',
    localNames: ['Consolas']
  },
  {
    value: 'Tahoma',
    label: 'Tahoma',
    localNames: ['Tahoma']
  },
  {
    value: 'Helvetica',
    label: 'Helvetica',
    localNames: ['Helvetica']
  },
  {
    value: 'Microsoft YaHei',
    label: 'Microsoft YaHei',
    localNames: ['Microsoft YaHei', 'Microsoft Yahei']
  }
];

const allowedFontFamilies = new Set([
  ...genericFontFamilies,
  ...localFontCandidates.map((candidate) => candidate.value)
]);

const legacyFontAliases = new Map<string, string>([
  ['Serif', 'serif'],
  ['Microsoft Yahei', 'Microsoft YaHei']
]);

const cssGenericFamilies = new Set([
  'cursive',
  'fantasy',
  'monospace',
  'sans-serif',
  'serif',
  'system-ui',
  'ui-monospace',
  'ui-sans-serif',
  'ui-serif'
]);

const escapeCssString = (value: string) => value
  .replaceAll('\\', '\\\\')
  .replaceAll('"', '\\"');

const formatCssFontFamilyName = (value: string) => (
  cssGenericFamilies.has(value)
    ? value
    : `"${escapeCssString(value)}"`
);

const buildFontFamilyStack = (fontFamily: unknown, fallbacks: readonly string[]) => {
  const primary = normalizeFontFamilySetting(fontFamily);
  const uniqueFamilies = [primary, ...fallbacks].filter((value, index, values) => (
    values.indexOf(value) === index
  ));

  return uniqueFamilies.map(formatCssFontFamilyName).join(', ');
};

export const normalizeFontFamilySetting = (value: unknown) => {
  const candidate = String(value ?? '').trim();
  const normalized = legacyFontAliases.get(candidate) || candidate;
  return allowedFontFamilies.has(normalized) ? normalized : fallbackFontFamily;
};

export const normalizeCodeFontSizeSetting = (value: unknown): CodeFontSize => {
  const candidate = String(value ?? '').trim();
  return codeFontSizePresets.some((preset) => preset.value === candidate)
    ? candidate as CodeFontSize
    : defaultCodeFontSize;
};

const getCodeFontSizePreset = (value: unknown) => (
  codeFontSizePresets.find((preset) => preset.value === normalizeCodeFontSizeSetting(value))
  || codeFontSizePresets[1]!
);

export const getCodeFontSizeCssValue = (value: unknown) => getCodeFontSizePreset(value).fontSize;

export const getCodeFontLineHeightCssValue = (value: unknown) => getCodeFontSizePreset(value).lineHeight;

export const buildCodeFontFamilyStack = (fontFamily: unknown) => buildFontFamilyStack(
  fontFamily,
  ['SFMono-Regular', 'Cascadia Code', 'Consolas', fallbackFontFamily]
);

const getDefaultFontFaceConstructor = () => (
  (globalThis as typeof globalThis & { FontFace?: FontFaceConstructorLike }).FontFace
);

export const probeLocalFontCandidate = async (
  candidate: LocalFontCandidate,
  options: {
    FontFaceApi?: FontFaceConstructorLike;
    timeoutMs?: number;
  } = {}
) => {
  const FontFaceApi = options.FontFaceApi || getDefaultFontFaceConstructor();
  if (!FontFaceApi) {
    return false;
  }

  const source = candidate.localNames
    .map((localName) => `local("${escapeCssString(localName)}")`)
    .join(', ');
  const probeName = candidate.value.replace(/[^a-z0-9]+/gi, '-');
  const timeoutMs = options.timeoutMs ?? 800;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const fontFace = new FontFaceApi(`JSONMateProbe-${probeName}`, source, {
      style: 'normal',
      weight: '400'
    });
    const timeout = new Promise<false>((resolve) => {
      timeoutId = globalThis.setTimeout(() => resolve(false), timeoutMs);
    });
    const loaded = fontFace.load()
      .then((result) => result.status === 'loaded')
      .catch(() => false);

    return await Promise.race([loaded, timeout]);
  } catch {
    return false;
  } finally {
    if (timeoutId !== undefined) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

export const detectAvailableLocalFonts = async (
  probe: LocalFontProbe = probeLocalFontCandidate
) => {
  const availability = await Promise.all(localFontCandidates.map(async (candidate) => {
    try {
      return await probe(candidate);
    } catch {
      return false;
    }
  }));

  return localFontCandidates.filter((_, index) => availability[index]);
};
