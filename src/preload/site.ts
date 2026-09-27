import { contextBridge, ipcRenderer, webFrame } from "electron";

// Runs at document start in every frame of the session (registered by the
// main process with session.registerPreloadScript). It only acts in the
// browser's site frames: never in a top frame, so the game's own page is left
// alone, and only for web pages. It exposes nothing to the page; what it
// changes in the page's world is done once, before the page's own scripts.
// Its IPC stays here in the isolated world, out of the page's reach.

/** A web page in a frame below some top frame: a browser tab or a frame inside one. */
const siteFrame = window.top !== window.self && /^https?:$/.test(location.protocol);

/**
 * Keeps a tab's script-set cookies, and dresses Google's sign-in as Firefox.
 * The game's page is the top-level site, so every site in a tab is
 * cross-site: Chrome drops a cookie set from script unless it is
 * SameSite=None; Secure, and Google's sign-in then says cookies are off.
 * Other sites keep the real navigator: spoofing it in the page trips bot
 * checks such as Cloudflare's. Runs in the page's world, so it must be
 * self-contained.
 */
function fixSite(ua: string, secure: boolean, firefox: boolean): void {
  const cross = (c: string): string => {
    if (!secure) return c;
    const parts = String(c)
      .split(";")
      .filter((p) => !/^\s*samesite\s*=/i.test(p));
    if (!parts.some((p) => /^\s*secure\s*$/i.test(p))) parts.push(" Secure");
    parts.push(" SameSite=None");
    return parts.join(";");
  };
  const cookie = Object.getOwnPropertyDescriptor(Document.prototype, "cookie");
  if (cookie?.get && cookie.set) {
    const { get, set } = cookie;
    Object.defineProperty(Document.prototype, "cookie", {
      configurable: true,
      enumerable: cookie.enumerable,
      get() {
        return get.call(this);
      },
      set(v: string) {
        set.call(this, cross(v));
      },
    });
  }
  const store = (globalThis as { CookieStore?: { prototype: { set: (...a: unknown[]) => Promise<void> } } }).CookieStore;
  if (store && secure) {
    const orig = store.prototype.set;
    store.prototype.set = function (this: unknown, a: unknown, b?: unknown) {
      const opts = typeof a === "string" ? { name: a, value: b } : { ...(a as object) };
      return orig.call(this, { ...opts, sameSite: "none" });
    };
  }
  if (!firefox) return;
  const nav = Navigator.prototype;
  const platform = /\(([^)]*)\)/.exec(ua)?.[1]?.replace(/;\s*rv:.*$/, "") ?? "";
  const fake: Record<string, unknown> = {
    userAgent: ua,
    appVersion: "5.0 (Windows)",
    userAgentData: undefined,
    vendor: "",
    productSub: "20100101",
    oscpu: platform,
    buildID: "20181001000000",
  };
  for (const [k, v] of Object.entries(fake)) {
    Object.defineProperty(nav, k, { configurable: true, enumerable: true, get: () => v });
  }
  try {
    delete (window as { chrome?: unknown }).chrome;
  } catch {}
}

if (siteFrame) {
  const platform = /\(([^)]*)\)/.exec(navigator.userAgent)?.[1] ?? "Windows NT 10.0; Win64; x64";
  const major = /Chrome\/(\d+)/.exec(navigator.userAgent)?.[1] ?? "0";
  // Google's sign-in gets a Firefox, as in the main process (fox.ts).
  const anc = location.ancestorOrigins;
  const tab = anc && anc.length >= 2 ? anc[anc.length - 2] : location.origin;
  const firefox = tab === "https://accounts.google.com";
  const ua = `Mozilla/5.0 (${platform}; rv:${Number(major) + 3}.0) Gecko/20100101 Firefox/${Number(major) + 3}.0`;
  try {
    contextBridge.executeInMainWorld({ func: fixSite, args: [ua, location.protocol === "https:", firefox] });
  } catch {}
  adblock();
  speaker();
}

/**
 * The tab's sound through the laptop's speakers. At document start, before
 * the page's scripts, the page's world gets its audio hooked (speakerHook);
 * then the game's speaker model and where the player is arrive from the main
 * process a few times a second and are handed in.
 */
function speaker(): void {
  let start: unknown = null;
  try {
    start = ipcRenderer.sendSync("fox-speaker:start");
  } catch {}
  try {
    contextBridge.executeInMainWorld({ func: speakerHook, args: [start] });
  } catch {
    return;
  }
  ipcRenderer.on("fox-speaker", (_e, state: unknown) => {
    try {
      contextBridge.executeInMainWorld({
        func: (s: unknown) => {
          const set = (globalThis as Record<symbol, unknown>)[Symbol.for("foundry.speaker")];
          if (typeof set === "function") set(s);
        },
        args: [state],
      });
    } catch {}
  });
}

/**
 * Runs in the page's world, so it must be self-contained. Every Web Audio
 * context's destination becomes the input of a speaker chain (bass cut,
 * presence peak, grill treble cut, soft clip, level, width and pan) in front
 * of the real one; media elements are routed through one when they play.
 * A cross-origin element without CORS cannot be routed (it would go silent):
 * it keeps its own sound and only gets the level, through its volume.
 */
function speakerHook(init: unknown): void {
  type P = { hp: number; hpQ: number; peakHz: number; peakDb: number; lp: number; drive: number; level: number; stereo: boolean };
  type S = { p: P; vol: number; dist: number; pan: number; width: number };
  type Chain = {
    ctx: BaseAudioContext;
    input: GainNode;
    hp1: BiquadFilterNode;
    hp2: BiquadFilterNode;
    peak: BiquadFilterNode;
    lp: BiquadFilterNode;
    pre: GainNode;
    post: GainNode;
    wide: GainNode;
    mono: GainNode;
    pan: StereoPannerNode;
  };
  let state: S =
    init && typeof init === "object"
      ? (init as S)
      : { p: { hp: 20, hpQ: 0.7, peakHz: 2800, peakDb: 0, lp: 20000, drive: 1, level: 1, stereo: true }, vol: 1, dist: 1, pan: 0, width: 1 };
  const RANGE = 4;
  const curve = new Float32Array(2049);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / 1024 - 1) * RANGE);
  const destination = Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, "destination")?.get;
  const volume = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "volume");
  const play = HTMLMediaElement.prototype.play;
  if (!destination || !volume?.get || !volume.set || typeof StereoPannerNode === "undefined") return;
  const volGet = volume.get;
  const volSet = volume.set;

  const chains = new Set<WeakRef<Chain>>();
  const byCtx = new WeakMap<BaseAudioContext, Chain>();

  const apply = (c: Chain) => {
    const { p, vol, dist, pan, width } = state;
    const t = c.ctx.currentTime;
    const to = (a: AudioParam, v: number) => a.setTargetAtTime(v, t, 0.04);
    to(c.hp1.frequency, p.hp);
    to(c.hp2.frequency, p.hp);
    c.hp2.Q.value = p.hpQ;
    to(c.peak.frequency, p.peakHz);
    to(c.peak.gain, p.peakDb);
    to(c.lp.frequency, p.lp);
    to(c.pre.gain, Math.max(0.001, p.drive * vol) / RANGE);
    to(c.post.gain, vol > 0 ? (p.level * dist) / Math.max(0.001, p.drive) : 0);
    const w = p.stereo ? width : 0;
    to(c.wide.gain, w);
    to(c.mono.gain, 1 - w);
    to(c.pan.pan, pan);
  };

  const build = (ctx: BaseAudioContext): Chain => {
    const real = destination.call(ctx) as AudioDestinationNode;
    const gain = () => ctx.createGain();
    const filter = (type: BiquadFilterType, q: number) => {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.Q.value = q;
      return f;
    };
    const c: Chain = {
      ctx,
      input: gain(),
      hp1: filter("highpass", 0.707),
      hp2: filter("highpass", 0.707),
      peak: filter("peaking", 1),
      lp: filter("lowpass", 0.707),
      pre: gain(),
      post: gain(),
      wide: gain(),
      mono: gain(),
      pan: ctx.createStereoPanner(),
    };
    const shaper = ctx.createWaveShaper();
    shaper.curve = curve;
    shaper.oversample = "2x";
    // One channel, explicitly: the stereo mix folds to mono here.
    c.mono.channelCount = 1;
    c.mono.channelCountMode = "explicit";
    c.mono.channelInterpretation = "speakers";
    c.input.connect(c.hp1).connect(c.hp2).connect(c.peak).connect(c.lp).connect(c.pre).connect(shaper).connect(c.post);
    c.post.connect(c.wide).connect(c.pan);
    c.post.connect(c.mono).connect(c.pan);
    c.pan.connect(real);
    Object.defineProperty(c.input, "maxChannelCount", { get: () => real.maxChannelCount });
    apply(c);
    return c;
  };

  Object.defineProperty(BaseAudioContext.prototype, "destination", {
    configurable: true,
    enumerable: true,
    get(this: BaseAudioContext) {
      if (typeof OfflineAudioContext !== "undefined" && this instanceof OfflineAudioContext) return destination.call(this);
      let c = byCtx.get(this);
      if (!c) {
        c = build(this);
        byCtx.set(this, c);
        chains.add(new WeakRef(c));
      }
      return c.input;
    },
  });

  // Media elements: routed through a chain of their own context, or, when
  // that would silence them, levelled through their volume.
  let mediaCtx: AudioContext | null = null;
  const routed = new WeakSet<HTMLMediaElement>();
  const loose = new Set<WeakRef<HTMLMediaElement>>();
  const isLoose = new WeakSet<HTMLMediaElement>();
  const want = new WeakMap<HTMLMediaElement, number>();
  const looseGain = () => Math.min(1, state.p.level * state.vol * state.dist);
  const level = (el: HTMLMediaElement) => volSet.call(el, (want.get(el) ?? 1) * looseGain());

  const routable = (el: HTMLMediaElement): boolean => {
    if (el.srcObject) return true;
    const src = el.currentSrc || el.src;
    if (!src) return false;
    if (/^(blob|data):/i.test(src)) return true;
    try {
      if (new URL(src, location.href).origin === location.origin) return true;
    } catch {}
    return el.crossOrigin !== null;
  };
  const route = (el: HTMLMediaElement) => {
    if (routed.has(el)) return;
    if (routable(el)) {
      try {
        if (!mediaCtx) mediaCtx = new AudioContext();
        if (mediaCtx.state === "suspended") mediaCtx.resume().catch(() => {});
        mediaCtx.createMediaElementSource(el).connect(mediaCtx.destination);
        routed.add(el);
        if (isLoose.has(el)) {
          isLoose.delete(el);
          volSet.call(el, want.get(el) ?? 1);
        }
        return;
      } catch {}
    }
    if (!isLoose.has(el)) {
      want.set(el, volGet.call(el) as number);
      isLoose.add(el);
      loose.add(new WeakRef(el));
    }
    level(el);
  };

  Object.defineProperty(HTMLMediaElement.prototype, "volume", {
    configurable: true,
    enumerable: true,
    get(this: HTMLMediaElement) {
      return isLoose.has(this) ? (want.get(this) ?? 1) : volGet.call(this);
    },
    set(this: HTMLMediaElement, v: number) {
      if (!isLoose.has(this) || !(Number(v) >= 0 && Number(v) <= 1)) {
        volSet.call(this, v);
        return;
      }
      want.set(this, Number(v));
      level(this);
    },
  });
  // A page that routes an element itself sends it to a context whose
  // destination is already a chain: that element is done.
  const own = AudioContext.prototype.createMediaElementSource;
  AudioContext.prototype.createMediaElementSource = function (this: AudioContext, el: HTMLMediaElement) {
    const node = own.call(this, el);
    routed.add(el);
    if (isLoose.has(el)) {
      isLoose.delete(el);
      volSet.call(el, want.get(el) ?? 1);
    }
    return node;
  };
  HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
    try {
      route(this);
    } catch {}
    return play.call(this);
  };
  window.addEventListener(
    "play",
    (e) => {
      if (e.target instanceof HTMLMediaElement) route(e.target);
    },
    true,
  );

  Object.defineProperty(globalThis, Symbol.for("foundry.speaker"), {
    configurable: false,
    enumerable: false,
    value: (s: S) => {
      if (!s || typeof s !== "object" || !s.p) return;
      state = s;
      for (const r of chains) {
        const c = r.deref();
        if (!c || (c.ctx instanceof AudioContext && c.ctx.state === "closed")) chains.delete(r);
        else apply(c);
      }
      for (const r of loose) {
        const el = r.deref();
        if (!el) loose.delete(r);
        else if (isLoose.has(el)) level(el);
      }
    },
  });
}

/**
 * The ad blocker's part in the page: the blocker's hiding rules and
 * scriptlets for this document, applied before the page's own scripts run
 * (scriptlets only work that early), then more hiding rules as the page adds
 * classes, ids and links. The main process picks the rules for this frame's
 * own address (src/main/adblock.ts).
 */
function adblock(): void {
  let start: { styles: string; scripts: string[] } | null = null;
  try {
    start = ipcRenderer.sendSync("fox-adblock:start");
  } catch {}
  if (!start) return;
  if (start.styles) webFrame.insertCSS(start.styles, { cssOrigin: "user" });
  // Each scriptlet in its own scope: several declare the same top-level names.
  for (const script of start.scripts) webFrame.executeJavaScript(`(function(){${script}\n})()`).catch(() => {});

  const seen = { classes: new Set<string>(), ids: new Set<string>(), hrefs: new Set<string>() };
  let pending = new Set<Element>();
  const scan = (roots: Iterable<Element>) => {
    const fresh = { classes: [] as string[], ids: [] as string[], hrefs: [] as string[] };
    const add = (kind: keyof typeof seen, v: string | null) => {
      if (v && !seen[kind].has(v) && seen[kind].size < 20000) {
        seen[kind].add(v);
        fresh[kind].push(v);
      }
    };
    const visit = (e: Element) => {
      add("ids", e.id);
      for (const c of e.classList) add("classes", c);
      add("hrefs", e.getAttribute("href"));
    };
    for (const root of roots) {
      if (!root.isConnected) continue;
      visit(root);
      for (const e of root.querySelectorAll("[id],[class],[href]")) visit(e);
    }
    if (!fresh.classes.length && !fresh.ids.length && !fresh.hrefs.length) return;
    ipcRenderer
      .invoke("fox-adblock:dom", fresh)
      .then((styles: unknown) => {
        if (typeof styles === "string" && styles) webFrame.insertCSS(styles, { cssOrigin: "user" });
      })
      .catch(() => {});
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const flush = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    timer = deadline = undefined;
    const roots = pending;
    pending = new Set();
    scan(roots);
  };
  window.addEventListener(
    "DOMContentLoaded",
    () => {
      scan([document.documentElement]);
      new MutationObserver((records) => {
        for (const r of records) {
          if (r.type === "attributes" && r.target instanceof Element) pending.add(r.target);
          for (const n of r.addedNodes) if (n instanceof Element) pending.add(n);
        }
        if (!pending.size) return;
        clearTimeout(timer);
        timer = setTimeout(flush, 50);
        deadline ??= setTimeout(flush, 1000);
      }).observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["class", "id", "href"],
      });
    },
    { once: true },
  );
}
