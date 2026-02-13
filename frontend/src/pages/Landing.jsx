import React from 'react';
import { Link } from 'react-router-dom';

function Landing() {
  return (
    <div className="landing-page">
      {/* Hero Section */}
      <section className="landing-hero">
        <div className="hero-badge">
          <span className="badge-icon">✨</span>
          <span>AI-Powered Learning Platform</span>
        </div>
        <h1 className="hero-title">
          Master Your Board Exams with
          <span className="gradient-text"> AI-Powered Guidance</span>
        </h1>
        <p className="hero-subtitle">
          BoardMate helps Pakistani students excel in their board exams with intelligent, 
          chapter-wise learning and instant AI assistance across all subjects.
        </p>
        <div className="hero-cta">
          <Link to="/dashboard" className="btn-primary">
            Start Learning Free
            <span className="arrow">→</span>
          </Link>
          <a href="#features" className="btn-secondary">
            See How It Works
          </a>
        </div>
        <div className="hero-stats">
          <div className="stat-item">
            <div className="stat-number">5</div>
            <div className="stat-label">Boards Supported</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">7+</div>
            <div className="stat-label">Subjects Available</div>
          </div>
          <div className="stat-divider"></div>
          <div className="stat-item">
            <div className="stat-number">24/7</div>
            <div className="stat-label">AI Assistant</div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="landing-features">
        <div className="section-header">
          <h2 className="section-title">Everything You Need to Succeed</h2>
          <p className="section-subtitle">
            Powerful features designed specifically for Pakistani board students
          </p>
        </div>
        
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🎯</div>
            <h3 className="feature-title">Board-Specific Content</h3>
            <p className="feature-description">
              Tailored study material for Sindh, Punjab, Federal, KPK, and Balochistan boards. 
              Get content aligned with your exact curriculum.
            </p>
          </div>
          
          <div className="feature-card feature-highlight">
            <div className="feature-badge">Most Popular</div>
            <div className="feature-icon">🤖</div>
            <h3 className="feature-title">AI Chat Assistant</h3>
            <p className="feature-description">
              Ask any question and get instant, detailed explanations. Your personal tutor 
              available 24/7 to help you understand complex topics.
            </p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">📚</div>
            <h3 className="feature-title">Chapter-wise Learning</h3>
            <p className="feature-description">
              Systematically organized content by chapters. Navigate easily through your 
              textbooks and focus on what matters most.
            </p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">⚡</div>
            <h3 className="feature-title">Instant Answers</h3>
            <p className="feature-description">
              No more waiting or searching. Get accurate answers to your questions 
              instantly, powered by advanced AI technology.
            </p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">🎓</div>
            <h3 className="feature-title">Smart Study Plans</h3>
            <p className="feature-description">
              Navigate through subjects intelligently. Our organized structure helps 
              you track progress and stay on top of your studies.
            </p>
          </div>
          
          <div className="feature-card">
            <div className="feature-icon">🔒</div>
            <h3 className="feature-title">Always Accurate</h3>
            <p className="feature-description">
              Responses based on official textbook content. Study with confidence 
              knowing the information is reliable and curriculum-aligned.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="landing-how">
        <h2 className="section-title">How BoardMate Works</h2>
        <p className="section-subtitle">Get started in three simple steps</p>
        
        <div className="steps-container">
          <div className="step-card">
            <div className="step-number">1</div>
            <div className="step-content">
              <h3>Select Your Board & Class</h3>
              <p>Choose from Sindh, Punjab, Federal, KPK, or Balochistan board and your class level</p>
            </div>
          </div>
          
          <div className="step-arrow">→</div>
          
          <div className="step-card">
            <div className="step-number">2</div>
            <div className="step-content">
              <h3>Pick Your Subject</h3>
              <p>Select the subject you want to study - Physics, Chemistry, Biology, Math, and more</p>
            </div>
          </div>
          
          <div className="step-arrow">→</div>
          
          <div className="step-card">
            <div className="step-number">3</div>
            <div className="step-content">
              <h3>Start Learning</h3>
              <p>Ask questions, get explanations, and master your subjects with AI assistance</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="landing-cta-section">
        <div className="cta-content">
          <h2 className="cta-title">Ready to Ace Your Exams?</h2>
          <p className="cta-subtitle">
            Join thousands of students using BoardMate to achieve their academic goals
          </p>
          <Link to="/dashboard" className="btn-primary btn-large">
            Get Started Now - It's Free
            <span className="arrow">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Landing;
