import React, { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../config/api';
import './videoshare.scss';

interface VideoAndShareScreenProps {
    onConnectionChange?: (connected: boolean) => void;
}

export const VideoAndShareScreen: React.FC<VideoAndShareScreenProps> = ({ onConnectionChange }) => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const screenVideoRef = useRef<HTMLVideoElement>(null);

    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const screenSendersRef = useRef<RTCRtpSender[]>([]);
    const sessionIdRef = useRef<string | null>(null);

    const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
    const [isSharingScreen, setIsSharingScreen] = useState<boolean>(false);
    const [errorMessage, setErrorMessage] = useState<string>('');

    // Safely attach the screen stream once React mounts the video element.
    useEffect(() => {
        if (isSharingScreen && screenStreamRef.current && screenVideoRef.current) {
            screenVideoRef.current.srcObject = screenStreamRef.current;
        }
    }, [isSharingScreen])

    // Reusable track renegotiation helper
    const renegotiateTracks = async (pc: RTCPeerConnection, sessionId: string) => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        const response = await fetch(`${BACKEND_URL}/api/session/${sessionId}/tracks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sdp: pc.localDescription?.sdp })
        });

        if (!response.ok) {
            throw new Error(`Track renegotiation failed: ${response.statusText}`);
        }

        const tracksData = await response.json();
        await pc.setRemoteDescription(new RTCSessionDescription({
            type: 'answer',
            sdp: tracksData.sessionDescription.sdp
        }));
    };

    const startBroadcast = async () => {
        setStatus('connecting');
        setErrorMessage('');

        try {
            // 1. Acquire Camera & Microphone
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: 'user' },
                audio: true,
            });

            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // 2. Setup Peer Connection
            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
            });
            peerConnectionRef.current = pc;

            stream.getTracks().forEach((track) => {
                pc.addTrack(track, stream);
            });

            // 3. Creating offer and  local Description (in short SDP).
            const offer1 = await pc.createOffer();
            await pc.setLocalDescription(offer1);

            const sessionResponse = await fetch(`${BACKEND_URL}/api/session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdp: pc.localDescription?.sdp })
            });

            if (!sessionResponse.ok) {
                throw new Error(`Session creation failed: ${sessionResponse.statusText}`);
            }

            const sessionData = await sessionResponse.json();
            sessionIdRef.current = sessionData.sessionId;

            // Answerion the current sessionData
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: sessionData.sessionDescription.sdp
            }));

            // STAGE 2: Publish Initial Tracks
            await renegotiateTracks(pc, sessionData.sessionId);

            setStatus('streaming');
            if (onConnectionChange) onConnectionChange(true);

        } catch (err: any) {
            console.error('Handshake failed:', err);
            setStatus('error');
            setErrorMessage(err.message || 'Could not connect to SFU.');
            stopBroadcast();
        }
    };

    const startScreenShare = async () => {
        if (!peerConnectionRef.current || !sessionIdRef.current) return;

        try {
            // Capture the screen display
            const screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                // audio: false // Set true if you want to forward system audio
                audio: true // Set true if you want to forward system audio
            });

            screenStreamRef.current = screenStream;


            const senders: RTCRtpSender[] = [];
            screenStream.getTracks().forEach(track => {
                const sender = peerConnectionRef.current!.addTrack(track, screenStream);
                senders.push(sender);

                // Detect when user clicks native browser "Stop Sharing" bubble
                track.onended = () => {
                    stopScreenShare();
                };
            });
            screenSendersRef.current = senders;

            // Trigger a renegotiation cycle to inform Cloudflare of the new tracks
            await renegotiateTracks(peerConnectionRef.current, sessionIdRef.current);
            setIsSharingScreen(true);

        } catch (err) {
            console.error("Failed to acquire screen share:", err);
        }
    };

    const stopScreenShare = async (skipRenegotiation: boolean = false) => {
        if (screenStreamRef.current) {
            screenStreamRef.current.getTracks().forEach(track => track.stop());
            screenStreamRef.current = null;
        }

        if (screenVideoRef.current) {
            screenVideoRef.current.srcObject = null;
        }

        if (!skipRenegotiation && peerConnectionRef.current && screenSendersRef.current.length > 0) {
            screenSendersRef.current.forEach(sender => {
                try {
                    peerConnectionRef.current?.removeTrack(sender);
                } catch (e) { }
            });
            screenSendersRef.current = [];

            // Renegotiate track layout down to just the camera feeds
            try {
                if (sessionIdRef.current && peerConnectionRef.current) {
                    await renegotiateTracks(peerConnectionRef.current, sessionIdRef.current);
                }
            } catch (err) {
                console.error("Failed to renegotiate track removal:", err);
            }
        } else {
            screenSendersRef.current = [];
        }

        setIsSharingScreen(false);
    };

    const stopBroadcast = () => {
        stopScreenShare(true);

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        sessionIdRef.current = null;
        setIsSharingScreen(false);
        setStatus('idle');
        if (onConnectionChange) onConnectionChange(false);
    };

    return (
        <div className="broadcast-container">
            <div className={`video-grid ${isSharingScreen ? 'dual-view' : 'single-view'}`}>
                {/* Camera Viewport */}
                <div className="video-wrapper">
                    <video ref={localVideoRef} autoPlay muted playsInline className="video-stream" />
                    {status === 'streaming' && <div className="live-badge">● LIVE CAMERA</div>}
                    {status === 'connecting' && <div className="overlay">Connecting Feed...</div>}
                    {status === 'idle' && <div className="overlay">Camera Offline</div>}
                </div>

                {/* Screen Share Viewport */}
                {isSharingScreen && (
                    <div className="video-wrapper">
                        <video ref={screenVideoRef} autoPlay muted playsInline className="video-stream" />
                        <div className="live-badge screen-badge">● SCREEN SHARE</div>
                    </div>
                )}
            </div>

            {errorMessage && (
                <div className="error-alert">
                    <strong>Error:</strong> {errorMessage}
                </div>
            )}

            <div className="control-panel">
                {status !== 'streaming' ? (
                    <button onClick={startBroadcast} disabled={status === 'connecting'} className="btn btn-primary">
                        {status === 'connecting' ? 'Configuring WebRTC...' : 'Start Broadcaster'}
                    </button>
                ) : (
                    <>
                        <button onClick={isSharingScreen ? () => stopScreenShare() : startScreenShare} className="btn btn-secondary">
                            {isSharingScreen ? 'Stop Screen Share' : 'Share Screen'}
                        </button>
                        <button onClick={stopBroadcast} className="btn btn-danger">
                            Disconnect Stream
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};