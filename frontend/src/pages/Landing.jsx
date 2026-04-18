import { Link } from 'react-router-dom';
import { isAuthenticated } from '../utils/auth';

const boards = [
  {
    name: 'Punjab',
    image: new URL('../assets/images/Panjab board.jpeg', import.meta.url).href,
  },
  {
    name: 'Sindh',
    image: new URL('../assets/images/SIndh board.jpeg', import.meta.url).href,
  },
  {
    name: 'Balochistan',
    image: new URL('../assets/images/Balouchistan board.jpeg', import.meta.url).href,
  },
  {
    name: 'Federal',
    image: new URL('../assets/images/Fedral board.png', import.meta.url).href,
  },
  {
    name: 'KPK',
    image: new URL('../assets/images/KPK board.jpeg', import.meta.url).href,
  },
];

const features = [
  {
    icon: 'smart_toy',
    title: 'AI Chat Tutor (RAG)',
    description:
      'Personalized tutoring using Retrieval-Augmented Generation based on your specific textbook.',
  },
  {
    icon: 'keyboard_voice',
    title: 'Voice Interaction',
    description:
      'Speak to BoardMate in Urdu or English and learn difficult concepts through natural conversation.',
  },
  {
    icon: 'edit_note',
    title: 'Smart Notes',
    description:
      'Generate revision summaries for every chapter with formulas, key definitions, and quick recalls.',
  },
  {
    icon: 'fact_check',
    title: 'Board-Specific',
    description:
      'Aligned with Punjab, Sindh, KPK, Federal, and Balochistan curriculum expectations.',
  },
];

const journeySteps = [
  {
    number: '1',
    title: 'Select Board',
    description:
      "Choose your regional board and class level so BoardMate can tailor its explanations and exam strategy.",
  },
  {
    number: '2',
    title: 'Ask Anything',
    description:
      'Upload questions, type your confusion, or share a past-paper problem to get step-by-step help.',
  },
  {
    number: '3',
    title: 'Master Concepts',
    description:
      'Practice with mock tests and targeted revision built around historical board paper patterns.',
  },
];

const benefits = [
  'Visual concept maps for complex science topics',
  'Memory retention drills based on board patterns',
  'Solved past papers with detailed explanations',
  '24/7 access to your personal digital tutor',
];

const plans = [
  {
    name: 'Free Plan',
    price: 'PKR 0',
    cadence: '/mo',
    description: 'Perfect for occasional help.',
    featured: false,
    cta: 'Get Started',
    items: ['10 AI Chats / Day', 'Single Board Access', 'Standard Response Speed'],
  },
  {
    name: 'Premium Plan',
    price: 'PKR 1,499',
    cadence: '/mo',
    description: 'For the top-rank achievers.',
    featured: true,
    cta: 'Go Premium',
    items: [
      'Unlimited AI Chats',
      'Access to All Boards',
      'Priority AI Responses',
      'Mock Paper Generator',
    ],
  },
];

const testimonials = [
  {
    quote:
      'BoardMate helped me understand complex Organic Chemistry concepts in days that I struggled with for months. The Urdu voice support is amazing!',
    name: 'Ahmed Ali',
    role: 'Grade 12 Student, Lahore',
  },
  {
    quote:
      'As a teacher, I recommend BoardMate to my students for practice. The AI-generated mock papers are remarkably close to the actual Federal Board pattern.',
    name: 'Ms. Sara Khan',
    role: 'Lecturer, Islamabad',
  },
  {
    quote:
      'I went from a B grade to an A* in my Physics final. The smart notes feature saved me dozens of hours during revision week.',
    name: 'Zainab Jamil',
    role: 'Grade 10 Student, Karachi',
  },
];

const footerLinks = {
  Product: ['Platform', 'Curriculum', 'AI Features', 'Pricing'],
  Company: ['About Us', 'Careers'],
  Legal: ['Privacy Policy', 'Terms of Service'],
};

function Icon({ name, filled = false }) {
  return (
    <span
      className="material-symbols-outlined"
      style={{ fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 500, 'GRAD' 0, 'opsz' 24` }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

function Landing() {
  const ctaTarget = isAuthenticated() ? '/dashboard' : '/signup';
  const secondaryTarget = isAuthenticated() ? '/dashboard' : '/signin';

  return (
    <div className="page-shell">
      <main>
        <section className="hero-section" id="hero">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="eyebrow">Pakistani Board Exam Prep (Grades 9-12)</span>
              <h1>
                Master Your Board Exams with <span>AI Intelligence</span>
              </h1>
              <p>
                Leverage board-specific RAG and advanced NLP to solve past papers, clarify
                concepts, and ace your matric and intermediate finals.
              </p>
              <div className="hero-actions">
                <Link className="button button-hero" to={ctaTarget}>
                  Start Learning Free
                </Link>
                <a className="button button-muted" href="#features">
                  <Icon name="play_circle" />
                  Watch Demo
                </a>
              </div>
            </div>

            <div className="hero-visual">
              <div className="orb orb-primary" />
              <div className="hero-card">
                <img
                  src="/images/heroimage.png"
                  alt="BoardMate dashboard preview"
                />
                <div className="floating-quote">
                  <div className="status-row">
                    <span className="status-dot" />
                    <span>AI Chat Active</span>
                  </div>
                  <p>
                    &quot;BoardMate correctly identified the Physics 2023 Punjab Board pattern
                    for Section C.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="boards-strip" id="platform">
          <div className="container">
            <p className="section-kicker">Supported by Major Boards</p>
            <div className="boards-logos" aria-label="Pakistan board logos">
              {boards.map((board) => (
                <img
                  className="board-logo-img"
                  key={board.name}
                  src={board.image}
                  alt={`${board.name} board logo`}
                  loading="lazy"
                />
              ))}
            </div>
          </div>
        </section>

        <section className="section" id="features">
          <div className="container">
            <div className="section-heading">
              <h2>Everything You Need to Ace Your Exams</h2>
              <p>
                Our AI is specifically trained on Pakistani board curricula, from Karachi to
                Peshawar.
              </p>
            </div>
            <div className="feature-grid">
              {features.map((feature) => (
                <article className="feature-card" key={feature.title}>
                  <div className="icon-wrap">
                    <Icon name={feature.icon} />
                  </div>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section section-muted" id="curriculum">
          <div className="container narrow">
            <div className="section-heading centered">
              <h2>Your Path to Excellence</h2>
            </div>
            <div className="steps-list">
              {journeySteps.map((step) => (
                <article className="step-item" key={step.number}>
                  <div className="step-badge">{step.number}</div>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container split-section">
            <div className="image-column">
              <div className="orb orb-secondary" />
              <img
                className="benefit-image"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuA0CHCAdC1pyOx8-iqL4Jarlb1TsRXboI1QHO0V1nIECTBUL9sqpC8qpcQW24AoETz7sbhFs2LmcaHgGufb_SvJt4lq33YBTklQMgF8ImJthQb6aOLXNIfo3Whp5MxcMO1otE2eOFIySKLwWrduOPlkM4DMdaT9M2I6nc0bqYf8TbwgvzWdJoEf1bGQJ_xZfzTTTjhhjYfXfxPDtMG9yyxOBlksYUcHzeZW9QGT8fLCOEjfVtyEF7CCQj7V3Xals3V_Tr556SECs93l"
                alt="Student studying with BoardMate"
              />
            </div>
            <div className="benefit-copy">
              <h2>
                Don&apos;t Just Memorize,
                <br />
                <span>Actually Learn.</span>
              </h2>
              <div className="benefit-list">
                {benefits.map((benefit) => (
                  <div className="benefit-item" key={benefit}>
                    <Icon name="check_circle" />
                    <p>{benefit}</p>
                  </div>
                ))}
              </div>
              <Link className="button button-primary" to={ctaTarget}>
                Experience BoardMate AI
              </Link>
            </div>
          </div>
        </section>

        <section className="section section-muted" id="pricing">
          <div className="container narrow">
            <div className="section-heading centered">
              <h2>Invest in Your Future</h2>
              <p>Simple plans for every student&apos;s budget.</p>
            </div>
            <div className="pricing-grid">
              {plans.map((plan) => (
                <article
                  className={`pricing-card${plan.featured ? ' pricing-card-featured' : ''}`}
                  key={plan.name}
                >
                  {plan.featured && <div className="pricing-ribbon">Recommended</div>}
                  <h3>{plan.name}</h3>
                  <p className="pricing-description">{plan.description}</p>
                  <div className="pricing-value">
                    {plan.price} <span>{plan.cadence}</span>
                  </div>
                  <ul>
                    {plan.items.map((item) => (
                      <li key={item}>
                        <Icon name="check" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={`button ${plan.featured ? 'button-hero' : 'button-outline'}`}
                    to={ctaTarget}
                  >
                    {plan.cta}
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section-heading centered">
              <h2>Results Speak Louder</h2>
            </div>
            <div className="testimonial-grid">
              {testimonials.map((testimonial) => (
                <article className="testimonial-card" key={testimonial.name}>
                  <div className="stars" aria-label="5 star rating">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Icon key={`${testimonial.name}-${index + 1}`} name="star" filled />
                    ))}
                  </div>
                  <p className="testimonial-quote">&quot;{testimonial.quote}&quot;</p>
                  <div className="testimonial-person">
                    <div className="avatar" aria-hidden="true" />
                    <div>
                      <strong>{testimonial.name}</strong>
                      <span>{testimonial.role}</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="cta-panel" id="cta">
              <div className="cta-grid" aria-hidden="true" />
              <h2>
                Start Your AI Learning
                <br />
                Journey Today
              </h2>
              <p>
                Join thousands of Pakistani students using BoardMate to transform their board exam
                preparation.
              </p>
              <div className="hero-actions centered-actions">
                <Link className="button button-light" to={ctaTarget}>
                  Start Learning Free
                </Link>
                <Link className="button button-ghost" to={secondaryTarget}>
                  Chat with BoardMate
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div className="footer-brand">
            <a className="brand footer-logo" href="#hero">
              BoardMate
            </a>
            <p>
              Empowering the next generation of Pakistan&apos;s leaders through board-specific AI
              learning technologies.
            </p>
          </div>

          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h3>{title}</h3>
              <ul className="footer-links">
                {links.map((link) => (
                  <li key={link}>
                    <a href="#hero">{link}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="container footer-bottom">
          <p>Copyright 2024 BoardMate. All rights reserved.</p>
          <div className="social-links">
            <a href="#hero">Twitter</a>
            <a href="#hero">LinkedIn</a>
            <a href="#hero">Instagram</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
