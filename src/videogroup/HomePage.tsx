import React, { useState } from 'react';

interface HomePageProps {
  onJoinRoom: (roomCode: string) => void;
}

const generateFriendlyRoomCode = (): string => {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const HomePage: React.FC<HomePageProps> = ({ onJoinRoom }) => {
  const [roomCode, setRoomCode] = useState<string>(() => generateFriendlyRoomCode());

  const handleRefreshCode = () => {
    setRoomCode(generateFriendlyRoomCode());
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9);
    setRoomCode(val);
  };

  const handleAction = () => {
    if (roomCode.trim()) {
      onJoinRoom(roomCode.trim());
    }
  };

  return (
    <div className="meus-home-wrapper">
      <div className="home-split-layout">

        {/* Left Side: Emotional Text Content */}
        <div className="hero-content">
          <div className="sparkle-badge">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" /></svg>
            <span>Where Conversations Come Alive</span>
          </div>

          <h1 className="hero-title">
            Me & Us <br />
            <span className="italic-highlight">talking to each other,</span> <br />
            sharing the happiness.
          </h1>

          <p className="hero-subtitle">
            Jump into a room, see your friends, and share the moments that matter. A place designed for effortless and entertaining connections.
          </p>

          <div className="features-list">
            <div className="feature-item">
              <div className="feature-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg></div>
              <span>Instant Rooms</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" ry="2" /></svg></div>
              <span>HD Video</span>
            </div>
            <div className="feature-item">
              <div className="feature-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg></div>
              <span>Screen Share</span>
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Card */}
        <div className="home-card-content">
          <div className="interactive-call-card">
            <div className="card-title-section">
              <h2>Start a Gathering</h2>
              <p>Enter an 8-character key or generate a fresh one</p>
            </div>

            <div className="code-input-block">
              <div className="input-label">
                <span>YOUR ROOM KEY</span>
                <span>8 CHARS</span>
              </div>
              <div className="code-field-wrapper">
                <input
                  type="text"
                  value={roomCode}
                  onChange={handleInputChange}
                  placeholder="e.g. K8X2-M9P4"
                  maxLength={9}
                />
                <button
                  type="button"
                  className="refresh-btn"
                  onClick={handleRefreshCode}
                  title="Generate new room code"
                >
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="cta-group">
              <button
                className="cta-btn primary"
                onClick={handleAction}
                disabled={!roomCode.trim()}
              >
                <span>Start Call</span>
              </button>
              <button
                className="cta-btn secondary"
                onClick={handleAction}
                disabled={!roomCode.trim()}
              >
                <span>Join Room</span>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
