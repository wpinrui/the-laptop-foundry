import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { app, BrowserWindow, Menu, net, protocol } from "electron";
import { registerStore } from "./store";

// The review photo sets' bundled assets (HDRIs, models, textures), served from
// the built renderer's review-assets folder. A custom scheme, because fetch
// cannot read file:// URLs. Nothing here touches the network.
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
      sandbox: true,
    },
  });

  window.on("ready-to-show", () => window.show());

  if (process.env.ELECTRON_RENDERER_URL) {
    window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  // Full screen with no menu bar.
  Menu.setApplicationMenu(null);
  registerStore();
  serveAssets();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
