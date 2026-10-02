import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import type { Capability, ClientMessage } from "../../../packages/protocol/src/index.ts";
import type { ActiveSession, DesktopState, InputEvent, TransferStatus } from "./contracts.ts";
import { RemoteMedia } from "./media.ts";
import type { Stats } from "./media.ts";
import logoUrl from "../assets/icon.png";
import "./bridge.ts";
import "./styles.css";

const icon =
  (d: string, size = 16) =>
  () => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
// Absolute, so it also resolves inside a popped-out session's window (an about:blank document).
const logoSrc = new URL(logoUrl, document.baseURI).href;
const Logo = () => <img className="logo-img" src={logoSrc} alt="" width={18} height={18} />;
const CopyIcon = icon("M9 9h10v10H9zM5 15V5h10");
const CheckIcon = icon("m5 12 5 5 9-10");
const MinIcon = icon("M5 12h14", 14);
const MaxIcon = icon("M5 5h14v14H5z", 13);
const RestoreIcon = icon("M8 8h11v11H8zM5 16V5h11", 13);
const CloseIcon = icon("m6 6 12 12M18 6 6 18", 14);
const TabCloseIcon = icon("m7 7 10 10M17 7 7 17", 12);
const FullIcon = icon("M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5");
const ExitFullIcon = icon("M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5");
const FitIcon = icon("M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4M8 8h8v8H8z");
const ActualIcon = icon("M4 4h16v16H4zM9 9v6M13 9h2v6");
const HomeIcon = icon("M4 11 12 4l8 7v9h-5v-6H9v6H4z", 15);
const GridIcon = icon("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z");
const PlusIcon = icon("M12 5v14M5 12h14", 15);
const PopoutIcon = icon("M10 5H5v14h14v-5M14 4h6v6M20 4l-8 8", 12);
const DockIcon = icon("M10 5H5v14h14v-5M20 4l-8 8M12 7v5h5");
const HistoryIcon = icon("M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4M12 8v4l3 2", 14);
const RenameIcon = icon("M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4", 13);
const InputOnIcon = icon("M4 6h16v12H4zM9 17v3M15 17v3M7 20h10", 14);
const InputOffIcon = () => (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 6h16v12H4zM9 17v3M15 17v3M7 20h10" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="#f55" strokeWidth="2.2" />
  </svg>
);
const DisconnectIcon = icon("M18.36 5.64a9 9 0 1 1-12.73 0M12 2v10", 12);
const MenuIcon = icon("M4 6h16M4 12h16M4 18h16", 14);
const ConnectIcon = icon("M5 12h14M13 5l7 7-7 7", 14);

const relative = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto",
  style: "short"
});
function ago(at: number, now: number) {
  const minutes = Math.round((at - now) / 60000);
  if (minutes > -1) return "just now";
  if (minutes > -60) return relative.format(minutes, "minute");
  if (minutes > -1440) return relative.format(Math.round(minutes / 60), "hour");
  return relative.format(Math.round(minutes / 1440), "day");
}
const formatId = (id?: string) => id?.replace(/(\d{3})(?=\d)/g, "$1 ") ?? "— — —";
const NAME_MAX = 40;

/** Inline editor for a recent computer's name: Enter or leaving the field saves, Escape cancels. */
function RenameField({ id, name, onDone }: { id: string; name?: string; onDone: (name?: string | null) => void }) {
  const done = useRef(false);
  // Enter unmounts the field, which can blur it too: finish only once.
  const finish = (value?: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(value);
  };
  return (
    <form
      className="recent-rename"
      onSubmit={e => {
        e.preventDefault();
        finish(new FormData(e.currentTarget).get("name") as string);
      }}
    >
      <input
        name="name"
        autoFocus
        defaultValue={name ?? ""}
        maxLength={NAME_MAX}
        placeholder="Name this computer"
        aria-label={`Name for ${formatId(id)}`}
        title="Enter to save, Esc to cancel"
        autoComplete="off"
        spellCheck={false}
        onFocus={e => e.currentTarget.select()}
        onKeyDown={e => {
          if (e.key === "Escape") {
            e.stopPropagation();
            finish();
          }
        }}
        onBlur={e => finish(e.currentTarget.value)}
      />
      <span className="recent-time recent-id-small">{formatId(id)}</span>
    </form>
  );
}
const permissionLabels: Record<Capability, string> = {
  screen: "view",
  mouse: "mouse",
  keyboard: "keyboard",
  clipboard: "clipboard"
};
const labels: Record<DesktopState["status"], string> = {
  setup: "Setup required",
  connecting: "Connecting",
  ready: "Ready to connect",
  offline: "Offline"
};
const HOME = "home";
// Matches the agent and server limit (MAX_SESSIONS / MAX_CONTROLLER_SESSIONS).
const MAX_SESSIONS = 8;

// A 32×18 grayscale frame of the shared screen. The agent compares it with each display to find the
// one being shared (src-tauri/src/platform.rs, display_for_source).
async function thumbnail(stream: MediaStream): Promise<number[] | undefined> {
  const video = document.createElement("video");
  video.muted = true;
  video.srcObject = stream;
  try {
    await video.play();
    await new Promise(resolve => setTimeout(resolve, 300));
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context || !video.videoWidth) return undefined;
    context.drawImage(video, 0, 0, 32, 18);
    const rgba = context.getImageData(0, 0, 32, 18).data;
    return Array.from({ length: 32 * 18 }, (_, i) => Math.round((rgba[i * 4]! * 299 + rgba[i * 4 + 1]! * 587 + rgba[i * 4 + 2]! * 114) / 1000));
  } catch {
    return undefined;
  } finally {
    video.srcObject = null;
  }
}

/** The frameless window's buttons; `target` names a popped-out session's window instead of this one. */
function WindowControls({ maximized, target, onClose, closeTitle = "Close to tray" }: { maximized: boolean; target?: string; onClose?: () => void; closeTitle?: string }) {
  return (
    <div className="window-controls">
      <button aria-label="Minimize" title="Minimize" onClick={() => void window.remote.window("minimize", target)}>
        <MinIcon />
      </button>
      <button aria-label={maximized ? "Restore" : "Maximize"} title={maximized ? "Restore" : "Maximize"} onClick={() => void window.remote.window("maximize", target)}>
        {maximized ? <RestoreIcon /> : <MaxIcon />}
      </button>
      <button className="close" aria-label="Close" title={closeTitle} onClick={onClose ?? (() => void window.remote.window("close", target))}>
        <CloseIcon />
      </button>
    </div>
  );
}
// Frameless window: title bar, tab bar and toolbar move the window; double-click maximizes.
// `target`: a popped-out session's window (its page is drawn from here, so it is moved from here too).
function drag(e: React.MouseEvent, target?: string) {
  const element = e.target as HTMLElement;
  if (e.button !== 0 || element.ownerDocument.fullscreenElement || element.closest("button, input, label, summary, a, .device-id, [role=tab], .tab")) return;
  if (e.detail === 2) void window.remote.window("maximize", target);
  else if (target) void window.remote.window("drag", target);
  else void window.remote.startDrag();
}
function TransferChip({ status }: { status: TransferStatus }) {
  return (
    <span className={`transfer-chip ${status.state}`} role="status" title={`${status.direction === "send" ? "Sending" : "Receiving"} ${status.label}`}>
      {status.state === "done" ? `✓ ${status.direction === "send" ? "Sent" : "Ready to paste"}` : status.state === "failed" ? "⚠ Transfer failed" : `${status.direction === "send" ? "↑" : "↓"} ${Math.round(status.progress * 100)}%`}
    </span>
  );
}
const statsTitle = (_session: ActiveSession, stats?: Stats) => (stats ? `${stats.path} · ${stats.rtt} ms · ${stats.fps} fps · ${stats.codec || "Video"} · ${stats.bitrate.toFixed(1)} Mbps` : undefined);

/** A session shown in its own window. The window is only a surface: this page draws into its document
 * (see popOut), so the session's connection, input and state never move. */
type Popout = {
  win: Window;
  root: HTMLElement;
  label: string;
  maximized: boolean;
};
const POPOUT = "session-";

/** One remote screen with its own video, scaling and input. Sessions in background tabs stay
 * mounted (their connection is kept) and the other computer pauses their video until shown. */
function SessionView({ session, media, stream, visible, focused, tiled, label, scale, inputDisabled: noInput, onFocus, onClose, onMaximize }: { session: ActiveSession; media?: RemoteMedia; stream?: MediaStream; visible: boolean; focused: boolean; tiled: boolean; label: string; scale: "fit" | "actual"; inputDisabled?: boolean; onFocus: () => void; onClose: () => void; onMaximize: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const viewer = useRef<HTMLDivElement>(null);
  const lastMove = useRef(0);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const target = stream ?? null;
    if (element.srcObject === target) return;
    element.srcObject = target;
    if (!stream) return;
    let cancelled = false;
    const tryPlay = () => { if (cancelled || element.srcObject !== stream) return; void element.play().catch(() => { if (!cancelled) setTimeout(tryPlay, 500); }); };
    tryPlay();
    return () => { cancelled = true; };
  }, [stream]);
  // Hiding a session releases anything held down there; the focused one gets the keyboard.
  useEffect(() => {
    if (!visible) media?.send({ type: "release" });
  }, [visible, media]);
  useEffect(() => {
    if (focused) viewer.current?.focus();
  }, [focused]);
  // Tell the other computer how large this view is, so it encodes at that size (see media.setQuality).
  useEffect(() => {
    const element = video.current;
    if (!element || !media || !visible) return;
    const report = () => media.setQuality(Math.round(element.clientWidth * ((element.ownerDocument.defaultView ?? window).devicePixelRatio || 1)));
    const observer = new ResizeObserver(report);
    observer.observe(element);
    report();
    return () => observer.disconnect();
  }, [media, visible, scale]);
  const send = (event: InputEvent) => { if (!noInput) media?.send(event); };
  function point(event: React.MouseEvent): { x: number; y: number } | undefined {
    const element = video.current;
    if (!element?.videoWidth) return;
    const rect = element.getBoundingClientRect();
    const fit = Math.min(rect.width / element.videoWidth, rect.height / element.videoHeight);
    const width = element.videoWidth * fit,
      height = element.videoHeight * fit;
    const x = (event.clientX - rect.left - (rect.width - width) / 2) / width;
    const y = (event.clientY - rect.top - (rect.height - height) / 2) / height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    return { x, y };
  }
  const dpr = (viewer.current?.ownerDocument.defaultView ?? window).devicePixelRatio || 1;
  const actualSize = scale === "actual" && frame.width ? { width: frame.width / dpr, height: frame.height / dpr } : undefined;
  const button = (e: React.MouseEvent) => (e.button === 2 ? "right" : e.button === 1 ? "middle" : "left");
  return (
    <div
      className={`viewer ${scale} ${tiled ? "tiled" : ""} ${focused ? "focused" : ""} ${noInput ? "input-disabled" : ""}`}
      ref={viewer}
      tabIndex={visible ? 0 : -1}
      hidden={!visible}
      aria-label={`Remote desktop input area for ${label}`}
      data-peer={session.peerId}
      data-phase={session.phase}
      onContextMenu={e => e.preventDefault()}
      onBlur={() => send({ type: "release" })}
      onKeyDown={e => {
        e.preventDefault();
        if (!e.repeat) send({ type: "key", code: e.code, down: true });
      }}
      onKeyUp={e => {
        e.preventDefault();
        send({ type: "key", code: e.code, down: false });
      }}
      onMouseMove={e => {
        if (performance.now() - lastMove.current < 8) return;
        const position = point(e);
        if (position) {
          lastMove.current = performance.now();
          send({ type: "move", ...position });
        }
      }}
      onMouseDown={e => {
        e.preventDefault();
        e.currentTarget.focus();
        onFocus();
        const position = point(e);
        if (position) send({ type: "button", ...position, button: button(e), down: true });
      }}
      onMouseUp={e => send({ type: "button", button: button(e), down: false })}
      onMouseLeave={() => send({ type: "release" })}
      onWheel={e =>
        send({
          type: "wheel",
          x: Math.round(Math.max(-1200, Math.min(1200, e.deltaX))),
          y: Math.round(Math.max(-1200, Math.min(1200, -e.deltaY)))
        })
      }
    >
      <video
        ref={video}
        autoPlay
        muted
        playsInline
        style={actualSize}
        onResize={e =>
          setFrame({
            width: e.currentTarget.videoWidth,
            height: e.currentTarget.videoHeight
          })
        }
      />
      {tiled && (
        <div className="tile-bar" onMouseDown={e => e.stopPropagation()}>
          <span className="tile-id">
            <span className={`live-dot ${session.phase === "connected" ? "on" : ""}`} />
            {label}
          </span>
          <span className="tile-actions">
            <button
              className="tile-btn"
              title="Maximize this session"
              aria-label={`Maximize ${label}`}
              onClick={e => {
                e.stopPropagation();
                onMaximize();
              }}
            >
              <FullIcon />
            </button>
            <button
              className="tile-btn"
              title="Disconnect"
              aria-label={`Disconnect ${label}`}
              onClick={e => {
                e.stopPropagation();
                onClose();
              }}
            >
              <TabCloseIcon />
            </button>
          </span>
        </div>
      )}
      {session.phase !== "connected" && (
        <div className="viewer-loading">
          <span className="spinner" />
          Establishing a private connection…
        </div>
      )}
    </div>
  );
}

function App() {
  const [state, setState] = useState<DesktopState>({
    status: "connecting",
    outgoing: [],
    sessions: [],
    nativeAvailable: false,
    unattendedEnabled: false,
    appVersion: ""
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [server, setServer] = useState(__DEFAULT_SERVER__ || "https://");
  const [token, setToken] = useState("");
  const [target, setTarget] = useState("");
  const [clipboardEnabled, setClipboardEnabled] = useState(true);
  const [relay, setRelay] = useState(false);
  // Controller side: an unattended password to try on the target, and whether to save it here.
  const [unattendedPassword, setUnattendedPassword] = useState("");
  const [rememberPassword, setRememberPassword] = useState(false);
  // Target side: the "set unattended password" form.
  const [uaPassword, setUaPassword] = useState("");
  const [uaConfirm, setUaConfirm] = useState("");
  const [uaOpen, setUaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [permissions, setPermissions] = useState<Capability[]>(["screen"]);
  const [now, setNow] = useState(Date.now());
  const [maximized, setMaximized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  // The selected tab: HOME, or the ID of a computer being controlled (or waiting to be).
  const [tab, setTab] = useState(HOME);
  const [scales, setScales] = useState<Record<string, "fit" | "actual">>({});
  const [inputDisabled, setInputDisabled] = useState<Record<string, boolean>>({});
  // Focus view (one session at a time) or grid/split view (all at once). Remembered per viewer.
  const [layout, setLayout] = useState<"focus" | "grid">(() => {
    try {
      return localStorage.getItem("asdesk.layout") === "grid" ? "grid" : "focus";
    } catch {
      return "focus";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem("asdesk.layout", layout);
    } catch {
      /* private mode */
    }
  }, [layout]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [transfers, setTransfers] = useState<Record<string, TransferStatus>>({});
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  // Sessions popped out of the tab bar into their own windows, by session ID.
  const [popouts, setPopouts] = useState<Record<string, Popout>>({});
  const popoutsRef = useRef(popouts);
  popoutsRef.current = popouts;
  const sessionsRef = useRef<ActiveSession[]>([]);
  // Latest unattended auto-accept handler, called from the event listener (which is bound once).
  const autoAcceptRef = useRef<(requestId: string, perms: Capability[]) => void>(() => {});
  // A tab being dragged (see startTear); `tore` swallows the click that ends a tear.
  const tear = useRef<{ id: string; out: boolean } | undefined>(undefined);
  const tore = useRef(false);
  const [tearing, setTearing] = useState<string>();
  const workspace = useRef<HTMLDivElement>(null);
  // Tabs that have existed; only those fall back when they disappear (a new request's tab is
  // selected before the agent's state lists it).
  const seenTabs = useRef(new Set<string>());
  // Per session: its peer connection, signals that arrived before it existed, and a signal queue.
  const medias = useRef(new Map<string, RemoteMedia>());
  const pending = useRef(new Map<string, ClientMessage[]>());
  const queues = useRef(new Map<string, Promise<void>>());
  // The screen captured for an accepted request, held until the session's media takes it over.
  const capture = useRef<MediaStream | undefined>(undefined);
  const releaseCapture = () => {
    capture.current?.getTracks().forEach(track => track.stop());
    capture.current = undefined;
  };
  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    // Agent errors arrive as plain strings; browser errors as Error objects.
    try {
      await work();
    } catch (e) {
      const message = typeof e === "string" ? e : e instanceof Error ? e.message : "Something went wrong";
      setError(message);
      void window.remote.report(message).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };
  const without = <T,>(record: Record<string, T>, key: string) => {
    const next = { ...record };
    delete next[key];
    return next;
  };
  // Names the user gave recent computers: shown in place of the ID wherever a computer is named.
  const [renaming, setRenaming] = useState<string>();
  const nameOf = (id: string) => state.recent?.find(r => r.id === id)?.name ?? formatId(id);
  const saveName = (id: string, current: string | undefined, value?: string | null) => {
    setRenaming(undefined);
    if (value == null) return; // cancelled
    const name = value.trim().replace(/\s+/g, " ");
    if (name !== (current ?? "")) void act(() => window.remote.renameRecent(id, name || null));
  };
  const stopMedia = (sessionId: string) => {
    medias.current.get(sessionId)?.stop();
    medias.current.delete(sessionId);
    pending.current.delete(sessionId);
    queues.current.delete(sessionId);
    setStats(s => without(s, sessionId));
    setStreams(s => without(s, sessionId));
    setTransfers(s => without(s, sessionId));
  };
  const deliver = (sessionId: string, message: ClientMessage) => {
    const media = medias.current.get(sessionId);
    if (!media) {
      pending.current.set(sessionId, [...(pending.current.get(sessionId) ?? []), message]);
      return;
    }
    const next = (queues.current.get(sessionId) ?? Promise.resolve())
      .then(() => media.signal(message))
      .catch(() => {
        setError("Peer negotiation failed");
        void window.remote.disconnect(sessionId);
      });
    queues.current.set(sessionId, next);
  };

  useEffect(() => {
    let alive = true;
    void window.remote.state().then(s => {
      if (alive) {
        setState(s);
        setLoaded(true);
      }
    });
    void window.remote.window("state").then(value => {
      if (alive) setMaximized(value);
    });
    const unsubscribe = window.remote.onEvent(event => {
      if (event.type === "state") {
        setState(event.state);
        setLoaded(true);
      }
      if (event.type === "window") {
        if (event.label === "main") setMaximized(event.maximized);
        else
          setPopouts(p => {
            const id = event.label.slice(POPOUT.length);
            return p[id] ? { ...p, [id]: { ...p[id]!, maximized: event.maximized } } : p;
          });
      }
      if (event.type === "popout") dockRef.current(event.sessionId);
      if (event.type === "autoaccept") autoAcceptRef.current(event.requestId, event.permissions);
      if (event.type === "stop") {
        if (event.sessionId) stopMedia(event.sessionId);
        else {
          [...medias.current.keys()].forEach(stopMedia);
          releaseCapture();
        }
      }
      if (event.type === "signal" && "sessionId" in event.message) deliver(event.message.sessionId, event.message);
    });
    const onFullscreen = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFullscreen);
    const clock = setInterval(() => {
      setNow(Date.now());
      // A popout window that went away some other way gives its session back to the tab bar.
      for (const [id, popout] of Object.entries(popoutsRef.current)) if (popout.win.closed) dockRef.current(id, false);
    }, 1000);
    return () => {
      alive = false;
      unsubscribe();
      clearInterval(clock);
      document.removeEventListener("fullscreenchange", onFullscreen);
      [...medias.current.keys()].forEach(stopMedia);
      releaseCapture();
    };
  }, []);
  // One peer connection per session; a session that ended releases its own.
  useEffect(() => {
    for (const session of state.sessions) {
      const id = session.sessionId;
      if (medias.current.has(id)) continue;
      const media = new RemoteMedia(
        session,
        stream => setStreams(s => ({ ...s, [id]: stream })),
        value => setStats(s => ({ ...s, [id]: value })),
        message => {
          console.error("Media startup:", message);
          setError(message);
          void window.remote.disconnect(id);
        },
        session.role === "target" ? capture.current : undefined,
        status => {
          setTransfers(t => ({ ...t, [id]: status }));
          if (status.state !== "active") setTimeout(() => setTransfers(t => (t[id]?.state === "active" ? t : without(t, id))), 4000);
        }
      );
      if (session.role === "target") capture.current = undefined;
      medias.current.set(id, media);
      for (const message of pending.current.get(id)?.splice(0) ?? []) deliver(id, message);
    }
    for (const id of [...medias.current.keys()]) if (!state.sessions.some(s => s.sessionId === id)) stopMedia(id);
  }, [state.sessions.map(s => s.sessionId).join()]);
  useEffect(() => {
    const incoming = state.incoming;
    // A request that was answered elsewhere, cancelled or expired releases a screen captured for it.
    if (!incoming) {
      if (!state.sessions.some(s => s.role === "target")) releaseCapture();
      return;
    }
    // Default every requested capability on (like AnyDesk: accepting grants what was asked). The user
    // can still untick any before accepting. Mouse/keyboard/clipboard need the native agent.
    setPermissions(incoming.permissions.filter(p => p === "screen" || state.nativeAvailable));
  }, [state.incoming?.requestId, state.sessions.length]);

  sessionsRef.current = state.sessions;
  const controlled = state.sessions.filter(s => s.role === "controller");
  // Sessions in the tab bar; popped-out ones are drawn into their own windows instead.
  const docked = controlled.filter(s => !popouts[s.sessionId]);
  const waitingFor = state.outgoing.filter(o => !controlled.some(s => s.peerId === o.targetId));
  const tabs = [...docked.map(s => s.peerId), ...waitingFor.map(o => o.targetId)];
  // Keep the selected tab valid: a finished session or answered request falls back to another tab.
  useEffect(() => {
    tabs.forEach(t => seenTabs.current.add(t));
    if (tab !== HOME && !tabs.includes(tab) && seenTabs.current.has(tab)) {
      seenTabs.current.delete(tab);
      setTab(tabs.at(-1) ?? HOME);
    }
  }, [tabs.join(), tab]);
  // Grid view streams every session at once; focus view streams only the selected one. The rest are
  // paused at the source, so hidden sessions cost almost nothing.
  const gridActive = layout === "grid" && tab !== HOME && docked.length >= 1;
  useEffect(() => {
    for (const session of controlled) medias.current.get(session.sessionId)?.setVisible(!!popouts[session.sessionId] || gridActive || session.peerId === tab);
  }, [tab, gridActive, controlled.map(s => s.sessionId).join(), Object.keys(streams).join(), Object.keys(popouts).join()]);

  // ── Popped-out sessions ─────────────────────────────────────────────────────────────────────────
  // A session dragged out of the tab bar (or sent there with its button) gets its own window, like a
  // browser tab. The window is about:blank opened by this page (same origin), and this page renders
  // the session into it through a React portal: the peer connection, input and video stream stay
  // exactly where they are, so popping out and back is instant and the other computer sees nothing.
  const popOut = (session: ActiveSession, at?: { x: number; y: number }) => {
    const id = session.sessionId,
      existing = popoutsRef.current[id];
    if (existing) {
      void window.remote.window("focus", existing.label);
      return;
    }
    const [width, height] = [1024, 680];
    // Where the window goes travels in the address, not as window.open's left/top: WebView2 reports
    // those unsigned, and a screen left of or above the main one has negative coordinates.
    const left = Math.round(at ? at.x - 140 : window.screenX + 48),
      top = Math.round(at ? at.y - 18 : window.screenY + 48);
    const win = window.open(`about:blank#asdesk-popout=${id}&at=${left},${top}`, "_blank", `popup,width=${width},height=${height}`);
    if (!win) {
      setError("This session could not be opened in its own window.");
      return;
    }
    const doc = win.document;
    doc.title = `${nameOf(session.peerId)} · ASDesk`;
    doc.documentElement.lang = "en";
    for (const sheet of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
      const link = doc.createElement("link");
      link.rel = "stylesheet";
      link.href = sheet.href;
      doc.head.append(link);
    }
    const root = doc.createElement("div");
    root.id = "root";
    doc.body.append(root);
    setPopouts(p => ({
      ...p,
      [id]: { win, root, label: `${POPOUT}${id}`, maximized: false }
    }));
    if (tab === session.peerId) setTab(tabs.filter(t => t !== session.peerId).at(-1) ?? HOME);
  };
  /** Puts a popped-out session back into the tab bar (and shows it, unless it ended) and closes its window. */
  const dock = (sessionId: string, show = true) => {
    const popout = popoutsRef.current[sessionId];
    if (!popout) return;
    setPopouts(p => without(p, sessionId));
    if (!popout.win.closed) void window.remote.window("close", popout.label).catch(() => undefined);
    const session = sessionsRef.current.find(s => s.sessionId === sessionId);
    if (show && session) {
      setTab(session.peerId);
      void window.remote.window("focus").catch(() => undefined);
    }
  };
  const dockRef = useRef(dock);
  dockRef.current = dock;
  // A session that ended closes its window.
  useEffect(() => {
    for (const id of Object.keys(popoutsRef.current)) if (!state.sessions.some(s => s.sessionId === id)) dock(id, false);
  }, [state.sessions.map(s => s.sessionId).join()]);
  // Dragging a tab out of the tab bar (down into the page, or off the window) pops it out where it is
  // dropped. The tab keeps the pointer for the whole drag, so the drop is seen even outside the window.
  const startTear = (e: React.PointerEvent<HTMLElement>, session: ActiveSession) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(".tab-close, .tab-popout")) return;
    tear.current = { id: session.sessionId, out: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveTear = (e: React.PointerEvent<HTMLElement>) => {
    const t = tear.current;
    const bar = e.currentTarget.closest(".toolbar")?.getBoundingClientRect();
    if (!t || !bar) return;
    const out = e.clientY > bar.bottom + 24 || e.clientY < bar.top - 24 || e.clientX < 0 || e.clientX > window.innerWidth;
    if (out !== t.out) {
      t.out = out;
      setTearing(out ? t.id : undefined);
    }
  };
  const endTear = (e: React.PointerEvent<HTMLElement>, session: ActiveSession) => {
    const t = tear.current;
    tear.current = undefined;
    setTearing(undefined);
    if (!t) return;
    // The pointer is captured, so the click lands on the tab rather than its button: select here.
    if (!t.out) {
      setTab(session.peerId);
      return;
    }
    tore.current = true;
    setTimeout(() => {
      tore.current = false;
    }, 0);
    popOut(session, { x: e.screenX, y: e.screenY });
  };
  const cancelTear = () => {
    tear.current = undefined;
    setTearing(undefined);
  };
  const popoutViews = controlled
    .filter(s => popouts[s.sessionId])
    .map(s => {
      const popout = popouts[s.sessionId]!,
        sessionStats = stats[s.sessionId],
        transfer = transfers[s.sessionId];
      const sessionScale = scales[s.sessionId] ?? "fit";
      return createPortal(
        <div className="session workspace popout">
          <div className="toolbar" onMouseDown={e => drag(e, popout.label)}>
            <span className="popout-name">
              <span className="logo">
                <Logo />
              </span>
              <span className={`live-dot ${s.phase === "connected" ? "on" : ""}`} />
              {nameOf(s.peerId)}
            </span>
            <div className="toolbar-actions">
              {transfer && <TransferChip status={transfer} />}
              <span className="session-stats compact" title={statsTitle(s, sessionStats)}>
                {sessionStats ? `${sessionStats.rtt}ms` : ""}
              </span>
              <div className="toolbar-separator" />
              <button
                className={`tool ${inputDisabled[s.sessionId] ? "active warn" : ""}`}
                disabled={s.phase !== "connected"}
                aria-label={inputDisabled[s.sessionId] ? "Enable remote input" : "Disable remote input"}
                title={inputDisabled[s.sessionId] ? "Remote input disabled — click to enable" : "Disable remote input"}
                aria-pressed={!!inputDisabled[s.sessionId]}
                onClick={() => setInputDisabled(d => ({ ...d, [s.sessionId]: !d[s.sessionId] }))}
              >
                {inputDisabled[s.sessionId] ? <InputOffIcon /> : <InputOnIcon />}
              </button>
              <button
                className="tool"
                disabled={s.phase !== "connected"}
                aria-label={sessionScale === "fit" ? "Original size" : "Fit to window"}
                title={sessionScale === "fit" ? "Original size (1:1)" : "Fit to window"}
                onClick={() =>
                  setScales(v => ({
                    ...v,
                    [s.sessionId]: sessionScale === "fit" ? "actual" : "fit"
                  }))
                }
              >
                {sessionScale === "fit" ? <ActualIcon /> : <FitIcon />}
              </button>
              <button className="tool" aria-label="Back to the tab bar" title="Back to the tab bar" onClick={() => dock(s.sessionId)}>
                <DockIcon />
              </button>
              <button className="tool tool-disconnect" aria-label="Disconnect" title="Disconnect" onClick={() => void act(() => window.remote.disconnect(s.sessionId))}>
                <DisconnectIcon />
              </button>
            </div>
            <WindowControls maximized={popout.maximized} target={popout.label} onClose={() => dock(s.sessionId)} closeTitle="Close this window (the session goes back to the tab bar)" />
          </div>
          <div className="workspace-body">
            <SessionView session={s} media={medias.current.get(s.sessionId)} stream={streams[s.sessionId]} visible focused tiled={false} label={nameOf(s.peerId)} scale={sessionScale} inputDisabled={!!inputDisabled[s.sessionId]} onFocus={() => {}} onMaximize={() => {}} onClose={() => void act(() => window.remote.disconnect(s.sessionId))} />
          </div>
        </div>,
        popout.root,
        s.sessionId
      );
    });

  const toggleFullscreen = () => {
    const done = document.fullscreenElement ? document.exitFullscreen() : workspace.current?.requestFullscreen();
    void done?.catch(() => setError("Full screen is unavailable"));
  };
  const connectTo = (id: string) => {
    setTarget(formatId(id));
    setTab(id);
    const password = unattendedPassword.trim() || undefined;
    const remember = rememberPassword && !!password;
    void act(async () => {
      try {
        await window.remote.connect(id, clipboardEnabled, relay, password, remember);
        // Don't leave a password sitting in the box for the next, different computer.
        setUnattendedPassword("");
        setRememberPassword(false);
      } catch (error) {
        setTab(t => (t === id && !seenTabs.current.has(id) ? HOME : t));
        throw error;
      }
    });
  };
  // Accepting captures the primary screen straight away (no picker; capture needs this click's user
  // gesture), then tells the agent which display it is.
  const acceptIncoming = (requestId: string, perms: Capability[] = permissions) =>
    act(async () => {
      const wantsControl = perms.includes("mouse") || perms.includes("keyboard");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: {
            displaySurface: "monitor",
            width: { max: 1920 },
            height: { max: 1080 },
            frameRate: { ideal: 24, max: 30 }
          },
          selfBrowserSurface: "exclude",
          surfaceSwitching: "exclude",
          monitorTypeSurfaces: "include"
        } as DisplayMediaStreamOptions);
      } catch (e) {
        void window.remote.report(`screen capture: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`).catch(() => undefined);
        throw new Error("This screen could not be shared. Choose Accept & share again, or reject the request.");
      }
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings();
      if (!track || !settings) {
        stream.getTracks().forEach(t => t.stop());
        throw new Error("Screen capture is unavailable");
      }
      // WebView2 reports the captured surface in the settings; if one ever does not (older runtimes, such
      // as the Windows 7 edition's), the track label names it instead (screen:<id>:0 for a whole screen).
      const surface = settings.displaySurface ?? (/^screen/i.test(track.label) ? "monitor" : undefined);
      if (wantsControl && surface !== "monitor") {
        stream.getTracks().forEach(t => t.stop());
        throw new Error("The whole screen could not be shared, so control is not possible.");
      }
      releaseCapture();
      capture.current = stream;
      try {
        await window.remote.accept(requestId, perms, settings.deviceId ?? track.label, settings.width ?? 0, settings.height ?? 0, await thumbnail(stream));
      } catch (error) {
        releaseCapture();
        throw error;
      }
    });
  // Unattended: the agent verified the controller's password, so capture and accept with no click.
  // Only what the native agent can honour is granted (screen always; control needs the agent).
  autoAcceptRef.current = (requestId, perms) => {
    if (state.incoming?.requestId !== requestId || busy) return;
    void acceptIncoming(
      requestId,
      perms.filter(p => p === "screen" || state.nativeAvailable)
    );
  };

  const activeError = error || state.error;
  // The message can be the page's own or the agent's (a declined request, a lost connection): clear both.
  const dismissError = () => {
    setError("");
    if (state.error) {
      setState(s => ({ ...s, error: undefined }));
      void window.remote.dismissError().catch(() => undefined);
    }
  };
  const errorBar = activeError && (
    <div className="error" role="alert">
      <span>{activeError}</span>
      <button aria-label="Dismiss error" title="Dismiss" onClick={dismissError}>
        <CloseIcon />
      </button>
    </div>
  );
  const incomingModal = state.incoming && (
    <div className="modal-backdrop">
      <section className="modal incoming" role="dialog" aria-modal="true" aria-labelledby="incoming-title">
        <div className="modal-head">
          <h2 id="incoming-title">Connection request</h2>
          <span className="countdown">{Math.max(0, Math.ceil((state.incoming.expiresAt - now) / 1000))}s</span>
        </div>
        <p className="muted">
          <strong>{formatId(state.incoming.sourceId)}</strong> wants to access this computer. Only accept if you know who is connecting.
        </p>
        <div className="permissions">
          {state.incoming.permissions.map(p => (
            <label className="check" key={p}>
              <input type="checkbox" checked={permissions.includes(p)} disabled={p === "screen" || (!state.nativeAvailable && (p === "mouse" || p === "keyboard"))} onChange={e => setPermissions(e.target.checked ? [...permissions, p] : permissions.filter(v => v !== p))} />
              {p === "screen" ? "View this screen" : p === "mouse" ? "Control mouse" : p === "keyboard" ? "Use keyboard" : "Share clipboard and files"}
            </label>
          ))}
        </div>
        {activeError && (
          <p className="modal-error" role="alert">
            {activeError}
          </p>
        )}
        <div className="modal-actions">
          <button className="secondary" disabled={busy} onClick={() => void act(() => window.remote.reject(state.incoming!.requestId))}>
            Reject
          </button>
          <button className="primary" disabled={busy || now >= state.incoming.expiresAt} onClick={() => void acceptIncoming(state.incoming!.requestId)}>
            {busy ? "Preparing…" : "Accept & share"}
          </button>
        </div>
      </section>
    </div>
  );

  const sharing = state.sessions.find(s => s.role === "target");
  if (sharing) {
    // The shared computer's window is hidden during a session (a notification and the tray icon say
    // that sharing is on). Opened from the tray, it shows this; it is left out of the shared image.
    const granted = sharing.permissions.filter(p => p !== "screen").map(p => permissionLabels[p]);
    const live = sharing.phase === "connected";
    return (
      <div className="shell">
        <div className="titlebar" onMouseDown={drag}>
          <span className="app-name">
            <span className="logo">
              <Logo />
            </span>
            ASDesk
          </span>
          <WindowControls maximized={maximized} />
        </div>
        <main className="sharing" role="status">
          <section className="panel sharing-card">
            <div className="sharing-title">
              <span className={`live-dot ${live ? "on" : ""}`} />
              <strong>{live ? "Your screen is being shared" : "Starting screen sharing…"}</strong>
            </div>
            <p className="muted">
              with <b className="peer-id">{formatId(sharing.peerId)}</b> · {granted.length ? `can use ${granted.join(", ")}` : "view only"}
              {sharing.unattended && " · unattended"}
            </p>
            {activeError && (
              <p className="modal-error" role="alert">
                {activeError}
              </p>
            )}
            <div className="sharing-foot">
              <span className="muted">
                <kbd>Ctrl+Alt+Shift+F12</kbd> stops instantly
              </span>
              <button className="danger" onClick={() => void act(() => window.remote.disconnect(sharing.sessionId))}>
                Disconnect
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  const validTarget = /^[1-9]\d{8}$/.test(target.replaceAll(" ", ""));
  // Every session counts toward the limit, popped out or not.
  const sessionCount = controlled.length + waitingFor.length;
  const full = sessionCount >= MAX_SESSIONS;
  const home = !loaded ? (
    <main className="home" />
  ) : state.status === "setup" ? (
    <main className="setup">
      <h1>Set up this computer</h1>
      <p className="muted">Connect to your remote-access server to get a connection ID.</p>
      <form
        onSubmit={e => {
          e.preventDefault();
          void act(async () => {
            await window.remote.setup({
              server,
              ...(token.trim() ? { enrollmentToken: token } : {})
            });
            setToken("");
          });
        }}
      >
        <label htmlFor="server">Company server</label>
        <input id="server" type="url" value={server} onChange={e => setServer(e.target.value)} required placeholder="https://remote.yourcompany.com" autoComplete="off" />
        <label htmlFor="token">Enrollment token (optional)</label>
        <input id="token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Only if your server requires one" />
        <button className="primary wide" disabled={busy}>
          {busy ? "Registering…" : "Set up this computer"}
        </button>
      </form>
    </main>
  ) : (
    <main className="home">
      <section className="panel">
        <span className="panel-label">Your ID</span>
        <div className="id-row">
          <span className="device-id" data-testid="device-id">
            {formatId(state.deviceId)}
          </span>
          <button
            className="icon-button"
            disabled={!state.deviceId}
            aria-label="Copy ID"
            title="Copy ID"
            onClick={() => {
              void window.remote
                .copyId()
                .then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                })
                .catch(() => setError("Select the ID and copy it with Ctrl+C"));
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        </div>
        <p className="muted">Share this ID to get help. You approve every request.</p>
      </section>
      <section className="panel">
        <label className="panel-label" htmlFor="remote-id">
          Remote computer ID
        </label>
        <form
          className="connect"
          onSubmit={e => {
            e.preventDefault();
            connectTo(target.replaceAll(" ", ""));
          }}
        >
          <input id="remote-id" value={target} onChange={e => setTarget(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))} placeholder="000 000 000" inputMode="numeric" autoComplete="off" disabled={state.status !== "ready"} />
          <button className="primary" disabled={busy || state.status !== "ready" || !validTarget || full} title={full ? `You can control up to ${MAX_SESSIONS} computers at once` : undefined}>
            Connect
          </button>
        </form>
        <details className="options">
          <summary>Options</summary>
          <label className="check">
            <input type="checkbox" checked={clipboardEnabled} onChange={e => setClipboardEnabled(e.target.checked)} />
            Request clipboard and file transfer
          </label>
          <label className="check">
            <input type="checkbox" checked={relay} onChange={e => setRelay(e.target.checked)} />
            Use relay only
          </label>
          <label className="panel-label ua-field-label" htmlFor="ua-connect">
            Unattended password
          </label>
          <input id="ua-connect" type="password" value={unattendedPassword} onChange={e => setUnattendedPassword(e.target.value)} placeholder="Only if that computer has one set" autoComplete="off" />
          <label className="check">
            <input type="checkbox" checked={rememberPassword} disabled={!unattendedPassword.trim()} onChange={e => setRememberPassword(e.target.checked)} />
            Remember this password on this computer
          </label>
        </details>
      </section>
      {!!state.recent?.length && (
        <section className="recent" aria-labelledby="recent-title">
          <span className="panel-label" id="recent-title">
            Recent
          </span>
          <ul>
            {state.recent.map(r => {
              const openSession = controlled.find(s => s.peerId === r.id);
              const open = !!openSession || tabs.includes(r.id);
              const label = r.name ? `${r.name} (${formatId(r.id)})` : formatId(r.id);
              const when = open ? (
                <>
                  <span className="live-dot on" />
                  open
                </>
              ) : (
                <>
                  <HistoryIcon />
                  {ago(r.at, now)}
                </>
              );
              if (renaming === r.id)
                return (
                  <li key={r.id}>
                    <RenameField id={r.id} name={r.name} onDone={value => saveName(r.id, r.name, value)} />
                  </li>
                );
              return (
                <li key={r.id}>
                  <button className="recent-connect" disabled={busy || state.status !== "ready" || (!open && full)} aria-label={open ? `Show ${label}` : `Connect to ${label}`} title={open ? "Show this session" : `Connect to ${label}`} onClick={() => (openSession && popouts[openSession.sessionId] ? popOut(openSession) : open ? setTab(r.id) : connectTo(r.id))}>
                    {r.name ? (
                      <>
                        <span className="recent-name">{r.name}</span>
                        <span className="recent-time">
                          <span className="recent-id-small">{formatId(r.id)}</span>·{when}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="recent-id">{formatId(r.id)}</span>
                        <span className="recent-time">{when}</span>
                      </>
                    )}
                  </button>
                  <div className="recent-actions">
                    <button aria-label={`Remove ${label} from recent`} title="Remove" onClick={() => void act(() => window.remote.forget(r.id))}>
                      <CloseIcon />
                    </button>
                    <button aria-label={r.name ? `Rename ${label}` : `Name ${formatId(r.id)}`} title={r.name ? "Rename" : "Add a name"} onClick={() => setRenaming(r.id)}>
                      <RenameIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
  const statusbar = (
    <footer className="statusbar">
      <span className={`status status-${state.status}`}>
        <i />
        {labels[state.status]}
      </span>
      <span className="statusbar-meta">
        {sessionCount ? `${sessionCount} of ${MAX_SESSIONS} sessions · ` : ""}v{state.appVersion}
      </span>
    </footer>
  );

  if (!tabs.length) {
    const isReady = state.status === "ready";
    return (
      <div className="shell ad-shell">
        <div className="titlebar" onMouseDown={drag}>
          <span className="app-name">
            <span className="logo">
              <Logo />
            </span>
            ASDesk
          </span>
          <span className="ad-nav-label">New Session</span>
          <div className="ad-titlebar-right">
            {loaded && state.status !== "setup" && (
              <button
                className={`ad-menu-toggle ${menuOpen ? "active" : ""}`}
                aria-label="Menu"
                title="Settings & options"
                onClick={() => setMenuOpen(m => !m)}
              >
                <MenuIcon />
              </button>
            )}
            <WindowControls maximized={maximized} />
          </div>
        </div>

        {loaded && state.status !== "setup" && (
          <div className="address-bar">
            <span className={`addr-dot ${state.status}`} title={labels[state.status]} />
            <form
              className="addr-form"
              onSubmit={e => {
                e.preventDefault();
                connectTo(target.replaceAll(" ", ""));
              }}
            >
              <input
                value={target}
                onChange={e => setTarget(e.target.value.replace(/[^\d ]/g, "").slice(0, 11))}
                placeholder="Enter Remote Address"
                inputMode="numeric"
                autoComplete="off"
                disabled={!isReady}
              />
              <button
                type="submit"
                className="addr-connect"
                disabled={busy || !isReady || !validTarget || full}
                aria-label="Connect"
                title={full ? `Up to ${MAX_SESSIONS} sessions` : "Connect"}
              >
                <ConnectIcon />
              </button>
            </form>
          </div>
        )}

        {errorBar}

        {!loaded ? (
          <main className="ad-main" />
        ) : state.status === "setup" ? (
          <main className="setup">
            <h1>Set up this computer</h1>
            <p className="muted">Connect to your remote-access server to get a connection ID.</p>
            <form
              onSubmit={e => {
                e.preventDefault();
                void act(async () => {
                  await window.remote.setup({
                    server,
                    ...(token.trim() ? { enrollmentToken: token } : {})
                  });
                  setToken("");
                });
              }}
            >
              <label htmlFor="server">Company server</label>
              <input id="server" type="url" value={server} onChange={e => setServer(e.target.value)} required placeholder="https://remote.yourcompany.com" autoComplete="off" />
              <label htmlFor="token">Enrollment token (optional)</label>
              <input id="token" type="password" value={token} onChange={e => setToken(e.target.value)} autoComplete="off" placeholder="Only if your server requires one" />
              <button className="primary wide" disabled={busy}>
                {busy ? "Registering…" : "Set up this computer"}
              </button>
            </form>
          </main>
        ) : (
          <main className="ad-main">
            <div className="ad-center">
              <span className="ad-id-label">Your Address</span>
              <div className="ad-id-row">
                <span className="ad-device-id" data-testid="device-id">
                  {formatId(state.deviceId)}
                </span>
                <button
                  className="ad-id-action"
                  disabled={!state.deviceId}
                  aria-label="Copy ID"
                  title="Copy ID"
                  onClick={() => {
                    void window.remote
                      .copyId()
                      .then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      })
                      .catch(() => setError("Select the ID and copy it with Ctrl+C"));
                  }}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </button>
              </div>
            </div>

            {!!state.recent?.length && (
              <section className="ad-recent" aria-labelledby="ad-recent-title">
                <span className="panel-label" id="ad-recent-title">
                  Recent
                </span>
                <ul>
                  {state.recent.map(r => {
                    const openSession = controlled.find(s => s.peerId === r.id);
                    const open = !!openSession || tabs.includes(r.id);
                    const label = r.name ? `${r.name} (${formatId(r.id)})` : formatId(r.id);
                    const when = open ? (
                      <>
                        <span className="live-dot on" />
                        open
                      </>
                    ) : (
                      <>
                        <HistoryIcon />
                        {ago(r.at, now)}
                      </>
                    );
                    if (renaming === r.id)
                      return (
                        <li key={r.id}>
                          <RenameField id={r.id} name={r.name} onDone={value => saveName(r.id, r.name, value)} />
                        </li>
                      );
                    return (
                      <li key={r.id}>
                        <button className="recent-connect" disabled={busy || !isReady || (!open && full)} aria-label={open ? `Show ${label}` : `Connect to ${label}`} title={open ? "Show this session" : `Connect to ${label}`} onClick={() => (openSession && popouts[openSession.sessionId] ? popOut(openSession) : open ? setTab(r.id) : connectTo(r.id))}>
                          {r.name ? (
                            <>
                              <span className="recent-name">{r.name}</span>
                              <span className="recent-time">
                                <span className="recent-id-small">{formatId(r.id)}</span>·{when}
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="recent-id">{formatId(r.id)}</span>
                              <span className="recent-time">{when}</span>
                            </>
                          )}
                        </button>
                        <div className="recent-actions">
                          <button aria-label={`Remove ${label} from recent`} title="Remove" onClick={() => void act(() => window.remote.forget(r.id))}>
                            <CloseIcon />
                          </button>
                          <button aria-label={r.name ? `Rename ${label}` : `Name ${formatId(r.id)}`} title={r.name ? "Rename" : "Add a name"} onClick={() => setRenaming(r.id)}>
                            <RenameIcon />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </main>
        )}

        {menuOpen && (
          <>
            <div className="ad-menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="ad-menu">
              <div className="ad-menu-section">
                <span className="ad-menu-title">Connection Options</span>
                <label className="check">
                  <input type="checkbox" checked={clipboardEnabled} onChange={e => setClipboardEnabled(e.target.checked)} />
                  Request clipboard & file transfer
                </label>
                <label className="check">
                  <input type="checkbox" checked={relay} onChange={e => setRelay(e.target.checked)} />
                  Use relay only
                </label>
                <label className="ad-menu-field-label" htmlFor="ua-connect-menu">
                  Unattended password
                </label>
                <input id="ua-connect-menu" type="password" value={unattendedPassword} onChange={e => setUnattendedPassword(e.target.value)} placeholder="If target has one set" autoComplete="off" />
                <label className="check">
                  <input type="checkbox" checked={rememberPassword} disabled={!unattendedPassword.trim()} onChange={e => setRememberPassword(e.target.checked)} />
                  Remember password
                </label>
              </div>
              {(state.unattendedEnabled || isReady) && (
                <div className="ad-menu-section">
                  <span className="ad-menu-title">Unattended Access</span>
                  {state.unattendedEnabled ? (
                    <>
                      <p className="muted ad-menu-text">
                        <span className="live-dot on" /> On — password access accepted automatically.
                      </p>
                      <button className="secondary ad-menu-btn-action" disabled={busy} onClick={() => void act(() => window.remote.clearUnattended())}>
                        Turn off
                      </button>
                    </>
                  ) : uaOpen ? (
                    <form
                      className="ua-form"
                      onSubmit={e => {
                        e.preventDefault();
                        if (uaPassword !== uaConfirm) {
                          setError("The passwords do not match.");
                          return;
                        }
                        void act(async () => {
                          await window.remote.setUnattended(uaPassword);
                          setUaPassword("");
                          setUaConfirm("");
                          setUaOpen(false);
                        });
                      }}
                    >
                      <input type="password" value={uaPassword} onChange={e => setUaPassword(e.target.value)} placeholder="New password (min 8 chars)" autoComplete="new-password" autoFocus />
                      <input type="password" value={uaConfirm} onChange={e => setUaConfirm(e.target.value)} placeholder="Confirm password" autoComplete="new-password" />
                      <div className="ua-actions">
                        <button type="button" className="secondary" onClick={() => { setUaOpen(false); setUaPassword(""); setUaConfirm(""); }}>
                          Cancel
                        </button>
                        <button className="primary" disabled={busy || uaPassword.length < 8}>
                          Save
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p className="muted ad-menu-text">Set a password for unattended access.</p>
                      <button className="secondary ad-menu-btn-action" onClick={() => setUaOpen(true)}>
                        Set a password…
                      </button>
                    </>
                  )}
                </div>
              )}
              <div className="ad-menu-footer">
                <span className={`status status-${state.status}`}>
                  <i />
                  {labels[state.status]}
                </span>
                <span className="ad-menu-version">v{state.appVersion}</span>
              </div>
            </div>
          </>
        )}

        {incomingModal}
        {popoutViews}
      </div>
    );
  }

  // Workspace: a tab per computer being controlled (or waiting to be), plus Home to start another.
  const current = docked.find(s => s.peerId === tab);
  const waiting = tab !== HOME && !current ? waitingFor.find(o => o.targetId === tab) : undefined;
  const scale = current ? (scales[current.sessionId] ?? "fit") : "fit";
  const currentStats = current ? stats[current.sessionId] : undefined;
  return (
    <div className={`session workspace ${fullscreen ? "is-fullscreen" : ""}`} ref={workspace}>
      <div className="toolbar tabbar" onMouseDown={drag}>
        <div className="tabs" role="tablist" aria-label="Sessions">
          <button role="tab" aria-selected={tab === HOME} className={`tab home-tab ${tab === HOME ? "active" : ""}`} aria-label="Home" title="Home — connect to another computer" onClick={() => setTab(HOME)}>
            <HomeIcon />
          </button>
          {docked.map(s => (
            <div key={s.sessionId} className={`tab ${tab === s.peerId ? "active" : ""} ${tearing === s.sessionId ? "tearing" : ""}`} data-peer={s.peerId} data-phase={s.phase} title="Drag out of the tab bar to open in its own window" onPointerDown={e => startTear(e, s)} onPointerMove={moveTear} onPointerUp={e => endTear(e, s)} onPointerCancel={cancelTear} onLostPointerCapture={cancelTear}>
              <button
                role="tab"
                aria-selected={tab === s.peerId}
                className="tab-main"
                aria-label={`Session with ${nameOf(s.peerId)}`}
                title={formatId(s.peerId)}
                onClick={() => {
                  if (!tore.current) setTab(s.peerId);
                }}
              >
                <span className={`live-dot ${s.phase === "connected" ? "on" : ""}`} />
                <span className="tab-label">{nameOf(s.peerId)}</span>
              </button>
              <button className="tab-popout" aria-label={`Open ${nameOf(s.peerId)} in its own window`} title="Open in its own window" onClick={() => popOut(s)}>
                <PopoutIcon />
              </button>
              <button className="tab-close" aria-label={`Disconnect ${nameOf(s.peerId)}`} title="Disconnect" onClick={() => void act(() => window.remote.disconnect(s.sessionId))}>
                <TabCloseIcon />
              </button>
            </div>
          ))}
          {waitingFor.map(o => (
            <div key={o.targetId} className={`tab waiting ${tab === o.targetId ? "active" : ""}`}>
              <button role="tab" aria-selected={tab === o.targetId} className="tab-main" aria-label={`Request to ${nameOf(o.targetId)}`} title={formatId(o.targetId)} onClick={() => setTab(o.targetId)}>
                <span className="spinner tiny" />
                <span className="tab-label">{nameOf(o.targetId)}</span>
              </button>
              <button className="tab-close" aria-label={`Cancel request to ${nameOf(o.targetId)}`} title="Cancel request" onClick={() => void act(() => window.remote.cancel(o.targetId))}>
                <TabCloseIcon />
              </button>
            </div>
          ))}
          <button className="tab new-tab" aria-label="New connection" title="New connection" onClick={() => setTab(HOME)}>
            <PlusIcon />
          </button>
        </div>
        {(current || docked.length >= 2) && (
          <div className="toolbar-actions">
            {docked.length >= 2 && (
              <button
                className={`tool ${layout === "grid" ? "active" : ""}`}
                aria-pressed={layout === "grid"}
                aria-label={layout === "grid" ? "Focus one session" : "Split all sessions"}
                title={layout === "grid" ? "Focus view (one at a time)" : "Split view (all sessions)"}
                onClick={() => {
                  setLayout(l => (l === "grid" ? "focus" : "grid"));
                  if (tab === HOME) setTab(docked[0]!.peerId);
                }}
              >
                <GridIcon />
              </button>
            )}
            {current && (
              <>
                {transfers[current.sessionId] && <TransferChip status={transfers[current.sessionId]!} />}
                <span className="session-stats compact" title={statsTitle(current, currentStats)}>
                  {currentStats ? `${currentStats.rtt}ms` : ""}
                </span>
                <div className="toolbar-separator" />
                <button
                  className={`tool ${inputDisabled[current.sessionId] ? "active warn" : ""}`}
                  disabled={current.phase !== "connected"}
                  aria-label={inputDisabled[current.sessionId] ? "Enable remote input" : "Disable remote input"}
                  title={inputDisabled[current.sessionId] ? "Remote input disabled — click to enable" : "Disable remote input"}
                  aria-pressed={!!inputDisabled[current.sessionId]}
                  onClick={() => setInputDisabled(d => ({ ...d, [current.sessionId]: !d[current.sessionId] }))}
                >
                  {inputDisabled[current.sessionId] ? <InputOffIcon /> : <InputOnIcon />}
                </button>
                <button
                  className="tool"
                  disabled={current.phase !== "connected"}
                  aria-label={scale === "fit" ? "Original size" : "Fit to window"}
                  title={scale === "fit" ? "Original size (1:1)" : "Fit to window"}
                  onClick={() =>
                    setScales(s => ({
                      ...s,
                      [current.sessionId]: scale === "fit" ? "actual" : "fit"
                    }))
                  }
                >
                  {scale === "fit" ? <ActualIcon /> : <FitIcon />}
                </button>
                <button className="tool" aria-label="Open in its own window" title="Open in its own window" onClick={() => popOut(current)}>
                  <PopoutIcon />
                </button>
                <button className="tool" disabled={current.phase !== "connected"} aria-label={fullscreen ? "Exit full screen" : "Full screen"} title={fullscreen ? "Exit full screen" : "Full screen"} onClick={toggleFullscreen}>
                  {fullscreen ? <ExitFullIcon /> : <FullIcon />}
                </button>
                <button className="tool tool-disconnect" aria-label="Disconnect" title="Disconnect" onClick={() => void act(() => window.remote.disconnect(current.sessionId))}>
                  <DisconnectIcon />
                </button>
              </>
            )}
          </div>
        )}
        {!fullscreen && <WindowControls maximized={maximized} />}
      </div>
      {errorBar}
      <div className={`workspace-body ${gridActive ? "grid" : ""}`}>
        {tab === HOME && (
          <div className="workspace-home">
            {home}
            {statusbar}
          </div>
        )}
        {docked.map(s => (
          <SessionView
            key={s.sessionId}
            session={s}
            media={medias.current.get(s.sessionId)}
            stream={streams[s.sessionId]}
            visible={gridActive || tab === s.peerId}
            focused={tab === s.peerId}
            tiled={gridActive}
            label={nameOf(s.peerId)}
            scale={gridActive ? "fit" : (scales[s.sessionId] ?? "fit")}
            inputDisabled={!!inputDisabled[s.sessionId]}
            onFocus={() => setTab(s.peerId)}
            onMaximize={() => {
              setTab(s.peerId);
              setLayout("focus");
            }}
            onClose={() => void act(() => window.remote.disconnect(s.sessionId))}
          />
        ))}
        {waiting && (
          <div className="waiting-pane">
            <section className="panel waiting-card" role="status">
              <span className="spinner" />
              <h2>Waiting for approval</h2>
              <p className="muted">
                The person at <strong>{nameOf(waiting.targetId)}</strong> needs to accept.
              </p>
              <button className="secondary" disabled={busy} onClick={() => void act(() => window.remote.cancel(waiting.targetId))}>
                Cancel request
              </button>
            </section>
          </div>
        )}
      </div>
      {incomingModal}
      {popoutViews}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
