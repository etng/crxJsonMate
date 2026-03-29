import { browser } from '#imports';

const viewerRecentStorageKey = 'jsonMate.viewer.recents.v1';
const viewerCollectionStorageKey = 'jsonMate.viewer.collections.v1';
const maxViewerRecentEntries = 12;
const maxViewerCollectionNames = 5;
const defaultViewerCollectionName = 'Default';

export type ViewerSourceType = 'recognized-page' | 'launcher-url' | 'manual-input';

export interface ViewerRecentEntry {
  url: string;
  detectedTitle: string;
  lastOpenedAt: number;
  sourceType: ViewerSourceType;
}

export interface ViewerCollectionEntry {
  id: string;
  url: string;
  detectedTitle: string;
  customTitle: string | null;
  collection: string;
  createdAt: number;
  updatedAt: number;
  lastOpenedAt: number;
  sourceType: ViewerSourceType;
}

export interface ViewerLibrarySnapshot {
  recents: ViewerRecentEntry[];
  collections: ViewerCollectionEntry[];
}

interface AsyncStorageArea {
  get: (keys?: string[] | string | null) => Promise<Record<string, unknown>>;
  set: (items: Record<string, unknown>) => Promise<void>;
}

interface ChromeStorageAreaLike {
  get: (keys: string[] | string | null, callback: (items: Record<string, unknown>) => void) => void;
  set: (items: Record<string, unknown>, callback: () => void) => void;
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
      chromeStorage.get(keys ?? null, (items) => {
        const runtimeError = chromeApi?.runtime?.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }

        resolve((items || {}) as Record<string, unknown>);
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

const normalizeViewerUrl = (value: string) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return '';
  }

  try {
    const normalizedUrl = new URL(trimmedValue);
    normalizedUrl.hash = '';
    normalizedUrl.protocol = normalizedUrl.protocol.toLowerCase();
    normalizedUrl.hostname = normalizedUrl.hostname.toLowerCase();
    return normalizedUrl.toString();
  } catch {
    return trimmedValue;
  }
};

const createViewerEntryId = (value: string) => {
  const normalizedUrl = normalizeViewerUrl(value);
  let hash = 0;

  for (let index = 0; index < normalizedUrl.length; index += 1) {
    hash = ((hash << 5) - hash) + normalizedUrl.charCodeAt(index);
    hash |= 0;
  }

  return `jm_${Math.abs(hash).toString(36)}`;
};

const isHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const normalizeCollectionName = (value: string) => {
  const trimmedValue = value.trim();
  return trimmedValue || defaultViewerCollectionName;
};

const normalizeRecentEntry = (entry: unknown): ViewerRecentEntry | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = entry as Partial<ViewerRecentEntry>;
  if (typeof candidate.url !== 'string' || typeof candidate.detectedTitle !== 'string') {
    return null;
  }

  return {
    url: normalizeViewerUrl(candidate.url),
    detectedTitle: candidate.detectedTitle.trim() || candidate.url.trim(),
    lastOpenedAt: typeof candidate.lastOpenedAt === 'number' ? candidate.lastOpenedAt : Date.now(),
    sourceType: candidate.sourceType === 'launcher-url' || candidate.sourceType === 'manual-input'
      ? candidate.sourceType
      : 'recognized-page'
  };
};

const normalizeCollectionEntry = (entry: unknown): ViewerCollectionEntry | null => {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const candidate = entry as Partial<ViewerCollectionEntry>;
  if (typeof candidate.url !== 'string' || typeof candidate.detectedTitle !== 'string') {
    return null;
  }

  const createdAt = typeof candidate.createdAt === 'number' ? candidate.createdAt : Date.now();
  const updatedAt = typeof candidate.updatedAt === 'number' ? candidate.updatedAt : createdAt;
  const lastOpenedAt = typeof candidate.lastOpenedAt === 'number' ? candidate.lastOpenedAt : updatedAt;

  return {
    id: typeof candidate.id === 'string' && candidate.id.trim()
      ? candidate.id.trim()
      : createViewerEntryId(candidate.url),
    url: normalizeViewerUrl(candidate.url),
    detectedTitle: candidate.detectedTitle.trim() || candidate.url.trim(),
    customTitle: typeof candidate.customTitle === 'string' && candidate.customTitle.trim()
      ? candidate.customTitle.trim()
      : null,
    collection: normalizeCollectionName(typeof candidate.collection === 'string' ? candidate.collection : defaultViewerCollectionName),
    createdAt,
    updatedAt,
    lastOpenedAt,
    sourceType: candidate.sourceType === 'launcher-url' || candidate.sourceType === 'manual-input'
      ? candidate.sourceType
      : 'recognized-page'
  };
};

const readStorageArray = async (storageKey: string) => {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return [];
  }

  const storedValue = await storageArea.get(storageKey);
  const rawValue = storedValue[storageKey];
  return Array.isArray(rawValue) ? rawValue : [];
};

const writeStorageArray = async (storageKey: string, value: unknown[]) => {
  const storageArea = getStorageArea();
  if (!storageArea) {
    return value;
  }

  await storageArea.set({
    [storageKey]: value
  });
  return value;
};

const sortRecentEntries = (entries: ViewerRecentEntry[]) => (
  [...entries].sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
);

const sortCollectionEntries = (entries: ViewerCollectionEntry[]) => (
  [...entries].sort((left, right) => {
    if (right.lastOpenedAt !== left.lastOpenedAt) {
      return right.lastOpenedAt - left.lastOpenedAt;
    }

    return getCollectionDisplayTitle(left).localeCompare(getCollectionDisplayTitle(right));
  })
);

const getCollectionDisplayTitle = (entry: ViewerCollectionEntry) => entry.customTitle || entry.detectedTitle;

export const formatViewerSourceTitle = (sourceUrl: string, sourcePathLabel = '') => {
  const normalizedSourcePathLabel = sourcePathLabel.trim();
  if (normalizedSourcePathLabel) {
    return normalizedSourcePathLabel;
  }

  const normalizedSourceUrl = sourceUrl.trim();
  if (!normalizedSourceUrl) {
    return defaultViewerCollectionName;
  }

  try {
    const url = new URL(normalizedSourceUrl);
    const pathname = url.pathname.replace(/\/+$/, '');
    return pathname && pathname !== '/'
      ? `${url.hostname}${pathname}`
      : url.hostname;
  } catch {
    return normalizedSourceUrl;
  }
};

export const getViewerNormalizedUrl = normalizeViewerUrl;

export const getViewerCollectionNames = (entries: ViewerCollectionEntry[]) => {
  const collectionNames = new Set<string>([defaultViewerCollectionName]);
  for (const entry of entries) {
    collectionNames.add(normalizeCollectionName(entry.collection));
  }

  return [...collectionNames].sort((left, right) => left.localeCompare(right));
};

export const getViewerCollectionLimit = () => maxViewerCollectionNames;

export const loadViewerLibrary = async (): Promise<ViewerLibrarySnapshot> => {
  const [recentEntries, collectionEntries] = await Promise.all([
    readStorageArray(viewerRecentStorageKey),
    readStorageArray(viewerCollectionStorageKey)
  ]);

  return {
    recents: sortRecentEntries(recentEntries.map(normalizeRecentEntry).filter(Boolean) as ViewerRecentEntry[]),
    collections: sortCollectionEntries(collectionEntries.map(normalizeCollectionEntry).filter(Boolean) as ViewerCollectionEntry[])
  };
};

export const recordViewerRecentEntry = async (entry: ViewerRecentEntry) => {
  if (!isHttpUrl(entry.url)) {
    return loadViewerLibrary();
  }

  const nextEntry: ViewerRecentEntry = {
    url: normalizeViewerUrl(entry.url),
    detectedTitle: entry.detectedTitle.trim() || entry.url.trim(),
    lastOpenedAt: entry.lastOpenedAt,
    sourceType: entry.sourceType
  };

  const currentLibrary = await loadViewerLibrary();
  const entryId = normalizeViewerUrl(nextEntry.url);
  const nextRecents = sortRecentEntries([
    nextEntry,
    ...currentLibrary.recents.filter((recent) => normalizeViewerUrl(recent.url) !== entryId)
  ]).slice(0, maxViewerRecentEntries);

  await writeStorageArray(viewerRecentStorageKey, nextRecents);
  return {
    ...currentLibrary,
    recents: nextRecents
  };
};

export const upsertViewerCollectionEntry = async (entry: ViewerCollectionEntry) => {
  if (!isHttpUrl(entry.url)) {
    return loadViewerLibrary();
  }

  const currentLibrary = await loadViewerLibrary();
  const normalizedUrl = normalizeViewerUrl(entry.url);
  const normalizedCollection = normalizeCollectionName(entry.collection);
  const existingCollectionNames = getViewerCollectionNames(currentLibrary.collections);
  const hasExistingCollection = existingCollectionNames.includes(normalizedCollection);
  const nextCollectionCount = hasExistingCollection
    ? existingCollectionNames.length
    : existingCollectionNames.length + 1;

  if (!hasExistingCollection && nextCollectionCount > maxViewerCollectionNames) {
    throw new Error('collection-limit');
  }

  const nextEntry: ViewerCollectionEntry = {
    ...entry,
    id: entry.id.trim() || createViewerEntryId(entry.url),
    url: normalizedUrl,
    detectedTitle: entry.detectedTitle.trim() || entry.url.trim(),
    customTitle: entry.customTitle?.trim() || null,
    collection: normalizedCollection,
    createdAt: entry.createdAt || Date.now(),
    updatedAt: Date.now(),
    lastOpenedAt: entry.lastOpenedAt || Date.now(),
    sourceType: entry.sourceType
  };

  const nextCollections = sortCollectionEntries([
    nextEntry,
    ...currentLibrary.collections.filter((collectionEntry) => collectionEntry.id !== nextEntry.id)
  ]);

  await writeStorageArray(viewerCollectionStorageKey, nextCollections);
  return {
    ...currentLibrary,
    collections: nextCollections
  };
};

export const updateViewerLibraryRecent = async (
  url: string,
  detectedTitle: string,
  sourceType: ViewerSourceType
) => recordViewerRecentEntry({
  url,
  detectedTitle,
  lastOpenedAt: Date.now(),
  sourceType
});

export const updateViewerLibraryCollection = async (entry: Omit<ViewerCollectionEntry, 'id' | 'createdAt' | 'updatedAt' | 'lastOpenedAt'> & {
  id?: string;
  createdAt?: number;
  lastOpenedAt?: number;
  updatedAt?: number;
}) => upsertViewerCollectionEntry({
  id: entry.id || createViewerEntryId(entry.url),
  url: entry.url,
  detectedTitle: entry.detectedTitle,
  customTitle: entry.customTitle,
  collection: entry.collection,
  createdAt: entry.createdAt || Date.now(),
  updatedAt: entry.updatedAt || Date.now(),
  lastOpenedAt: entry.lastOpenedAt || Date.now(),
  sourceType: entry.sourceType
});

export const findViewerCollectionEntryByUrl = (entries: ViewerCollectionEntry[], url: string) => {
  const normalizedUrl = normalizeViewerUrl(url);
  return entries.find((entry) => normalizeViewerUrl(entry.url) === normalizedUrl) || null;
};

export const findViewerRecentEntryByUrl = (entries: ViewerRecentEntry[], url: string) => {
  const normalizedUrl = normalizeViewerUrl(url);
  return entries.find((entry) => normalizeViewerUrl(entry.url) === normalizedUrl) || null;
};

export const getViewerCollectionEntryDisplayTitle = getCollectionDisplayTitle;
