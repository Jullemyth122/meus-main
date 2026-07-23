import React, { useState, useRef, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { BACKEND_URL } from '../config/api';

interface RoomPageProps {
  roomCode: string;
  onLeaveRoom: () => void;
}

// interface PeerInfo {
//   socketId?: string;
//   sessionId: string;
//   tracks: Array<{ trackName: string; mid: string; kind?: string }>;
// }

interface PeerInfo {
  socketId?: string;
  sessionId: string;
  tracks: Array<{
    trackName: string;
    mid: string;
    kind?: string;
    type?: 'camera' | 'screen';   // ← Add this
  }>;
}

export const RoomPage: React.FC<RoomPageProps> = ({ roomCode, onLeaveRoom }) => {
  const [isMicOn, setIsMicOn] = useState<boolean>(true);
  const [isCameraOn, setIsCameraOn] = useState<boolean>(true);
  const [isScreenSharing, setIsScreenSharing] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [roomPeers, setRoomPeers] = useState<PeerInfo[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<{ sessionId: string; type: 'camera' | 'screen'; stream: MediaStream }[]>([]);

  // WebRTC & Media Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const trackToInfoRef = useRef<Map<string, { sessionId: string; type: string }>>(new Map());
  const publishedTracksRef = useRef<Array<{ trackName: string; mid: string; kind?: string; type?: 'camera' | 'screen' }>>([]);
  const roomPeersRef = useRef<PeerInfo[]>([]);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const screenSendersRef = useRef<RTCRtpSender[]>([]);
  const sessionIdRef = useRef<string | null>(null);
  const pulledSessionsRef = useRef<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    roomPeersRef.current = roomPeers;
  }, [roomPeers]);

  // Copy Room Code Helper
  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Helper to ensure PeerConnection is in 'stable' signalingState before offer creation
  const waitForStable = (pc: RTCPeerConnection): Promise<void> => {
    if (pc.signalingState === 'stable') return Promise.resolve();
    return new Promise((resolve) => {
      const checkState = () => {
        if (pc.signalingState === 'stable') {
          pc.removeEventListener('signalingstatechange', checkState);
          resolve();
        }
      };
      pc.addEventListener('signalingstatechange', checkState);
    });
  };

  useEffect(() => {
    let isMounted = true;

    const initCall = async () => {
      try {
        setStatus('connecting');
        setErrorMessage('');

        // 1. Acquire Local Camera & Microphone Media Stream (flexible ideal constraints for Brave/Desktop support)
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: true,
          });
        } catch (camErr) {
          console.warn("Primary camera access failed with ideal constraints. Trying basic video...", camErr);
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
          } catch (basicErr) {
            console.warn("Camera & audio access failed completely. Using fallback canvas stream...", basicErr);
            try {
              stream = await navigator.mediaDevices.getUserMedia({ audio: true });
              const canvas = document.createElement('canvas');
              canvas.width = 640;
              canvas.height = 480;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#1a1a24';
                ctx.fillRect(0, 0, 640, 480);
                ctx.fillStyle = '#ffb703';
                ctx.font = '20px sans-serif';
                ctx.fillText(`Incognito / Secondary Tab`, 180, 240);
              }
              const canvasStream = canvas.captureStream(15);
              canvasStream.getVideoTracks().forEach(t => stream.addTrack(t));
            } catch (audioErr) {
              const canvas = document.createElement('canvas');
              canvas.width = 640;
              canvas.height = 480;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#1a1a24';
                ctx.fillRect(0, 0, 640, 480);
              }
              stream = canvas.captureStream(15);
            }
          }
        }

        if (!isMounted) return;

        localStreamRef.current = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // 2. Setup RTCPeerConnection with Cloudflare STUN server
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
        });
        peerConnectionRef.current = pc;

        // Listen for incoming remote tracks from Cloudflare SFU
        pc.ontrack = (event) => {
          console.log("🛠️ ontrack fired:", {
            kind: event.track.kind,
            mid: event.transceiver.mid,
            streams: event.streams.length,
            trackToInfoKeys: Array.from(trackToInfoRef.current.keys()),
          });

          const mid = String(event.transceiver.mid || '');
          let trackInfo = trackToInfoRef.current.get(mid);

          if (!trackInfo) {
            console.warn("No direct trackInfo mapping for mid:", mid, "— attempting fallback lookup from peer tracks");
            // Attempt to resolve type from peer track metadata instead of hardcoding 'camera'
            const fallbackPeer = roomPeersRef.current.find(p => p.sessionId !== sessionIdRef.current);
            const fallbackSessionId = fallbackPeer?.sessionId || 'remote-peer';

            // Check if this mid corresponds to a screen track by looking at peer's track list
            let fallbackType: 'camera' | 'screen' = 'camera';
            if (fallbackPeer) {
              const hasScreenTrack = fallbackPeer.tracks?.some(t => t.type === 'screen');
              if (hasScreenTrack) {
                // Check if we already have a camera stream for this peer
                let cameraAlreadyMapped = false;
                trackToInfoRef.current.forEach((info) => {
                  if (info.sessionId === fallbackSessionId && info.type === 'camera') {
                    cameraAlreadyMapped = true;
                  }
                });
                if (cameraAlreadyMapped) {
                  fallbackType = 'screen';
                }
              }
            }

            trackInfo = { sessionId: fallbackSessionId, type: fallbackType };
            // Store the fallback mapping so subsequent tracks for the same mid are consistent
            trackToInfoRef.current.set(mid, trackInfo);
            console.log("Fallback trackInfo resolved:", { mid, ...trackInfo });
          }

          const resolvedInfo = trackInfo;

          setRemoteStreams(prev => {
            const existingIndex = prev.findIndex(s =>
              s.sessionId === resolvedInfo.sessionId && s.type === resolvedInfo.type
            );

            if (existingIndex >= 0) {
              const oldStream = prev[existingIndex].stream;
              if (!oldStream.getTracks().some(t => t.id === event.track.id)) {
                oldStream.addTrack(event.track);
              }
              // Force React re-render by creating a new MediaStream instance
              return prev.map((item, i) => i === existingIndex ? { ...item, stream: new MediaStream(item.stream.getTracks()) } : item);
            } else {
              const newStream = new MediaStream([event.track]);
              return [...prev, {
                sessionId: resolvedInfo.sessionId,
                type: resolvedInfo.type as 'camera' | 'screen',
                stream: newStream
              }];
            }
          });
        };

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // 3. STAGE 1: Create Session with Backend -> Cloudflare Calls
        const offer1 = await pc.createOffer();
        await pc.setLocalDescription(offer1);

        const sessionResp = await fetch(`${BACKEND_URL}/api/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: pc.localDescription?.sdp })
        });

        if (!sessionResp.ok) throw new Error(`Session creation failed: ${sessionResp.statusText}`);
        const sessionData = await sessionResp.json();
        const sessionId = sessionData.sessionId;
        sessionIdRef.current = sessionId;

        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: sessionData.sessionDescription.sdp
        }));

        // 4. STAGE 2: Auto-Discover & Register Local Track Names on Cloudflare Calls SFU
        await waitForStable(pc);
        const offer2 = await pc.createOffer();
        await pc.setLocalDescription(offer2);

        const tracksResp = await fetch(`${BACKEND_URL}/api/session/${sessionId}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: pc.localDescription?.sdp })
        });

        if (!tracksResp.ok) throw new Error(`Track publish failed: ${tracksResp.statusText}`);
        const tracksData = await tracksResp.json();

        await pc.setRemoteDescription(new RTCSessionDescription({
          type: 'answer',
          sdp: tracksData.sessionDescription.sdp
        }));

        // Map discovered tracks with official trackNames from Cloudflare Calls
        const localTransceivers = pc.getTransceivers();
        const screenTrackIds = new Set(screenStreamRef.current?.getTracks().map(st => st.id) || []);
        const publishedTracks = (tracksData.tracks || []).map((t: any, index: number) => {
          const matchingTr = localTransceivers.find(tr => String(tr.mid) === String(t.mid)) || localTransceivers[index];
          const kind = matchingTr?.sender?.track?.kind || matchingTr?.receiver?.track?.kind || 'video';
          const isScreen = Boolean(
            (matchingTr?.sender?.track?.id && screenTrackIds.has(matchingTr.sender.track.id)) ||
            (matchingTr?.sender && screenSendersRef.current.includes(matchingTr.sender))
          );
          return {
            trackName: t.trackName,
            mid: String(t.mid ?? matchingTr?.mid ?? index),
            kind: kind,
            type: isScreen ? ('screen' as const) : ('camera' as const)
          };
        });

        publishedTracksRef.current = publishedTracks;

        if (!isMounted) return;
        setStatus('connected');

        // 5. STAGE 3: Real-Time WebSocket Signaling via Socket.io
        const socket = io(BACKEND_URL, {
          transports: ['websocket', 'polling']
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log("Connected to WebSocket signaling server:", socket.id);
          socket.emit('join-room', {
            roomCode,
            sessionId,
            tracks: publishedTracks
          });
        });

        // Receive existing peers in the room
        socket.on('room-peers', async ({ peers }: { peers: PeerInfo[] }) => {
          console.log("Room peers received via WebSocket:", peers);
          setRoomPeers(peers);
          await pullPeerTracks(peers);
        });

        // Event triggered when a new user enters the room
        socket.on('user-joined', async (peer: PeerInfo) => {
          console.log("New user joined room via WebSocket:", peer);
          setRoomPeers(prev => {
            if (prev.some(p => p.sessionId === peer.sessionId || (peer.socketId && p.socketId === peer.socketId))) return prev;
            return [...prev, peer];
          });
          await pullPeerTracks([peer]);
        });

        // Event triggered when a peer updates their tracks (e.g. screen sharing)
        socket.on('peer-updated-tracks', async (updatedPeer: PeerInfo) => {
          console.log("Peer updated tracks via WebSocket:", updatedPeer);
          setRoomPeers(prev => {
            const exists = prev.some(p => p.sessionId === updatedPeer.sessionId);
            if (exists) {
              return prev.map(p => p.sessionId === updatedPeer.sessionId ? updatedPeer : p);
            }
            return [...prev, updatedPeer];
          });

          // Clean up remoteStreams for types no longer present in updatedPeer.tracks
          setRemoteStreams(prev => prev.filter(stream => {
            if (stream.sessionId !== updatedPeer.sessionId) return true;
            return (updatedPeer.tracks || []).some(t => (t.type || 'camera') === stream.type);
          }));

          await pullPeerTracks([updatedPeer]);
        });

        // Event triggered when a user leaves the room
        socket.on('user-left', ({ sessionId: leftSessionId, socketId }: { sessionId: string; socketId?: string }) => {
          console.log("User left room:", leftSessionId);
          setRoomPeers(prev => prev.filter(p => p.sessionId !== leftSessionId && p.socketId !== socketId));
          setRemoteStreams(prev => prev.filter(s => s.sessionId !== leftSessionId));
        });

      } catch (err: any) {
        console.error("Room initialization failed:", err);
        if (isMounted) {
          setStatus('error');
          setErrorMessage(err.message || 'Failed to connect to room call.');
        }
      }
    };

    // Mutex to prevent concurrent pull operations (concurrent SDP negotiations corrupt PeerConnection state)
    let pullInProgress = false;
    const pendingPulls: PeerInfo[][] = [];

    const pullPeerTracks = async (peers: PeerInfo[]) => {
      if (pullInProgress) {
        console.log("⏳ Pull already in progress, queueing peers for later...");
        pendingPulls.push(peers);
        return;
      }
      pullInProgress = true;
      try {
        await _doPullPeerTracks(peers);
      } finally {
        pullInProgress = false;
        if (pendingPulls.length > 0) {
          const next = pendingPulls.shift()!;
          console.log("📤 Processing queued pull...");
          pullPeerTracks(next);
        }
      }
    };

    const _doPullPeerTracks = async (peers: PeerInfo[]) => {
      const pc = peerConnectionRef.current;
      const currentSessionId = sessionIdRef.current;
      console.log("🔍 pullPeerTracks called. currentSessionId:", currentSessionId, "peers:", peers.map(p => ({ sid: p.sessionId, trackCount: p.tracks?.length })));

      if (!pc || !currentSessionId) {
        console.warn("⚠️ pullPeerTracks aborted: pc or currentSessionId missing");
        return;
      }

      console.log("🔍 PC state:", pc.signalingState, pc.connectionState, pc.iceConnectionState);

      const pulls: Array<{ sessionId: string; trackName: string; type: string }> = [];

      for (const peer of peers) {
        if (peer.sessionId === currentSessionId) continue;

        for (const t of peer.tracks || []) {
          if (!t.trackName) continue;

          const pullKey = `${peer.sessionId}:${t.trackName}`;
          if (pulledSessionsRef.current.has(pullKey)) continue;

          pulls.push({
            sessionId: peer.sessionId,
            trackName: t.trackName,
            type: t.type || 'camera'
          });

          pulledSessionsRef.current.add(pullKey);
        }
      }

      console.log(`📋 New tracks to pull: ${pulls.length}`);
      if (pulls.length === 0) return;

      try {
        await waitForStable(pc);

        const tracksToPull = pulls.map(p => ({
          location: 'remote' as const,
          sessionId: p.sessionId,
          trackName: p.trackName
        }));

        console.log("🚀 Sending pull request to Cloudflare. Tracks:", JSON.stringify(tracksToPull));

        const pullResp = await fetch(`${BACKEND_URL}/api/session/${currentSessionId}/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tracks: tracksToPull })
        });

        console.log("📬 Pull response status:", pullResp.status);

        if (!pullResp.ok) {
          const err = await pullResp.text();
          console.error("❌ Pull API failed:", pullResp.status, err);
          pulls.forEach(p => pulledSessionsRef.current.delete(`${p.sessionId}:${p.trackName}`));
          return;
        }

        const pullData = await pullResp.json();
        console.log("📬 Pull data keys:", Object.keys(pullData), "tracks:", pullData.tracks);
        console.log("📬 Original pulls with types:", pulls.map(p => ({ sessionId: p.sessionId, trackName: p.trackName, type: p.type })));

        // CRITICAL: Map returned Cloudflare mids to session + track type BEFORE setRemoteDescription
        // because ontrack fires synchronously during setRemoteDescription and needs these mappings
        (pullData.tracks || []).forEach((cfTrack: any) => {
          if (cfTrack.mid !== undefined && cfTrack.mid !== null) {
            const midStr = String(cfTrack.mid);
            // Match by trackName since Cloudflare may not echo back our sessionId
            const matchingPull = pulls.find(p =>
              p.trackName === cfTrack.trackName ||
              (p.sessionId === cfTrack.sessionId && p.trackName === cfTrack.trackName)
            );

            const resolvedType = matchingPull?.type || 'camera';

            trackToInfoRef.current.set(midStr, {
              sessionId: matchingPull?.sessionId || cfTrack.sessionId,
              type: resolvedType
            });
            console.log(`📌 Mapped mid ${midStr} → sessionId: ${matchingPull?.sessionId || cfTrack.sessionId}, type: ${resolvedType}, trackName: ${cfTrack.trackName}`);
          }
        });

        console.log("📌 Full trackToInfoRef after mapping:", Array.from(trackToInfoRef.current.entries()));

        if (pullData.sessionDescription) {
          const sdpType = pullData.sessionDescription.type || 'offer';
          console.log(`📥 Setting remote description from Cloudflare (${sdpType})...`);

          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'offer',
            sdp: pullData.sessionDescription.sdp
          }));

          if (sdpType === 'offer') {
            console.log("📤 Creating local answer for Cloudflare SFU offer...");
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            const reNegResp = await fetch(`${BACKEND_URL}/api/session/${currentSessionId}/renegotiate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sdp: pc.localDescription?.sdp, type: 'answer' })
            });

            if (reNegResp.ok) {
              console.log(`✅ SFU renegotiation completed successfully! Pulled ${pulls.length} tracks.`);
            } else {
              const err = await reNegResp.text();
              console.error("❌ SFU renegotiation failed:", reNegResp.status, err);
            }
          } else {
            console.log(`✅ Pulled ${pulls.length} tracks via answer! PC state: ${pc.signalingState}`);
          }
        } else {
          console.warn("⚠️ Pull succeeded but no sessionDescription returned. State:", pullData);
        }
      } catch (e) {
        console.error("❌ Pull error exception:", e);
        pulls.forEach(p => pulledSessionsRef.current.delete(`${p.sessionId}:${p.trackName}`));
      }
    };

    initCall();

    return () => {
      isMounted = false;

      // Disconnect WebSocket
      if (socketRef.current) {
        socketRef.current.emit('leave-room');
        socketRef.current.disconnect();
        socketRef.current = null;
      }

      // Close peer connection & media streams
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
        localStreamRef.current = null;
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      pulledSessionsRef.current.clear();
    };
  }, [roomCode]);

  // Toggle Microphone
  const toggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(!isMicOn);
      }
    }
  };

  // Toggle Camera
  const toggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isCameraOn;
        setIsCameraOn(!isCameraOn);
      }
    }
  };

  // Screen Share Handler
  const toggleScreenShare = async () => {
    const pc = peerConnectionRef.current;
    const sessionId = sessionIdRef.current;
    if (!pc || !sessionId) return;

    if (isScreenSharing) {
      // Stop screen sharing
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;
      }
      if (screenSendersRef.current.length > 0) {
        screenSendersRef.current.forEach(s => {
          try { pc.removeTrack(s); } catch (e) { }
        });
        screenSendersRef.current = [];
      }
      setIsScreenSharing(false);

      // Keep only non-screen tracks
      publishedTracksRef.current = publishedTracksRef.current.filter(t => t.type !== 'screen');
      if (socketRef.current && sessionIdRef.current) {
        socketRef.current.emit('update-tracks', {
          roomCode,
          sessionId: sessionIdRef.current,
          tracks: publishedTracksRef.current
        });
      }
    } else {
      // Start screen sharing
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screenStream;

        const senders: RTCRtpSender[] = [];
        screenStream.getTracks().forEach(t => {
          const sender = pc.addTrack(t, screenStream);
          senders.push(sender);
          t.onended = () => {
            toggleScreenShare();
          };
        });
        screenSendersRef.current = senders;

        setIsScreenSharing(true);

        // Safely renegotiate with Cloudflare SFU when PC signalingState is stable
        await waitForStable(pc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const resp = await fetch(`${BACKEND_URL}/api/session/${sessionId}/tracks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sdp: pc.localDescription?.sdp })
        });
        if (resp.ok) {
          const data = await resp.json();
          await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: data.sessionDescription.sdp
          }));

          // Discover newly registered screen track names from Cloudflare Calls
          const localTransceivers = pc.getTransceivers();
          const screenTrackIds = new Set(screenStreamRef.current?.getTracks().map(st => st.id) || []);

          // Find transceivers belonging to the screen share stream
          const screenTransceivers = localTransceivers.filter(tr =>
            tr.sender?.track?.id && screenTrackIds.has(tr.sender.track.id)
          );

          console.log("🔍 Local screen transceivers:", screenTransceivers.map(tr => ({ mid: tr.mid, kind: tr.sender?.track?.kind })));

          const updatedScreenTracks = (data.tracks || []).map((t: any, index: number) => {
            const matchingTr = screenTransceivers.find(tr => String(tr.mid) === String(t.mid))
              || screenTransceivers[index]
              || localTransceivers.find(tr => String(tr.mid) === String(t.mid))
              || localTransceivers[index];

            const kind = matchingTr?.sender?.track?.kind || 'video';
            const midStr = String(t.mid ?? matchingTr?.mid ?? (2 + index));

            console.log(`📢 Screen Track Discovered: mid=${midStr}, trackName=${t.trackName}, kind=${kind}`);

            return {
              trackName: t.trackName,
              mid: midStr,
              kind: kind,
              type: 'screen' as const
            };
          });

          // Keep existing camera tracks and append the new screen share tracks
          const cameraTracks = publishedTracksRef.current.filter(t => t.type !== 'screen');
          const fullTracksList = [...cameraTracks, ...updatedScreenTracks];
          publishedTracksRef.current = fullTracksList;

          console.log("🚀 Full tracks list to broadcast via WebSocket:", fullTracksList);

          // Broadcast updated full track list to other room members via WebSocket
          if (socketRef.current) {
            socketRef.current.emit('update-tracks', {
              roomCode,
              sessionId,
              tracks: fullTracksList
            });
          }

          console.log("Screen sharing track published successfully!");
        } else {
          console.error("Screen share track publish rejected:", await resp.text());
        }
      } catch (err) {
        console.error("Screen sharing failed:", err);
      }
    }
  };

  return (
    <div className="meus-room-wrapper">
      {/* Top Room Bar */}
      <div className="room-nav-bar">
        <div className="room-tag">
          <div className="live-pill">
            <span className="pulse-dot"></span>
            {status === 'connecting' ? 'CONNECTING...' : status === 'error' ? 'ERROR' : 'LIVE CALL'}
          </div>
          <div className="code-info">
            Room Code: <strong>{roomCode}</strong>
          </div>
        </div>

        <button className="copy-btn" onClick={handleCopyCode}>
          {copied ? (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg> Room Key Copied!</>
          ) : (
            <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg> Copy Key</>
          )}
        </button>
      </div>

      {status === 'error' && (
        <div style={{ color: '#ff6b6b', textAlign: 'center', margin: '12px 0' }}>
          {errorMessage || 'Connection failed. Please check backend server.'}
        </div>
      )}

      {/* Responsive Call Grid Area */}
      <div className="call-grid-area">
        {/* Local User Card */}
        <div className="stream-card">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className={`mirrored ${!isCameraOn ? 'hidden' : ''}`}
            style={{ display: isCameraOn ? 'block' : 'none' }}
          />
          {!isCameraOn && (
            <div className="offline-state">
              <div className="user-avatar">ME</div>
              <div className="offline-text">Your camera is paused</div>
            </div>
          )}

          <div className="participant-badge">
            <span className={`status-icon ${!isMicOn ? 'muted' : ''}`}>
              {isMicOn ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
              )}
            </span>
            You (Me)
          </div>
        </div>

        {/* Local Screen Share Card */}
        {isScreenSharing && (
          <div className="stream-card">
            <video
              autoPlay
              muted
              playsInline
              ref={el => {
                if (el && screenStreamRef.current && el.srcObject !== screenStreamRef.current) {
                  el.srcObject = screenStreamRef.current;
                }
              }}
            />
            <div className="participant-badge">
              <span className="status-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
              </span> Your Screen
            </div>
          </div>
        )}

        {/* Remote Room Peer Participant Cards */}
        {roomPeers.length === 0 ? (
          <div className="stream-card">
            <div className="offline-state" style={{ pointerEvents: 'none' }}>
              <div className="user-avatar">US</div>
              <div className="offline-text">Share room key {roomCode} to invite friends!</div>
            </div>
            <div className="participant-badge">
              <span className="status-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
              </span> Waiting for members...
            </div>
          </div>
        ) : (
          roomPeers.map((peer, idx) => {
            const cameraStreamObj = remoteStreams.find(s => s.sessionId === peer.sessionId && s.type === 'camera');
            const screenStreamObj = remoteStreams.find(s => s.sessionId === peer.sessionId && s.type === 'screen');
            console.log(`🎥 [Peer ${idx + 1} (${peer.sessionId}) Streams]:`, {
              hasCamera: !!cameraStreamObj,
              hasScreen: !!screenStreamObj,
              tracksInPeerMetadata: peer.tracks
            });
            return (
              <React.Fragment key={peer.sessionId || peer.socketId || idx}>
                {/* Camera Card */}
                <div className="stream-card">
                  {cameraStreamObj ? (
                    <video
                      autoPlay
                      playsInline
                      ref={el => {
                        if (el && el.srcObject !== cameraStreamObj.stream) {
                          el.srcObject = cameraStreamObj.stream;
                          el.play().catch(err => console.warn("Remote camera video play error:", err));
                        }
                      }}
                    />
                  ) : (
                    <div className="offline-state">
                      <div className="user-avatar">P{idx + 1}</div>
                      <div className="offline-text">Connecting media feed...</div>
                    </div>
                  )}
                  <div className="participant-badge">
                    <span className="status-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                    </span> Participant {idx + 1}
                  </div>
                </div>

                {/* Screen Share Card (if active) */}
                {screenStreamObj && (
                  <div className="stream-card">
                    <video
                      autoPlay
                      playsInline
                      ref={el => {
                        if (el && el.srcObject !== screenStreamObj.stream) {
                          el.srcObject = screenStreamObj.stream;
                          el.play().catch(err => console.warn("Remote screen video play error:", err));
                        }
                      }}
                    />
                    <div className="participant-badge">
                      <span className="status-icon">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
                      </span> P{idx + 1}'s Screen
                    </div>
                  </div>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Control Dock */}
      <div className="call-controls-dock">
        <button
          className={`dock-btn ${!isMicOn ? 'off' : ''}`}
          onClick={toggleMic}
          title={isMicOn ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {isMicOn ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>
          )}
        </button>

        <button
          className={`dock-btn ${!isCameraOn ? 'off' : ''}`}
          onClick={toggleCamera}
          title={isCameraOn ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {isCameraOn ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
          )}
        </button>

        <button
          className={`dock-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={toggleScreenShare}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg>
        </button>

        <button className="dock-btn leave" onClick={onLeaveRoom}>
          Leave Call
        </button>
      </div>
    </div>
  );
};
