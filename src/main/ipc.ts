import { type IpcMainInvokeEvent, ipcMain } from "electron";

/**
 * An IPC handler only the game's own top frame may call. Preloads also run in
 * the browser's site frames (nodeIntegrationInSubFrames, for the site frame
 * preload), so a handler must not answer a frame below the top.
 */
export function handleTop(
  channel: string,
  // biome-ignore lint/suspicious/noExplicitAny: handlers take their own argument types
  fn: (e: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, (e, ...args) => {
    const f = e.senderFrame;
    if (!f || f.parent) throw new Error(`${channel}: not from the game's own frame`);
    return fn(e, ...args);
  });
}
