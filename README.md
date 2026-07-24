                                    M E U S
                        Real-Time Video Calling, Built Different.
                ─────────────────────────────────────────────────────────

Meus (Latin: "Me" and "Us") is a real-time, peer-to-peer video calling web
application built on Cloudflare Calls SFU (Selective Forwarding Unit) and
Socket.io. It lets people create or join a room instantly using an 8-character
room key, share their camera, microphone, and screen — all without accounts,
downloads, or complicated setup.

The name is the mission. Me and Us, talking to each other, sharing the moments
that matter.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT IT DOES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Instant Rooms Generate a collision-resistant 8-character key
(e.g. K8X2-M9P4) or type your own to enter a room.
No sign-up. No waiting. Just a link to share.

HD Video + Audio Camera and microphone access is negotiated via WebRTC
with graceful fallback — even Incognito tabs and
restricted browsers are handled without crashing.

Screen Sharing Share your full screen or any application window live
into the room. Stops cleanly when you click the native
browser "Stop Sharing" bubble or the in-app button.

Multi-Peer Support Every participant is a separate Cloudflare Calls
session. Peers are discovered in real-time via
Socket.io signaling and their media is pulled directly
from the SFU — not relayed through your device.

Dark / Light Theme A full theme toggle persists through the session via
a data-theme HTML attribute, driving a SCSS variable
system across every component.

Camera Mute / Mic Toggle your camera and microphone on the fly within
Toggle a live call without re-negotiating the WebRTC session.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE TECH STACK
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Frontend Framework React 19 + TypeScript 6, bundled with Vite 8
Styling SCSS (Sass) — component-scoped stylesheets with a
shared design token system for dark and light modes
State Management Zustand 5 for global lightweight state
Routing React Router DOM 7
Animations GSAP 3 for entrance and interaction animations
Real-Time Signaling Socket.io Client 4 over WebSocket / polling fallback
Media Transport WebRTC via Cloudflare Calls SFU (STUN: Cloudflare)
Backend Proxy Custom Node.js/Express backend on Render
(configurable via VITE_BACKEND_URL env variable)
Linting ESLint 10 + typescript-eslint 8

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW THE CALL WORKS (The 5-Stage Handshake)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

When you hit "Start Call", a lot happens invisibly. Here is the exact
sequence under the hood:

Stage 1 — Create Session
Your browser creates an RTCPeerConnection and acquires your camera and
microphone. An SDP offer is sent to the backend, which forwards it to
the Cloudflare Calls API. Cloudflare responds with an SDP answer and
assigns you a unique sessionId for the lifetime of this call.

Stage 2 — Publish Tracks
A second SDP negotiation cycle runs immediately after Stage 1 stabilizes.
Your audio and video tracks are registered with Cloudflare's SFU, which
returns official trackName identifiers for each transceiver mid. These
names become your published identity in the room.

Stage 3 — WebSocket Signaling (join-room)
Once tracks are published, a Socket.io connection is opened to the
backend. You emit join-room with your sessionId and published track list.
The server relays room-peers back to you (existing participants) and
broadcasts user-joined to everyone else in the room.

Stage 4 — Pull Peer Tracks
For each remote peer, the app issues a pull request to Cloudflare Calls,
asking it to route the peer's camera (and screen, if active) tracks to
your session. Cloudflare responds with an SDP offer containing the new
media. Your browser creates an SDP answer, which is sent back via a
/renegotiate endpoint. A concurrency mutex prevents overlapping pulls
from corrupting the RTCPeerConnection signaling state.

Stage 5 — Screen Share (optional renegotiation)
Activating screen share captures a display stream, adds its tracks to
the existing peer connection, and triggers a third SDP negotiation cycle.
The new screen trackNames are published to Cloudflare and broadcast to
all room members via update-tracks. Peers automatically pull the new
screen stream without disconnecting their camera feeds.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROJECT STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

src/
├── videogroup/
│ ├── index.tsx Root app shell — tab routing, theme, room state
│ ├── Navbar.tsx Top navigation bar with theme toggle + Sign In
│ ├── HomePage.tsx Landing page — hero text, room key generator, CTA
│ ├── RoomPage.tsx Full call room — WebRTC + Socket.io orchestration
│ └── videogroup.scss Full design system: tokens, layout, components
│
├── components/
│ ├── VideoAndShareScreen.tsx Standalone broadcaster (single-user mode)
│ ├── VideoBroadcast.tsx Viewer-only broadcast component
│ ├── video.scss Broadcaster styles
│ └── videoshare.scss Screen share styles
│
└── config/
└── api.ts Backend URL config (env var or localhost:6003)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GETTING STARTED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Prerequisites:
Node.js 18+ npm 9+ A running Meus backend (or localhost:6003)

1. Install dependencies

   npm install

2. Set your backend URL (optional)

   Create a .env file in the project root:

   VITE_BACKEND_URL=https://your-backend.onrender.com

   If omitted, the app defaults to http://localhost:6003

3. Start the dev server

   npm run dev

4. Open the app

   Navigate to http://localhost:5173 in your browser.
   Generate a room key, share it with a friend, and start your call.

Available scripts:

       npm run dev        Start Vite development server with HMR
       npm run build      Type-check with tsc and produce a production bundle
       npm run preview    Preview the production build locally
       npm run lint       Run ESLint across the entire project

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ENVIRONMENT VARIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Variable Default Description
───────────────────── ───────────────────── ─────────────────────────
VITE_BACKEND_URL http://localhost:6003 Backend proxy for the
Cloudflare Calls API and
Socket.io signaling

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KNOWN BEHAVIORS AND EDGE CASES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Camera denial If camera access is fully blocked (Incognito, no
hardware, strict permissions), the app falls back to
a canvas placeholder stream so the call can still
proceed with audio only.

Pull concurrency Simultaneous SDP renegotiations from multiple peers
joining at once are serialized via a mutex queue so
that RTCPeerConnection signaling state is never
corrupted.

Screen track type Cloudflare Calls does not label tracks by type. The
resolution app resolves whether an incoming mid is "camera" or
"screen" by cross-referencing the peer's published
track metadata received over Socket.io.

Mid mapping trackToInfoRef maps each SFU-assigned mid to a
sessionId and type before setRemoteDescription is
called, because the ontrack event fires synchronously
during that call and needs the mapping to already
exist.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LICENSE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MIT License. Build freely, share generously.

                ─────────────────────────────────────────────────────────
                        Meus — where conversations come alive.
