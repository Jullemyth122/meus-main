import React, { useState, useEffect } from 'react';
import { Navbar } from './Navbar';
import { HomePage } from './HomePage';
import { RoomPage } from './RoomPage';
import './videogroup.scss';

export const VideoGroupApp: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'home' | 'calls' | 'account'>('home');
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Toggle HTML theme attribute for dark/light themes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleToggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleJoinRoom = (code: string) => {
    setActiveRoomCode(code);
    setCurrentTab('calls');
  };

  const handleLeaveRoom = () => {
    setActiveRoomCode(null);
    setCurrentTab('home');
  };

  return (
    <div className="meus-app">
      <Navbar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          if (tab === 'home') setActiveRoomCode(null);
          setCurrentTab(tab);
        }}
        theme={theme}
        onToggleTheme={handleToggleTheme}
      />

      <main style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {activeRoomCode ? (
          <RoomPage roomCode={activeRoomCode} onLeaveRoom={handleLeaveRoom} />
        ) : (
          <>
            {(currentTab === 'home' || currentTab === 'calls') && (
              <HomePage onJoinRoom={handleJoinRoom} />
            )}

            {currentTab === 'account' && (
              <div className="meus-home-wrapper">
                <div className="interactive-call-card" style={{ textAlign: 'center' }}>
                  <div className="card-title-section">
                    <h2>Account Authentication</h2>
                    <p>Welcome to Meus! Sign-in and account profiles coming soon.</p>
                  </div>
                  <button
                    className="cta-btn primary"
                    onClick={() => setCurrentTab('home')}
                  >
                    Return to Home
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default VideoGroupApp;
