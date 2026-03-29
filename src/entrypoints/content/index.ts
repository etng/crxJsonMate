import JSON5 from 'json5';
import { browser } from '#imports';
import { detectRawPayload, createRawDocumentSnapshot, type JsonLikeApi, type RawPayloadResult } from '@/core/detector/raw-payload';
import { loadSettings, saveSettings } from '@/core/settings/storage';
import type { JsonMateRuntimeMessage } from '@/core/messaging/messages';

const json5Api: JsonLikeApi = {
  parse: (text) => JSON5.parse(text),
  stringify: (value, replacer, space) => JSON5.stringify(value, replacer as never, space) || ''
};

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_end',
  async main() {
    let settings = await loadSettings();
    const jsonApi = settings.jsonEngine === 'JM-JSON' ? json5Api : undefined;
    let detectedPayload: RawPayloadResult | null = detectRawPayload(
      createRawDocumentSnapshot(document),
      jsonApi
    );
    let inPageViewerRendered = false;
    let recoveryBannerShown = false;

    const refreshDetectedPayload = async () => {
      settings = await loadSettings();
      const latestJsonApi = settings.jsonEngine === 'JM-JSON' ? json5Api : undefined;
      detectedPayload = detectRawPayload(createRawDocumentSnapshot(document), latestJsonApi);
      return detectedPayload;
    };

    const escapeHtml = (value: string) => String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

    const countNodes = (value: unknown): number => {
      let total = 1;
      if (!value || typeof value !== 'object') {
        return total;
      }

      for (const child of Object.values(value)) {
        total += countNodes(child);
      }
      return total;
    };

    const ensureLoadingTip = () => {
      let tip = document.querySelector('.json-mate-loading-tip') as HTMLDivElement | null;
      if (tip) {
        return tip;
      }

      tip = document.createElement('div');
      tip.className = 'json-mate-loading-tip';
      tip.textContent = 'JSON Mate is loading...';
      Object.assign(tip.style, {
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 16px',
        borderRadius: '999px',
        background: 'rgba(255, 248, 233, 0.96)',
        color: '#6b7280',
        font: '12px/1.2 "Avenir Next", "Segoe UI", sans-serif',
        boxShadow: '0 16px 40px rgba(15, 23, 42, 0.16)',
        zIndex: '2147483647'
      } satisfies Partial<CSSStyleDeclaration>);
      document.body.appendChild(tip);
      return tip;
    };

    const hideLoadingTip = () => {
      const tip = document.querySelector('.json-mate-loading-tip');
      tip?.remove();
    };

    const removeRecoveryBanner = () => {
      const banner = document.querySelector('.json-mate-recovery-banner');
      banner?.remove();
      recoveryBannerShown = false;
    };

    const openWorkspaceLauncherFromPage = async () => {
      const payload = detectedPayload || await refreshDetectedPayload();
      await browser.runtime.sendMessage({
        cmd: 'setPendingJson',
        data: payload?.string || null
      } as const);
      await browser.runtime.sendMessage({
        cmd: 'openWorkspaceLauncher',
        sourceUrl: window.location.href
      } as const);
    };

    const ensureRecoveryBanner = () => {
      if (recoveryBannerShown || inPageViewerRendered || !detectedPayload || !document.body) {
        return;
      }

      let banner = document.querySelector('.json-mate-recovery-banner') as HTMLDivElement | null;
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'json-mate-recovery-banner';
        banner.innerHTML = [
          '<div class="json-mate-recovery-copy">',
          '<strong>JSON Mate auto render is off</strong>',
          '<span>This page is still valid JSON. Open it manually or turn auto render back on.</span>',
          '</div>',
          '<div class="json-mate-recovery-actions">',
          '<button type="button" data-json-mate-action="open">Open workspace</button>',
          '<button type="button" data-json-mate-action="enable">Enable auto render</button>',
          '</div>'
        ].join('');
        Object.assign(banner.style, {
          position: 'fixed',
          right: '18px',
          bottom: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          width: 'min(360px, calc(100vw - 36px))',
          padding: '16px',
          borderRadius: '20px',
          border: '1px solid rgba(15, 118, 110, 0.16)',
          background: 'rgba(255, 255, 255, 0.98)',
          boxShadow: '0 24px 60px rgba(15, 23, 42, 0.16)',
          color: '#15332d',
          font: '13px/1.45 "Avenir Next", "Segoe UI", sans-serif',
          zIndex: '2147483647'
        } satisfies Partial<CSSStyleDeclaration>);

        const style = document.createElement('style');
        style.textContent = [
          '.json-mate-recovery-banner strong { display:block; font-size:14px; margin-bottom:4px; }',
          '.json-mate-recovery-banner span { color:#58716c; }',
          '.json-mate-recovery-actions { display:flex; gap:10px; flex-wrap:wrap; }',
          '.json-mate-recovery-actions button { border:0; border-radius:999px; padding:10px 14px; cursor:pointer; }',
          '.json-mate-recovery-actions button[data-json-mate-action="open"] { background:linear-gradient(135deg, #0f766e, #14b8a6); color:#fff; }',
          '.json-mate-recovery-actions button[data-json-mate-action="enable"] { background:rgba(15, 118, 110, 0.08); color:#0f766e; }'
        ].join('\n');
        banner.appendChild(style);
        document.body.appendChild(banner);
      }

      if (!banner.dataset.bound) {
        banner.dataset.bound = '1';
        banner.addEventListener('click', async (event) => {
          const button = (event.target as HTMLElement | null)?.closest('[data-json-mate-action]') as HTMLElement | null;
          if (!button) {
            return;
          }

          const action = button.dataset.jsonMateAction;
          if (action === 'open') {
            await openWorkspaceLauncherFromPage();
            return;
          }

          if (action === 'enable') {
            settings = {
              ...settings,
              autoRenderEnabled: true
            };
            await saveSettings({ autoRenderEnabled: true });
            removeRecoveryBanner();
            createView();
          }
        });
      }

      recoveryBannerShown = true;
    };

    const buildMinimalPreview = () => {
      const rawJson = json5Api.stringify(detectedPayload?.data ?? null, null, 4);
      const escaped = escapeHtml(rawJson);
      return escaped.replace(/^(\s*)&quot;(.+?)&quot;: /gm, '$1<b>&quot;$2&quot;</b><i>:</i> ');
    };

    const renderMinimalView = () => {
      if (!document.body) {
        return;
      }

      document.documentElement.style.height = '100%';
      document.body.style.cssText = [
        'margin:0',
        'padding:24px',
        'min-height:100%',
        'box-sizing:border-box',
        'background:#fcfcff',
        'color:#2d47a2',
        `font-family:${settings.fontFamily}, "SFMono-Regular", Consolas, monospace`
      ].join(';');

      const pre = document.createElement('pre');
      pre.innerHTML = buildMinimalPreview();
      pre.style.margin = '0';
      pre.style.whiteSpace = 'pre-wrap';
      pre.style.wordBreak = 'break-word';
      pre.style.lineHeight = '1.6';

      const style = document.createElement('style');
      style.textContent = [
        'pre b { color: #3f6b1c; }',
        'pre i { color: #94a3b8; font-style: normal; margin-right: 0.5rem; }'
      ].join('\n');

      document.body.replaceChildren(style, pre);
      hideLoadingTip();
      inPageViewerRendered = true;
    };

    const getViewerUrl = () => {
      const viewerUrl = new URL(browser.runtime.getURL('/viewer.html'));
      viewerUrl.searchParams.set('type', 'iframe');
      viewerUrl.searchParams.set('sourceUrl', window.location.href);
      return viewerUrl.toString();
    };

    const renderInPageViewer = (payload: RawPayloadResult | null) => {
      if (!payload || inPageViewerRendered || !document.body) {
        return;
      }

      inPageViewerRendered = true;
      const tip = ensureLoadingTip();
      const frame = document.createElement('iframe');
      frame.src = getViewerUrl();
      frame.style.cssText = [
        'position:fixed',
        'inset:0',
        'width:100%',
        'height:100%',
        'border:0',
        'background:#fff',
        'z-index:2147483646'
      ].join(';');

      document.documentElement.style.height = '100%';
      document.body.style.margin = '0';
      document.body.style.minHeight = '100%';
      document.body.style.background = '#fff';
      document.body.appendChild(frame);

      const extensionOrigin = browser.runtime.getURL('').slice(0, -1);
      const cleanupViewerMessage = () => {
        window.removeEventListener('message', handleViewerMessage);
      };

      const handleViewerMessage = (event: MessageEvent) => {
        if (event.origin !== extensionOrigin) {
          return;
        }

        if (event.data?.cmd === 'viewerLoadedOk') {
          hideLoadingTip();
          frame.contentWindow?.postMessage({
            cmd: 'postJson',
            json: payload
          }, '*');
          return;
        }

        if (event.data?.cmd === 'viewerLoadedError') {
          tip.textContent = `JSON Mate error: ${String(event.data.msg || 'Unknown error')}`;
          cleanupViewerMessage();
          return;
        }

        hideLoadingTip();
        cleanupViewerMessage();
      };

      window.addEventListener('message', handleViewerMessage);
    };

    const createView = () => {
      if (!detectedPayload || inPageViewerRendered) {
        return;
      }

      removeRecoveryBanner();
      const nodeCount = countNodes(detectedPayload.data);
      if (nodeCount > 150000) {
        return;
      }

      if (detectedPayload.string && (detectedPayload.string.length > 100000 || nodeCount > 50000)) {
        ensureLoadingTip();
      }

      if (
        settings.minimalism &&
        (settings.minimalismTrigger === 'always' || nodeCount > 80000)
      ) {
        renderMinimalView();
        return;
      }

      renderInPageViewer(detectedPayload);
    };

    browser.runtime.onMessage.addListener(async (request: JsonMateRuntimeMessage) => {
      switch (request.cmd) {
        case 'getDetectedJsonText':
          return (detectedPayload || await refreshDetectedPayload())?.string || null;
        case 'getSelectionText': {
          const activeSelection = window.getSelection?.()?.toString().trim();
          return activeSelection || null;
        }
        case 'runViewerInPage': {
          const payload = detectedPayload || await refreshDetectedPayload();
          if (!payload) {
            return { error: 'Found not JSON text.' };
          }
          createView();
          return { ok: true };
        }
        default:
          return undefined;
      }
    });

    if (!settings.autoRenderEnabled) {
      if (detectedPayload) {
        ensureRecoveryBanner();
      }
      return;
    }

    if (detectedPayload) {
      createView();
    }
  }
});
