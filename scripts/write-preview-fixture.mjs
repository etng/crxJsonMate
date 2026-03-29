import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const buildDir = path.join(rootDir, '.output', 'wxt', 'chrome-mv3');
const previewDir = path.join(rootDir, '.output', 'preview');
const buildFaviconPath = path.join(buildDir, 'favicon.ico');
const viewerHtmlPath = path.join(buildDir, 'viewer.html');
const outputPath = path.join(previewDir, 'preview-iframe-fixture.html');

const viewerHtml = await readFile(viewerHtmlPath, 'utf8');

const scriptMatch = viewerHtml.match(/<script type="module" crossorigin src="([^"]+)"><\/script>/);
const styleMatch = viewerHtml.match(/<link rel="stylesheet" crossorigin href="([^"]+)">/);
const preloadMatches = Array.from(
  viewerHtml.matchAll(/<link rel="modulepreload" crossorigin href="([^"]+)">/g),
  (match) => match[1]
);

if (!scriptMatch || !styleMatch) {
  throw new Error(`Could not extract viewer assets from ${viewerHtmlPath}`);
}

const payload = {
  meta: {
    source: 'json-mate-local-fixture',
    version: '0.2.4',
    generatedAt: '2026-03-27T06:10:00+08:00'
  },
  user: {
    profile: {
      displayName: 'JSON Mate',
      email: 'json-mate@example.test',
      avatar: 'https://dummyimage.com/256x160/0f766e/ffffff.png&text=JSON+Mate'
    }
  },
  links: {
    homepage: 'https://noiseprotocol.org/noise.html'
  },
  flags: {
    enabled: true,
    archived: false
  },
  time: {
    iso: '2026-03-27T06:10:00+08:00',
    unixMs: 1774563000000
  },
  items: [
    { id: 'sku-1', price: 19.99, enabled: true },
    { id: 'sku-2', price: 48.5, enabled: false }
  ]
};

const preloadTags = preloadMatches
  .map((href) => `    <link rel="modulepreload" crossorigin href="${href}" />`)
  .join('\n');

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>JSON Mate Viewer Fixture</title>
    <script>
      (() => {
        const settings = {
          initialized: true,
          lang: 'en',
          panelMode: 'always',
          sortKey: false,
          jsonEngine: 'JM-JSON',
          fontFamily: 'Tahoma',
          showTreeValues: true,
          showTypeIcons: true,
          showArrayIndexes: true,
          showImages: true,
          showImageMode: 'all',
          showArrayLength: true,
          rememberNodeState: true,
          minimalism: false,
          showTextFormat: false,
          contextMenuEnabled: true,
          autoRenderEnabled: true,
          treeIconStyle: 'folder',
          showLengthMode: 'array',
          renderMode: 'rich',
          minimalismTrigger: 'largePayloadOnly',
          toolkitNavigation: [],
          launchCount: 1,
          openViewerMode: 'popup'
        };
        const payload = ${JSON.stringify(JSON.stringify(payload, null, 2))};
        const runtime = {
          getURL: (value) => value,
          sendMessage: async (message) => {
            if (message && (message.cmd === 'peekPendingJson' || message.cmd === 'getPendingJson')) {
              return payload;
            }
            return null;
          }
        };
        const api = {
          storage: {
            local: {
              get: async () => settings,
              set: async (patch) => Object.assign(settings, patch),
              clear: async () => null
            }
          },
          runtime,
          tabs: {
            create: async () => null
          }
        };
        window.browser = api;
        window.chrome = api;
      })();
    </script>
${preloadTags}
    <script type="module" crossorigin src="${scriptMatch[1]}"></script>
    <link rel="stylesheet" crossorigin href="${styleMatch[1]}" />
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

await mkdir(previewDir, { recursive: true });
await writeFile(outputPath, html, 'utf8');
await unlink(buildFaviconPath).catch(() => {});

process.stdout.write(`${outputPath}\n`);
