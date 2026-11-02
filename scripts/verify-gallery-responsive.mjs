import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const baseUrl = process.env.SIGIL_GALLERY_URL ?? 'http://127.0.0.1:5173/dev/gallery';
const screenshotDir = join(import.meta.dirname, '..', 'docs', 'screenshots');
const chromePath = process.env.CHROME_PATH ??
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const profileDir = await mkdtemp(join(tmpdir(), 'sigil-responsive-chrome-'));
const browser = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-default-apps',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-debugging-port=0',
  `--user-data-dir=${profileDir}`,
  '--window-size=1280,1000',
  'about:blank',
], { stdio: 'ignore' });

let socket;
let nextId = 0;
const pending = new Map();
const checks = [];
let screenshotCount = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForEndpoint() {
  const activePortPath = join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const [port] = (await readFile(activePortPath, 'utf8')).trim().split(/\r?\n/);
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return { port, version: await response.json() };
    } catch {
      await delay(100);
    }
  }
  throw new Error('Headless Chrome did not expose a DevTools endpoint.');
}

async function command(method, params = {}) {
  const id = ++nextId;
  const result = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Chrome DevTools command timed out: ${method}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
  });
  socket.send(JSON.stringify({ id, method, params }));
  const response = await result;
  if (response.error) throw new Error(`${method}: ${response.error.message}`);
  return response.result;
}

function connectPage(webSocketUrl) {
  return new Promise((resolve, reject) => {
    socket = new WebSocket(webSocketUrl);
    socket.addEventListener('open', () => resolve());
    socket.addEventListener('error', reject);
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const item = pending.get(message.id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(message.id);
      item.resolve(message);
    });
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function waitForGallery() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate("Boolean(document.querySelector('[data-testid=\"create-exam-gallery\"]'))")) return;
    await delay(100);
  }
  throw new Error('The gallery did not render.');
}

async function click(expression) {
  const clicked = await evaluate(expression);
  assert(clicked, `Could not find gallery control: ${expression}`);
  await delay(100);
}

async function capture(name, selector) {
  const rect = await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error('Screenshot element not found: ' + ${JSON.stringify(selector)});
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    const rect = element.getBoundingClientRect();
    return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height };
  })()`);
  assert(rect.width > 0 && rect.height > 0, `Screenshot element is empty: ${selector}`);
  const image = await command('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { ...rect, scale: 1 },
  });
  await writeFile(join(screenshotDir, `${name}.png`), Buffer.from(image.data, 'base64'));
  screenshotCount += 1;
  if (name.startsWith('mobile-')) {
    const pageMetrics = await evaluate(`(() => ({
      innerWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))()`);
    assert(
      pageMetrics.innerWidth === 390 && pageMetrics.scrollWidth <= pageMetrics.clientWidth,
      `Horizontal page scrolling at mobile state ${name}: ${JSON.stringify(pageMetrics)}`,
    );
  }
  if (name.endsWith('participants-populated') || name.endsWith('docket-populated')) {
    const tableMetrics = await evaluate(`(() => {
      const root = document.querySelector(${JSON.stringify(selector)});
      const wrapper = root?.querySelector('.sigil-ledger-table-wrap');
      return wrapper ? {
        overflowX: getComputedStyle(wrapper).overflowX,
        clientWidth: wrapper.clientWidth,
        scrollWidth: wrapper.scrollWidth,
      } : null;
    })()`);
    assert(tableMetrics?.overflowX === 'auto', `Wide ${name} table lacks its own horizontal scroll container.`);
    if (name.startsWith('mobile-')) {
      assert(
        tableMetrics.scrollWidth > tableMetrics.clientWidth,
        `Expected ${name} table to scroll within its container: ${JSON.stringify(tableMetrics)}`,
      );
      const touchTargets = await evaluate(`(() => {
        const root = document.querySelector('#fa-05-pages');
        const buttons = name => [...root.querySelectorAll(name)].map((item) => item.getBoundingClientRect().height);
        return {
          register: root.querySelector('.participants-page-header button')?.getBoundingClientRect().height ?? 0,
          roleFilters: buttons('.participants-role-filter button'),
          revokeButtons: buttons('.participants-actions button'),
          docketCreate: root.querySelector('.docket-page-header button')?.getBoundingClientRect().height ?? 0,
          docketFilters: buttons('.docket-state-filter button'),
          docketSearch: root.querySelector('.docket-search input')?.getBoundingClientRect().height ?? 0,
        };
      })()`);
      const touchTargetsReady = name.includes('participants')
        ? touchTargets.register >= 44 &&
          touchTargets.roleFilters.every((height) => height >= 44) &&
          touchTargets.revokeButtons.every((height) => height >= 44)
        : touchTargets.docketCreate >= 44 &&
          touchTargets.docketFilters.every((height) => height >= 44) &&
          touchTargets.docketSearch >= 44;
      assert(touchTargetsReady, `Mobile page controls are smaller than 44px: ${JSON.stringify(touchTargets)}`);
    }
  }
}

async function viewportMetrics(width) {
  await command('Emulation.setDeviceMetricsOverride', {
    width,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(200);
  const metrics = await evaluate(`(() => {
    const root = document.documentElement;
    const stamp = document.querySelector('#fa-07-command-centre .sigil-state-stamp');
    const grid = document.querySelector('#fa-07-command-centre .command-centre__grid');
    const wizardLayout = document.querySelector('#fa-06-pages .create-exam__layout');
    const rosette = document.querySelector('#fa-07-command-centre .command-centre__rosette');
    const tableScroll = document.querySelector('#fa-05-pages .participants-view__table-scroll, #fa-05-pages .docket-view__table-scroll, #fa-07-command-centre .command-centre__table-scroll');
    const topBar = document.querySelector('.sigil-top-bar, .sigil-topbar, header');
    return {
      innerWidth,
      clientWidth: root.clientWidth,
      scrollWidth: root.scrollWidth,
      topBarWidth: topBar?.getBoundingClientRect().width ?? null,
      rosetteWidth: rosette?.getBoundingClientRect().width ?? null,
      wizardColumns: wizardLayout ? getComputedStyle(wizardLayout).gridTemplateColumns : null,
      commandColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null,
      stateStampTransform: stamp ? getComputedStyle(stamp).transform : null,
      tableScrollWidth: tableScroll?.scrollWidth ?? null,
      tableClientWidth: tableScroll?.clientWidth ?? null,
      pageTables: [...document.querySelectorAll('#fa-05-pages .sigil-ledger-table-wrap')].map((table) => ({
        scrollWidth: table.scrollWidth,
        clientWidth: table.clientWidth,
        overflowX: getComputedStyle(table).overflowX,
      })),
      topBarHeight: topBar?.getBoundingClientRect().height ?? null,
      roleFilterButtonHeight: document.querySelector('#fa-05-pages .participants-role-filter button')?.getBoundingClientRect().height ?? null,
      docketSearchHeight: document.querySelector('#fa-05-pages .docket-search input')?.getBoundingClientRect().height ?? null,
      viewportHeight: innerHeight,
    };
  })()`);
  assert(metrics.innerWidth === width, `Expected innerWidth ${width}, got ${metrics.innerWidth}`);
  checks.push({ width, metrics });
  return metrics;
}

async function captureGalleryStates(prefix) {
  await capture(`${prefix}gallery-shell`, 'body');
  await capture(`${prefix}top-bar`, '.sigil-topbar');

  const participants = "(() => { const section = document.querySelector('#fa-05-pages'); const box = section?.querySelector(':scope > div'); const button = [...(box?.querySelectorAll('button') ?? [])].find((item) => item.textContent.trim() === 'STATE'); if (!button) return false; button.click(); return true; })()";
  for (const state of ['populated', 'loading', 'empty', 'error', 'permission']) {
    await click(participants.replace('STATE', state));
    await capture(`${prefix}participants-${state}`, '#fa-05-pages > div:nth-of-type(1)');
  }

  const docket = "(() => { const section = document.querySelector('#fa-05-pages'); const box = section?.querySelectorAll(':scope > div')[1]; const button = [...(box?.querySelectorAll('button') ?? [])].find((item) => item.textContent.trim() === 'STATE'); if (!button) return false; button.click(); return true; })()";
  for (const state of ['populated', 'loading', 'empty', 'error', 'permission']) {
    await click(docket.replace('STATE', state));
    await capture(`${prefix}docket-${state}`, '#fa-05-pages > div:nth-of-type(2)');
  }

  for (const [state, testId] of [
    ['connect-wallet', 'guard-connect-wallet'],
    ['sign-in', 'guard-sign-in'],
    ['wrong-network', 'guard-wrong-network'],
    ['no-role', 'guard-no-role'],
  ]) {
    await capture(`${prefix}guard-${state}`, `[data-testid="${testId}"]`);
  }

  const wizard = (state) => `(() => {
    const group = document.querySelector('[data-testid="create-exam-gallery"]');
    const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
  for (const state of ['populated', 'loading', 'empty', 'error', 'permission', 'metadata-error', 'created']) {
    await click(wizard(state));
    if (state === 'metadata-error') {
      await click(`(() => { const group = document.querySelector('[data-testid="create-exam-gallery"]'); const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === 'Review and sign'); if (!button) return false; button.click(); return true; })()`);
    }
    const selector = ['loading', 'empty', 'error', 'permission', 'created'].includes(state)
      ? '#fa-06-pages .create-exam__state'
      : '#fa-06-pages .create-exam';
    await capture(`${prefix}create-exam-${state}`, selector);
  }

  await click(wizard('populated'));
  for (const [index, label] of [
    'Details',
    'Sections and quotas',
    'Schedule',
    'Panel and threshold',
    'Setters and centres',
    'Review and sign',
  ].entries()) {
    await click(`(() => { const buttons = [...document.querySelectorAll('#fa-06-pages .create-exam__steps button')]; const button = buttons[${index}]; if (!button) return false; button.click(); return true; })()`);
    await capture(`${prefix}create-exam-step-${index + 1}-${label.toLowerCase().replaceAll(' ', '-')}`, '#fa-06-pages .create-exam');
  }

  const ceremony = (state) => `(() => {
    const group = document.querySelector('[data-testid="key-ceremony-gallery"]');
    const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
  for (const state of ['ready', 'loading', 'empty', 'error', 'permission', 'blocked', 'failed', 'complete']) {
    await click(ceremony(state));
    const selector = ['loading', 'empty', 'error', 'permission'].includes(state)
      ? '#fa-06-pages .key-ceremony__state'
      : '#fa-06-pages .key-ceremony';
    await capture(`${prefix}key-ceremony-${state}`, selector);
  }

  const commandCentre = (groupId, state) => `(() => {
    const group = document.querySelector('[data-testid="${groupId}"]');
    const button = [...group.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(state)});
    if (!button) return false;
    button.click();
    return true;
  })()`;
  for (const state of ['ready', 'loading', 'empty', 'error', 'permission']) {
    await click(commandCentre('command-centre-page-state-controls', state));
    await capture(
      `${prefix}command-centre-page-${state}`,
      state === 'empty'
        ? '#fa-07-command-centre .sigil-empty-state'
        : state === 'ready'
          ? '#fa-07-command-centre .command-centre'
          : '#fa-07-command-centre .command-centre__state',
    );
  }
  for (const state of ['Draft', 'Collecting', 'Sealed', 'Released', 'Concluded', 'Cancelled']) {
    await click(commandCentre('command-centre-page-state-controls', 'ready'));
    await click(commandCentre('command-centre-chain-state-controls', state));
    if (state === 'Collecting') await click(commandCentre('command-centre-seal-controls', 'quota'));
    await capture(`${prefix}command-centre-${state.toLowerCase()}${state === 'Collecting' ? '-quota-blocked' : ''}`, '#fa-07-command-centre .command-centre');
  }
  for (const state of ['randomness', 'ready']) {
    await click(commandCentre('command-centre-page-state-controls', 'ready'));
    await click(commandCentre('command-centre-chain-state-controls', 'Collecting'));
    await click(commandCentre('command-centre-seal-controls', state));
    await capture(`${prefix}command-centre-collecting-${state}`, '#fa-07-command-centre .command-centre');
  }
  await click(commandCentre('command-centre-page-state-controls', 'ready'));
  await click(commandCentre('command-centre-chain-state-controls', 'Collecting'));
  const cancelInputReady = await evaluate("(() => { const input = document.querySelector('#fa-07-command-centre #command-centre-cancel-confirmation'); if (!input) return false; input.focus(); input.value = ''; return true; })()");
  assert(cancelInputReady, 'Could not focus the command-centre cancellation confirmation field.');
  await command('Input.insertText', { text: 'No. 0007' });
  const cancelEnabled = await evaluate("(() => { const button = [...document.querySelectorAll('#fa-07-command-centre button')].find((item) => item.textContent.trim() === 'Cancel exam'); return Boolean(button && !button.disabled); })()");
  assert(cancelEnabled, 'The typed cancellation confirmation did not enable the cancel button.');
  await capture(`${prefix}command-centre-cancel-confirmed`, '#fa-07-command-centre .command-centre');

  const finalMetrics = await evaluate(`(() => ({
    innerWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    overflowingElements: [...document.querySelectorAll('body *')]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          testId: element.getAttribute('data-testid'),
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          text: element.innerText?.slice(0, 60) ?? '',
        };
      })
      .filter((element) => element.right > document.documentElement.clientWidth + 1)
      .slice(0, 30),
    tableAncestors: (() => {
      const ancestors = [];
      for (let element = document.querySelector('.sigil-ledger-table'); element && ancestors.length < 10; element = element.parentElement) {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        ancestors.push({
          tag: element.tagName,
          className: typeof element.className === 'string' ? element.className : '',
          width: Math.round(rect.width),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          minWidth: style.minWidth,
          overflowX: style.overflowX,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        });
      }
      return ancestors;
    })(),
    firstOverflowingDescendants: [...document.querySelectorAll('body *')]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const parentRect = element.parentElement?.getBoundingClientRect();
        return rect.right > document.documentElement.clientWidth + 1 &&
          (!parentRect || parentRect.right <= document.documentElement.clientWidth + 1);
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName,
        className: typeof element.className === 'string' ? element.className : '',
        testId: element.getAttribute('data-testid'),
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
        parent: element.parentElement?.tagName + '.' + (element.parentElement?.className ?? ''),
        text: element.innerText?.slice(0, 80) ?? '',
      })),
    mainChildren: [...document.querySelector('.sigil-main-content')?.children ?? []].map((element) => ({
      tag: element.tagName,
      className: typeof element.className === 'string' ? element.className : '',
      width: Math.round(element.getBoundingClientRect().width),
      right: Math.round(element.getBoundingClientRect().right),
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    })),
  }))()`);
  assert(finalMetrics.innerWidth === Number(prefix === 'desktop-' ? 1280 : 390), 'Viewport changed during gallery capture.');
  if (prefix === 'mobile-') {
    assert(!finalMetrics.pageOverflow, `Mobile gallery has horizontal page overflow: ${JSON.stringify(finalMetrics)}`);
  }
  checks.push({ width: finalMetrics.innerWidth, finalMetrics });
}

try {
  await mkdir(screenshotDir, { recursive: true });
  const { port, version } = await waitForEndpoint();
  const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about%3Ablank`, { method: 'PUT' });
  assert(targetResponse.ok, 'Could not create headless Chrome page.');
  const target = await targetResponse.json();
  await connectPage(target.webSocketDebuggerUrl);
  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: baseUrl });
  await waitForGallery();

  for (const width of [1280, 390]) {
    const prefix = width === 1280 ? 'desktop-' : 'mobile-';
    const metrics = await viewportMetrics(width);
    await captureGalleryStates(prefix);
    console.log(JSON.stringify({ width, metrics, screenshots: screenshotCount }));
  }

  console.log(JSON.stringify({ browser: version.Browser, screenshotCount, checks }, null, 2));
} finally {
  socket?.close();
  browser.kill();
  await delay(250);
  await rm(profileDir, { recursive: true, force: true });
}
