import { Link, useLocation } from 'react-router-dom';

const navItems = [
  { label: 'Platform', id: 'platform' },
  { label: 'Curriculum', id: 'curriculum' },
  { label: 'AI Features', id: 'features' },
  { label: 'Pricing', id: 'pricing' },
];

function TopNavBar() {
  const location = useLocation();
  const isLanding = location.pathname === '/';

  if (!isLanding) {
    return (
      <header className="topbar topbar-minimal">
        <div className="container topbar-minimal-row">
          <Link className="topbar-back-link" to="/">
            Back to Home
          </Link>
          <Link className="brand" to="/">
            BoardMate
          </Link>
        </div>
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="container nav-row">
        <Link className="brand" to="/">
          BoardMate
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {navItems.map((item) => (
            <a key={item.id} href={`#${item.id}`}>
              {item.label}
            </a>
          ))}
        </nav>

        <div className="topbar-actions">
          <Link className="button button-outline topbar-login" to="/signin">
            Sign In
          </Link>
          <Link className="button button-primary nav-cta" to="/signup">
            Get Started
          </Link>
        </div>
      </div>
    </header>
  );
}

export default TopNavBar;
