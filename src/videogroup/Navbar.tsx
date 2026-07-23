import React from 'react';

interface NavbarProps {
  currentTab: 'home' | 'calls' | 'account';
  onSelectTab: (tab: 'home' | 'calls' | 'account') => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  theme,
  onToggleTheme
}) => {
  return (
    <header className="meus-navbar">
      {/* Brand Logo & Name */}
      <div className="nav-brand" onClick={() => onSelectTab('home')}>
        <div className="brand-logo-icon">MU</div>
        <div className="brand-text">
          <div className="brand-name">Me<span>us</span></div>
          <div className="brand-slogan">Connecting Me & Us</div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="nav-links">
        <button
          className={`nav-item ${currentTab === 'home' ? 'active' : ''}`}
          onClick={() => onSelectTab('home')}
        >
          Home
        </button>
        <button
          className={`nav-item ${currentTab === 'calls' ? 'active' : ''}`}
          onClick={() => onSelectTab('calls')}
        >
          Group Calls
        </button>
        <button
          className={`nav-item ${currentTab === 'account' ? 'active' : ''}`}
          onClick={() => onSelectTab('account')}
        >
          Account
        </button>
      </nav>

      {/* Right Actions */}
      <div className="nav-right-actions">
        <button
          className="theme-toggle"
          onClick={onToggleTheme}
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
          )}
        </button>
        <button
          className="auth-btn"
          onClick={() => onSelectTab('account')}
        >
          Sign In
        </button>
      </div>
    </header>
  );
};
