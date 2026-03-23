import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import boardMateLogo from '../assets/images/Boardmatelogo.jpg';
import { clearSession, getUser, isAuthenticated } from '../utils/auth';

function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const isLanding = location.pathname === '/';
  const isSignedIn = isAuthenticated();
  const user = getUser();

  const handleLogout = () => {
    clearSession();
    navigate('/signin');
  };

  return (
    <nav className="navbar v2-navbar">
      <div className="v2-navbar-inner">
        <div className="v2-navbar-left">
          <Link to="/" className="navbar-brand v2-navbar-brand">
            <img src={boardMateLogo} alt="BoardMate" className="v2-brand-logo" />
            <span>BoardMate</span>
          </Link>
        </div>

        <div className="v2-navbar-center">
          <a href={isLanding ? '#home' : '/#home'} className="v2-nav-link">Home</a>
          <a href={isLanding ? '#features' : '/#features'} className="v2-nav-link">Features</a>
          <a href={isLanding ? '#pricing' : '/#pricing'} className="v2-nav-link">Pricing</a>
        </div>

        <div className="v2-navbar-right">
          {!isSignedIn && <Link to="/signin" className="v2-nav-login">Login</Link>}
          {!isSignedIn && <Link to="/signup" className="v2-nav-signup">Sign Up</Link>}
          {isSignedIn && (
            <>
              <span className="v2-nav-user">{user?.full_name || 'Student'}</span>
              <button type="button" className="v2-nav-signup" onClick={handleLogout}>Logout</button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
