import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

import punjabLogo from '../assets/images/Panjab board.jpeg';
import sindhLogo from '../assets/images/SIndh board.jpeg';
import federalLogo from '../assets/images/Fedral board.png';
import kpkLogo from '../assets/images/KPK board.jpeg';
import balochistanLogo from '../assets/images/Balouchistan board.jpeg';
import officialTextbooksImage from '../assets/images/Official Textbooks.png';
import aiTutorImage from '../assets/images/AI Tutor 247.png';
import chapterNavigationImage from '../assets/images/chapternavigation.png';

function Landing() {
  const boardItems = [
    { name: 'Punjab Board', logo: punjabLogo },
    { name: 'Sindh Board', logo: sindhLogo },
    { name: 'Federal Board', logo: federalLogo },
    { name: 'KPK Board', logo: kpkLogo },
    { name: 'Balochistan', logo: balochistanLogo },
  ];

  return (
    <div className="landing-v2-page">
      <section id="home" className="landing-v2-hero-wrap">
        <div className="landing-v2-hero">
          <div className="landing-v2-hero-left">
            <span className="landing-v2-hero-kicker">Revolutionizing Study Sessions</span>
            <h1>
              <span className="hero-line-one">Your board exam</span>
              <span className="hero-line-middle">success,</span>
              <span className="hero-line-two">powered by AI</span>
            </h1>
            <p>
              Turn textbook content into interactive mastery. BoardMate AI transforms the way you study, providing precision guidance through every chapter of your journey.
            </p>
            <div className="landing-v2-hero-actions">
              <Link to="/signup" className="v2-btn-primary">Start Free Trial</Link>
              <Link to="/signin" className="v2-btn-secondary">How it works</Link>
            </div>
          </div>

          <aside className="landing-v2-hero-visual" aria-label="Student using AI to study">
            <div className="v2-hero-image-frame">
              <img src="/images/TCF.jpg" alt="Student studying with a laptop while using AI" />
            </div>
            <div className="v2-hero-result-badge" aria-label="Student pass rate increase">
              <span className="v2-hero-result-dot" aria-hidden="true">✓</span>
              <div>
                <strong>98%</strong>
                <small>Pass Rate Increase</small>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-v2-boards-strip" aria-label="Supported education boards">
        <p>Trusted by students across all major boards</p>
        <div className="v2-carousel">
          <div className="v2-carousel-track">
            <div className="v2-carousel-group">
              {boardItems.map((board) => (
                <div key={board.name} className="v2-board-chip">
                  <img src={board.logo} alt={board.name} />
                  <span>{board.name}</span>
                </div>
              ))}
            </div>
            <div className="v2-carousel-group" aria-hidden="true">
              {boardItems.map((board) => (
                <div key={`${board.name}-clone`} className="v2-board-chip">
                  <img src={board.logo} alt={board.name} />
                  <span>{board.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="landing-v2-features">
        <h2>Precision Tools for Perfection</h2>
        <p className="landing-v2-section-subtitle">
          Everything you need to master your curriculum, curated by AI and backed by official resources.
        </p>
        <div className="landing-v2-feature-grid">
          <article className="v2-feature-card">
            <div className="v2-feature-image v2-feature-image-books">
              <img src={officialTextbooksImage} alt="Official textbooks feature" />
            </div>
            <div className="v2-feature-content">
              <h3>Official Textbooks</h3>
              <p>AI trained on official board textbooks for accurate answers.</p>
            </div>
          </article>
          <article className="v2-feature-card">
            <div className="v2-feature-image v2-feature-image-ai">
              <img src={aiTutorImage} alt="AI tutor feature" />
            </div>
            <div className="v2-feature-content">
              <h3>AI Tutor 24/7</h3>
              <p>Ask any question anytime and get instant explanations.</p>
            </div>
          </article>
          <article className="v2-feature-card">
            <div className="v2-feature-image v2-feature-image-chapters">
              <img src={chapterNavigationImage} alt="Chapter navigation feature" />
            </div>
            <div className="v2-feature-content">
              <h3>Chapter Navigation</h3>
              <p>Jump between chapters and ask questions about specific topics.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="landing-v2-steps">
        <h2>The Path to Mastery is Simple</h2>
        <div className="landing-v2-steps-grid">
          <div className="landing-v2-steps-copy">
            <p>
              We simplified the flow into three focused steps so students can move from confusion to clarity, faster.
            </p>
            <ol>
              <li><span>1</span>Select your Board and Class</li>
              <li><span>2</span>Ask questions from your textbook</li>
              <li><span>3</span>Get instant AI explanations</li>
            </ol>
          </div>
          <div className="v2-steps-image-card" aria-label="Student success story">
            <img src="/images/TCF.jpg" alt="Student writing notes while studying" />
            <div className="v2-steps-image-overlay">
              <strong>"BoardMate helped me improve one of my weakest subjects in weeks."</strong>
              <small>Student Success Story</small>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-v2-cta-wrap">
        <div className="landing-v2-cta-card">
          <h2>Start Passing Today.</h2>
          <p>Join thousands of students improving their board exam performance with BoardMate AI.</p>
          <div className="landing-v2-cta-actions">
            <Link to="/signup" className="v2-cta-btn">Get Started for Free</Link>
            <Link to="/signin" className="v2-cta-btn v2-cta-btn-alt">View All Plans</Link>
          </div>
        </div>
      </section>

      <footer className="bm4-footer" aria-label="BoardMate footer">
        <div className="bm4-footer-inner">
          <div className="bm4-footer-grid">
            <section className="bm4-footer-col bm4-footer-brand" aria-label="BoardMate brand">
              <h3>BoardMate</h3>
              <p>AI-powered platform helping students master board exams.</p>
              <div className="bm4-socials" aria-label="Social links">
                <a href="#" aria-label="BoardMate on Instagram" className="bm4-social-link">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.2 2h9.6A5.2 5.2 0 0122 7.2v9.6a5.2 5.2 0 01-5.2 5.2H7.2A5.2 5.2 0 012 16.8V7.2A5.2 5.2 0 017.2 2zm0 1.9a3.3 3.3 0 00-3.3 3.3v9.6a3.3 3.3 0 003.3 3.3h9.6a3.3 3.3 0 003.3-3.3V7.2a3.3 3.3 0 00-3.3-3.3H7.2zm10.2 1.5a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zM12 7a5 5 0 110 10 5 5 0 010-10zm0 1.9a3.1 3.1 0 100 6.2 3.1 3.1 0 000-6.2z" />
                  </svg>
                </a>
                <a href="#" aria-label="BoardMate on LinkedIn" className="bm4-social-link">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M6.8 8.1H3.7V20h3.1V8.1zM5.2 2.7a1.8 1.8 0 100 3.6 1.8 1.8 0 000-3.6zM20.3 13.3c0-3.4-1.8-5.4-4.6-5.4-2.2 0-3.1 1.2-3.6 2v-1.8H9V20h3.1v-6.1c0-1.6.3-3.2 2.3-3.2 2 0 2 1.9 2 3.3V20h3.1l-.2-6.7z" />
                  </svg>
                </a>
                <a href="#" aria-label="BoardMate on GitHub" className="bm4-social-link">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 .9a11.1 11.1 0 00-3.5 21.6c.6.1.8-.3.8-.6v-2.1c-3.3.7-4-1.4-4-1.4-.6-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.9 1.2 1.9 1.2 1.1 1.9 2.9 1.3 3.6 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.4 11.4 0 016 0c2.3-1.6 3.3-1.2 3.3-1.2.7 1.6.3 2.8.1 3.1.8.8 1.2 1.9 1.2 3.2 0 4.7-2.8 5.7-5.5 6 .4.3.8 1 .8 2.1v3.1c0 .3.2.7.8.6A11.1 11.1 0 0012 .9z" />
                  </svg>
                </a>
              </div>
            </section>

            <section className="bm4-footer-col" aria-label="All boards">
              <h4>All Boards</h4>
              <ul>
                <li><a href="#">Federal Board</a></li>
                <li><a href="#">Punjab Board</a></li>
                <li><a href="#">Sindh Board</a></li>
                <li><a href="#">KPK Board</a></li>
                <li><a href="#">Balochistan Board</a></li>
              </ul>
            </section>

            <section className="bm4-footer-col" aria-label="Product links">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#home">How it Works</a></li>
              </ul>
            </section>

            <section className="bm4-footer-col" aria-label="Company links">
              <h4>Company</h4>
              <ul>
                <li><a href="#">Contact</a></li>
                <li><a href="#">Terms</a></li>
              </ul>
            </section>
          </div>

          <div className="bm4-footer-bottom">
            <span>© 2026 BoardMate</span>
            <div className="bm4-footer-bottom-links" aria-label="Legal links">
              <a href="#">Privacy</a>
              <span aria-hidden="true">•</span>
              <a href="#">Terms</a>
            </div>
          </div>
        </div>
      </footer>

    </div>
  );
}

export default Landing;
