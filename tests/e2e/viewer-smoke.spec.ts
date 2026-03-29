import { expect, test, chromium, type BrowserContext, type Page, type FrameLocator } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';

const EXTENSION_PATH = path.resolve('.output/wxt/chrome-mv3');
const TOOLS_FIXTURE_URL = 'http://127.0.0.1:4311/fixtures/sample-tools.json';
const OBJECT_FIXTURE_URL = 'http://127.0.0.1:4311/fixtures/sample-object.json';
const TOOLS_HOMEPAGE_URL = 'https://noiseprotocol.org/noise.html?chapter=handshake-patterns&section=one-way&example=noise-nn&lang=en&view=full';

let context: BrowserContext;
let userDataDir: string;

const openFixtureViewer = async (url = TOOLS_FIXTURE_URL): Promise<{ page: Page; viewer: FrameLocator }> => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 2200, height: 1400 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('iframe')).toHaveCount(1);

  const viewer = page.frameLocator('iframe[src^="chrome-extension://"]');
  await expect(viewer.locator('#dataExplorer')).toBeVisible();

  return { page, viewer };
};

const resolveLauncherViewerUrl = async (page: Page) => {
  const iframeSrc = await page.locator('iframe[src^="chrome-extension://"]').getAttribute('src');
  if (!iframeSrc) {
    throw new Error('viewer iframe src not found');
  }

  const launcherUrl = new URL(iframeSrc);
  launcherUrl.pathname = '/viewer.html';
  launcherUrl.search = '?type=iframe&launcher=1';
  launcherUrl.hash = '';
  return launcherUrl.toString();
};

test.beforeEach(async () => {
  userDataDir = mkdtempSync(path.join(tmpdir(), 'json-mate-e2e-'));
  context = await chromium.launchPersistentContext(userDataDir, {
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`
    ],
    channel: 'chromium',
    headless: true
  });
});

test.afterEach(async () => {
  await context.close();
  rmSync(userDataDir, { force: true, recursive: true });
});

test('keeps semantic links usable while preserving image previews', async () => {
  const { page, viewer } = await openFixtureViewer();

  const homepageRow = viewer.locator('button:has-text("homepage")').first();
  const avatarRow = viewer.locator('button:has-text("avatar")').first();

  await expect(homepageRow).toBeVisible();
  await expect(avatarRow).toBeVisible();
  await expect(homepageRow.locator('img.value-preview-image')).toHaveCount(0);
  await expect(homepageRow.locator('a.value-inline-link')).toHaveCount(1);
  await expect(viewer.locator(`a.treeValueLink[href="${TOOLS_HOMEPAGE_URL}"]`)).toHaveCount(0);
  await expect(avatarRow.locator('img.value-preview-image')).toHaveCount(1);

  await homepageRow.click();
  await expect(viewer.locator('#showPath')).toHaveValue('links.homepage');
  await expect(viewer.locator('#showLink')).toHaveAttribute('href', TOOLS_HOMEPAGE_URL);
  await expect.poll(async () => homepageRow.locator('a.value-inline-link').evaluate((element) => (
    window.getComputedStyle(element).color
  ))).toBe('rgb(255, 255, 255)');
  await expect.poll(async () => viewer.locator('.pathField').evaluate((element) => (
    element.querySelector('#showLink')?.getAttribute('href') ?? ''
  ))).toBe(TOOLS_HOMEPAGE_URL);
  await expect(viewer.getByText('Image unavailable')).toHaveCount(0);

  await page.close();
});

test('uses feature-specific close actions in iframe dialogs', async () => {
  const { page, viewer } = await openFixtureViewer();

  const searchButton = viewer.locator('#pathSearchBtn');
  const searchInput = viewer.locator('#pathSearchInput');

  await searchButton.click();
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toBeFocused();
  await expect(viewer.locator('#pathSearchClose')).toContainText('Close search');

  await viewer.locator('.pathSearchModeButton:has-text("Values")').click();
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toBeFocused();
  await viewer.locator('#pathSearchClose').click();
  await expect(viewer.locator('#pathSearchOverlay')).toBeHidden();

  await searchButton.click();
  await expect(viewer.locator('.pathSearchModeButton.is-active')).toContainText('Values');
  await viewer.locator('#pathSearchClose').click();
  await expect(viewer.locator('#pathSearchOverlay')).toBeHidden();

  await viewer.locator('#openToolkit').click();
  const toolkitCloseButton = viewer.locator('.viewerToolkitDialog .viewerButton:has-text("Close toolkit")');
  await expect(toolkitCloseButton).toBeVisible();
  await toolkitCloseButton.click();
  await expect(toolkitCloseButton).toHaveCount(0);

  await viewer.locator('button:has-text("avatar") img.value-preview-image').click();
  const imagePreviewCloseButton = viewer.locator('.viewerImagePreviewDialog .viewerButton:has-text("Close image preview")');
  await expect(imagePreviewCloseButton).toBeVisible();
  await imagePreviewCloseButton.click();
  await expect(imagePreviewCloseButton).toHaveCount(0);

  await page.close();
});

test('keeps the embedded toolkit focused on source and target panels', async () => {
  const { page, viewer } = await openFixtureViewer(OBJECT_FIXTURE_URL);

  await viewer.locator('button:has(.treeKey.object-key:text-is("price"))').first().click();
  await viewer.locator('#openToolkit').click();

  const dialog = viewer.locator('.viewerToolkitDialog');
  await expect(dialog).toBeVisible();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox?.width ?? 0).toBeGreaterThan(1200);

  const toolkit = viewer.frameLocator('.viewerToolkitFrame');
  await expect(toolkit.locator('.toolHero')).toBeHidden();
  await expect(toolkit.locator('.currentToolCard')).toBeHidden();
  await expect(toolkit.locator('.workspaceFocusBar')).toBeVisible();
  await expect(toolkit.locator('.workspaceBridgeLegend')).toBeVisible();
  await expect(toolkit.locator('.toolExample')).toHaveCount(2);
  await expect(toolkit.locator('.toolExample').first()).toBeHidden();

  const sourceTextarea = toolkit.locator('#sourceText');
  const targetTextarea = toolkit.locator('#targetText');
  await expect(sourceTextarea).toBeVisible();
  await expect(targetTextarea).toBeVisible();
  await expect(sourceTextarea).toBeFocused();

  const sourceBox = await sourceTextarea.boundingBox();
  const targetBox = await targetTextarea.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();

  if (!sourceBox || !targetBox) {
    throw new Error('toolkit textareas must be measurable');
  }

  expect(targetBox.x - sourceBox.x).toBeGreaterThan(180);
  expect(Math.abs(targetBox.y - sourceBox.y)).toBeLessThan(120);

  await page.close();
});

test('returns transformed toolkit output to the originating viewer field', async () => {
  const { page, viewer } = await openFixtureViewer();

  await viewer.locator('button:has-text("homepage")').first().click();
  await expect(viewer.locator('#editorValue')).toHaveValue(TOOLS_HOMEPAGE_URL);

  await viewer.locator('#openToolkit').click();

  const toolkit = viewer.frameLocator('.viewerToolkitFrame');
  await expect(toolkit.locator('#sourceText')).toBeFocused();
  await toolkit.locator('.catalogItem:has-text("URL Component")').click();
  await expect(toolkit.locator('#sourceText')).toBeFocused();
  await expect(toolkit.locator('#sourceText')).toHaveValue(TOOLS_HOMEPAGE_URL);

  await toolkit.locator('button.primaryButton:has-text("Encode")').click();
  await expect(viewer.locator('#editorValue')).toHaveValue(encodeURIComponent(TOOLS_HOMEPAGE_URL));

  await page.close();
});

test('saves a source document into a collection and exposes it in launcher', async () => {
  const { page, viewer } = await openFixtureViewer(OBJECT_FIXTURE_URL);
  const collectionButton = viewer.locator('#collectionBtn');

  await expect(collectionButton).toBeVisible();
  await collectionButton.click();
  await expect(viewer.locator('#collectionTitleInput')).toBeVisible();

  await viewer.locator('#collectionTitleInput').fill('Object sample');
  await viewer.locator('#collectionSelect').selectOption('__new__');
  const newCollectionInput = viewer.locator('#collectionNewInput');
  await expect(newCollectionInput).toBeVisible();
  await expect(newCollectionInput).toBeFocused();
  await newCollectionInput.fill('Launch samples');
  await newCollectionInput.press('Enter');
  await expect(viewer.locator('#viewerStatusToast')).toContainText('Saved to collection');

  await collectionButton.click();
  await expect(viewer.locator('#collectionTitleInput')).toBeVisible();
  await viewer.locator('#collectionTitleInput').fill('Object sample updated');
  await viewer.locator('#collectionTitleInput').press('Enter');
  await expect(viewer.locator('#viewerStatusToast')).toContainText('Saved to collection');

  const launcherUrl = await resolveLauncherViewerUrl(page);
  await page.goto(launcherUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.viewerLauncherLayout')).toBeVisible();
  await expect(page.locator('.viewerLauncherLibrary')).toBeVisible();
  await expect(page.locator('.viewerLauncherLibraryBlock')).toHaveCount(2);
  await expect(page.locator('.viewerLauncherLibraryBlock').first().locator('.viewerLauncherLibraryItemMeta').first()).toContainText(OBJECT_FIXTURE_URL);
  await expect(page.locator('.viewerLauncherLibraryBlock').nth(1).locator('.viewerLauncherCollectionGroupTitle').filter({ hasText: 'Launch samples' })).toBeVisible();
  await expect(page.locator('.viewerLauncherLibraryBlock').nth(1).locator('.viewerLauncherLibraryItemTitle').first()).toContainText('Object sample updated');

  await page.close();
});

test('collapses and reopens the workspace from the same top-right toggle', async () => {
  const { page, viewer } = await openFixtureViewer();

  const panel = viewer.locator('#panel');
  const panelToggle = viewer.locator('#mateBadge');
  const metaRow = viewer.locator('button:has-text("meta")').first();

  await expect(panel).not.toHaveClass(/isMinimized/);
  await panelToggle.click();
  await expect(panel).toHaveClass(/isMinimized/);
  await metaRow.click();
  await expect(panel).toHaveClass(/isMinimized/);
  await panelToggle.click();
  await expect(panel).not.toHaveClass(/isMinimized/);

  await page.close();
});

test('keeps the workspace toggle pinned to the viewport edge in iframe mode', async () => {
  const { page, viewer } = await openFixtureViewer();

  const panel = viewer.locator('#panel');
  const panelToggle = viewer.locator('#mateBadge');
  const settingsButton = viewer.locator('#optBtn');

  const viewport = page.viewportSize();
  const panelBox = await panel.boundingBox();
  const toggleBox = await panelToggle.boundingBox();
  const settingsBox = await settingsButton.boundingBox();

  expect(viewport).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(toggleBox).not.toBeNull();
  expect(settingsBox).not.toBeNull();

  if (!viewport || !panelBox || !toggleBox || !settingsBox) {
    throw new Error('workspace geometry must be measurable');
  }

  const toggleRightInset = viewport.width - (toggleBox.x + toggleBox.width);
  const toggleTopInset = toggleBox.y;
  const settingsRightInset = panelBox.x + panelBox.width - (settingsBox.x + settingsBox.width);

  expect(Math.abs(toggleRightInset - 16)).toBeLessThanOrEqual(4);
  expect(Math.abs(toggleTopInset - 10)).toBeLessThanOrEqual(4);
  expect(settingsRightInset).toBeGreaterThanOrEqual(48);
  expect(settingsRightInset).toBeLessThanOrEqual(88);

  await page.close();
});

test('renders icon-first workspace toolbar actions with tooltips', async () => {
  const { page, viewer } = await openFixtureViewer();

  const toolbarButtons = [
    { selector: '#expandCur', title: 'Expand current' },
    { selector: '#collapseCur', title: 'Collapse current' },
    { selector: '#expandAll', title: 'Expand all' },
    { selector: '#collapseAll', title: 'Collapse all' },
    { selector: '#pathSearchBtn', title: 'Search' },
    { selector: '#collectionBtn', title: 'Collection' },
    { selector: '#optBtn', title: 'Settings' }
  ] as const;

  for (const { selector, title } of toolbarButtons) {
    const button = viewer.locator(selector);
    await expect(button).toHaveAttribute('title', title);
    await expect(button.locator('span.srOnly')).toHaveCount(1);
    await expect(button.locator('.viewerActionTooltip')).toHaveText(title);

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error(`missing bounding box for ${selector}`);
    }

    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);

    await button.hover();
    const tooltip = button.locator('.viewerActionTooltip');
    await expect(tooltip).toBeVisible();

    if (selector === '#expandCur') {
      const tooltipBox = await tooltip.boundingBox();
      expect(tooltipBox).not.toBeNull();
      if (!tooltipBox) {
        throw new Error('missing tooltip bounding box for #expandCur');
      }

      expect(tooltipBox.x).toBeGreaterThanOrEqual(0);
      expect(tooltipBox.y).toBeGreaterThanOrEqual(0);
    }
  }

  await page.close();
});

test('renders icon-first value actions with visible hover tooltips', async () => {
  const { page, viewer } = await openFixtureViewer(TOOLS_FIXTURE_URL);
  const rawRow = viewer.locator('button:has(.treeKey.object-key:text-is("raw"))').first();

  await rawRow.click();

  const primaryActions = [
    { selector: '#saveBtn', title: 'Apply edit' },
    { selector: '#copyValue', title: 'Copy value' },
    { selector: '#openCurrentDetachedValue', title: 'Open as JSON' },
    { selector: '#openToolkit', title: 'Send to toolkit' }
  ] as const;

  for (const { selector, title } of primaryActions) {
    const button = viewer.locator(selector);
    await expect(button).toHaveAttribute('title', title);
    await expect(button.locator('span.srOnly')).toHaveCount(1);
    await expect(button.locator('.viewerActionTooltip')).toHaveText(title);

    const box = await button.boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
      throw new Error(`missing bounding box for ${selector}`);
    }

    expect(box.width).toBeGreaterThanOrEqual(40);
    expect(box.height).toBeGreaterThanOrEqual(40);

    await button.hover();
    await expect(button.locator('.viewerActionTooltip')).toBeVisible();
  }

  const moreToolsButton = viewer.locator('.jmViewerShelfActionIcon');
  await expect(moreToolsButton).toHaveAttribute('title', 'More');
  await moreToolsButton.hover();
  await expect(moreToolsButton.locator('.viewerActionTooltip')).toBeVisible();

  await page.close();
});

test('keeps iframe search input editable after opening the dialog', async () => {
  const { page, viewer } = await openFixtureViewer();

  const searchButton = viewer.locator('#pathSearchBtn');
  const searchInput = viewer.locator('#pathSearchInput');

  await searchButton.click();
  await expect(searchInput).toBeVisible();
  await expect(searchInput).toBeFocused();
  await searchInput.type('price');
  await page.waitForTimeout(250);
  await searchInput.type('x');
  await expect(searchInput).toHaveValue('pricex');

  await page.close();
});

test('keeps the inspector value editor editable while a node is selected', async () => {
  const { page, viewer } = await openFixtureViewer(TOOLS_FIXTURE_URL);
  const introRow = viewer.locator('button:has(.treeKey.object-key:text-is("intro"))').first();
  const textarea = viewer.locator('#editorValue');

  await introRow.click();
  await expect(textarea).not.toHaveAttribute('readonly', '');
  await textarea.fill('changed value');
  await expect(textarea).toHaveValue('changed value');

  await page.close();
});

test('offers ignore or save-as-string when a typed edit becomes invalid', async () => {
  const { page, viewer } = await openFixtureViewer(OBJECT_FIXTURE_URL);
  const priceRow = viewer.locator('button:has(.treeKey.object-key:text-is("price"))').first();
  const textarea = viewer.locator('#editorValue');

  await priceRow.click();
  await expect(viewer.locator('#viewerPathInput')).toHaveValue('items[0].price');
  await expect(priceRow).toContainText('19.99');

  await textarea.fill('3ee');
  await viewer.locator('#saveBtn').click();
  await expect(viewer.locator('#editorConflictActions')).toBeVisible();
  await viewer.locator('#ignoreInvalidEditBtn').click();
  await expect(viewer.locator('#editorConflictActions')).toBeHidden();
  await expect(priceRow).toContainText('19.99');
  await expect(textarea).toHaveValue('3ee');

  await viewer.locator('#saveBtn').click();
  await expect(viewer.locator('#editorConflictActions')).toBeVisible();
  await viewer.locator('#saveAsStringBtn').click();
  await expect(priceRow).toContainText('3ee');
  await expect(textarea).toHaveValue('3ee');

  await page.close();
});

test('keeps value search relevant for the current fixture', async () => {
  const toolsView = await openFixtureViewer(TOOLS_FIXTURE_URL);
  await toolsView.viewer.locator('#pathSearchBtn').click();
  await toolsView.viewer.locator('.pathSearchModeButton:has-text("Values")').click();
  const toolsSearchInput = toolsView.viewer.locator('#pathSearchInput');
  await toolsSearchInput.fill('price');
  await expect.poll(async () => await toolsView.viewer.locator('.pathSearchResult').count()).toBeGreaterThanOrEqual(2);
  await expect(toolsView.viewer.locator('#pathSearchMeta')).toContainText('2');
  await expect(toolsView.viewer.locator('.pathSearchResult').nth(0)).toContainText('payload.raw');
  await expect(toolsView.viewer.locator('.pathSearchResult').nth(1)).toContainText('payload.pretty');
  await toolsView.page.close();

  const objectView = await openFixtureViewer(OBJECT_FIXTURE_URL);
  await objectView.viewer.locator('#pathSearchBtn').click();
  await objectView.viewer.locator('.pathSearchModeButton:has-text("Keys")').click();
  const objectSearchInput = objectView.viewer.locator('#pathSearchInput');
  await objectSearchInput.fill('price');
  await expect.poll(async () => await objectView.viewer.locator('.pathSearchResult').count()).toBeGreaterThanOrEqual(2);
  await expect(objectView.viewer.locator('.pathSearchResult').nth(0)).toContainText('items[0].price');
  await expect(objectView.viewer.locator('.pathSearchResult').nth(1)).toContainText('items[1].price');
  await objectView.page.close();
});

test('expand and collapse controls change the tree state', async () => {
  const { page, viewer } = await openFixtureViewer(OBJECT_FIXTURE_URL);

  const explorer = viewer.locator('#dataExplorer');

  await viewer.locator('#expandAll').click();
  await expect.poll(async () => await explorer.innerText()).toContain('profile');
  await expect.poll(async () => await explorer.innerText()).toContain('19.99');

  await viewer.locator('#collapseAll').click();
  await expect.poll(async () => await explorer.innerText()).not.toContain('profile');
  await expect.poll(async () => await explorer.innerText()).not.toContain('19.99');

  await viewer.locator('#expandAll').click();
  await expect.poll(async () => await explorer.innerText()).toContain('profile');
  await expect.poll(async () => await explorer.innerText()).toContain('19.99');

  await page.close();
});

test('keeps iframe display options available and image previews controllable', async () => {
  const { page, viewer } = await openFixtureViewer(TOOLS_FIXTURE_URL);
  const tree = viewer.locator('#dataExplorer');
  const referenceValue = viewer.locator('button:has(.treeKey.object-key:text-is("reference")) .value-text');
  const introValue = viewer.locator('button:has(.treeKey.object-key:text-is("intro")) .value-text');
  const contentValue = viewer.locator('button:has(.treeKey.object-key:text-is("content")) .value-text');

  await expect(viewer.locator('#viewerMinimalMode')).toBeVisible();
  await expect(viewer.locator('#showLinkButtons')).toBeVisible();
  await expect(viewer.locator('#showArrayIndexes')).toBeVisible();
  await expect(viewer.locator('#showValues')).toBeVisible();
  await expect(viewer.locator('#showArrayLength')).toBeVisible();
  await expect(viewer.locator('#showImages')).toBeVisible();
  await expect(viewer.locator('#showTypeIcons')).toBeVisible();

  await expect(tree).toHaveClass(/showImages/);
  await expect(viewer.locator('button:has-text("homepage")').first().locator('a.value-inline-link')).toHaveCount(1);
  await expect(viewer.locator(`a.treeValueLink[href="${TOOLS_HOMEPAGE_URL}"]`)).toHaveCount(0);

  await viewer.locator('#viewerMinimalMode').evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await expect(tree).not.toHaveClass(/showImages/);
  await expect(tree).toHaveClass(/showFullValueText/);
  await expect(tree).toHaveClass(/showValues/);
  await expect(viewer.locator('#showImages')).toBeDisabled();
  await expect(viewer.locator('#showLinkButtons')).toBeDisabled();
  await expect(viewer.locator('button:has-text("homepage")').first().locator('a.value-inline-link')).toHaveCount(0);
  await expect.poll(async () => referenceValue.evaluate((element) => (
    window.getComputedStyle(element).whiteSpace
  ))).toBe('normal');
  await expect(referenceValue).toContainText('interactive-pattern-fundamentals-and-handshake-state-transitions');
  await expect(introValue).toContainText('Start from the initiator and responder roles.');
  await expect(contentValue).toContainText('Minimal mode should still keep the meaning visible');

  await viewer.locator('#viewerMinimalMode').evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await expect(viewer.locator('#showImages')).toBeEnabled();
  await expect(viewer.locator('#showLinkButtons')).toBeEnabled();
  await expect(tree).toHaveClass(/showImages/);
  await expect(viewer.locator('button:has-text("homepage")').first().locator('a.value-inline-link')).toHaveCount(1);

  await viewer.locator('#showLinkButtons').evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await expect(viewer.locator('button:has-text("homepage")').first().locator('a.value-inline-link')).toHaveCount(0);
  await expect(viewer.locator(`a.treeValueLink[href="${TOOLS_HOMEPAGE_URL}"]`)).toHaveCount(0);

  await viewer.locator('#showLinkButtons').evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await expect(viewer.locator('button:has-text("homepage")').first().locator('a.value-inline-link')).toHaveCount(1);

  await viewer.locator('#showImages').evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await expect(tree).not.toHaveClass(/showImages/);

  await viewer.locator('#showImages').evaluate((element) => {
    (element as HTMLInputElement).click();
  });
  await expect(tree).toHaveClass(/showImages/);

  await page.close();
});

test('opens parseable raw values in a detached viewer window', async () => {
  const { page, viewer } = await openFixtureViewer(TOOLS_FIXTURE_URL);
  const rawRow = viewer.locator('button:has(.treeKey.object-key:text-is("raw"))').first();
  const prettyRow = viewer.locator('button:has(.treeKey.object-key:text-is("pretty"))').first();
  const decimalTextRow = viewer.locator('button:has(.treeKey.object-key:text-is("decimalText"))').first();

  await expect(rawRow.locator('.value-inline-action')).toHaveCount(1);
  await expect(prettyRow.locator('.value-inline-action')).toHaveCount(1);
  await expect(decimalTextRow.locator('.value-inline-action')).toHaveCount(0);

  const detachedPagePromise = context.waitForEvent('page');
  await prettyRow.locator('.value-inline-action').click();
  const detachedViewer = await detachedPagePromise;

  await detachedViewer.waitForLoadState('domcontentloaded');
  await expect(detachedViewer).toHaveURL(/viewer\.html\?.*type=iframe.*detached=1.*json=.*sourcePath=payload\.pretty.*sourceUrl=/);
  await expect(detachedViewer).toHaveTitle(/payload\.pretty/);
  await expect(detachedViewer).toHaveTitle(/sample-tools\.json/);
  await expect(detachedViewer.locator('#root')).toContainText('Viewer payload ready', { timeout: 10000 });
  await expect(detachedViewer.locator('#root')).toContainText('items', { timeout: 10000 });
  await expect(detachedViewer.locator('#root')).toContainText('Root', { timeout: 10000 });

  await detachedViewer.close();
  await page.close();
});

test('syncs viewer display changes across already-open tabs', async () => {
  const firstView = await openFixtureViewer(TOOLS_FIXTURE_URL);
  const secondView = await openFixtureViewer(TOOLS_FIXTURE_URL);

  await expect(firstView.viewer.locator('#dataExplorer')).toHaveClass(/showImages/);
  await expect(secondView.viewer.locator('#dataExplorer')).toHaveClass(/showImages/);

  await firstView.viewer.locator('#viewerMinimalMode').evaluate((element) => {
    (element as HTMLInputElement).click();
  });

  await expect(firstView.viewer.locator('#dataExplorer')).not.toHaveClass(/showImages/);
  await expect(secondView.viewer.locator('#dataExplorer')).not.toHaveClass(/showImages/);
  await expect(secondView.viewer.locator('#showImages')).toBeDisabled();

  await firstView.page.close();
  await secondView.page.close();
});

test('opens launcher mode in the same iframe shell and accepts manual input', async () => {
  const { page } = await openFixtureViewer(TOOLS_FIXTURE_URL);
  const launcherUrl = await resolveLauncherViewerUrl(page);
  const launcherPage = await context.newPage();

  await launcherPage.goto(launcherUrl, { waitUntil: 'domcontentloaded' });
  await expect(launcherPage.locator('.viewerLauncherHero')).toBeVisible();
  await expect(launcherPage.locator('.viewerLauncherBrandMark')).toContainText('JM');
  await expect(launcherPage.getByRole('heading', { name: 'JSON Mate Viewer' })).toBeVisible();
  await expect(launcherPage.locator('.viewerLauncherHero').getByText('Quick start')).toBeVisible();
  await expect(launcherPage.getByRole('button', { name: 'Open URL' })).toBeVisible();
  await expect(launcherPage.getByRole('button', { name: 'IP info' })).toBeVisible();
  await expect(launcherPage.getByRole('button', { name: 'API response' })).toBeVisible();
  const sourceInput = launcherPage.locator('textarea.viewerTextareaDocument');

  await expect(sourceInput).toBeVisible();
  await expect(sourceInput).toBeFocused();
  await sourceInput.fill('{"launcher":{"ok":true,"items":[1,2,3]}}');
  await sourceInput.press('Enter');
  await expect(launcherPage.locator('#root')).toContainText('launcher', { timeout: 10000 });
  await expect(launcherPage.locator('#root')).toContainText('items', { timeout: 10000 });

  await launcherPage.close();
  await page.close();
});
