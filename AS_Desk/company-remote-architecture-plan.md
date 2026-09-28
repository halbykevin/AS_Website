# Company Remote — Architecture & Implementation Plan

> A simplified, self-hosted, RustDesk-style remote desktop application for internal company use.
>
> **Primary UX:** enter a 9-digit remote ID → send connection request → remote user accepts → view and fully control the remote PC.
>
> **Target platform for v1:** Windows 10/11.
>
> **Hosting model:** self-hosted on a public Linux VPS using your own domains.

---

## Table of Contents

1. [Project Goal](#1-project-goal)
2. [Core Product Behavior](#2-core-product-behavior)
3. [Design Principles](#3-design-principles)
4. [Recommended Technology Stack](#4-recommended-technology-stack)
5. [High-Level Architecture](#5-high-level-architecture)
6. [The 9-Digit Device ID System](#6-the-9-digit-device-id-system)
7. [Device Registration and Identity](#7-device-registration-and-identity)
8. [Application Components](#8-application-components)
9. [Windows Process Architecture](#9-windows-process-architecture)
10. [Remote Connection Flow](#10-remote-connection-flow)
11. [WebSocket / Rendezvous Protocol](#11-websocket--rendezvous-protocol)
12. [WebRTC Architecture](#12-webrtc-architecture)
13. [TURN / STUN Design](#13-turn--stun-design)
14. [Screen Capture](#14-screen-capture)
15. [Video Encoding](#15-video-encoding)
16. [Remote Input](#16-remote-input)
17. [Clipboard](#17-clipboard)
18. [State Machines](#18-state-machines)
19. [Security Architecture](#19-security-architecture)
20. [PostgreSQL Data Model](#20-postgresql-data-model)
21. [Server Structure](#21-server-structure)
22. [Monorepo Structure](#22-monorepo-structure)
23. [Public VPS Deployment](#23-public-vps-deployment)
24. [Domain and Port Layout](#24-domain-and-port-layout)
25. [Reverse Proxy and TLS](#25-reverse-proxy-and-tls)
26. [TURN Credentials](#26-turn-credentials)
27. [Rate Limiting and Abuse Prevention](#27-rate-limiting-and-abuse-prevention)
28. [Session Auditing](#28-session-auditing)
29. [Automatic Updates](#29-automatic-updates)
30. [Windows Code Signing](#30-windows-code-signing)
31. [Logging and Monitoring](#31-logging-and-monitoring)
32. [Suggested API Endpoints](#32-suggested-api-endpoints)
33. [Suggested Protocol Messages](#33-suggested-protocol-messages)
34. [Recommended Build Order](#34-recommended-build-order)
35. [Features to Delay](#35-features-to-delay)
36. [Production Checklist](#36-production-checklist)
37. [Final Recommended Stack](#37-final-recommended-stack)
38. [First Concrete Milestone](#38-first-concrete-milestone)

---

# 1. Project Goal

The goal is to build a small, company-owned remote desktop product that behaves similarly to RustDesk in the areas that matter most:

- Every installed computer gets a unique **9-digit ID**.
- A user enters the target computer's 9-digit ID.
- The target receives a connection request.
- The target user explicitly clicks **Accept** or **Reject**.
- If accepted, the requester can:
  - see the remote screen,
  - move the mouse,
  - click,
  - type,
  - optionally synchronize clipboard,
  - disconnect the session.
- The system works over the public Internet, not only on the company LAN.
- Direct peer-to-peer connectivity is used whenever possible.
- A self-hosted TURN server is used only when direct connectivity fails.
- The application and infrastructure are owned by the company.
- There is no per-seat SaaS subscription.

This is **not** intended to reproduce every RustDesk or AnyDesk feature.

The product should intentionally stay smaller and easier to maintain.

---

# 2. Core Product Behavior

The main desktop screen should be intentionally simple.

```text
┌─────────────────────────────────────────────┐
│              COMPANY REMOTE                 │
├─────────────────────────────────────────────┤
│                                             │
│ Your ID                                     │
│ ┌─────────────────────────────────────────┐ │
│ │              483 291 750                │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ Status: ● Ready                             │
│                                             │
│ Connect to Remote Computer                  │
│ ┌───────────────────────────┐               │
│ │ 927 381 442               │   [Connect]   │
│ └───────────────────────────┘               │
│                                             │
└─────────────────────────────────────────────┘
```

The controller enters:

```text
927 381 442
```

and clicks:

```text
Connect
```

The target computer receives:

```text
┌───────────────────────────────────────────┐
│ Incoming Remote Connection                │
│                                           │
│ Device 483 291 750 wants to control       │
│ your computer.                            │
│                                           │
│ Requested permissions:                    │
│ ✓ View screen                             │
│ ✓ Keyboard                                │
│ ✓ Mouse                                   │
│ ✓ Clipboard                               │
│                                           │
│      [ Reject ]           [ Accept ]       │
└───────────────────────────────────────────┘
```

The requester sees:

```text
Connecting to 927 381 442

Waiting for the remote user to accept...

[Cancel]
```

Only after the target clicks **Accept** does WebRTC negotiation begin.

---

# 3. Design Principles

## 3.1 One application can both control and be controlled

Do not create two completely separate user-facing products.

Every Windows installation should be able to act as:

- a controller,
- a remote target.

Internally, however, the application can still contain multiple executables/services.

---

## 3.2 The public server is primarily a rendezvous/control server

The VPS should handle:

- device registration,
- device presence,
- request routing,
- session authorization,
- signaling,
- TURN credential issuance,
- audit events.

The VPS should **not** carry all screen traffic by default.

---

## 3.3 Prefer direct peer-to-peer connections

Best case:

```text
Controller PC  ═════════ WebRTC ═════════  Target PC
                         direct P2P
```

Fallback:

```text
Controller PC  ═══ TURN Relay ═══  Target PC
```

The Node.js server should not become a video proxy.

---

## 3.4 The 9-digit ID is an address, not a password

Knowing:

```text
927 381 442
```

should only mean:

> "I know which computer I want to contact."

It must **not** mean:

> "I am authorized to control that computer."

Default authorization is:

```text
Know ID
  ↓
Send request
  ↓
Target user accepts
  ↓
Session authorized
  ↓
Remote control starts
```

---

## 3.5 Keep v1 Windows-only

Do not start with:

- Windows,
- macOS,
- Linux,
- Android,
- iOS,
- browser viewer.

Start with:

```text
Windows 10/11 → Windows 10/11
```

This dramatically reduces complexity.

---

# 4. Recommended Technology Stack

Because the primary developer experience is React + Node.js, keep the control-plane code in that ecosystem, while using native technologies where they make technical sense.

| Component | Recommended Technology |
|---|---|
| Desktop UI | Tauri 2 + React + TypeScript |
| Web/Admin UI | React + TypeScript + Vite |
| Public API | Node.js + TypeScript + Fastify |
| Signaling | WebSocket / WSS |
| Database | PostgreSQL |
| ORM | Drizzle or Prisma |
| Presence cache | In-memory first, Redis later |
| Device WebRTC engine | Go + Pion WebRTC v4 |
| Windows native helper | Rust + `windows` crate |
| Screen capture | DXGI Desktop Duplication API |
| Video codec | H.264 |
| Encoder API | Windows Media Foundation |
| Keyboard/mouse | Win32 `SendInput` |
| Local IPC | Windows Named Pipes |
| STUN/TURN | coturn |
| TLS/reverse proxy | Caddy |
| Deployment | Linux VPS + Docker Compose / systemd |
| Monitoring | OpenTelemetry + Prometheus/Grafana later |
| Updates | Signed updater |
| Code signing | Windows Authenticode certificate |

---

# 5. High-Level Architecture

```text
                              INTERNET
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
        api.remote.company.com       turn.remote.company.com
                    │                           │
              HTTPS / WSS                  STUN/TURN
                    │                           │
                    ▼                           │
           ┌──────────────────┐                 │
           │ PUBLIC VPS       │                 │
           │                  │                 │
           │ Caddy            │                 │
           │ Node.js API      │                 │
           │ Signaling        │                 │
           │ PostgreSQL       │                 │
           │ Redis optional   │                 │
           │ coturn           │◄────────────────┘
           └─────────┬────────┘
                     │
                Rendezvous
                     │
        ┌────────────┴─────────────┐
        │                          │
        ▼                          ▼
┌──────────────────┐      ┌──────────────────┐
│ Controller PC    │      │ Target PC        │
│ ID 483291750     │      │ ID 927381442     │
│                  │      │                  │
│ Tauri + React    │      │ Tauri + React    │
│ Go Service       │      │ Go Service       │
│ Rust Helper      │      │ Rust Helper      │
└────────┬─────────┘      └─────────┬────────┘
         │                          │
         └────────── WebRTC ────────┘
                   direct P2P

If direct connectivity fails:

Controller ───────── coturn/TURN ───────── Target
```

---

# 6. The 9-Digit Device ID System

Each installation receives a numeric ID from:

```text
100000000
...
999999999
```

That produces approximately 900 million possible public IDs.

For company-scale use, this is more than sufficient.

Store:

```text
927381442
```

but display:

```text
927 381 442
```

for readability.

---

## 6.1 Generate IDs on the server

Do not derive the ID from:

- MAC address,
- CPU serial,
- motherboard serial,
- hostname,
- Windows SID.

Instead:

```text
First run
   ↓
Device creates cryptographic identity
   ↓
POST /devices/register
   ↓
Server chooses random unused 9-digit ID
   ↓
Server stores mapping
```

Example:

```text
Internal UUID:
019d13fc-....

Public ID:
927381442
```

---

## 6.2 ID uniqueness

At registration time:

1. generate a cryptographically secure random integer,
2. ensure it is within 100000000–999999999,
3. check for collision,
4. retry if already taken,
5. store a unique DB constraint on `public_id`.

---

## 6.3 Never expose a public directory

The server should not offer endpoints such as:

```text
GET /devices
```

that expose all active IDs.

The 9-digit namespace should be treated as contact addressing, not a browseable directory.

---

# 7. Device Registration and Identity

Every installation should create a cryptographic key pair.

Recommended:

```text
Ed25519
```

The target machine stores:

```text
private key
```

locally.

The server stores:

```text
public key
```

with the device record.

The private key must never leave the machine.

---

## 7.1 First-run registration

```text
Application installed
       ↓
RemoteService starts
       ↓
Generate Ed25519 key pair
       ↓
Create registration request
       ↓
POST /v1/devices/register
       ↓
Server creates:
  - internal UUID
  - public 9-digit ID
       ↓
Server returns device identity
       ↓
Local service stores credentials securely
```

---

## 7.2 Example device record

```json
{
  "id": "019d13fc-53da-7c36-8a02-...",
  "publicId": "927381442",
  "publicKey": "MCowBQYDK2VwAyEA...",
  "hostname": "ACCOUNTING-PC",
  "platform": "windows",
  "agentVersion": "0.1.0"
}
```

---

## 7.3 Persistent ID behavior

The 9-digit ID should remain stable across:

- application restarts,
- Windows restarts,
- application upgrades.

Whether it survives a full uninstall/reinstall is your choice.

For a simple v1:

- uninstall removes local identity,
- reinstall creates a new identity and ID.

Later you can add identity backup/recovery.

---

# 8. Application Components

Install approximately:

```text
C:\Program Files\CompanyRemote\
    CompanyRemote.exe
    RemoteService.exe
    RemoteSessionHost.exe
```

---

## 8.1 `CompanyRemote.exe`

Technology:

```text
Tauri 2 + React + TypeScript
```

Responsibilities:

- show local 9-digit ID,
- display connectivity status,
- accept remote ID input,
- send connection requests,
- display incoming connection dialogs,
- display the remote desktop,
- send local mouse/keyboard events,
- display connection statistics,
- allow disconnect.

---

## 8.2 `RemoteService.exe`

Recommended technology:

```text
Go + Pion WebRTC
```

Runs as a Windows service.

Responsibilities:

- persist device identity,
- maintain WSS connection,
- authenticate with rendezvous server,
- route signaling messages,
- manage WebRTC peer connections,
- perform ICE,
- connect to STUN/TURN,
- create DataChannels,
- authorize remote session,
- launch session host,
- coordinate auto-update,
- expose local IPC.

---

## 8.3 `RemoteSessionHost.exe`

Recommended technology:

```text
Rust + windows-rs
```

Runs inside the logged-in user's interactive Windows session.

Responsibilities:

- capture desktop,
- encode H.264,
- monitor changes,
- inject mouse input,
- inject keyboard input,
- handle clipboard,
- enumerate monitors,
- receive local commands through IPC.

---

# 9. Windows Process Architecture

This split is important.

Windows services run in **Session 0**, separate from the interactive user's desktop.

Therefore:

```text
Windows Session 0
────────────────────────────────

RemoteService.exe
    │
    │ Named Pipe / IPC
    │
─────────────── Windows session boundary ───────────────
    │
    ▼
Windows User Session
────────────────────────────────

RemoteSessionHost.exe
    │
    ├── DXGI capture
    ├── H.264 encoding
    ├── SendInput
    ├── Clipboard
    └── Monitor handling
```

Do not try to make the Windows service itself directly handle all interactive desktop capture and UI tasks.

---

# 10. Remote Connection Flow

Example devices:

```text
Controller:
483 291 750

Target:
927 381 442
```

---

## Step 1 — both devices connect to the rendezvous server

On startup:

```text
wss://api.remote.company.com/ws
```

Each authenticated device maintains a persistent outbound WebSocket.

No router port forwarding is needed on employee home networks.

---

## Step 2 — controller enters target ID

Controller sends:

```json
{
  "type": "connection.request",
  "targetId": "927381442"
}
```

The server already knows the controller's authenticated identity.

---

## Step 3 — rendezvous server resolves target

Conceptually:

```ts
const target = connections.get("927381442");
```

If no connection exists:

```text
Remote device is offline.
```

If online, forward an incoming request.

---

## Step 4 — target gets an incoming request

Example:

```json
{
  "type": "connection.incoming",
  "requestId": "req_81da79d0",
  "source": {
    "id": "483291750"
  },
  "permissions": [
    "screen",
    "mouse",
    "keyboard",
    "clipboard"
  ]
}
```

The target displays:

```text
Incoming remote connection

483 291 750 wants to control this computer.

[Reject] [Accept]
```

---

## Step 5 — target accepts

Target sends:

```json
{
  "type": "connection.accept",
  "requestId": "req_81da79d0"
}
```

The server creates:

```text
sessionId
```

and a short-lived session authorization.

Example:

```json
{
  "sessionId": "ses_f89abc15",
  "controller": "483291750",
  "target": "927381442",
  "capabilities": [
    "screen",
    "mouse",
    "keyboard",
    "clipboard"
  ],
  "expiresAt": 1790000000
}
```

---

## Step 6 — WebRTC signaling starts

Controller creates an SDP offer.

```text
Controller
    │
    │ SDP offer
    ▼
Rendezvous server
    │
    ▼
Target
```

Target creates an SDP answer.

```text
Target
    │
    │ SDP answer
    ▼
Rendezvous server
    │
    ▼
Controller
```

Both send trickle ICE candidates through the WebSocket.

---

## Step 7 — ICE establishes the best path

Preferred:

```text
Controller ═════════ direct WebRTC ═════════ Target
```

Fallback:

```text
Controller ═══ TURN ═══ Target
```

---

## Step 8 — desktop session begins

Target:

```text
DXGI capture
    ↓
H.264 encode
    ↓
WebRTC video track
    ↓
Controller
```

Controller:

```text
mouse
keyboard
clipboard
    ↓
WebRTC DataChannels
    ↓
Target
```

---

# 11. WebSocket / Rendezvous Protocol

Use WebSocket for:

- presence,
- request/accept/reject,
- SDP signaling,
- ICE exchange,
- session lifecycle messages.

Use TLS:

```text
wss://
```

only.

---

## 11.1 Initial handshake

Example:

```json
{
  "type": "hello",
  "protocolVersion": 1,
  "clientVersion": "0.1.0",
  "platform": "windows",
  "deviceId": "927381442",
  "capabilities": [
    "h264",
    "clipboard",
    "multi-monitor"
  ]
}
```

The message should be signed or sent after device authentication.

---

## 11.2 Recommended message envelope

Use a standard envelope:

```json
{
  "type": "connection.request",
  "id": "msg_123",
  "timestamp": 1790000000000,
  "payload": {}
}
```

Benefits:

- protocol versioning,
- tracing,
- logging,
- correlation IDs,
- debugging.

---

# 12. WebRTC Architecture

Use WebRTC for the actual session.

It provides:

- ICE,
- STUN,
- TURN compatibility,
- DTLS,
- SRTP,
- SCTP DataChannels,
- NAT traversal.

---

## 12.1 Video

Send screen content as a WebRTC video track.

Recommended initial codec:

```text
H.264
```

Advantages:

- excellent hardware support,
- Windows Media Foundation support,
- WebView/Chromium playback support,
- common WebRTC compatibility.

---

## 12.2 DataChannels

Create separate channels for different semantics.

### `control`

Reliable and ordered.

Used for:

- session metadata,
- monitor switching,
- capabilities,
- disconnect commands.

### `keyboard`

Reliable and ordered.

Used for:

- key down,
- key up,
- modifiers.

### `mouse-fast`

Potentially unordered / low-latency.

Used for:

- high-frequency mouse movement.

Old mouse position packets are not useful if a newer position is already available.

### `mouse-reliable`

Reliable.

Used for:

- button down/up,
- wheel,
- important discrete events.

### `clipboard`

Reliable and ordered.

### `file-transfer`

Add later.

---

# 13. TURN / STUN Design

Use:

```text
coturn
```

on the Linux VPS.

Suggested domain:

```text
turn.remote.company.com
```

TURN should be a fallback, not the primary route.

---

## 13.1 Why TURN is necessary

Employees may connect from:

- home routers,
- mobile hotspots,
- CGNAT,
- hotels,
- corporate firewalls,
- restrictive NATs.

Some combinations will prevent direct peer-to-peer connectivity.

TURN solves this by relaying traffic.

---

## 13.2 Suggested coturn ports

Example:

```text
3478/udp
3478/tcp

5349/tcp
5349/udp

49160-49300/udp
```

The relay range should be sized based on expected concurrent sessions.

For a small internal deployment, a relatively small range is reasonable.

---

## 13.3 TURN over TLS 443

Some restrictive networks allow almost only HTTPS traffic on port 443.

Later, consider supporting:

```text
TURN/TLS :443
```

If API HTTPS and TURN need port 443 on the same public IP, you may eventually want:

- a second public IP, or
- a separate small VPS for TURN.

This is not required for the first implementation.

---

# 14. Screen Capture

For Windows v1, use:

```text
DXGI Desktop Duplication API
```

This is more appropriate than repeatedly taking screenshots.

Advantages:

- GPU-based surfaces,
- desktop frame acquisition,
- dirty region metadata,
- mouse pointer metadata,
- efficient change detection,
- multi-monitor support.

---

## 14.1 Initial capture strategy

Do not over-optimize the first build.

Start with:

```text
Capture complete frame
    ↓
Encode
    ↓
Send
```

Once the full pipeline works reliably, optimize with:

- dirty rectangles,
- idle FPS reduction,
- changed-region tracking,
- cursor composition optimizations.

---

# 15. Video Encoding

Recommended pipeline:

```text
DXGI desktop frame
       ↓
GPU texture
       ↓
NV12 conversion
       ↓
Media Foundation H.264 encoder
       ↓
H.264 NAL units
       ↓
Pion WebRTC video track
```

---

## 15.1 Initial quality targets

Reasonable first targets:

```text
Resolution:
up to 1920×1080

Frame rate:
20–30 FPS maximum

Bitrate:
approximately 2–6 Mbps

Idle:
reduce frame rate aggressively

High movement:
increase frame rate / bitrate
```

Do not hardcode one bitrate forever.

Later adapt using:

- packet loss,
- RTT,
- available outgoing bitrate,
- actual screen motion.

---

# 16. Remote Input

On the target Windows machine, use:

```text
SendInput
```

for normal keyboard and mouse injection.

---

## 16.1 Mouse message example

```ts
type MouseMove = {
  type: "mouse_move";
  x: number;
  y: number;
};

type MouseButton = {
  type: "mouse_button";
  button: "left" | "right" | "middle";
  state: "down" | "up";
};

type MouseWheel = {
  type: "mouse_wheel";
  deltaX: number;
  deltaY: number;
};
```

---

## 16.2 Keyboard message example

```ts
type KeyboardEvent = {
  type: "keyboard";
  scanCode: number;
  state: "down" | "up";
  extended?: boolean;
};
```

Prefer scan codes when possible because they map more accurately across keyboard layouts than high-level character strings.

---

## 16.3 Privilege limitations

Normal input injection does not automatically solve:

- UAC secure desktop,
- Windows login screen,
- Ctrl+Alt+Del,
- higher-integrity UI,
- secure credential prompts.

Treat those as a later milestone.

First support:

- desktop,
- browser,
- Office,
- terminal,
- typical applications.

---

# 17. Clipboard

Clipboard can use a reliable WebRTC DataChannel.

Recommended initial scope:

```text
text only
```

Later add:

- images,
- files,
- rich formats.

Do not log clipboard contents on the server.

The clipboard should travel directly between peers whenever the WebRTC session is direct.

---

# 18. State Machines

Do not represent connection state with many independent booleans.

Use explicit enumerated states.

---

## 18.1 Controller state machine

```text
IDLE
  ↓
LOOKING_UP
  ↓
REQUESTING
  ↓
WAITING_FOR_ACCEPT
  ├── rejected → REJECTED
  ├── timeout  → EXPIRED
  └── accepted
          ↓
      SIGNALING
          ↓
     ICE_CONNECTING
          ↓
       CONNECTED
          ↓
     DISCONNECTING
          ↓
         IDLE
```

---

## 18.2 Target state machine

```text
IDLE
  ↓
INCOMING_REQUEST
  ├── reject → IDLE
  ├── timeout → IDLE
  └── accept
          ↓
      SIGNALING
          ↓
     ICE_CONNECTING
          ↓
       CONNECTED
          ↓
         IDLE
```

---

## 18.3 Recommended request timeout

For example:

```text
30 seconds
```

After that:

```text
Connection request expired.
```

---

# 19. Security Architecture

Remote control software is security-sensitive.

The following should be considered mandatory.

---

## 19.1 TLS everywhere

Use only:

```text
HTTPS
WSS
TURN TLS where appropriate
```

Never expose plaintext signaling in production.

---

## 19.2 Per-device cryptographic identity

Every machine has:

```text
device private key
device public key
```

The 9-digit public ID is only a friendly address.

---

## 19.3 Short-lived session grants

When a target accepts a request, issue a signed short-lived grant.

Example:

```json
{
  "sessionId": "ses_f89abc15",
  "controllerDeviceId": "dev_controller",
  "targetDeviceId": "dev_target",
  "capabilities": [
    "screen",
    "mouse",
    "keyboard",
    "clipboard"
  ],
  "expiresAt": 1790000000,
  "nonce": "7e71..."
}
```

Characteristics:

- session-specific,
- short-lived,
- signed,
- non-reusable,
- capability-scoped.

---

## 19.4 No shared company password

Never use:

```text
COMPANY_PASSWORD=secret123
```

inside all clients.

Compromise of one machine must not compromise the entire fleet.

---

## 19.5 No permanent TURN password in the application

Do not embed:

```text
turn_user=company
turn_password=supersecret
```

Use temporary credentials issued by the control server.

---

## 19.6 Explicit session visibility

When a computer is being controlled, show a visible indicator:

```text
Remote session active
483 291 750 is connected

[Disconnect]
```

This should not be hidden.

---

## 19.7 Local user must be able to terminate the session

Always provide a local disconnect button.

Optionally allow a keyboard shortcut.

---

# 20. PostgreSQL Data Model

Keep the database intentionally small at first.

Recommended core tables:

```text
devices
connection_requests
sessions
session_events
blocked_devices
```

---

## 20.1 `devices`

Suggested fields:

```sql
id UUID PRIMARY KEY
public_id VARCHAR(9) UNIQUE NOT NULL
public_key TEXT NOT NULL
hostname TEXT
platform TEXT NOT NULL
agent_version TEXT
created_at TIMESTAMPTZ NOT NULL
last_seen_at TIMESTAMPTZ
revoked_at TIMESTAMPTZ
```

---

## 20.2 `connection_requests`

```sql
id UUID PRIMARY KEY
controller_device_id UUID NOT NULL
target_device_id UUID NOT NULL
requested_at TIMESTAMPTZ NOT NULL
expires_at TIMESTAMPTZ NOT NULL
accepted_at TIMESTAMPTZ
rejected_at TIMESTAMPTZ
status TEXT NOT NULL
```

Possible states:

```text
pending
accepted
rejected
expired
cancelled
```

---

## 20.3 `sessions`

```sql
id UUID PRIMARY KEY
controller_device_id UUID NOT NULL
target_device_id UUID NOT NULL
request_id UUID
requested_at TIMESTAMPTZ
accepted_at TIMESTAMPTZ
connected_at TIMESTAMPTZ
ended_at TIMESTAMPTZ
status TEXT NOT NULL
connection_type TEXT
termination_reason TEXT
controller_ip INET
target_ip INET
controller_version TEXT
target_version TEXT
```

---

## 20.4 `connection_type`

Useful values:

```text
direct
turn_udp
turn_tcp
turn_tls
```

This becomes very useful for diagnosing network behavior.

---

## 20.5 `blocked_devices`

```sql
id UUID PRIMARY KEY
blocking_device_id UUID NOT NULL
blocked_device_id UUID NOT NULL
created_at TIMESTAMPTZ NOT NULL
```

This lets a target permanently block abusive callers.

---

# 21. Server Structure

Recommended Node.js service structure:

```text
server/
│
├── src/
│   ├── auth/
│   │
│   ├── devices/
│   │
│   ├── presence/
│   │
│   ├── rendezvous/
│   │
│   ├── signaling/
│   │
│   ├── sessions/
│   │
│   ├── turn/
│   │
│   ├── audit/
│   │
│   ├── rate-limit/
│   │
│   └── updates/
│   │
│   ├── app.ts
│   └── server.ts
│
└── package.json
```

The most important modules are:

```text
presence/
rendezvous/
signaling/
sessions/
```

---

## 21.1 Presence map

For one VPS:

```ts
Map<string, DeviceConnection>
```

can be enough.

Example:

```text
927381442 → WebSocket #342
483291750 → WebSocket #991
```

Once you run multiple Node.js instances, move presence to Redis or a pub/sub layer.

---

# 22. Monorepo Structure

Recommended:

```text
company-remote/
│
├── apps/
│   ├── desktop/
│   │   ├── src/
│   │   ├── src-tauri/
│   │   └── package.json
│   │
│   └── admin-web/
│       └── optional later
│
├── services/
│   ├── control-api/
│   │   ├── src/
│   │   └── package.json
│   │
│   └── agent-service/
│       └── Go
│
├── native/
│   └── windows-session-host/
│       ├── src/
│       │   ├── capture/
│       │   ├── encoder/
│       │   ├── input/
│       │   ├── clipboard/
│       │   ├── monitors/
│       │   └── ipc/
│       └── Cargo.toml
│
├── packages/
│   ├── protocol/
│   ├── shared-types/
│   └── ui/
│
├── infra/
│   ├── compose.yml
│   ├── caddy/
│   ├── coturn/
│   ├── postgres/
│   └── monitoring/
│
└── docs/
    ├── architecture.md
    ├── protocol.md
    ├── security.md
    └── deployment.md
```

---

# 23. Public VPS Deployment

Your existing Linux VPS is suitable.

Example production layout:

```text
Linux VPS
│
├── Caddy
│
├── Node.js Control API
│
├── PostgreSQL
│
├── Redis              optional initially
│
├── coturn
│
├── update files
│
└── monitoring/logging
```

---

## 23.1 Deployment style

Two reasonable choices:

### Option A — Docker Compose

Good for:

- Node.js,
- PostgreSQL,
- Redis,
- monitoring,
- Caddy.

### Option B — systemd for coturn

coturn often works cleanly as a native service because it uses a range of UDP relay ports.

Another good approach is Docker host networking for coturn.

---

# 24. Domain and Port Layout

Example domains:

```text
remote.company.com
api.remote.company.com
turn.remote.company.com
updates.remote.company.com
```

Suggested usage:

| Hostname | Purpose |
|---|---|
| `remote.company.com` | landing/admin UI |
| `api.remote.company.com` | API + WSS signaling |
| `turn.remote.company.com` | STUN/TURN |
| `updates.remote.company.com` | installers and update manifests |

---

## 24.1 Firewall

Example:

```text
22/tcp
80/tcp
443/tcp

3478/udp
3478/tcp

5349/tcp
5349/udp

49160-49300/udp
```

SSH should ideally be limited to:

- your office IP,
- your VPN,
- or a secure administration path.

---

## 24.2 PostgreSQL

Do not publicly expose:

```text
5432
```

Bind PostgreSQL to:

- localhost,
- Docker internal network,
- private interface.

---

# 25. Reverse Proxy and TLS

Recommended:

```text
Caddy
```

Reasons:

- simple configuration,
- automatic HTTPS,
- automatic certificate renewal,
- easy WebSocket reverse proxying.

Example conceptual layout:

```text
api.remote.company.com
    ↓
Caddy
    ↓
Node.js :3000
```

WebSocket upgrades must be preserved.

---

# 26. TURN Credentials

Use short-lived TURN credentials.

Conceptual model:

```text
username:
<expiry>:<device-id>

password:
HMAC(turn-secret, username)
```

Example lifetime:

```text
5–15 minutes
```

The client requests fresh TURN credentials shortly before WebRTC negotiation.

This prevents long-lived TURN credentials from being extracted and abused.

---

# 27. Rate Limiting and Abuse Prevention

Because IDs are 9 digits, attackers could attempt enumeration.

Mitigate this aggressively.

---

## 27.1 Limit target lookups / requests

Example:

```text
Per source device:
10 different target IDs per minute

Per target:
5 incoming requests per minute
```

Adjust based on real usage.

---

## 27.2 Do not reveal unnecessary metadata

Before acceptance, avoid returning:

```text
John Smith
Finance Department
CEO Laptop
Windows username
email address
```

A request should reveal minimal information.

---

## 27.3 Temporary cooldowns

Repeated:

- invalid IDs,
- rejected requests,
- high-frequency connection attempts,

should trigger cooldowns.

---

## 27.4 Blocking

Incoming request UI can include later:

```text
[Reject]
[Block this device]
```

---

# 28. Session Auditing

Store metadata such as:

```text
who connected
target
request time
accept time
connected time
end time
connection path
software versions
termination reason
```

Do not log:

- screen contents,
- keystrokes,
- clipboard contents,
- transferred files,

unless a future company policy explicitly requires something different.

---

# 29. Automatic Updates

Remote-control software must be updateable.

Recommended design:

```text
updates.remote.company.com/
    latest.json
    desktop-0.1.4.exe
    desktop-0.1.4.sig
    service-0.1.4.exe
    service-0.1.4.sig
```

All updates should be signed.

Do not allow unsigned update packages.

---

## 29.1 Update sequence

```text
App starts
  ↓
Check signed update manifest
  ↓
Download package
  ↓
Verify signature
  ↓
Install safely
  ↓
Restart service/application
```

---

# 30. Windows Code Signing

Before broad internal deployment, obtain a Windows code-signing certificate.

Benefits:

- clear publisher identity,
- less alarming SmartScreen behavior,
- higher user trust,
- protection against modified installers.

Code sign:

- installer,
- `CompanyRemote.exe`,
- `RemoteService.exe`,
- `RemoteSessionHost.exe`,
- update packages where applicable.

---

# 31. Logging and Monitoring

Initially monitor:

```text
API health
active WebSockets
online devices
connection request count
session count
P2P success rate
TURN usage
TURN bandwidth
session setup time
WebRTC failures
average RTT
packet loss
```

---

## 31.1 Important network metrics

Especially useful:

```text
% direct P2P
% TURN UDP
% TURN TCP
% TURN TLS
```

If most sessions are direct, VPS bandwidth remains small.

If TURN usage is high, relay bandwidth becomes the main infrastructure cost.

---

## 31.2 Logging stack

Start simple:

```text
structured JSON logs
```

Later:

```text
OpenTelemetry
Prometheus
Grafana
Loki / compatible logging system
```

---

# 32. Suggested API Endpoints

Example REST endpoints:

```text
POST /v1/devices/register
POST /v1/devices/auth/challenge
POST /v1/devices/auth/verify

POST /v1/turn/credentials

GET  /v1/updates/latest

GET  /health
GET  /ready
```

Most live session actions should travel over WebSocket rather than repeated REST requests.

---

# 33. Suggested Protocol Messages

A possible first protocol:

---

## Device online

```json
{
  "type": "device.online",
  "protocolVersion": 1,
  "deviceId": "483291750",
  "clientVersion": "0.1.0"
}
```

---

## Connection request

```json
{
  "type": "connection.request",
  "requestId": "req_123",
  "targetId": "927381442"
}
```

---

## Incoming request

```json
{
  "type": "connection.incoming",
  "requestId": "req_123",
  "sourceId": "483291750",
  "permissions": [
    "screen",
    "mouse",
    "keyboard",
    "clipboard"
  ]
}
```

---

## Accept

```json
{
  "type": "connection.accept",
  "requestId": "req_123"
}
```

---

## Reject

```json
{
  "type": "connection.reject",
  "requestId": "req_123",
  "reason": "user_rejected"
}
```

---

## Cancel

```json
{
  "type": "connection.cancel",
  "requestId": "req_123"
}
```

---

## Request expired

```json
{
  "type": "connection.expired",
  "requestId": "req_123"
}
```

---

## SDP offer

```json
{
  "type": "webrtc.offer",
  "sessionId": "ses_123",
  "sdp": "..."
}
```

---

## SDP answer

```json
{
  "type": "webrtc.answer",
  "sessionId": "ses_123",
  "sdp": "..."
}
```

---

## ICE candidate

```json
{
  "type": "webrtc.ice",
  "sessionId": "ses_123",
  "candidate": {
    "candidate": "...",
    "sdpMid": "0",
    "sdpMLineIndex": 0
  }
}
```

---

## Session connected

```json
{
  "type": "session.connected",
  "sessionId": "ses_123",
  "connectionType": "direct"
}
```

---

## Session ended

```json
{
  "type": "session.ended",
  "sessionId": "ses_123",
  "reason": "remote_disconnect"
}
```

---

# 34. Recommended Build Order

Build the project in layers.

Do not begin with screen capture.

---

## Phase 1 — Rendezvous only

Build:

- Node.js server,
- PostgreSQL,
- device registration,
- 9-digit IDs,
- device keypairs,
- WSS presence,
- online/offline state,
- connection request,
- accept,
- reject,
- timeout,
- cancel.

Use console applications if necessary.

Success condition:

```text
PC A enters PC B's 9-digit ID.
PC B receives request.
PC B accepts.
Both clients receive a session ID.
```

---

## Phase 2 — WebRTC data-only session

Add:

- Pion,
- SDP offer/answer,
- ICE candidate exchange,
- STUN,
- TURN,
- DataChannel.

Success condition:

```text
PC A and PC B establish WebRTC across different networks
and exchange text messages.
```

Test with:

```text
PC A → normal broadband
PC B → mobile hotspot
```

Do not test only on the same LAN.

---

## Phase 3 — TURN fallback

Force direct connectivity to fail.

Verify:

```text
PC A → coturn → PC B
```

Measure:

- session setup,
- bandwidth,
- latency.

---

## Phase 4 — Native Windows capture

Implement:

```text
RemoteSessionHost.exe
```

Add:

- DXGI capture,
- local preview,
- H.264 encoding.

Success condition:

```text
Target captures and encodes its own desktop correctly.
```

---

## Phase 5 — Remote video

Connect H.264 output to WebRTC.

Success condition:

```text
Controller sees target desktop.
```

No input yet.

---

## Phase 6 — Mouse control

Implement:

```text
mouse move
left click
right click
wheel
```

---

## Phase 7 — Keyboard

Implement:

```text
key down
key up
modifiers
scan codes
```

---

## Phase 8 — Production desktop UI

Build the final Tauri/React interface:

```text
Your ID
Remote ID
Connect
Waiting
Incoming request
Accept
Reject
Remote screen
Disconnect
```

---

## Phase 9 — Clipboard

Text clipboard first.

---

## Phase 10 — Windows service integration

Ensure:

- auto-start,
- WSS reconnect,
- helper launch,
- correct session handling,
- safe shutdown.

---

## Phase 11 — Security hardening

Add:

- strict rate limiting,
- signed session grants,
- request cooldowns,
- target blocking,
- replay protection,
- key rotation strategy,
- audit events.

---

## Phase 12 — Updates and code signing

Add:

- signed updates,
- release channel,
- installer signing,
- binary signing.

---

## Phase 13 — Quality improvements

Add:

- adaptive bitrate,
- lower idle FPS,
- multi-monitor,
- connection statistics,
- reconnect,
- better error handling.

---

# 35. Features to Delay

Do not put these into the first release:

```text
macOS
Linux
Android
iOS
browser-only viewer
remote audio
voice chat
text chat
remote printing
session recording
VPN/tunneling
TCP forwarding
Wake-on-LAN
complex address book
multi-controller sessions
organization hierarchy
file manager
unattended passwords
UAC secure desktop
Windows login screen
Ctrl+Alt+Del
```

These can be added after the core remote session is stable.

---

# 36. Production Checklist

Before calling the application production-ready:

## Connectivity

- [ ] Works across two different home networks.
- [ ] Works through mobile hotspot.
- [ ] Direct P2P tested.
- [ ] TURN fallback tested.
- [ ] WebSocket reconnection tested.
- [ ] Client survives temporary Internet loss.
- [ ] Session disconnect is clean.

## Security

- [ ] TLS everywhere.
- [ ] Device private keys never leave device.
- [ ] Device identity verified.
- [ ] 9-digit ID is not authentication.
- [ ] Target acceptance required.
- [ ] Session grants expire quickly.
- [ ] TURN credentials expire quickly.
- [ ] Replay protection implemented.
- [ ] Connection requests rate-limited.
- [ ] Device blocking supported.
- [ ] No public device directory.
- [ ] Sensitive clipboard contents never logged.
- [ ] Database not exposed publicly.

## Windows

- [ ] Windows service starts reliably.
- [ ] Interactive helper launches in correct user session.
- [ ] Capture works on supported Windows versions.
- [ ] Keyboard layouts tested.
- [ ] Multi-monitor behavior documented.
- [ ] Session ends safely on logout.
- [ ] App shows clear active-session indicator.

## Operations

- [ ] PostgreSQL backups.
- [ ] VPS firewall configured.
- [ ] Health checks.
- [ ] Structured logs.
- [ ] TURN bandwidth monitoring.
- [ ] P2P success metric.
- [ ] Signed update process.
- [ ] Rollback process.
- [ ] Code signing.

---

# 37. Final Recommended Stack

For this exact project:

```text
DESKTOP UI
────────────────────────
Tauri 2
React
TypeScript


CONTROL / RENDEZVOUS SERVER
────────────────────────
Node.js
TypeScript
Fastify
WebSocket


DATABASE
────────────────────────
PostgreSQL
Drizzle or Prisma


OPTIONAL PRESENCE / SCALE
────────────────────────
Redis


WEBRTC AGENT
────────────────────────
Go
Pion WebRTC v4


WINDOWS NATIVE
────────────────────────
Rust
windows-rs
DXGI Desktop Duplication
Media Foundation H.264
SendInput
Named Pipes


NETWORKING
────────────────────────
WebRTC
ICE
STUN
coturn TURN


PUBLIC INFRASTRUCTURE
────────────────────────
Linux VPS
Caddy
Docker Compose
systemd where appropriate


SECURITY
────────────────────────
Per-device Ed25519 keys
TLS
Signed session grants
Short-lived TURN credentials
Rate limiting
Audit logs
Signed updates
Windows code signing
```

---

# 38. First Concrete Milestone

The first real implementation milestone should be:

```text
                 PUBLIC VPS
                     │
          Node.js Rendezvous Server
                     │
          ┌──────────┴──────────┐
          │                     │
          ▼                     ▼
       PC A                   PC B
   ID 483291750           ID 927381442
```

Required behavior:

1. PC A registers and receives a 9-digit ID.
2. PC B registers and receives a 9-digit ID.
3. Both maintain persistent WSS connections.
4. PC A enters PC B's ID.
5. PC B receives an incoming connection request.
6. PC B chooses Accept or Reject.
7. PC A sees the result.
8. On Accept, the server creates a session ID.
9. Both clients receive that session ID.
10. The request automatically expires if ignored.

Do **not** add screen capture yet.

Once that protocol is stable, implement:

```text
WebRTC DataChannel
```

between the two computers.

Then add:

```text
TURN fallback
```

Then:

```text
screen capture → H.264 → WebRTC video
```

Then:

```text
mouse + keyboard
```

This sequence isolates each difficult problem and prevents debugging networking, capture, encoding, Windows input, and application UI simultaneously.

---

# Final Product Model

The product should remain conceptually simple:

```text
┌─────────────────────────────────────────┐
│            COMPANY REMOTE               │
│                                         │
│ Your ID                                 │
│                                         │
│            483 291 750                  │
│                                         │
│          ● Ready                        │
│                                         │
│ Remote ID                               │
│                                         │
│       [ 927 381 442 ]                   │
│                                         │
│             CONNECT                     │
└─────────────────────────────────────────┘
```

Behind that simple UI:

```text
                VPS
                 │
        ┌────────┴─────────┐
        │                  │
   Rendezvous           coturn
   Node.js/WSS          TURN/STUN
        │                  │
        │                  │
        ▼                  ▼
 Controller ═══════ WebRTC ═══════ Target
            direct whenever possible
```

And the trust model remains:

```text
9-digit ID
     ↓
Request connection
     ↓
Target receives popup
     ↓
Target explicitly accepts
     ↓
Short-lived authorized session
     ↓
WebRTC establishes best path
     ↓
View + mouse + keyboard + clipboard
```

That is the recommended architecture for a simpler, self-hosted, company-owned RustDesk-style remote desktop application.
