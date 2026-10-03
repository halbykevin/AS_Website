import type { ActiveSession, FileInfo, FilesSnapshot, InputEvent, TransferStatus } from './contracts.ts';
import type { ClientMessage } from '../../../packages/protocol/src/index.ts';

export type Stats = { path: string; bitrate: number; rtt: number; fps: number; codec: string };
const FILE_CHUNK = 48 * 1024; // ≤ transfer::MAX_CHUNK; leaves headroom in the data-channel frame
const toBase64 = (bytes: Uint8Array) => { let binary = ''; for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(binary); };
const fromBase64 = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
export class RemoteMedia {
  private pc: RTCPeerConnection;
  private channels = new Map<string, RTCDataChannel>();
  private stream?: MediaStream;
  private candidates: RTCIceCandidateInit[] = [];
  private sequence = new Map<string, number>();
  private received = new Map<string, number>();
  private stopped = false;
  private ready = false;
  private startPromise: Promise<void>;
  private statsTimer?: ReturnType<typeof setInterval>;
  private clipboardTimer?: ReturnType<typeof setInterval>;
  private clipboardBusy = false;
  private lastClipboard?: string;
  private lastBytes = 0;
  private lastTime = 0;
  private disconnectedTimer?: ReturnType<typeof setTimeout>;
  private iceRestartAttempts = 0;
  // Controller: whether this session is on screen. A hidden session asks the other computer to pause
  // its video, so sessions in background tabs cost almost no bandwidth or CPU on either side.
  private visible = true;
  private lastQuality = 0;
  private paramsChain: Promise<void> = Promise.resolve();
  // Zero-frame detection: counts consecutive stats ticks with fps=0 while the session should be producing frames.
  private zeroFpsStreak = 0;
  private keyframeRecoveryDone = false;
  // The target passes the screen the user picked (getDisplayMedia needs the Accept click's user gesture).
  // Clipboard file transfer state (see transfer.rs): controller streams, target receives in order.
  private lastFilesFp?: string;
  private sendingFiles = false;
  private fileAccept?: (ok: boolean) => void;
  private sendId?: string;
  private recv?: { id: string; label: string; total: number; received: number };
  private recvChain: Promise<void> = Promise.resolve();
  constructor(readonly session: ActiveSession, private video: (stream: MediaStream) => void,
    private status: (stats: Stats) => void, private fail: (message: string) => void, private capture?: MediaStream,
    private transfer?: (status: TransferStatus) => void) {
    this.pc = new RTCPeerConnection({ iceServers: session.iceServers, iceTransportPolicy: session.relayOnly ? 'relay' : 'all', bundlePolicy: 'max-bundle' });
    this.pc.onicecandidate = event => {
      if (event.candidate && !this.stopped) void window.remote.signal({ type: 'webrtc.ice', sessionId: session.sessionId, candidate: {
        candidate: event.candidate.candidate, sdpMid: event.candidate.sdpMid, sdpMLineIndex: event.candidate.sdpMLineIndex
      } }).catch(() => this.fail('Signaling interrupted'));
    };
    this.pc.ontrack = event => {
      const track = event.track;
      const stream = event.streams[0] ?? new MediaStream([track]);
      // Guard against receiving an already-ended track (race between capture stop and negotiation).
      if (track.readyState === 'ended') return;
      track.onended = () => { if (!this.stopped && this.session.role === 'controller') this.fail('Remote screen sharing ended'); };
      track.onunmute = () => { if (!this.stopped) this.video(stream); };
      this.video(stream);
    };
    this.pc.ondatachannel = event => this.channel(event.channel);
    this.pc.onconnectionstatechange = () => {
      if (this.stopped) return;
      if (this.pc.connectionState === 'connected') {
        clearTimeout(this.disconnectedTimer);
        this.iceRestartAttempts = 0;
        void this.connected().catch(() => this.fail('Could not authorize the media connection'));
      } else if (this.pc.connectionState === 'failed') {
        // Attempt ICE restart before giving up entirely.
        if (this.ready && this.iceRestartAttempts < 2) {
          this.iceRestartAttempts++;
          this.pc.restartIce();
        } else {
          this.fail('Peer connection ended');
        }
      } else if (this.pc.connectionState === 'closed') {
        this.fail('Peer connection ended');
      } else if (this.pc.connectionState === 'disconnected') {
        // Try ICE restart first; only fail after a generous timeout.
        if (this.ready) this.pc.restartIce();
        this.disconnectedTimer = setTimeout(() => {
          if (this.stopped) return;
          if (this.iceRestartAttempts < 2) {
            this.iceRestartAttempts++;
            this.pc.restartIce();
          } else {
            this.fail('Network connection lost');
          }
        }, 8000);
      }
    };
    this.startPromise = this.start();
    void this.startPromise.catch(error => this.fail(error instanceof Error ? error.message : 'Unable to start screen sharing'));
  }
  private preferH264() {
    const codecs = RTCRtpReceiver.getCapabilities('video')?.codecs;
    if (!codecs) return;
    const h264 = codecs.filter(c => c.mimeType.toLowerCase() === 'video/h264');
    if (!h264.length) return;
    for (const transceiver of this.pc.getTransceivers()) if (transceiver.receiver.track.kind === 'video')
      transceiver.setCodecPreferences([...h264, ...codecs.filter(c => c.mimeType.toLowerCase() !== 'video/h264')]);
  }
  private async start() {
    if (this.session.role === 'controller') {
      this.pc.addTransceiver('video', { direction: 'recvonly' });
      for (const label of ['control', 'keyboard', 'mouse-fast', 'mouse-reliable', 'clipboard', 'files']) {
        const fast = label === 'mouse-fast';
        this.channel(this.pc.createDataChannel(label, fast ? { ordered: false, maxRetransmits: 0 } : { ordered: true }));
      }
      this.preferH264();
      const offer = await this.pc.createOffer();
      await this.localDescription('webrtc.offer', offer);
    } else {
      const stream = this.capture;
      if (!stream?.active) throw new Error('Screen capture is unavailable');
      if (this.stopped) { stream.getTracks().forEach(t => t.stop()); return; }
      this.stream = stream;
      for (const track of stream.getTracks()) {
        track.contentHint = 'detail'; track.onended = () => { if (!this.stopped) this.fail('Screen sharing stopped'); };
        this.pc.addTrack(track, stream);
      }
      this.video(stream);
    }
  }
  private async localDescription(type: 'webrtc.offer' | 'webrtc.answer', description: RTCSessionDescriptionInit) {
    // Sign and route the description before releasing trickled candidates.
    await window.remote.signal({ type, sessionId: this.session.sessionId, sdp: description.sdp! });
    if (!this.stopped) await this.pc.setLocalDescription(description);
  }
  async signal(message: ClientMessage) {
    await this.startPromise;
    if (this.stopped) return;
    if (message.type === 'webrtc.ice') {
      if (this.pc.remoteDescription) await this.pc.addIceCandidate(message.candidate);
      else this.candidates.push(message.candidate);
    } else if (message.type === 'webrtc.offer' || message.type === 'webrtc.answer') {
      await this.pc.setRemoteDescription({ type: message.type === 'webrtc.offer' ? 'offer' : 'answer', sdp: message.sdp });
      for (const candidate of this.candidates.splice(0)) await this.pc.addIceCandidate(candidate);
      if (message.type === 'webrtc.offer') {
        this.preferH264();
        await this.localDescription('webrtc.answer', await this.pc.createAnswer());
        for (const sender of this.pc.getSenders()) if (sender.track?.kind === 'video') {
          const params = sender.getParameters();
          if (params.encodings.length) {
            params.encodings[0]!.maxBitrate = 4_000_000;
            params.encodings[0]!.maxFramerate = 30;
            await sender.setParameters(params).catch(() => undefined);
          }
        }
      }
    }
  }
  private channel(channel: RTCDataChannel) {
    if (!['control', 'keyboard', 'mouse-fast', 'mouse-reliable', 'clipboard', 'files'].includes(channel.label) || this.channels.has(channel.label)) { channel.close(); return; }
    this.channels.set(channel.label, channel);
    // Files carry binary chunks and a small JSON protocol; kept apart from the input channels' seq logic.
    if (channel.label === 'files') { channel.binaryType = 'arraybuffer'; channel.onmessage = event => this.onFileMessage(event.data); return; }
    channel.onmessage = event => {
      if (!this.ready || this.stopped || typeof event.data !== 'string' || event.data.length > 70000) return;
      try {
        const packet = JSON.parse(event.data);
        if (packet.sessionId !== this.session.sessionId || !Number.isSafeInteger(packet.seq) || packet.seq <= (this.received.get(channel.label) ?? 0)) return;
        this.received.set(channel.label, packet.seq);
        const control = packet.event?.type;
        if (channel.label === 'control') {
          if (this.session.role === 'target') {
            if (control === 'pause' || control === 'resume') this.queueParams(() => this.setSending(control === 'resume'));
            else if (control === 'quality' && Number.isFinite(packet.event?.maxWidth)) this.queueParams(() => this.applyQuality(packet.event.maxWidth));
            else if (control === 'disable-input' && typeof packet.event?.blocked === 'boolean')
              void window.remote.blockInput(this.session.sessionId, packet.event.blocked).catch(() => {});
          }
          return;
        }
        const input = packet.event as InputEvent;
        const allowed = channel.label === 'keyboard' ? input.type === 'key' : channel.label === 'mouse-fast' ? input.type === 'move'
          : channel.label === 'mouse-reliable' ? ['button', 'wheel'].includes(input.type) : channel.label === 'clipboard' ? input.type === 'clipboard' : input.type === 'release';
        if (!allowed || (this.session.role === 'controller' && input.type !== 'clipboard')) return;
        if (input.type === 'clipboard') this.lastClipboard = input.text;
        void window.remote.input(this.session.sessionId, input).catch(() => this.fail('Peer sent unauthorized input'));
      } catch { this.fail('Invalid peer message'); }
    };
  }
  /** Controller: show or hide this session (see `visible`). */
  setVisible(visible: boolean) {
    if (this.session.role !== 'controller' || this.visible === visible) return;
    this.visible = visible;
    this.sendControl({ type: visible ? 'resume' : 'pause' });
    if (visible) { this.zeroFpsStreak = 0; this.keyframeRecoveryDone = false; }
  }
  /** Controller: ask the other computer to encode at roughly the pixel width shown here. In a grid of
   *  small tiles this cuts encode, bandwidth and decode dramatically, so several sessions stay smooth. */
  setQuality(displayWidth: number) {
    if (this.session.role !== 'controller' || !Number.isFinite(displayWidth)) return;
    const bucket = Math.max(320, Math.min(1920, Math.round(displayWidth / 160) * 160));
    if (bucket === this.lastQuality) return;
    this.lastQuality = bucket;
    this.sendControl({ type: 'quality', maxWidth: bucket });
  }
  /** Controller: block or unblock the target machine's local keyboard and mouse. */
  setInputBlocked(blocked: boolean) {
    if (this.session.role !== 'controller') return;
    this.sendControl({ type: 'disable-input', blocked });
  }
  private sendControl(event: { type: 'pause' | 'resume' } | { type: 'quality'; maxWidth: number } | { type: 'disable-input'; blocked: boolean }) {
    const channel = this.channels.get('control');
    if (!this.ready || this.stopped || channel?.readyState !== 'open') return;
    const seq = (this.sequence.get('control') ?? 0) + 1; this.sequence.set('control', seq);
    channel.send(JSON.stringify({ sessionId: this.session.sessionId, seq, event }));
  }
  // Target: downscale the encoded resolution to about the tile's size (never upscale), and match the
  // bitrate and frame rate to it, so a small tile is cheap to produce and send.
  private async applyQuality(maxWidth: number) {
    for (const sender of this.pc.getSenders()) if (sender.track?.kind === 'video') {
      const params = sender.getParameters();
      if (!params.encodings.length) continue;
      const capture = sender.track.getSettings().width ?? 1920;
      const scale = Math.max(1, Math.min(4, capture / Math.max(160, maxWidth)));
      const encoding = params.encodings[0]!;
      encoding.scaleResolutionDownBy = scale;
      encoding.maxBitrate = Math.round(Math.max(500_000, Math.min(4_000_000, (capture / scale / 1920) * 4_000_000)));
      encoding.maxFramerate = maxWidth < 640 ? 20 : 30;
      await sender.setParameters(params).catch(() => undefined);
    }
  }
  private queueParams(step: () => Promise<void>) { this.paramsChain = this.paramsChain.then(step).then(() => undefined, () => undefined); }
  // Target: pausing disables the encoder (no frames are captured into it or sent); resuming starts
  // again with a key frame, so the picture is back immediately.
  private async setSending(active: boolean) {
    for (const sender of this.pc.getSenders()) if (sender.track?.kind === 'video') {
      const params = sender.getParameters();
      if (!params.encodings.length) continue;
      // Always apply the requested state — don't skip when it appears unchanged, because a prior
      // setParameters call may have failed silently and left the actual encoder in the wrong state.
      params.encodings[0]!.active = active;
      await sender.setParameters(params).catch(() => undefined);
    }
  }
  send(event: InputEvent) {
    if (!this.ready || this.stopped) return;
    if (event.type === 'key' && !this.session.permissions.includes('keyboard')) return;
    if (['move', 'button', 'wheel'].includes(event.type) && !this.session.permissions.includes('mouse')) return;
    const label = event.type === 'key' ? 'keyboard' : event.type === 'move' ? 'mouse-fast' : event.type === 'clipboard' ? 'clipboard' : event.type === 'release' ? 'control' : 'mouse-reliable';
    const channel = this.channels.get(label);
    if (channel?.readyState !== 'open') return;
    if (channel.bufferedAmount > 131072) { if (event.type !== 'move') this.fail('Remote input connection is congested'); return; }
    const seq = (this.sequence.get(label) ?? 0) + 1; this.sequence.set(label, seq);
    channel.send(JSON.stringify({ sessionId: this.session.sessionId, seq, event }));
  }
  private async connected() {
    if (this.ready || this.stopped) return;
    const stats = await this.measure();
    const connectionType = stats.path === 'Direct' ? 'direct' : stats.path.includes('TLS') ? 'turn_tls' : stats.path.includes('TCP') ? 'turn_tcp' : 'turn_udp';
    await window.remote.signal({ type: 'session.connected', sessionId: this.session.sessionId, connectionType });
    if (this.stopped) return;
    this.ready = true;
    // Ensure the encoder starts in the correct state: if we are visible, explicitly resume
    // (in case the target defaulted to paused); if hidden, pause.
    this.sendControl({ type: this.visible ? 'resume' : 'pause' });
    this.statsTimer = setInterval(() => {
      void this.measure().then(measured => {
        this.status(measured);
        if (this.session.role === 'controller' && this.visible) this.checkFrameHealth(measured);
      }).catch(() => undefined);
    }, 1000);
    if (this.session.permissions.includes('clipboard')) {
      // Baseline the controller's copied files so a selection made before the session is not auto-sent.
      if (this.session.role === 'controller') this.lastFilesFp = (await window.remote.clipboardFiles(this.session.sessionId).catch(() => null))?.fingerprint;
      this.clipboardTimer = setInterval(() => { void this.syncClipboard(); void this.syncFiles(); }, 1000);
    }
  }
  /** Controller: detect when the video track is alive but producing zero frames, and recover. */
  private checkFrameHealth(stats: Stats) {
    if (stats.fps > 0) { this.zeroFpsStreak = 0; this.keyframeRecoveryDone = false; return; }
    this.zeroFpsStreak++;
    // After 3 consecutive zero-fps ticks (~3s), force a keyframe by toggling pause/resume.
    if (this.zeroFpsStreak === 3 && !this.keyframeRecoveryDone) {
      this.keyframeRecoveryDone = true;
      this.sendControl({ type: 'pause' });
      setTimeout(() => { if (!this.stopped && this.visible) this.sendControl({ type: 'resume' }); }, 200);
    }
  }
  private async syncClipboard() {
    if (this.clipboardBusy || this.stopped) return;
    this.clipboardBusy = true;
    try {
      const text = await window.remote.clipboard(this.session.sessionId);
      // Copying files clears the text format; don't propagate that as an empty-clipboard wipe.
      if (this.lastClipboard !== undefined && text !== this.lastClipboard && text !== '') this.send({ type: 'clipboard', text });
      this.lastClipboard = text;
    } catch { /* ending a session revokes clipboard immediately */ }
    finally { this.clipboardBusy = false; }
  }
  // ── Clipboard file transfer (controller copies files → shared computer pastes them) ──
  private async syncFiles() {
    if (this.session.role !== 'controller' || this.sendingFiles || this.stopped) return;
    const channel = this.channels.get('files');
    if (channel?.readyState !== 'open') return;
    let snapshot: FilesSnapshot | null;
    try { snapshot = await window.remote.clipboardFiles(this.session.sessionId); } catch { return; }
    const fingerprint = snapshot?.fingerprint;
    if (fingerprint === this.lastFilesFp) return; // the copied selection has not changed
    this.lastFilesFp = fingerprint;
    if (snapshot && snapshot.files.length) void this.sendFiles(channel, snapshot);
  }
  private fileControl(message: object) {
    const channel = this.channels.get('files');
    if (channel?.readyState === 'open') channel.send(JSON.stringify(message));
  }
  private async sendFiles(channel: RTCDataChannel, snapshot: FilesSnapshot) {
    this.sendingFiles = true;
    const id = crypto.randomUUID(); this.sendId = id;
    const label = snapshot.files.length === 1 ? snapshot.files[0]!.name : `${snapshot.files.length} files`;
    const total = snapshot.files.reduce((sum, file) => sum + file.size, 0) || 1;
    try {
      const accepted = new Promise<boolean>(resolve => { this.fileAccept = resolve; setTimeout(() => resolve(false), 15000); });
      channel.send(JSON.stringify({ k: 'offer', id, files: snapshot.files }));
      this.transfer?.({ direction: 'send', label, progress: 0, state: 'active' });
      if (!(await accepted)) throw new Error('not accepted');
      let sent = 0;
      for (let index = 0; index < snapshot.files.length; index++) {
        channel.send(JSON.stringify({ k: 'file', id, index }));
        const size = snapshot.files[index]!.size;
        for (let offset = 0; offset < size;) {
          if (this.stopped || channel.readyState !== 'open') throw new Error('closed');
          const length = Math.min(FILE_CHUNK, size - offset);
          const bytes = fromBase64(await window.remote.fileRead(this.session.sessionId, snapshot.fingerprint, index, offset, length));
          if (!bytes.length) break;
          await this.drain(channel);
          channel.send(bytes);
          offset += bytes.length; sent += bytes.length;
          this.transfer?.({ direction: 'send', label, progress: Math.min(1, sent / total), state: 'active' });
        }
        channel.send(JSON.stringify({ k: 'file-end', id, index }));
      }
      channel.send(JSON.stringify({ k: 'done', id }));
    } catch {
      this.fileControl({ k: 'cancel', id });
      this.transfer?.({ direction: 'send', label, progress: 0, state: 'failed' });
    } finally { this.sendingFiles = false; this.fileAccept = undefined; this.sendId = undefined; }
  }
  // Pause streaming while the channel's send buffer is deep, so a transfer never floods the link.
  private drain(channel: RTCDataChannel) {
    return new Promise<void>(resolve => {
      if (channel.bufferedAmount < (1 << 20)) return resolve();
      const timer = setInterval(() => { if (this.stopped || channel.bufferedAmount < (1 << 20)) { clearInterval(timer); resolve(); } }, 50);
    });
  }
  private queueRecv(step: () => Promise<unknown>) { this.recvChain = this.recvChain.then(step).then(() => undefined, () => undefined); }
  private onFileMessage(data: unknown) {
    if (this.stopped) return;
    if (typeof data === 'string') {
      let message: { k?: string; id?: string; index?: number; files?: FileInfo[] };
      try { message = JSON.parse(data); } catch { return; }
      if (this.session.role === 'controller') {
        if (message.id !== this.sendId) return;
        if (message.k === 'ready') this.fileAccept?.(true);
        else if (message.k === 'cancel') this.fileAccept?.(false);
        else if (message.k === 'complete') this.transfer?.({ direction: 'send', label: 'Files', progress: 1, state: 'done' });
        return;
      }
      if (message.k === 'offer') return this.recvOffer(message);
      if (!this.recv || message.id !== this.recv.id) return;
      if (message.k === 'file' && Number.isInteger(message.index)) this.queueRecv(() => window.remote.fileRecvOpen(this.session.sessionId, this.recv!.id, message.index!));
      else if (message.k === 'done') this.recvDone();
      else if (message.k === 'cancel') this.recvCancel();
      return;
    }
    if (this.session.role !== 'target' || !this.recv || !(data instanceof ArrayBuffer)) return;
    const id = this.recv.id, base64 = toBase64(new Uint8Array(data));
    this.recv.received += data.byteLength;
    this.transfer?.({ direction: 'receive', label: this.recv.label, progress: Math.min(1, this.recv.received / this.recv.total), state: 'active' });
    this.queueRecv(async () => { try { await window.remote.fileRecvChunk(this.session.sessionId, id, base64); } catch { this.recvCancel(); } });
  }
  private recvOffer(message: { id?: string; files?: FileInfo[] }) {
    const files = message.files;
    if (typeof message.id !== 'string' || !Array.isArray(files) || !files.length || files.length > 256) return;
    const label = files.length === 1 ? files[0]!.name : `${files.length} files`;
    const total = files.reduce((sum, file) => sum + (file.size || 0), 0) || 1;
    this.recv = { id: message.id, label, total, received: 0 };
    this.transfer?.({ direction: 'receive', label, progress: 0, state: 'active' });
    this.queueRecv(async () => {
      try { await window.remote.fileRecvBegin(this.session.sessionId, message.id!, files); this.fileControl({ k: 'ready', id: message.id }); }
      catch { this.recv = undefined; this.fileControl({ k: 'cancel', id: message.id }); this.transfer?.({ direction: 'receive', label, progress: 0, state: 'failed' }); }
    });
  }
  private recvDone() {
    const id = this.recv?.id, label = this.recv?.label ?? 'Files';
    if (!id) return;
    this.queueRecv(async () => {
      try { const count = await window.remote.fileRecvFinish(this.session.sessionId, id); this.fileControl({ k: 'complete', id }); this.transfer?.({ direction: 'receive', label: count === 1 ? label : `${count} files`, progress: 1, state: 'done' }); }
      catch { this.transfer?.({ direction: 'receive', label, progress: 0, state: 'failed' }); }
      finally { this.recv = undefined; }
    });
  }
  private recvCancel() {
    if (!this.recv) return;
    const label = this.recv.label;
    this.recv = undefined;
    this.queueRecv(() => window.remote.fileCancel(this.session.sessionId));
    this.transfer?.({ direction: 'receive', label, progress: 0, state: 'failed' });
  }
  private async measure(): Promise<Stats> {
    const report = await this.pc.getStats();
    let path = 'Direct', rtt = 0, fps = 0, bytes = 0, codec = '';
    report.forEach(row => {
      if (row.type === 'candidate-pair' && row.state === 'succeeded' && row.nominated) {
        rtt = Math.round((row.currentRoundTripTime ?? 0) * 1000);
        const local = report.get(row.localCandidateId); const remote = report.get(row.remoteCandidateId);
        const relay = local?.candidateType === 'relay' ? local : remote?.candidateType === 'relay' ? remote : undefined;
        if (relay) path = `TURN ${(relay.relayProtocol ?? relay.protocol ?? 'udp').toUpperCase()}`;
      }
      if ((row.type === 'inbound-rtp' || row.type === 'outbound-rtp') && row.kind === 'video') {
        bytes += row.bytesReceived ?? row.bytesSent ?? 0; fps = row.framesPerSecond ?? 0;
        codec = report.get(row.codecId)?.mimeType?.replace('video/', '') ?? '';
      }
    });
    const now = performance.now();
    const bitrate = this.lastTime ? Math.max(0, (bytes - this.lastBytes) * 8 / (now - this.lastTime) / 1000) : 0;
    this.lastTime = now; this.lastBytes = bytes;
    return { path, rtt, fps, bitrate, codec };
  }
  stop() {
    this.stopped = true; this.ready = false;
    clearInterval(this.statsTimer); clearInterval(this.clipboardTimer); clearTimeout(this.disconnectedTimer);
    this.stream?.getTracks().forEach(track => track.stop());
    this.channels.forEach(channel => channel.close()); this.pc.close();
  }
}
