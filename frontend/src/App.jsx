import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import TopNavBar from './components/TopNavBar';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import ChatLayout from './pages/ChatLayout';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import AdminLogin from './pages/AdminLogin';
import NotFound from './pages/NotFound';
import { isAuthenticated } from './utils/auth';
import './styles/landing.css';
import './styles/dashboard.css';
import './styles/chat.css';
import './styles/auth.css';

function RequireAuth({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/signin" replace />;
  }

  return children;
}

function PublicOnly({ children }) {
  if (isAuthenticated()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

function App() {
  const location = useLocation();
  const isChatRoute = location.pathname.startsWith('/chat/');
  const isAdminRoute = location.pathname.startsWith('/admin');
  const isAuthRoute = location.pathname === '/signin' || location.pathname === '/signup';
  const isLandingRoute = location.pathname === '/';
  const hideTopNav = isChatRoute || isAuthRoute || isAdminRoute;

  return (
    <div className={`app ${isChatRoute ? 'chat-route' : ''} ${isAuthRoute ? 'auth-route' : ''} ${isLandingRoute ? 'landing-route' : ''}`}>
      {!hideTopNav && <TopNavBar />}
      <div className="app-main">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route
            path="/signin"
            element={(
              <PublicOnly>
                <SignIn />
              </PublicOnly>
            )}
          />
          <Route
            path="/signup"
            element={(
              <PublicOnly>
                <SignUp />
              </PublicOnly>
            )}
          />
          <Route
            path="/dashboard"
            element={(
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            )}
          />
          <Route
            path="/admin"
            element={<AdminLogin />}
          />
          <Route
            path="/admin-login"
            element={<AdminLogin />}
          />
          <Route
            path="/chat/:board/:classLevel/:subject"
            element={(
              <RequireAuth>
                <ChatLayout />
              </RequireAuth>
            )}
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
