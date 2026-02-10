import React from 'react';
import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="landing-page">
      <div className="landing-hero">
        <h1>Welcome to BoardMate</h1>
        <p>
          Your AI-powered study companion for Pakistani board exams. 
          Get instant help with Physics, Chemistry, Biology, Mathematics, 
          and more — tailored to your specific board and class level.
        </p>
        <Link to="/dashboard" className="landing-cta">
          Get Started →
        </Link>
      </div>

      <div className="landing-features">
        <div className="feature-card">
          <h3>🎯 Board-Specific Content</h3>
          <p>Study material tailored for Sindh, Punjab, Federal, KPK, and Balochistan boards.</p>
        </div>
        <div className="feature-card">
          <h3>💬 AI Chat Assistant</h3>
          <p>Ask questions about any topic and get instant, detailed explanations.</p>
        </div>
        <div className="feature-card">
          <h3>📚 Chapter-wise Learning</h3>
          <p>Organized content by chapters for systematic and effective studying.</p>
        </div>
      </div>
    </div>
  );
}

export default Landing;
