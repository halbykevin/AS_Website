import type { Capability, ClientMessage } from "../../../packages/protocol/src/index.ts";

// The UI's view of the trusted agent (src-tauri/src/agent.rs). The agent validates everything it receives.
export type InputEvent = { type: "move"; x: number; y: number } | { type: "button"; button: "left" | "right" | "middle"; down: boolean; x?: number; y?: number } | { type: "wheel"; x: number; y: number } | { type: "key"; code: string; down: boolean } | { type: "release" } | { type: "clipboard"; text: string };
export type ActiveSession = { sessionId: string; role: "controller" | "target"; peerId: string; permissions: Capability[]; expiresAt: number; iceServers: RTCIceServer[]; relayOnly: boolean; phase: "negotiating" | "connected"; unattended: boolean };
export type Incoming = { requestId: string; sourceId: string; permissions: Capability[]; expiresAt: number };
/** A computer this one has controlled; `name` is the user's own label for it, kept on this computer only. */
export type Recent = { id: string; at: number; name?: string };
/** A request this computer sent that the other side has not answered yet. `passwordPrompt`: that
 *  computer has unattended access and asked for its password, which connects without anyone accepting. */
export type Outgoing = { targetId: string; requestId?: string; passwordPrompt?: boolean };
// A technician's computer may control several computers at once (`sessions` with role controller);
// a computer being helped has at most one `incoming` request and one session with role target.
export type DesktopState = { deviceId?: string; recent?: Recent[]; server?: string; status: "setup" | "offline" | "connecting" | "ready"; error?: string; incoming?: Incoming; outgoing: Outgoing[]; sessions: ActiveSession[]; nativeAvailable: boolean; unattendedEnabled: boolean; appVersion: string };
/** A copied file as the page sees it: never a path, only what the receiver needs. */
export type FileInfo = { name: string; size: number };
/** The controller's copied files; `fingerprint` changes whenever the selection does. */
export type FilesSnapshot = { fingerprint: string; files: FileInfo[] };
/** Progress of a clipboard file transfer, for the UI. */
export type TransferStatus = { direction: "send" | "receive"; label: string; progress: number; state: "active" | "done" | "failed" };
export type DesktopEvent =
  | { type: "state"; state: DesktopState }
  | { type: "signal"; message: ClientMessage }
  | { type: "stop"; sessionId?: string; reason: string }
  | { type: "window"; label: string; maximized: boolean }
  /** A popped-out session's window was closed from outside the page; the session goes back to the tab bar. */
  | { type: "popout"; sessionId: string }
  /** Unattended access: the controller proved the password, so capture and accept this request with no click. */
  | { type: "autoaccept"; requestId: string; permissions: Capability[] };
export interface DesktopAPI {
  state(): Promise<DesktopState>;
  copyId(): Promise<void>;
  /** Frameless window controls; resolves to whether the window is maximized. `target` is a popped-out
   *  session's window ("session-<id>"), which this page draws and therefore also controls. */
  window(action: "state" | "minimize" | "maximize" | "close" | "drag" | "focus", target?: string): Promise<boolean>;
  /** Move the frameless window with the pointer (title bar, toolbar, sharing panel). */
  startDrag(): Promise<void>;
  setup(options: { server: string; enrollmentToken?: string }): Promise<void>;
  /** A password saved for the target is tried automatically (unattended access). */
  connect(targetId: string, clipboard: boolean, relayOnly: boolean): Promise<void>;
  /** The unattended password for a waiting request whose computer asked for one (`passwordPrompt`);
   *  `remember` saves it on this computer once it has been accepted. */
  provePassword(targetId: string, password: string, remember: boolean): Promise<void>;
  /** Turn unattended access on for THIS computer by setting a password (replaces any existing one). */
  setUnattended(password: string): Promise<void>;
  /** Turn unattended access off for this computer. */
  clearUnattended(): Promise<void>;
  /** Remove a computer from the recent connections list. */
  forget(targetId: string): Promise<void>;
  /** Name a recent computer (at most 40 characters); an empty name or null removes it. */
  renameRecent(targetId: string, name: string | null): Promise<void>;
  /** Clear the agent's current error message (the user dismissed it). */
  dismissError(): Promise<void>;
  /** Accept with the screen the user picked: its track device id and frame size locate the display for input. */
  accept(requestId: string, permissions: Capability[], sourceId: string, width: number, height: number, thumbnail?: number[]): Promise<void>;
  /** Write an error the user saw to the local diagnostics log. */
  report(message: string): Promise<void>;
  /** The developer's website (rAIone) in the default browser; the agent holds the address. */
  openWebsite(): Promise<void>;
  reject(requestId: string): Promise<void>;
  /** Withdraw a request that is still waiting. */
  cancel(targetId: string): Promise<void>;
  /** End one session, or every session when none is named. */
  disconnect(sessionId?: string): Promise<void>;
  signal(message: ClientMessage): Promise<void>;
  /** The peer's events, in order. Keep one call in flight per session (see RemoteMedia.forward). */
  input(sessionId: string, events: InputEvent[]): Promise<void>;
  /** Shared computer: block or unblock the keyboard and mouse of the person here, as the controller asked. */
  blockInput(sessionId: string, block: boolean): Promise<void>;
  clipboard(sessionId: string): Promise<string>;
  // Clipboard file transfer, controller → shared computer. Bytes cross as base64.
  clipboardFiles(sessionId: string): Promise<FilesSnapshot | null>;
  fileRead(sessionId: string, fingerprint: string, index: number, offset: number, len: number): Promise<string>;
  fileRecvBegin(sessionId: string, transferId: string, files: FileInfo[]): Promise<void>;
  fileRecvOpen(sessionId: string, transferId: string, index: number): Promise<void>;
  fileRecvChunk(sessionId: string, transferId: string, data: string): Promise<void>;
  /** Places the received files on the clipboard; resolves to how many. */
  fileRecvFinish(sessionId: string, transferId: string): Promise<number>;
  fileCancel(sessionId: string): Promise<void>;
  onEvent(callback: (event: DesktopEvent) => void): () => void;
}
declare global {
  interface Window {
    remote: DesktopAPI;
  }
}
