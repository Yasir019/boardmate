import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import ChatLayout from './pages/ChatLayout';
import SignIn from './pages/SignIn';
import SignUp from './pages/SignUp';
import NotFound from './pages/NotFound';
import { isAuthenticated } from './utils/auth';
import './styles/global.css';
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
  return (
    <div className="app">
      <Navbar />
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
