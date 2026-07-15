import type { ViewerPathSearchMode } from './tree';

export const viewerSearchHistoryStorageKey = 'jsonMate.modernViewerSearchHistory.v1';
export const viewerSearchModeStorageKey = 'jsonMate.modernViewerSearchMode.v1';
export const viewerMinimalModeStorageKey = 'jsonMate.modernViewerMinimalMode.v1';
export const viewerPanelWidthStorageKey = 'jsonMate.modernViewerPanelWidth.v1';

export interface ViewerSearchHistoryEntry {
  query: string;
  mode: ViewerPathSearchMode;
}

export interface ViewerPreferenceSnapshot {
  searchHistory: ViewerSearchHistoryEntry[];
  searchMode: ViewerPathSearchMode;
  minimalMode: boolean;
  panelWidth: number | null;
}

const getLocalStorage = () => (
  typeof window === 'undefined' ? null : window.localStorage
);

export const readViewerSearchHistory = (): ViewerSearchHistoryEntry[] => {
  const storage = getLocalStorage();
  if (!storage) {
    return [];
  }

  try {
    const rawValue = storage.getItem(viewerSearchHistoryStorageKey);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue.flatMap((entry): ViewerSearchHistoryEntry[] => {
      if (typeof entry === 'string') {
        return [{ query: entry, mode: 'key' }];
      }

      if (!entry || typeof entry !== 'object' || typeof entry.query !== 'string') {
        return [];
      }

      return [{
        query: entry.query,
        mode: entry.mode === 'value' ? 'value' : 'key'
      }];
    }).slice(0, 12);
  } catch {
    return [];
  }
};

export const writeViewerSearchHistory = (entries: ViewerSearchHistoryEntry[]) => {
  try {
    getLocalStorage()?.setItem(viewerSearchHistoryStorageKey, JSON.stringify(entries));
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

export const readViewerSearchMode = (): ViewerPathSearchMode => {
  try {
    return getLocalStorage()?.getItem(viewerSearchModeStorageKey) === 'value' ? 'value' : 'key';
  } catch {
    return 'key';
  }
};

export const writeViewerSearchMode = (mode: ViewerPathSearchMode) => {
  try {
    getLocalStorage()?.setItem(viewerSearchModeStorageKey, mode);
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

export const readViewerMinimalMode = () => {
  try {
    return getLocalStorage()?.getItem(viewerMinimalModeStorageKey) === 'true';
  } catch {
    return false;
  }
};

export const writeViewerMinimalMode = (enabled: boolean) => {
  try {
    getLocalStorage()?.setItem(viewerMinimalModeStorageKey, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

export const readStoredViewerPanelWidth = () => {
  try {
    const rawValue = getLocalStorage()?.getItem(viewerPanelWidthStorageKey);
    if (rawValue == null) {
      return null;
    }

    const parsedValue = Number(rawValue);
    return Number.isFinite(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

export const writeStoredViewerPanelWidth = (width: number | null) => {
  const storage = getLocalStorage();
  if (!storage) {
    return;
  }

  try {
    if (width == null) {
      storage.removeItem(viewerPanelWidthStorageKey);
      return;
    }

    storage.setItem(viewerPanelWidthStorageKey, String(Math.round(width)));
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

export const readViewerPreferenceSnapshot = (): ViewerPreferenceSnapshot => ({
  searchHistory: readViewerSearchHistory(),
  searchMode: readViewerSearchMode(),
  minimalMode: readViewerMinimalMode(),
  panelWidth: readStoredViewerPanelWidth()
});

export const replaceViewerPreferenceSnapshot = (snapshot: ViewerPreferenceSnapshot) => {
  const storage = getLocalStorage();
  if (!storage) {
    throw new Error('viewer_preferences_unavailable');
  }

  storage.setItem(viewerSearchHistoryStorageKey, JSON.stringify(snapshot.searchHistory));
  storage.setItem(viewerSearchModeStorageKey, snapshot.searchMode);
  storage.setItem(viewerMinimalModeStorageKey, snapshot.minimalMode ? 'true' : 'false');
  if (snapshot.panelWidth == null) {
    storage.removeItem(viewerPanelWidthStorageKey);
  } else {
    storage.setItem(viewerPanelWidthStorageKey, String(Math.round(snapshot.panelWidth)));
  }
};

export const writeViewerPreferenceSnapshot = (snapshot: ViewerPreferenceSnapshot) => {
  try {
    replaceViewerPreferenceSnapshot(snapshot);
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};
