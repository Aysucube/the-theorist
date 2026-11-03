// The Theorist as a desktop app. It runs the site's own server on this
// computer (lib/server.mjs) and shows it in a window, after a welcome that opens
// a portal into it (splash/). Everything the app saves (the binder, decks,
// lists, price history, and copies of what it reads from EDHREC, Scryfall and
// the stores) lives in the app's folder in the user's profile, so it opens
// quickly and keeps working between updates.
import { app, BrowserWindow, clipboard, dialog, Menu, nativeTheme, screen, session, shell } from "electron";
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { canOpenOutside, isAppUrl } from "./lib/links.mjs";
import { copyOldData, dataFolderIn, findOldData, hasSavedData, likelyOldFolders } from "./lib/old-data.mjs";
import { startServer } from "./lib/server.mjs";
import { readWindowState, saveWindowState } from "./lib/window-state.mjs";

const here = import.meta.dirname;
const BACKGROUND = "#060a14";
const isMac = process.platform === "darwin";
/** The site's GitHub page, from Help. */
const HOME_PAGE = "https://github.com/Aysucube/the-theorist";

// For trying the app out: a separate profile, so a test run never touches the real one.
if (process.env.THEORIST_PROFILE) app.setPath("userData", process.env.THEORIST_PROFILE);

const profile = app.getPath("userData");
const dataDir = path.join(profile, "data");
const logDir = path.join(profile, "logs");
const serverLog = path.join(logDir, "server.log");
const appLog = path.join(logDir, "app.log");
const windowFile = path.join(profile, "window.json");
/** Written once the first start has looked for the launcher version's data. */
const broughtOverFile = path.join(profile, "brought-over.json");
const serverDir = app.isPackaged ? path.join(process.resourcesPath, "server") : path.join(here, "server");
const splashFile = path.join(here, "splash", "index.html");

/** @type {BrowserWindow | null} */
let win = null;
/** @type {Awaited<ReturnType<typeof startServer>> | null} */
let server = null;
let quitting = false;
/** When the server stopped on its own lately, to give up after a few. */
let crashes = [];

function note(message) {
  try {
    mkdirSync(logDir, { recursive: true });
    appendFileSync(appLog, `${new Date().toISOString()} ${message}\n`);
  } catch {}
}

/** Opens a link in the computer's browser (test runs only note it). */
function openOutside(url) {
  if (!canOpenOutside(url)) return;
  if (process.env.THEORIST_TEST_EXTERNAL_LOG === "1") note(`would open in the browser: ${url}`);
  else void shell.openExternal(url);
}

const appOrigin = () => (server ? new URL(server.url).origin : null);

// --- The splash's portal ---------------------------------------------------------

/** Runs a line in the splash page (our own file), quietly doing nothing once it's gone. */
function splash(script) {
  return win && !win.isDestroyed() ? win.webContents.executeJavaScript(script, true).catch(() => undefined) : Promise.resolve();
}
const say = (text) => splash(`window.portal?.say(${JSON.stringify(text)})`);

// --- Windows -------------------------------------------------------------------

function createWindow() {
  const state = readWindowState(
    windowFile,
    screen.getAllDisplays().map((d) => d.workArea),
  );
  const window = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 380,
    minHeight: 560,
    show: false,
    backgroundColor: BACKGROUND,
    title: "The Theorist",
    autoHideMenuBar: true,
    icon: app.isPackaged ? undefined : path.join(here, "assets", "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
  });
  window.once("ready-to-show", () => {
    if (state.maximized) window.maximize();
    window.show();
  });
  window.on("close", () => saveWindowState(windowFile, window));
  // The mouse's back and forward buttons (Windows), and two-finger swipes (Mac).
  window.on("app-command", (_event, command) => {
    if (command === "browser-backward") goBack();
    if (command === "browser-forward") goForward();
  });
  window.on("swipe", (_event, direction) => {
    if (direction === "right") goBack();
    if (direction === "left") goForward();
  });
  return window;
}

function goBack() {
  const history = win?.webContents.navigationHistory;
  if (history?.canGoBack() && isAppUrl(win.webContents.getURL(), appOrigin())) history.goBack();
}
function goForward() {
  const history = win?.webContents.navigationHistory;
  if (history?.canGoForward()) history.goForward();
}

/** Keeps every window on the app's own pages: other links open in the computer's browser. */
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (isAppUrl(url, appOrigin())) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          backgroundColor: BACKGROUND,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: true },
        },
      };
    }
    openOutside(url);
    return { action: "deny" };
  });
  contents.on("will-navigate", (event, url) => {
    if (isAppUrl(url, appOrigin()) || url === pathToFileUrl(splashFile)) return;
    event.preventDefault();
    openOutside(url);
  });
  contents.on("context-menu", (_event, params) => showContextMenu(contents, params));
}

function pathToFileUrl(file) {
  return new URL(`file:///${file.replace(/\\/g, "/").replace(/^\//, "")}`).href;
}

/** Copy and paste where there's text, and spelling fixes: a desktop window has no menu of its own. */
function showContextMenu(contents, params) {
  const items = [];
  for (const suggestion of params.dictionarySuggestions.slice(0, 4)) {
    items.push({ label: suggestion, click: () => contents.replaceMisspelling(suggestion) });
  }
  if (items.length > 0) items.push({ type: "separator" });
  if (params.isEditable) {
    items.push(
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { type: "separator" },
      { role: "selectAll" },
    );
  } else if (params.selectionText.trim()) {
    items.push({ role: "copy" });
  }
  if (params.linkURL && !isAppUrl(params.linkURL, appOrigin()) && canOpenOutside(params.linkURL)) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push(
      { label: "Open in Your Browser", click: () => openOutside(params.linkURL) },
      { label: "Copy Link", click: () => clipboard.writeText(params.linkURL) },
    );
  }
  if (items.length > 0) Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) ?? undefined });
}

function buildMenu() {
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    {
      label: "File",
      submenu: [
        { label: "Bring Over Data from the Launcher Version…", click: () => void bringOverFromFolder() },
        { label: "Open the App’s Data Folder", click: () => void shell.openPath(dataDir) },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { label: "Back", accelerator: isMac ? "Cmd+[" : "Alt+Left", click: goBack },
        { label: "Forward", accelerator: isMac ? "Cmd+]" : "Alt+Right", click: goForward },
        { label: "Home", accelerator: "CmdOrCtrl+Shift+H", click: () => server && win?.loadURL(`${server.url}/`) },
        { type: "separator" },
        { role: "reload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        // Ctrl and = too, without Shift, as browsers allow.
        { role: "zoomIn", accelerator: "CmdOrCtrl+=", visible: false, acceleratorWorksWhenHidden: true },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        { label: "Open the Log Folder", click: () => void shell.openPath(logDir) },
        { label: "Developer Tools", accelerator: "CmdOrCtrl+Shift+I", click: () => win?.webContents.toggleDevTools() },
        { type: "separator" },
        { label: "The Theorist on GitHub", click: () => openOutside(HOME_PAGE) },
        ...(isMac ? [] : [{ role: "about" }]),
      ],
    },
  ]);
}

// --- The launcher version's data ------------------------------------------------------

/** On the very first start: copies in the launcher version's binder, decks and the rest, if it's found. */
async function bringOverOnce() {
  if (existsSync(broughtOverFile) || (await hasSavedData(dataDir))) return;
  const candidates = process.env.THEORIST_IMPORT_FROM ? [process.env.THEORIST_IMPORT_FROM] : likelyOldFolders(os.homedir());
  const from = await findOldData(candidates);
  if (from) {
    await say("Bringing your binder and decks over…");
    await copyOldData(from, dataDir);
    note(`brought over the launcher version's data from ${from}`);
  }
  // Looked once; File → Bring Over Data does it on request after this.
  writeFileSync(broughtOverFile, JSON.stringify({ from, at: new Date().toISOString() }));
}

async function bringOverFromFolder() {
  const picked = await dialog.showOpenDialog(win ?? undefined, {
    title: "Bring Over Data from the Launcher Version",
    message: "Choose the folder the launcher version was in (the one with “Start The Theorist”).",
    defaultPath: app.getPath("documents"),
    properties: ["openDirectory"],
  });
  if (picked.canceled || !picked.filePaths[0]) return;
  const from = await dataFolderIn(picked.filePaths[0]);
  if (!from) {
    await dialog.showMessageBox(win ?? undefined, {
      type: "info",
      message: "There’s no binder or decks in that folder.",
      detail: "Choose the folder with “Start The Theorist” in it, or the .data folder inside it.",
    });
    return;
  }
  await copyOldData(from, dataDir, { freshen: true });
  writeFileSync(broughtOverFile, JSON.stringify({ from, at: new Date().toISOString() }));
  note(`brought over data from ${from} on request`);
  win?.reload();
  await dialog.showMessageBox(win ?? undefined, {
    type: "info",
    message: "Your binder, decks and lists are in.",
    detail: `Brought over from ${from}. That folder hasn’t been changed.`,
  });
}

// --- Starting and keeping the server -------------------------------------------------

async function showFailure(error) {
  note(`failed: ${error?.stack ?? error}`);
  if (quitting) return;
  await say("The portal wouldn’t open.");
  const { response } = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, {
    type: "error",
    title: "The Theorist",
    message: "The Theorist couldn’t start.",
    detail: `${error?.message ?? error}\n\nThe log folder has the details.`,
    buttons: ["Try Again", "Open the Log Folder", "Quit"],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 1) await shell.openPath(logDir);
  if (response === 0) app.relaunch();
  app.exit(0);
}

/** The server stopped by itself: start it again and reload the page, unless it keeps happening. */
function onServerExit(code) {
  if (quitting) return;
  note(`the server stopped by itself (code ${code})`);
  crashes = [...crashes.filter((at) => Date.now() - at < 5 * 60_000), Date.now()];
  if (crashes.length > 3) {
    void showFailure(new Error(`The app's server keeps stopping (last code ${code}).`));
    return;
  }
  const port = server?.port;
  startServer({ serverDir, dataDir, logFile: serverLog, port, onExit: onServerExit })
    .catch(() => startServer({ serverDir, dataDir, logFile: serverLog, onExit: onServerExit }))
    .then((restarted) => {
      server = restarted;
      note(`server back at ${restarted.url}`);
      if (win && !win.isDestroyed()) void win.loadURL(`${restarted.url}/`);
    })
    .catch(showFailure);
}

async function start() {
  nativeTheme.themeSource = "dark";
  mkdirSync(dataDir, { recursive: true });
  note(`starting ${app.getName()} ${app.getVersion()} (${process.platform}, Electron ${process.versions.electron})`);

  const allowed = new Set(["clipboard-sanitized-write", "clipboard-read", "fullscreen"]);
  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) => callback(allowed.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_contents, permission) => allowed.has(permission));
  session.defaultSession.setUserAgent(`${session.defaultSession.getUserAgent()} TheTheoristApp/${app.getVersion()}`);
  app.setAboutPanelOptions({
    applicationName: "The Theorist",
    applicationVersion: app.getVersion(),
    credits: "Card data from Scryfall, EDHREC and Commander Spellbook. Prices from TCGph and Philippine stores.",
    iconPath: path.join(here, "assets", "icon.png"),
  });
  app.on("web-contents-created", (_event, contents) => guard(contents));
  Menu.setApplicationMenu(buildMenu());

  win = createWindow();
  win.on("closed", () => (win = null));
  await win.loadFile(splashFile);
  // Resolves when the portal's opening has played (or was clicked through).
  const intro = splash("window.portal.intro");
  try {
    await bringOverOnce();
    const slow = setTimeout(() => void say("Waking the server… the first start takes a little longer."), 7000);
    server = await startServer({ serverDir, dataDir, logFile: serverLog, onExit: onServerExit });
    clearTimeout(slow);
    note(`server ready at ${server.url}`);
    // Warms the first page while the portal opens.
    void fetch(`${server.url}/`).catch(() => {});
    await intro;
    await splash("window.portal.gather()");
    if (!win) return;
    await win.loadURL(`${server.url}/?portal=1`);
  } catch (error) {
    await showFailure(error);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.on("before-quit", () => {
    quitting = true;
    server?.stop();
  });
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(start, showFailure);
}
