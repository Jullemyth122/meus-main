import React, { useRef, useState } from 'react';
import './video.scss';

interface VideoBroadcastProps {
    onConnectionChange?: (connected: boolean) => void;
}

export const VideoBroadcast: React.FC<VideoBroadcastProps> = ({ onConnectionChange }) => {
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string>('');

    const startBroadcast = async () => {
        setStatus('connecting');
        setErrorMessage('');

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720, facingMode: 'user' },
                audio: true,
            });

            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            const pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }]
            });
            peerConnectionRef.current = pc;

            stream.getTracks().forEach((track) => {
                pc.addTrack(track, stream);
            });

            // STAGE 1: Create Session
            const offer1 = await pc.createOffer();
            await pc.setLocalDescription(offer1);

            const sessionResponse = await fetch('http://localhost:6003/api/session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdp: pc.localDescription?.sdp })
            });

            if (!sessionResponse.ok) {
                throw new Error(`Session creation failed: ${sessionResponse.statusText}`);
            }

            const sessionData = await sessionResponse.json();
            const sessionId = sessionData.sessionId;

            // Apply Cloudflare's first answer to clear the stable state
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: sessionData.sessionDescription.sdp
            }));

            // STAGE 2: Publish Tracks (Renegotiation)
            // We must generate a FRESH offer now that the connection configuration has shifted
            const offer2 = await pc.createOffer();
            await pc.setLocalDescription(offer2);

            const tracksResponse = await fetch(`http://localhost:6003/api/session/${sessionId}/tracks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sdp: pc.localDescription?.sdp })
            });

            if (!tracksResponse.ok) {
                throw new Error(`Track registration failed: ${tracksResponse.statusText}`);
            }

            const tracksData = await tracksResponse.json();

            // Apply Cloudflare's second answer to finish negotiation
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'answer',
                sdp: tracksData.sessionDescription.sdp
            }));

            setStatus('streaming');
            if (onConnectionChange) onConnectionChange(true);

        } catch (err: any) {
            console.error('Handshake failed:', err);
            setStatus('error');
            setErrorMessage(err.message || 'Could not connect to SFU.');
            stopBroadcast();
        }
    };

    const stopBroadcast = () => {
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

        setStatus('idle');
        if (onConnectionChange) onConnectionChange(false);
    };

    return (
        <div className="broadcast-card">
            <div className="video-wrapper">
                <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    playsInline
                    className="video-stream"
                />
                {status === 'streaming' && <div className="live-badge">● LIVE</div>}
                {status === 'connecting' && <div className="overlay">Establishing Link...</div>}
                {status === 'idle' && <div className="overlay">Camera Offline</div>}
            </div>

            {errorMessage && (
                <div className="error-alert">
                    <strong>Error:</strong> {errorMessage}
                </div>
            )}

            <div className="control-panel">
                {status !== 'streaming' ? (
                    <button
                        onClick={startBroadcast}
                        disabled={status === 'connecting'}
                        className="btn btn-primary"
                    >
                        {status === 'connecting' ? 'Configuring WebRTC...' : 'Start Broadcaster'}
                    </button>
                ) : (
                    <button
                        onClick={stopBroadcast}
                        className="btn btn-danger"
                    >
                        Disconnect Stream
                    </button>
                )}
            </div>
        </div>
    );
};