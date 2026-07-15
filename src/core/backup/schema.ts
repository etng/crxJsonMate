import type { JsonMateSettings } from '../settings/schema';
import type {
  ViewerCollectionEntry,
  ViewerLibrarySnapshot,
  ViewerRecentEntry,
  ViewerSourceType
} from '../viewer/library';
import type {
  ViewerPreferenceSnapshot,
  ViewerSearchHistoryEntry
} from '../viewer/preferences';

export const jsonMateBackupFormat = 'json-mate-backup';
export const jsonMateBackupSchemaVersion = 1;
export const maxJsonMateBackupBytes = 1024 * 1024;

export type BackupValidationErrorCode =
  | 'too-large'
  | 'invalid-json'
  | 'invalid-format'
  | 'unsupported-version'
  | 'invalid-data';

export class BackupValidationError extends Error {
  constructor(public readonly code: BackupValidationErrorCode) {
    super(code);
    this.name = 'BackupValidationError';
  }
}

export const backupSettingKeys = [
  'autoRenderEnabled',
  'lang',
  'panelMode',
  'showTreeValues',
  'showLinkButtons',
  'showTypeIcons',
  'treeIconStyle',
  'showArrayIndexes',
  'showImages',
  'showImageMode',
  'openViewerMode',
  'detachedViewerMode',
  'showArrayLength',
  'showLengthMode',
  'renderMode',
  'rememberNodeState',
  'minimalism',
  'showTextFormat',
  'fontFamily',
  'fontSize',
  'minimalismTrigger',
  'jsonEngine',
  'sortKey',
  'toolkitNavigation',
  'contextMenuEnabled',
  'telemetryEnabled'
] as const satisfies ReadonlyArray<keyof JsonMateSettings>;

type BackupSettingKey = typeof backupSettingKeys[number];
export type BackupSettings = Pick<JsonMateSettings, BackupSettingKey>;

export interface JsonMateBackupV1 {
  format: typeof jsonMateBackupFormat;
  schemaVersion: typeof jsonMateBackupSchemaVersion;
  exportedAt: string;
  extensionVersion: string;
  data: {
    settings: Partial<BackupSettings>;
    library: ViewerLibrarySnapshot;
    viewer: ViewerPreferenceSnapshot;
  };
}

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.getPrototypeOf(value) === Object.prototype
);

const invalidData = (): never => {
  throw new BackupValidationError('invalid-data');
};

const readString = (value: unknown, maxLength: number, allowEmpty = false) => {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    return invalidData();
  }
  return value;
};

const readTimestamp = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return invalidData();
  }
  return value;
};

const readSourceType = (value: unknown): ViewerSourceType => {
  if (value === 'recognized-page' || value === 'launcher-url' || value === 'manual-input') {
    return value;
  }
  return invalidData();
};

const readHttpUrl = (value: unknown) => {
  const urlValue = readString(value, 8192);
  try {
    const parsedUrl = new URL(urlValue);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return invalidData();
    }
  } catch {
    return invalidData();
  }
  return urlValue;
};

const readSettingValue = <K extends BackupSettingKey>(
  settingKey: K,
  value: unknown
): BackupSettings[K] => {
  switch (settingKey) {
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
    case 'telemetryEnabled':
      return (typeof value === 'boolean' ? value : invalidData()) as BackupSettings[K];
    case 'lang':
      return (
        value === 'en' || value === 'zh-cn' || value === 'zh-tw' || value === 'ja'
          ? value
          : invalidData()
      ) as BackupSettings[K];
    case 'panelMode':
      return (
        value === 'always' || value === 'leftClick' || value === 'rightClick' || value === 'clickButton'
          ? value
          : invalidData()
      ) as BackupSettings[K];
    case 'showImageMode':
      return (value === 'hover' || value === 'all' ? value : invalidData()) as BackupSettings[K];
    case 'openViewerMode':
    case 'detachedViewerMode':
      return (value === 'popup' || value === 'tab' ? value : invalidData()) as BackupSettings[K];
    case 'showLengthMode':
      return (value === 'array' || value === 'array-object' ? value : invalidData()) as BackupSettings[K];
    case 'renderMode':
      return (value === 'rich' || value === 'smart' || value === 'dark' ? value : invalidData()) as BackupSettings[K];
    case 'fontSize':
      return (
        value === 'compact' || value === 'comfortable' || value === 'large'
          ? value
          : invalidData()
      ) as BackupSettings[K];
    case 'minimalismTrigger':
      return (
        value === 'always' || value === 'largePayloadOnly' ? value : invalidData()
      ) as BackupSettings[K];
    case 'jsonEngine':
      return (value === 'JM-JSON' || value === 'JSON' ? value : invalidData()) as BackupSettings[K];
    case 'sortKey':
      return (
        typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
          ? value
          : invalidData()
      ) as BackupSettings[K];
    case 'toolkitNavigation': {
      if (!Array.isArray(value) || value.length > 20) {
        return invalidData();
      }
      return value.map((item) => readString(item, 128)) as BackupSettings[K];
    }
    case 'fontFamily':
    case 'treeIconStyle':
      return readString(value, 256) as BackupSettings[K];
    default:
      return invalidData();
  }
};

const readSettings = (value: unknown): Partial<BackupSettings> => {
  if (!isPlainObject(value)) {
    return invalidData();
  }

  const settings: Partial<BackupSettings> = {};
  for (const settingKey of backupSettingKeys) {
    if (value[settingKey] !== undefined) {
      settings[settingKey] = readSettingValue(settingKey, value[settingKey]) as never;
    }
  }
  return settings;
};

const readRecentEntry = (value: unknown): ViewerRecentEntry => {
  if (!isPlainObject(value)) {
    return invalidData();
  }
  return {
    url: readHttpUrl(value.url),
    detectedTitle: readString(value.detectedTitle, 1024),
    lastOpenedAt: readTimestamp(value.lastOpenedAt),
    sourceType: readSourceType(value.sourceType)
  };
};

const readCollectionEntry = (value: unknown): ViewerCollectionEntry => {
  if (!isPlainObject(value)) {
    return invalidData();
  }

  const customTitle = value.customTitle === null
    ? null
    : readString(value.customTitle, 1024);
  return {
    id: readString(value.id, 256),
    url: readHttpUrl(value.url),
    detectedTitle: readString(value.detectedTitle, 1024),
    customTitle,
    collection: readString(value.collection, 128),
    createdAt: readTimestamp(value.createdAt),
    updatedAt: readTimestamp(value.updatedAt),
    lastOpenedAt: readTimestamp(value.lastOpenedAt),
    sourceType: readSourceType(value.sourceType)
  };
};

const readLibrary = (value: unknown): ViewerLibrarySnapshot => {
  if (!isPlainObject(value) || !Array.isArray(value.recents) || !Array.isArray(value.collections)) {
    return invalidData();
  }
  if (value.recents.length > 12 || value.collections.length > 1000) {
    return invalidData();
  }

  const recents = value.recents.map(readRecentEntry);
  const collections = value.collections.map(readCollectionEntry);
  const collectionNames = new Set(['Default', ...collections.map((entry) => entry.collection)]);
  const collectionIds = new Set(collections.map((entry) => entry.id));
  if (collectionNames.size > 5 || collectionIds.size !== collections.length) {
    return invalidData();
  }
  return { recents, collections };
};

const readSearchHistoryEntry = (value: unknown): ViewerSearchHistoryEntry => {
  if (!isPlainObject(value)) {
    return invalidData();
  }
  return {
    query: readString(value.query, 2048),
    mode: value.mode === 'value' ? 'value' : value.mode === 'key' ? 'key' : invalidData()
  };
};

const readViewerPreferences = (value: unknown): ViewerPreferenceSnapshot => {
  if (!isPlainObject(value) || !Array.isArray(value.searchHistory) || value.searchHistory.length > 12) {
    return invalidData();
  }
  if (value.searchMode !== 'key' && value.searchMode !== 'value') {
    return invalidData();
  }
  if (typeof value.minimalMode !== 'boolean') {
    return invalidData();
  }
  if (
    value.panelWidth !== null
    && (
      typeof value.panelWidth !== 'number'
      || !Number.isFinite(value.panelWidth)
      || value.panelWidth < 0
      || value.panelWidth > 4096
    )
  ) {
    return invalidData();
  }

  return {
    searchHistory: value.searchHistory.map(readSearchHistoryEntry),
    searchMode: value.searchMode,
    minimalMode: value.minimalMode,
    panelWidth: value.panelWidth
  };
};

export const buildJsonMateBackup = (input: {
  settings: JsonMateSettings;
  library: ViewerLibrarySnapshot;
  viewer: ViewerPreferenceSnapshot;
  extensionVersion: string;
  exportedAt?: string;
}): JsonMateBackupV1 => {
  const settings: Partial<BackupSettings> = {};
  for (const settingKey of backupSettingKeys) {
    settings[settingKey] = input.settings[settingKey] as never;
  }

  return parseJsonMateBackup({
    format: jsonMateBackupFormat,
    schemaVersion: jsonMateBackupSchemaVersion,
    exportedAt: input.exportedAt || new Date().toISOString(),
    extensionVersion: input.extensionVersion,
    data: {
      settings,
      library: input.library,
      viewer: input.viewer
    }
  });
};

export const parseJsonMateBackup = (value: unknown): JsonMateBackupV1 => {
  if (!isPlainObject(value) || value.format !== jsonMateBackupFormat) {
    throw new BackupValidationError('invalid-format');
  }
  if (value.schemaVersion !== jsonMateBackupSchemaVersion) {
    throw new BackupValidationError('unsupported-version');
  }
  if (!isPlainObject(value.data)) {
    throw new BackupValidationError('invalid-data');
  }

  const exportedAt = readString(value.exportedAt, 64);
  if (Number.isNaN(Date.parse(exportedAt))) {
    throw new BackupValidationError('invalid-data');
  }

  return {
    format: jsonMateBackupFormat,
    schemaVersion: jsonMateBackupSchemaVersion,
    exportedAt,
    extensionVersion: readString(value.extensionVersion, 64),
    data: {
      settings: readSettings(value.data.settings),
      library: readLibrary(value.data.library),
      viewer: readViewerPreferences(value.data.viewer)
    }
  };
};

export const parseJsonMateBackupText = (text: string) => {
  if (new TextEncoder().encode(text).byteLength > maxJsonMateBackupBytes) {
    throw new BackupValidationError('too-large');
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(text);
  } catch {
    throw new BackupValidationError('invalid-json');
  }
  return parseJsonMateBackup(parsedValue);
};

export const serializeJsonMateBackup = (backup: JsonMateBackupV1) => (
  `${JSON.stringify(backup, null, 2)}\n`
);
