import { describe, expect, it, vi } from 'vitest';
import { createEmbeddedViewerHostMessageHandler } from './embedded-host';

describe('embedded viewer host messages', () => {
  it('keeps accepting viewer-ready messages after the first payload is loaded', () => {
    const viewerWindow = {};
    const onPayloadLoaded = vi.fn();
    const onViewerError = vi.fn();
    const onViewerReady = vi.fn();
    const handleMessage = createEmbeddedViewerHostMessageHandler('chrome-extension://json-mate', {
      getViewerWindow: () => viewerWindow,
      onPayloadLoaded,
      onViewerError,
      onViewerReady
    });

    handleMessage({
      data: { cmd: 'viewerLoadedOk' },
      origin: 'chrome-extension://json-mate',
      source: viewerWindow
    });
    handleMessage({
      data: { cmd: 'viewerPayloadLoaded' },
      origin: 'chrome-extension://json-mate',
      source: viewerWindow
    });
    handleMessage({
      data: { cmd: 'viewerLoadedOk' },
      origin: 'chrome-extension://json-mate',
      source: viewerWindow
    });

    expect(onViewerReady).toHaveBeenCalledTimes(2);
    expect(onPayloadLoaded).toHaveBeenCalledOnce();
    expect(onViewerError).not.toHaveBeenCalled();
  });

  it('ignores messages from a different origin or frame', () => {
    const viewerWindow = {};
    const onViewerReady = vi.fn();
    const handleMessage = createEmbeddedViewerHostMessageHandler('chrome-extension://json-mate', {
      getViewerWindow: () => viewerWindow,
      onPayloadLoaded: vi.fn(),
      onViewerError: vi.fn(),
      onViewerReady
    });

    handleMessage({
      data: { cmd: 'viewerLoadedOk' },
      origin: 'https://example.test',
      source: viewerWindow
    });
    handleMessage({
      data: { cmd: 'viewerLoadedOk' },
      origin: 'chrome-extension://json-mate',
      source: {}
    });

    expect(onViewerReady).not.toHaveBeenCalled();
  });
});
