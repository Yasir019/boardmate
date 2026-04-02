import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

import punjabLogo from '../assets/images/Panjab board.jpeg';
import sindhLogo from '../assets/images/SIndh board.jpeg';
import federalLogo from '../assets/images/Fedral board.png';
import kpkLogo from '../assets/images/KPK board.jpeg';
import balochistanLogo from '../assets/images/Balouchistan board.jpeg';
import chapterNavigationImage from '../assets/images/chapternavigation.png';

function Landing() {
  const howItWorksRef = useRef(null);
  const [stepAnimationState, setStepAnimationState] = useState('idle');

  useEffect(() => {
    const target = howItWorksRef.current;
    if (!target) {
      return undefined;
    }

    setStepAnimationState('pending');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setStepAnimationState('visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.32,
        rootMargin: '0px 0px -8% 0px',
      }
    );

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, []);

  const boardItems = [
    { name: 'Punjab Board', logo: punjabLogo },
    { name: 'Sindh Board', logo: sindhLogo },
    { name: 'Federal Board', logo: federalLogo },
    { name: 'KPK Board', logo: kpkLogo },
    { name: 'Balochistan', logo: balochistanLogo },
  ];

  const proofItems = [
    { value: '5 Boards', label: 'Board coverage at launch' },
    { value: 'Chapter-based', label: 'Study flow built around textbooks' },
    { value: '24/7', label: 'Ask questions any time' },
  ];

  return (
    <div className="landing-v2-page">
      <section id="home" className="landing-v2-hero-wrap">
        <div className="landing-v2-hero">
          <div className="landing-v2-hero-left">
            <span className="landing-v2-hero-kicker">Built for Pakistani board students</span>
            <h1>
              <span className="hero-line-one">Study your textbook</span>
              <span className="hero-line-two">with an AI tutor</span>
            </h1>
            <p>
              Ask better questions, understand faster, and stay close to your syllabus.
            </p>
            <div className="landing-v2-hero-actions">
              <Link to="/signup" className="v2-btn-primary">Start Free</Link>
              <a href="#how-it-works" className="v2-btn-secondary">See how it works</a>
            </div>
            <div className="landing-v2-proof-row" aria-label="BoardMate proof points">
              {proofItems.map((item) => (
                <div key={item.label} className="v2-proof-item">
                  <strong>{item.value}</strong>
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <aside className="landing-v2-hero-visual" aria-label="Student using AI to study">
            <div className="v2-hero-image-frame">
              <img src="/images/heroimage.png" alt="Student studying with a laptop while using AI" />
            </div>
            <div className="v2-hero-result-badge" aria-label="BoardMate study support summary">
              <span className="v2-hero-result-dot" aria-hidden="true">&#10003;</span>
              <div>
                <strong>Board + class + chapter</strong>
                <small>Faster path from question to explanation</small>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-v2-boards-strip" aria-label="Supported education boards">
        <p>Designed around Pakistan&apos;s major education boards</p>
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
        <h2>Everything students need to stay on track</h2>
        <p className="landing-v2-section-subtitle">
          Built for focused revision.
        </p>
        <div className="landing-v2-feature-grid">
          <article className="v2-feature-card">
            <div className="v2-feature-image v2-feature-image-books">
              <img src="/images/officialtexbooks.webp" alt="Official textbooks feature" />
            </div>
            <div className="v2-feature-content">
              <h3>Official Textbooks</h3>
              <p>Ground explanations in the same textbook material students are already expected to study.</p>
            </div>
          </article>
          <article className="v2-feature-card">
            <div className="v2-feature-image v2-feature-image-ai">
              <img src="/images/tutor24.jpeg" alt="AI tutor feature" />
            </div>
            <div className="v2-feature-content">
              <h3>AI Tutor 24/7</h3>
              <p>Ask follow-up questions in plain language and get quick explanations when a topic does not click the first time.</p>
            </div>
          </article>
          <article className="v2-feature-card">
            <div className="v2-feature-image v2-feature-image-chapters">
              <img src={chapterNavigationImage} alt="Chapter navigation feature" />
            </div>
            <div className="v2-feature-content">
              <h3>Chapter Navigation</h3>
              <p>Navigate by chapter so each answer stays tied to the topic the student is revising right now.</p>
            </div>
          </article>
        </div>
      </section>

      <section id="how-it-works" className="landing-v2-steps">
        <h2>How it works</h2>
        <div className="landing-v2-steps-grid">
          <div className="landing-v2-steps-copy">
            <p>
              Start with your board. End with a clearer answer.
            </p>
            <ol
              ref={howItWorksRef}
              className={`v2-steps-sequence ${stepAnimationState === 'pending' ? 'is-pending' : ''} ${stepAnimationState === 'visible' ? 'is-visible' : ''}`}
            >
              <li><span>1</span>Select your Board and Class</li>
              <li><span>2</span>Ask questions from your textbook</li>
              <li><span>3</span>Get instant AI explanations</li>
            </ol>
          </div>
          <div className="v2-steps-image-card" aria-label="Student success story">
            <img src="/images/Student.png" alt="Student writing notes while studying" />
            <div className="v2-steps-image-overlay">
              <strong>Use BoardMate beside your textbook, not instead of it.</strong>
              <small>Designed to support revision and concept clarity</small>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="landing-v2-cta-wrap">
        <div className="landing-v2-plans-head">
          <h2>Start simple</h2>
          <p>
            Choose the path that fits you best.
          </p>
        </div>
        <div className="landing-v2-plan-grid">
          <article className="v2-plan-card v2-plan-card-highlight">
            <span className="v2-plan-eyebrow">Best first step</span>
            <h3>Free account</h3>
            <p>Start asking textbook questions in minutes.</p>
            <ul>
              <li>Board, class, and subject selection</li>
              <li>Chapter-based study flow</li>
              <li>Fast AI explanations for revision</li>
            </ul>
            <Link to="/signup" className="v2-cta-btn">Create Free Account</Link>
          </article>

          <article className="v2-plan-card">
            <span className="v2-plan-eyebrow">Why it matters</span>
            <h3>Focused learning</h3>
            <p>Stay close to the exact syllabus you need to finish.</p>
            <ul>
              <li>Less context switching during revision</li>
              <li>More confidence in chapter coverage</li>
              <li>Better support for weak concepts</li>
            </ul>
            <a href="#features" className="v2-cta-btn v2-cta-btn-alt">Review Features</a>
          </article>

          <article className="v2-plan-card">
            <span className="v2-plan-eyebrow">Need access now?</span>
            <h3>Already registered</h3>
            <p>Jump back in and continue studying.</p>
            <ul>
              <li>Return to your saved session</li>
              <li>Pick up from the current subject</li>
              <li>Keep learning without setup friction</li>
            </ul>
            <Link to="/signin" className="v2-cta-btn v2-cta-btn-alt">Sign In</Link>
          </article>
        </div>
      </section>

      <footer className="bm4-footer" aria-label="BoardMate footer">
        <div className="bm4-footer-inner">
          <div className="bm4-footer-grid">
            <section className="bm4-footer-col bm4-footer-brand" aria-label="BoardMate brand">
              <h3>BoardMate</h3>
              <p>AI-assisted study support for board students who want a clearer path through official subjects and chapters.</p>
              <div className="bm4-socials" aria-label="BoardMate quick links">
                <Link to="/signup" className="bm4-social-link bm4-text-link">Sign up</Link>
                <Link to="/signin" className="bm4-social-link bm4-text-link">Sign in</Link>
              </div>
            </section>

            <section className="bm4-footer-col" aria-label="All boards">
              <h4>All Boards</h4>
              <ul>
                <li><a href="#home">Federal Board</a></li>
                <li><a href="#home">Punjab Board</a></li>
                <li><a href="#home">Sindh Board</a></li>
                <li><a href="#home">KPK Board</a></li>
                <li><a href="#home">Balochistan Board</a></li>
              </ul>
            </section>

            <section className="bm4-footer-col" aria-label="Product links">
              <h4>Product</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How it Works</a></li>
                <li><a href="#pricing">Get Started</a></li>
              </ul>
            </section>

            <section className="bm4-footer-col" aria-label="Company links">
              <h4>Company</h4>
              <ul>
                <li><a href="mailto:hello@boardmate.pk">Contact</a></li>
                <li><a href="mailto:hello@boardmate.pk?subject=BoardMate%20Support">Support</a></li>
              </ul>
            </section>
          </div>

          <div className="bm4-footer-bottom">
            <span>&copy; 2026 BoardMate</span>
            <div className="bm4-footer-bottom-links" aria-label="Legal links">
              <a href="mailto:hello@boardmate.pk?subject=BoardMate%20Privacy">Privacy</a>
              <span aria-hidden="true">&bull;</span>
              <a href="mailto:hello@boardmate.pk?subject=BoardMate%20Terms">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
