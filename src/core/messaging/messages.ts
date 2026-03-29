import type { JsonMateSettings } from '../settings/schema';

export interface SetPendingJsonMessage {
  cmd: 'setPendingJson';
  data: string | null;
}

export interface OpenWorkspaceLauncherMessage {
  cmd: 'openWorkspaceLauncher';
  sourceUrl?: string | null;
}

export interface OpenViewerPageMessage {
  cmd: 'openViewerPage';
}

export interface OpenBrowserTabMessage {
  cmd: 'openBrowserTab';
  data: string;
}

export interface GetPendingJsonMessage {
  cmd: 'getPendingJson';
}

export interface PeekPendingJsonMessage {
  cmd: 'peekPendingJson';
}

export interface SetPendingInputMessage {
  cmd: 'setPendingInput';
  data: string | null;
}

export interface GetPendingInputMessage {
  cmd: 'getPendingInput';
}

export interface PeekPendingInputMessage {
  cmd: 'peekPendingInput';
}

export interface RunViewerInPageMessage {
  cmd: 'runViewerInPage';
}

export interface GetDetectedJsonTextMessage {
  cmd: 'getDetectedJsonText';
}

export interface GetSelectionTextMessage {
  cmd: 'getSelectionText';
}

export interface SaveSettingsMessage {
  cmd: 'saveSettings';
  oIni: Partial<JsonMateSettings>;
}

export interface LoadSettingsMessage {
  cmd: 'loadSettings';
}

export type JsonMateRuntimeMessage =
  | SetPendingJsonMessage
  | OpenWorkspaceLauncherMessage
  | OpenViewerPageMessage
  | OpenBrowserTabMessage
  | GetPendingJsonMessage
  | PeekPendingJsonMessage
  | SetPendingInputMessage
  | GetPendingInputMessage
  | PeekPendingInputMessage
  | RunViewerInPageMessage
  | GetDetectedJsonTextMessage
  | GetSelectionTextMessage
  | SaveSettingsMessage
  | LoadSettingsMessage;
