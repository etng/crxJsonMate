import { browser } from '#imports';
import { parseRawPayload } from '@/core/detector/raw-payload';
import { loadSettings, saveSettings } from '@/core/settings/storage';
import type { JsonMateRuntimeMessage } from '@/core/messaging/messages';

const CONTEXT_MENU_IDS = [
  { id: 'json-mate-context-menu-page', contexts: ['page'], title: 'JSON Mate (page)' },
  { id: 'json-mate-context-menu-selection', contexts: ['selection'], title: 'JSON Mate (selection)' }
] as const;

interface RuntimeTabRef {
  id?: number | undefined;
  url?: string | undefined;
}

const pendingViewerJsonStorageKey = 'pendingViewerJsonText';
const pendingViewerInputStorageKey = 'pendingViewerInputText';
let pendingViewerJsonText: string | null = null;
let pendingViewerInputText: string | null = null;
let contextMenuRebuildTask = Promise.resolve();

const setPendingViewerJson = async (jsonText: string | null | undefined) => {
  pendingViewerJsonText = jsonText || null;
  await browser.storage.local.set({
    [pendingViewerJsonStorageKey]: pendingViewerJsonText
  });
};

const setPendingViewerInput = async (inputText: string | null | undefined) => {
  pendingViewerInputText = inputText || null;
  await browser.storage.local.set({
    [pendingViewerInputStorageKey]: pendingViewerInputText
  });
};

const readPendingViewerJson = async () => {
  if (typeof pendingViewerJsonText === 'string') {
    return pendingViewerJsonText;
  }

  const storedValue = await browser.storage.local.get(pendingViewerJsonStorageKey);
  const nextPendingValue = typeof storedValue[pendingViewerJsonStorageKey] === 'string'
    ? storedValue[pendingViewerJsonStorageKey]
    : null;
  pendingViewerJsonText = nextPendingValue;
  return nextPendingValue;
};

const consumePendingViewerJson = async () => {
  const jsonText = await readPendingViewerJson();
  pendingViewerJsonText = null;
  await browser.storage.local.remove(pendingViewerJsonStorageKey);
  return jsonText;
};

const readPendingViewerInput = async () => {
  if (typeof pendingViewerInputText === 'string') {
    return pendingViewerInputText;
  }

  const storedValue = await browser.storage.local.get(pendingViewerInputStorageKey);
  const nextPendingValue = typeof storedValue[pendingViewerInputStorageKey] === 'string'
    ? storedValue[pendingViewerInputStorageKey]
    : null;
  pendingViewerInputText = nextPendingValue;
  return nextPendingValue;
};

const consumePendingViewerInput = async () => {
  const inputText = await readPendingViewerInput();
  pendingViewerInputText = null;
  await browser.storage.local.remove(pendingViewerInputStorageKey);
  return inputText;
};

const getViewerUrl = (params?: Record<string, string | null | undefined>) => {
  const viewerUrl = new URL(browser.runtime.getURL('/viewer.html'));
  for (const [key, value] of Object.entries(params || {})) {
    if (!value) {
      continue;
    }
    viewerUrl.searchParams.set(key, value);
  }
  return viewerUrl.toString();
};

const getLauncherViewerParams = (params?: Record<string, string | null | undefined>) => ({
  type: 'iframe',
  launcher: '1',
  ...(params || {})
});

const resolveRuntimeUrl = (targetUrl: string) => {
  if (/^[a-z][a-z0-9+.-]*:/i.test(targetUrl)) {
    return targetUrl;
  }

  const normalizedPath = `/${targetUrl.replace(/^\/+/, '')}`;

  switch (normalizedPath) {
    case '/options.html':
    case '/viewer.html':
    case '/transform-toolkit.html':
      return browser.runtime.getURL(normalizedPath);
    default:
      return browser.runtime.getURL('/viewer.html');
  }
};

const openViewerPage = async (params?: Record<string, string | null | undefined>) => {
  await browser.tabs.create({
    url: getViewerUrl(getLauncherViewerParams(params)),
    active: true
  });
};

const openViewer = async (params?: Record<string, string | null | undefined>) => {
  const settings = await loadSettings();
  if (settings.openViewerMode === 'tab') {
    await openViewerPage(params);
    return;
  }

  await browser.windows.create({
    url: getViewerUrl(getLauncherViewerParams(params)),
    type: 'popup',
    width: 1024,
    height: 768
  });
};

const openWorkspaceLauncher = async (params?: Record<string, string | null | undefined>) => {
  await openViewerPage(params);
};

const sendMessageToTab = async (tabId: number | undefined, payload: JsonMateRuntimeMessage) => {
  if (!tabId) {
    return null;
  }

  try {
    return await browser.tabs.sendMessage(tabId, payload);
  } catch {
    return null;
  }
};

const handleActionClick = async (tab: RuntimeTabRef) => {
  const selectionText = await sendMessageToTab(tab.id, { cmd: 'getSelectionText' });
  const normalizedSelectionText = typeof selectionText === 'string'
    ? selectionText.trim()
    : '';
  const selectedPayload = normalizedSelectionText
    ? parseRawPayload(normalizedSelectionText)
    : null;

  await setPendingViewerJson(selectedPayload?.string || null);
  await setPendingViewerInput(!selectedPayload && normalizedSelectionText ? normalizedSelectionText : null);
  await openWorkspaceLauncher(selectedPayload ? { sourceUrl: tab.url || null } : undefined);
};

const createContextMenuItem = (item: typeof CONTEXT_MENU_IDS[number]) => new Promise<void>((resolve, reject) => {
  browser.contextMenus.create(
    {
      id: item.id,
      title: item.title,
      contexts: [...item.contexts]
    },
    () => {
      const runtimeError = browser.runtime.lastError;
      if (runtimeError) {
        reject(new Error(runtimeError.message));
        return;
      }
      resolve();
    }
  );
});

const rebuildContextMenus = async () => {
  contextMenuRebuildTask = contextMenuRebuildTask
    .catch(() => {})
    .then(async () => {
      await browser.contextMenus.removeAll();
      const settings = await loadSettings();
      if (!settings.contextMenuEnabled) {
        return;
      }

      for (const item of CONTEXT_MENU_IDS) {
        await createContextMenuItem(item);
      }
    });

  return contextMenuRebuildTask;
};

const handleContextMenuClick = async (
  info: { selectionText?: string },
  tab?: RuntimeTabRef
) => {
  if (info.selectionText) {
    await setPendingViewerJson(info.selectionText);
    await openViewer({ sourceUrl: tab?.url || null });
    return;
  }

  await sendMessageToTab(tab?.id, { cmd: 'runViewerInPage' });
};

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => {
    void rebuildContextMenus();
  });

  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && Object.prototype.hasOwnProperty.call(changes, 'contextMenuEnabled')) {
      void rebuildContextMenus();
    }
  });

  browser.action.onClicked.addListener((tab) => {
    void handleActionClick(tab);
  });

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenuClick(info, tab);
  });

  browser.runtime.onMessage.addListener(async (request: JsonMateRuntimeMessage) => {
    switch (request.cmd) {
      case 'getPendingJson':
        return await consumePendingViewerJson();
      case 'peekPendingJson':
        return await readPendingViewerJson();
      case 'setPendingJson':
        await setPendingViewerJson(request.data);
        return {};
      case 'getPendingInput':
        return await consumePendingViewerInput();
      case 'peekPendingInput':
        return await readPendingViewerInput();
      case 'setPendingInput':
        await setPendingViewerInput(request.data);
        return {};
      case 'openViewerPage':
        await openViewerPage();
        return {};
      case 'openBrowserTab':
        await browser.tabs.create({
          url: resolveRuntimeUrl(request.data),
          active: true
        });
        return {};
      case 'openWorkspaceLauncher':
        await openWorkspaceLauncher({ sourceUrl: request.sourceUrl || null });
        return {};
      case 'saveSettings':
        await saveSettings(request.oIni || {});
        return {};
      case 'loadSettings':
        return loadSettings();
      default:
        return undefined;
    }
  });

  void rebuildContextMenus();
});
