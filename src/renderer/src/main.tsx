import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { markEscape } from "./app/escape";
import "@fontsource/barlow-condensed/500.css";
import "@fontsource/barlow-condensed/600.css";
import "@fontsource/barlow-condensed/700.css";
import "@fontsource/ibm-plex-sans/300.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "./styles/base.css";
import "./styles/fonts.css";

// Escape reaches the game from the main process instead of the browser (so the
// browser never drops the pointer lock): replayed here as a key press on
// whatever has focus, for every Escape handler to hear as before.
// The main process runs it as a user gesture where it can, so a place taking
// the pointer back on Escape needs no click.
const escape = () => {
  markEscape();
  const at = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : window;
  for (const type of ["keydown", "keyup"])
    at.dispatchEvent(new KeyboardEvent(type, { key: "Escape", code: "Escape", bubbles: true, cancelable: true }));
};
Object.assign(window, { __gameEscape: escape });
window.api.onEscape(escape);

const root = document.getElementById("root");
if (!root) throw new Error("Root element #root not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
