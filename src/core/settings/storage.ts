import { browser } from '#imports';
import { defaultSettings, type JsonMateSettings } from './schema';

const DEFAULT_SETTING_KEYS = Object.keys(defaultSettings) as Array<keyof JsonMateSettings>;

const cloneDefaultSettings = (): JsonMateSettings => ({ ...defaultSettings });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]';

const settingsValueChanged = (previousValue: unknown, nextValue: unknown) => {
  if (
    Array.isArray(previousValue)
    || Array.isArray(nextValue)
    || isPlainObject(previousValue)
    || isPlainObject(nextValue)
  ) {
    return JSON.stringify(previousValue) !== JSON.stringify(nextValue);
  }

  return previousValue !== nextValue;
};

const normalizeLanguage = (value: unknown): JsonMateSettings['lang'] => {
  switch (value) {
    case 'zh-cn':
    case 'zh-tw':
    case 'ja':
      return value;
    default:
      return 'en';
  }
};

const normalizeSettingValue = <K extends keyof JsonMateSettings>(
  settingKey: K,
  value: unknown
): JsonMateSettings[K] => {
  switch (settingKey) {
    case 'lang':
      return normalizeLanguage(value) as JsonMateSettings[K];
    case 'openViewerMode':
    case 'detachedViewerMode':
      return (value === 'tab' ? 'tab' : 'popup') as JsonMateSettings[K];
    case 'panelMode':
      return (
        value === 'always'
        || value === 'rightClick'
        || value === 'clickButton'
        || value === 'leftClick'
          ? value
          : 'leftClick'
      ) as JsonMateSettings[K];
    case 'showImageMode':
      return (value === 'hover' ? 'hover' : 'all') as JsonMateSettings[K];
    case 'showLengthMode':
      return (value === 'array-object' ? 'array-object' : 'array') as JsonMateSettings[K];
    case 'renderMode':
      return (
        value === 'smart' || value === 'dark' || value === 'rich'
          ? value
          : 'rich'
      ) as JsonMateSettings[K];
    case 'minimalismTrigger':
      return (value === 'always' ? 'always' : 'largePayloadOnly') as JsonMateSettings[K];
    case 'jsonEngine':
      return (value === 'JSON' ? 'JSON' : 'JM-JSON') as JsonMateSettings[K];
    case 'toolkitNavigation':
      return (Array.isArray(value) ? value.filter(Boolean) : []) as JsonMateSettings[K];
    case 'sortKey':
      return (typeof value === 'number' ? value : Boolean(value)) as JsonMateSettings[K];
    case 'autoRenderEnabled':
    case 'showTreeValues':
    case 'showLinkButtons':
    case 'showTypeIcons':
    case 'showArrayIndexes':
    case 'showImages':
    case 'showArrayLength':
    case 'rememberNodeState':
    case 'minimalism':
    case 'showTextFormat':
    case 'contextMenuEnabled':
    case 'initialized':
      return Boolean(value) as JsonMateSettings[K];
    case 'launchCount':
      return (typeof value === 'number' ? value : Number(value) || 0) as JsonMateSettings[K];
    case 'treeIconStyle':
    case 'fontFamily':
      return String(value ?? defaultSettings[settingKey]) as JsonMateSettings[K];
    default:
      return value as JsonMateSettings[K];
  }
};

const normalizeStoredSettings = (rawSettings: Record<string, unknown> = {}) => {
  const normalizedSettings = cloneDefaultSettings();

  for (const settingKey of DEFAULT_SETTING_KEYS) {
    if (rawSettings[settingKey] === undefined) {
      continue;
    }

    normalizedSettings[settingKey] = normalizeSettingValue(
      settingKey,
      rawSettings[settingKey]
    ) as never;
  }

  return normalizedSettings;
};

type StorageSnapshot = Record<string, unknown>;

interface AsyncStorageArea {
  get: (keys?: string[] | string | null) => Promise<StorageSnapshot>;
  set: (items: StorageSnapshot) => Promise<void>;
}

interface ChromeStorageAreaLike {
  get: (keys: string[] | string | null, callback: (items: StorageSnapshot) => void) => void;
  set: (items: StorageSnapshot, callback: () => void) => void;
}

interface ChromeApiLike {
  runtime?: {
    lastError?: {
      message: string;
    };
  };
  storage?: {
    local?: ChromeStorageAreaLike;
  };
}

const getStorageArea = (): AsyncStorageArea | null => {
  if (browser?.storage?.local) {
    return browser.storage.local;
  }

  const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeApiLike }).chrome;
  const chromeStorage = chromeApi?.storage?.local;
  if (!chromeStorage) {
    return null;
  }

  return {
    get: (keys) => new Promise((resolve, reject) => {
      chromeStorage.get(keys ?? null, (items: StorageSnapshot) => {
        const runtimeError = chromeApi?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve((items || {}) as StorageSnapshot);
      });
    }),
    set: (items) => new Promise((resolve, reject) => {
      chromeStorage.set(items, () => {
        const runtimeError = chromeApi?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve();
      });
    })
  };
};

export const loadSettings = async (): Promise<JsonMateSettings> => {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return cloneDefaultSettings();
  }

  const storedSettings = await storageArea.get(null);

  if (!storedSettings.initialized) {
    const defaults = cloneDefaultSettings();
    await storageArea.set(defaults as unknown as StorageSnapshot);
    return defaults;
  }

  const normalizedSettings = normalizeStoredSettings(storedSettings);
  const migrationPatch: Record<string, unknown> = {};

  for (const settingKey of DEFAULT_SETTING_KEYS) {
    if (storedSettings[settingKey] === undefined) {
      migrationPatch[settingKey] = normalizedSettings[settingKey];
      continue;
    }

    if (settingsValueChanged(storedSettings[settingKey], normalizedSettings[settingKey])) {
      migrationPatch[settingKey] = normalizedSettings[settingKey];
    }
  }

  if (Object.keys(migrationPatch).length > 0) {
    await storageArea.set(migrationPatch);
  }

  return normalizedSettings;
};

export const saveSettings = async (patch: Partial<JsonMateSettings>) => {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return patch;
  }

  const normalizedPatch: Record<string, unknown> = {};

  for (const [settingKey, value] of Object.entries(patch)) {
    normalizedPatch[settingKey] = normalizeSettingValue(
      settingKey as keyof JsonMateSettings,
      value
    );
  }

  await storageArea.set(normalizedPatch);
  return normalizedPatch;
};
