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
    title: 'Quizz Generator',
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
    cta: 'Soon',
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
      'BoardMate helped me revise chapter concepts quickly and improved my exam confidence with clean summaries and practice flow.',
    name: 'Jahanzaib Alamgeer',
    role: 'Grade 12 Student',
    image: '/images/JahanzaibAlamgeer.jpeg',
    rating: 5,
  },
  {
    quote:
      'The platform keeps me focused on board-style preparation and makes difficult topics easier to understand.',
    name: 'Muneeb Younis',
    role: 'Student',
    image: '/images/MuneebYounis.jpeg',
    rating: 4,
  },
  {
    quote:
      'Practice tools and chapter-wise support made my prep more consistent and my paper attempts more accurate.',
    name: 'sameer ahmed',
    role: 'Student',
    image: '/images/SameerAhmed.jpeg',
    rating: 4,
  },
];

const footerSections = [
  {
    title: 'All Boards',
    links: [
      { label: 'Panjab', href: 'https://hed.punjab.gov.pk/' },
      { label: 'Sindh', href: 'https://www.bsek.edu.pk/' },
      { label: 'KPK', href: 'https://www.bisep.edu.pk/' },
      { label: 'Balouchistan', href: '#hero' },
      { label: 'Fedral', href: 'https://www.fbise.edu.pk/' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '#hero' },
      { label: 'Careers', disabled: true },
    ],
  },
  {
    title: 'Contact Us',
    links: [
      {
        label: 'Email',
        value: 'muhammadyasirali.ai@gmail.com',
        href: 'mailto:muhammadyasirali.ai@gmail.com',
        icon: 'mail',
      },
      {
        label: 'Phone',
        value: '03041529500',
        href: 'tel:03041529500',
        icon: 'call',
      },
    ],
  },
];

function Icon({ name, filled = false, className = '' }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`.trim()}
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
          <div className="container hero-grid hero-grid-centered">
            <div className="hero-copy hero-copy-centered">
              <h1>
                Master Your Board Exams with <span className="hero-highlight-ai">AI</span>
              </h1>
              <p>
                Board-specific learning, AI chat, quizzes, summaries, and past paper solving - all in one workspace.
              </p>
              <div className="hero-actions">
                <Link className="button button-hero" to={ctaTarget}>
                  Start Learning Free
                </Link>
                <a className="button button-hero-secondary" href="#features">
                  <Icon name="play_circle" />
                  Watch Demo
                </a>
              </div>
            </div>

            <div className="hero-showcase" role="presentation">
              <div className="hero-showcase-frame">
                <img
                  src="/images/HEro.png"
                  alt="BoardMate dashboard with chapters, chat, and studio"
                />
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
                src="/images/Student.png"
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
              <Link className="button button-hero" to={ctaTarget}>
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
                  {plan.featured ? (
                    <button
                      type="button"
                      className="button button-disabled"
                      disabled
                    >
                      {plan.cta}
                    </button>
                  ) : (
                    <Link
                      className="button button-hero"
                      to={ctaTarget}
                    >
                      {plan.cta}
                    </Link>
                  )}
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
                  <div className="stars" aria-label={`${testimonial.rating} star rating`}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <Icon
                        key={`${testimonial.name}-${index + 1}`}
                        name="star"
                        filled={index < testimonial.rating}
                        className={index < testimonial.rating ? 'star-filled' : 'star-empty'}
                      />
                    ))}
                  </div>
                  <p className="testimonial-quote">&quot;{testimonial.quote}&quot;</p>
                  <div className="testimonial-person">
                    <img className="avatar" src={testimonial.image} alt={testimonial.name} loading="lazy" />
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
              <img className="brand-icon footer-brand-icon" src="/images/book.png" alt="BoardMate" />
              <span className="brand-wordmark"><span className="brand-board">Board</span><span className="brand-mate">Mate</span></span>
            </a>
            <p>
              Empowering the next generation of Pakistan&apos;s leaders through board-specific AI
              learning technologies.
            </p>
          </div>

          {footerSections.map((section) => (
            <div key={section.title}>
              <h3>{section.title}</h3>
              <ul className="footer-links">
                {section.links.map((link) => (
                  <li key={link.label}>
                    {link.disabled ? (
                      <span className="footer-link-disabled" aria-disabled="true">{link.label}</span>
                    ) : link.to ? (
                      <Link to={link.to}>{link.label}</Link>
                    ) : (
                      link.value ? (
                        <div className="footer-contact-row">
                          {link.icon ? (
                            <span className="footer-contact-icon" aria-hidden="true">
                              <Icon name={link.icon} />
                            </span>
                          ) : null}
                          <span className="footer-contact-text">
                            <span className="footer-contact-label">{link.label}</span>
                            <a className="footer-contact-value-link" href={link.href || '#hero'}>
                              {link.value}
                            </a>
                          </span>
                        </div>
                      ) : (
                        <a
                          href={link.href || '#hero'}
                          target={link.href?.startsWith('http') ? '_blank' : undefined}
                          rel={link.href?.startsWith('http') ? 'noreferrer' : undefined}
                        >
                          {link.label}
                        </a>
                      )
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="container footer-bottom">
          <p>Copyright 2024 BoardMate. All rights reserved.</p>
          <div className="social-links">
            <a href="https://www.linkedin.com/in/muhammad-yasir-ali-34143b266" target="_blank" rel="noreferrer">LinkedIn</a>
            <a href="https://x.com/Yasir_023" target="_blank" rel="noreferrer">Twitter</a>
            <a href="https://github.com/Yasir019" target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default Landing;
