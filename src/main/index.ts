import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, net, protocol } from "electron";
import { registerFox } from "./fox";
import { registerStore } from "./store";
import { registerSvgImport } from "./svg";
import { registerVideo } from "./video";

// The review photo sets' bundled assets (HDRIs, models, textures), served from
// the built renderer's review-assets folder. A custom scheme, because fetch
// cannot read file:// URLs. Nothing here touches the network.
// In a full screen window, Chromium on Windows lifts a pillarboxed video into a
// hardware overlay stretched over the whole display with black bars, drawn
// above the page, so the short's buttons beside the video vanish. Kept off,
// the overlay covers only the video itself.
app.commandLine.appendSwitch("disable-features", "DirectCompositionLetterboxVideoOptimization");
// Turning off only the letterbox step was not enough on real hardware: keep
// video out of hardware overlays altogether, so the page always draws above it.
app.commandLine.appendSwitch("disable-direct-composition-video-overlays");

protocol.registerSchemesAsPrivileged([
  { scheme: "foundry", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function serveAssets(): void {
  const root = normalize(join(__dirname, "../renderer/review-assets"));
  protocol.handle("foundry", async (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, "");
    const file = normalize(join(root, rel));
    if (!file.startsWith(root + sep)) return new Response(null, { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const headers = new Headers(res.headers);
    headers.set("Access-Control-Allow-Origin", "*");
    return new Response(res.body, { status: res.status, headers });
  });
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    fullscreen: true,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      // Lets the browser's site frame preload (src/preload/site.ts) run in
      // the tabs. Sandboxed, so no frame gets Node; the game's preload and IPC
      // handlers only serve the top frame.
      nodeIntegrationInSubFrames: true,
      sandbox: true,
    },
  });

  window.on("ready-to-show", () => window.show());

  const dev = process.env.ELECTRON_RENDERER_URL;
  const index = pathToFileURL(join(__dirname, "../renderer/index.html")).href;
  const devOrigin = dev ? new URL(dev).origin : null;
  const appOrigin = (url: string): boolean => {
    try {
      if (devOrigin) return new URL(url).origin === devOrigin;
      return url.split("#")[0].split("?")[0] === index;
    } catch {
      return false;
    }
  };
  registerFox(window, appOrigin);

  if (dev) {
    window.loadURL(dev);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Full screen with no menu bar.
  Menu.setApplicationMenu(null);
  registerStore();
  registerSvgImport();
  registerVideo();
  serveAssets();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
