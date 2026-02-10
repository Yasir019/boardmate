import React from 'react';
import { Link, useLocation } from 'react-router-dom';

function Navbar() {
  const location = useLocation();

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        <span>📚</span>
        BoardMate
      </Link>
      <div className="navbar-links">
        <Link 
          to="/" 
          className={`navbar-link ${isActive('/') && location.pathname === '/' ? 'active' : ''}`}
        >
          Home
        </Link>
        <Link 
          to="/dashboard" 
          className={`navbar-link ${isActive('/dashboard') || isActive('/chat') ? 'active' : ''}`}
        >
          Dashboard
        </Link>
      </div>
    </nav>
  );
}

export default Navbar;
