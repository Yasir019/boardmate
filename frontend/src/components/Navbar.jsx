import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import boardMateLogo from '../assets/images/Boardmatelogo.jpg';
import { clearSession, isAuthenticated } from '../utils/auth';

const navItems = [
  { label: 'Platform', id: 'platform' },
  { label: 'Curriculum', id: 'curriculum' },
  { label: 'AI Features', id: 'features' },
  { label: 'Pricing', id: 'pricing' },
];

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const isLanding = location.pathname === '/';
  const isSignedIn = isAuthenticated();

  const sectionHref = (id) => (isLanding ? `#${id}` : `/#${id}`);

  const handleLogout = () => {
    clearSession();
    setMenuOpen(false);
    navigate('/signin');
  };

  const closeMenu = () => setMenuOpen(false);

  return (
    <nav className="navbar bm-nav">
      <div className="bm-nav-inner">
        <Link to="/" className="navbar-brand bm-nav-brand" onClick={closeMenu}>
          <img src={boardMateLogo} alt="BoardMate" className="bm-nav-logo" />
          <span>BoardMate</span>
        </Link>

        <div className="bm-nav-links" aria-label="Primary navigation">
          {navItems.map((item, index) => (
            <a
              key={item.id}
              href={sectionHref(item.id)}
              className={`bm-nav-link${isLanding && index === 0 ? ' is-active' : ''}`}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="bm-nav-actions">
          {!isSignedIn && (
            <>
              <Link to="/signin" className="bm-nav-login">Login</Link>
              <Link to="/signup" className="bm-nav-cta">Get Started</Link>
            </>
          )}
          {isSignedIn && (
            <>
              <button type="button" className="bm-nav-login" onClick={handleLogout}>Logout</button>
              <Link to="/dashboard" className="bm-nav-cta">Get Started</Link>
            </>
          )}
        </div>

        <button
          type="button"
          className="bm-nav-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-label="Toggle navigation"
        >
          Menu
        </button>
      </div>

      {menuOpen && (
        <div className="bm-nav-drawer">
          <div className="bm-nav-drawer-links">
            {navItems.map((item) => (
              <a
                key={item.id}
                href={sectionHref(item.id)}
                className="bm-nav-drawer-link"
                onClick={closeMenu}
              >
                {item.label}
              </a>
            ))}
          </div>

          <div className="bm-nav-drawer-actions">
            {!isSignedIn && (
              <>
                <Link to="/signin" className="bm-nav-login" onClick={closeMenu}>Login</Link>
                <Link to="/signup" className="bm-nav-cta" onClick={closeMenu}>Get Started</Link>
              </>
            )}
            {isSignedIn && (
              <>
                <button type="button" className="bm-nav-login" onClick={handleLogout}>Logout</button>
                <Link to="/dashboard" className="bm-nav-cta" onClick={closeMenu}>Get Started</Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar;
