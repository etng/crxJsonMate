import { browser } from '#imports';
import { loadSettings, saveSettings } from '@/core/settings/storage';
import {
  loadViewerLibrary,
  replaceViewerLibrary
} from '@/core/viewer/library';
import {
  readViewerPreferenceSnapshot,
  replaceViewerPreferenceSnapshot
} from '@/core/viewer/preferences';
import {
  buildJsonMateBackup,
  type JsonMateBackupV1
} from './schema';

export const createJsonMateBackup = async () => {
  const [settings, library] = await Promise.all([
    loadSettings(),
    loadViewerLibrary()
  ]);

  return buildJsonMateBackup({
    settings,
    library,
    viewer: readViewerPreferenceSnapshot(),
    extensionVersion: browser.runtime.getManifest().version
  });
};

export const restoreJsonMateBackup = async (backup: JsonMateBackupV1) => {
  const [previousSettings, previousLibrary] = await Promise.all([
    loadSettings(),
    loadViewerLibrary()
  ]);
  const previousViewerPreferences = readViewerPreferenceSnapshot();
  const nextSettings = {
    ...previousSettings,
    ...backup.data.settings,
    initialized: true
  };

  try {
    await saveSettings(nextSettings);
    await replaceViewerLibrary(backup.data.library);
    replaceViewerPreferenceSnapshot(backup.data.viewer);
    return loadSettings();
  } catch (error) {
    await Promise.allSettled([
      saveSettings(previousSettings),
      replaceViewerLibrary(previousLibrary)
    ]);

    try {
      replaceViewerPreferenceSnapshot(previousViewerPreferences);
    } catch {
      // Preserve the original import error when rollback is also unavailable.
    }
    throw error;
  }
};

export const getJsonMateBackupFilename = (date = new Date()) => (
  `json-mate-backup-${date.toISOString().slice(0, 10)}.json`
);
