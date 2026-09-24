// Electron's binary lives outside the package tree that yarn tracks: the
// postinstall downloads it into node_modules/electron/dist and writes
// path.txt. When that step is skipped, interrupted, or the binary is later
// quarantined or locked away, yarn still considers the package installed and
// electron-vite dies with "Error: Electron uninstall".
//
// This runs before anything that launches Electron and repairs the install in
// place, cheapest fix first.

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = join(root, "node_modules", "electron");

/** The installed binary, or null if Electron is not actually usable. */
function binaryPath() {
  const pointer = join(electronDir, "path.txt");
  if (!existsSync(pointer)) return null;
  const target = join(electronDir, "dist", readFileSync(pointer, "utf8").trim());
  return existsSync(target) ? target : null;
}

function attempt(label, command, cwd) {
  console.log(`[ensure-electron] ${label}`);
  try {
    execSync(command, { cwd, stdio: "inherit" });
  } catch {
    console.log(`[ensure-electron] ${label} failed, trying the next option`);
  }
  return binaryPath();
}

if (binaryPath()) process.exit(0);

console.log("[ensure-electron] Electron binary is missing. Repairing.");

if (!existsSync(electronDir)) {
  attempt("installing dependencies", "yarn install", root);
}

let found = binaryPath();

// The download step on its own, which reuses the local Electron cache and is
// far faster than reinstalling the package.
if (!found && existsSync(join(electronDir, "install.js"))) {
  found = attempt("running electron's postinstall", "node install.js", electronDir);
}

// Full reinstall, which also repairs a package tree that lost files.
if (!found) {
  found = attempt("reinstalling from scratch", "yarn install --check-files --force", root);
}

if (!found) {
  console.error(
    "[ensure-electron] Could not restore the Electron binary.\n" +
      "  If an app instance is still running it holds a lock on the file: kill it and retry.\n" +
      "  Otherwise check whether antivirus quarantined node_modules/electron/dist.",
  );
  process.exit(1);
}

console.log(`[ensure-electron] Ready: ${found}`);
