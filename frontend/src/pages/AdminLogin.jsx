import { useState } from 'react';
import { api } from '../api/client';
import { clearAdminAccess, hasAdminAccess, setAdminAccess } from '../utils/auth';

function AdminLogin() {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(hasAdminAccess());

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      await api.adminSignIn(username, password);
      setAdminAccess();
      setIsLoggedIn(true);
      setPassword('');
    } catch (submitError) {
      setError(submitError.message || 'Admin sign in failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleLogout() {
    clearAdminAccess();
    setIsLoggedIn(false);
    setPassword('');
    setError('');
  }

  if (isLoggedIn) {
    return (
      <main className="admin-shell">
        <section className="admin-panel">
          <div className="admin-panel-copy">
            <p className="admin-kicker">Admin Portal</p>
            <h1>Admin basic page</h1>
            <p>This page is ready and intentionally minimal for now.</p>
          </div>

          <div className="admin-panel-actions">
            <div className="admin-stat-card">
              <span className="admin-stat-label">Status</span>
              <strong>Logged in</strong>
              <p>Username: admin</p>
            </div>

            <div className="admin-stat-card">
              <span className="admin-stat-label">Workspace</span>
              <strong>BoardMate</strong>
              <p>Design aligned with the main app.</p>
            </div>
          </div>

          <button type="button" className="button button-primary admin-action-btn" onClick={handleLogout}>
            Log out
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-page admin-auth-page">
      <section className="auth-card admin-auth-card">
        <p className="admin-kicker">Admin Portal</p>
        <h1>Admin login</h1>
        <p>Use the seeded admin account to access this page.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-username">Username</label>
          <input
            id="admin-username"
            name="username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="admin-password">Password</label>
          <input
            id="admin-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error ? <p className="auth-error">{error}</p> : null}

          <button type="submit" className="button button-primary admin-action-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

export default AdminLogin;
