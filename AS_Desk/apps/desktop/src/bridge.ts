import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { DesktopAPI, DesktopEvent } from "./contracts.ts";

// window.remote: the typed, frozen surface the UI uses. Each call is a Tauri command that the agent
// checks (src-tauri/capabilities/main.json lists the only commands this page may invoke).
const api: DesktopAPI = {
  state: () => invoke("get_state"),
  copyId: () => invoke("copy_id"),
  window: (action, target) => invoke("window_action", { action, target: target ?? null }),
  startDrag: () => getCurrentWindow().startDragging(),
  setup: ({ server, enrollmentToken }) => invoke("setup", { server, enrollmentToken }),
  connect: (targetId, clipboard, relayOnly, password, remember) => invoke("connect", { targetId, clipboard, relayOnly, password: password ?? null, remember: remember ?? false }),
  setUnattended: password => invoke("set_unattended", { password }),
  clearUnattended: () => invoke("clear_unattended"),
  forget: targetId => invoke("forget", { targetId }),
  renameRecent: (targetId, name) => invoke("rename_recent", { targetId, name }),
  dismissError: () => invoke("dismiss_error"),
  accept: (requestId, permissions, sourceId, width, height, thumbnail) => invoke("accept", { requestId, permissions, sourceId, width, height, thumbnail }),
  report: message => invoke("report", { message }),
  reject: requestId => invoke("reject", { requestId }),
  cancel: targetId => invoke("cancel", { targetId }),
  disconnect: sessionId => invoke("disconnect", { sessionId: sessionId ?? null }),
  signal: message => invoke("signal", { message }),
  input: (sessionId, event) => invoke("input", { sessionId, event }),
  clipboard: sessionId => invoke("read_clipboard", { sessionId }),
  clipboardFiles: sessionId => invoke("clipboard_files", { sessionId }),
  fileRead: (sessionId, fingerprint, index, offset, len) => invoke("file_read", { sessionId, fingerprint, index, offset, len }),
  fileRecvBegin: (sessionId, transferId, files) => invoke("file_recv_begin", { sessionId, transferId, files }),
  fileRecvOpen: (sessionId, transferId, index) => invoke("file_recv_open", { sessionId, transferId, index }),
  fileRecvChunk: (sessionId, transferId, data) => invoke("file_recv_chunk", { sessionId, transferId, data }),
  fileRecvFinish: (sessionId, transferId) => invoke("file_recv_finish", { sessionId, transferId }),
  fileCancel: sessionId => invoke("file_cancel", { sessionId }),
  onEvent: callback => {
    let active = true;
    const registration = listen<DesktopEvent>("remote:event", event => {
      if (active) callback(event.payload);
    });
    // A state change between the first state() call and this registration would otherwise be missed.
    void registration
      .then(() => api.state())
      .then(state => {
        if (active) callback({ type: "state", state });
      });
    return () => {
      active = false;
      void registration.then(stop => stop());
    };
  }
};
Object.defineProperty(window, "remote", { value: Object.freeze(api) });
