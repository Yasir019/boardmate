import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, isAuthenticated } from '../utils/auth';

const navItems = [
  { label: 'Home', id: 'hero' },
  { label: 'Curriculum', id: 'platform' },
  { label: 'Features', id: 'features' },
  { label: 'Pricing', id: 'pricing' },
];

function TopNavBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === '/';
  const isSignedIn = isAuthenticated();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  const handleLogout = () => {
    clearSession();
    navigate('/', { replace: true });
  };

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 1024) {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isLanding) {
      setIsScrolled(false);
      return undefined;
    }

    const handleScroll = () => {
      setIsScrolled(window.scrollY > 14);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLanding]);

  if (!isLanding) {
    return (
      <header className="topbar topbar-minimal">
        <div className="container topbar-minimal-row">
          <Link className="brand" to="/">
            <img className="brand-icon" src="/images/book.png" alt="BoardMate" />
            <span className="brand-wordmark"><span className="brand-board">Board</span><span className="brand-mate">Mate</span></span>
          </Link>
          {isSignedIn ? (
            <button type="button" className="topbar-minimal-logout" onClick={handleLogout}>
              Logout
            </button>
          ) : (
            <Link className="topbar-back-link" to="/signin">
              Login
            </Link>
          )}
        </div>
      </header>
    );
  }

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className={`topbar ${isLanding ? 'topbar-landing' : ''} ${isScrolled ? 'is-scrolled' : ''}`}>
      <div className="container nav-row">
        <Link className="brand" to="/">
          <img className="brand-icon" src="/images/book.png" alt="BoardMate" />
          <span className="brand-wordmark"><span className="brand-board">Board</span><span className="brand-mate">Mate</span></span>
        </Link>

        <nav className="nav-links nav-links-desktop" aria-label="Primary">
          {navItems.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-actions topbar-actions-desktop">
          {!isSignedIn && (
            <>
              <Link className="button button-outline topbar-login" to="/signin">
                Login
              </Link>
              <Link className="button button-primary nav-cta" to="/signup">
                Get Started
              </Link>
            </>
          )}
          {isSignedIn && (
            <>
              <button type="button" className="button button-outline topbar-login" onClick={handleLogout}>
                Logout
              </button>
              <Link className="button button-primary nav-cta" to="/dashboard">
                Get Started
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          className={`landing-mobile-toggle${isMenuOpen ? ' is-open' : ''}`}
          onClick={() => setIsMenuOpen((prev) => !prev)}
          aria-expanded={isMenuOpen}
          aria-controls="landing-primary-nav-mobile"
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
        >
          <span className="landing-mobile-toggle-bar" />
          <span className="landing-mobile-toggle-bar" />
          <span className="landing-mobile-toggle-bar" />
        </button>

        <div className={`mobile-menu-drawer${isMenuOpen ? ' is-open' : ''}`}>
          <nav className="nav-links nav-links-mobile" id="landing-primary-nav-mobile" aria-label="Primary">
            {navItems.map((item) => (
              <a key={item.id} href={`#${item.id}`} onClick={closeMenu}>
                {item.label}
              </a>
            ))}
          </nav>

          <div className="topbar-actions topbar-actions-mobile">
            {!isSignedIn && (
              <>
                <Link className="button button-outline topbar-login" to="/signin" onClick={closeMenu}>
                  Login
                </Link>
                <Link className="button button-primary nav-cta" to="/signup" onClick={closeMenu}>
                  Get Started
                </Link>
              </>
            )}
            {isSignedIn && (
              <>
                <button type="button" className="button button-outline topbar-login" onClick={handleLogout}>
                  Logout
                </button>
                <Link className="button button-primary nav-cta" to="/dashboard" onClick={closeMenu}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {isMenuOpen && (
        <button
          type="button"
          className="mobile-menu-backdrop"
          onClick={() => setIsMenuOpen(false)}
          aria-label="Close menu"
        />
      )}
    </header>
  );
}

export default TopNavBar;
