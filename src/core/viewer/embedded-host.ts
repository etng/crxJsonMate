export interface EmbeddedViewerHostMessageEvent {
  data?: {
    cmd?: unknown;
    msg?: unknown;
  } | null;
  origin: string;
  source: unknown;
}

export interface EmbeddedViewerHostMessageCallbacks {
  getViewerWindow: () => unknown;
  onPayloadLoaded: () => void;
  onViewerError: (message: string) => void;
  onViewerReady: () => void;
}

export const createEmbeddedViewerHostMessageHandler = (
  extensionOrigin: string,
  callbacks: EmbeddedViewerHostMessageCallbacks
) => (event: EmbeddedViewerHostMessageEvent) => {
  if (event.origin !== extensionOrigin || event.source !== callbacks.getViewerWindow()) {
    return;
  }

  switch (event.data?.cmd) {
    case 'viewerLoadedOk':
      callbacks.onViewerReady();
      return;
    case 'viewerPayloadLoaded':
      callbacks.onPayloadLoaded();
      return;
    case 'viewerLoadedError':
      callbacks.onViewerError(String(event.data.msg || 'Unknown error'));
  }
};
