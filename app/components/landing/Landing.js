'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Scenes from './Scenes';
import RoleTiles from './RoleTiles';
import AuthDialog from './AuthDialog';
import {
  ChevronIcon,
  MarkIcon,
} from './LandingIcons';

const SCENES = [
  {
    kicker: 'CUTTING GATE',
    title: 'Cut. Count. Verify. Sew.',
    text: 'A controlled production flow where every cutting batch is checked before it reaches sewing.',
  },
  {
    kicker: 'TRACEABLE BY DESIGN',
    title: 'Every piece has a place.',
    text: 'Keep orders, fabric usage, component counts and verification decisions connected.',
  },
  {
    kicker: 'NO GUESSWORK',
    title: 'The gate only opens when the batch is ready.',
    text: 'Verification protects the sewing floor from incomplete or incorrect cutting batches.',
  },
];

export default function Landing({
  busy = false,
  onLogin,
}) {
  const [scene, setScene] = useState(0);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [selectedAccount, setSelectedAccount] = useState(null);

  function nextScene() {
    setScene((current) => (current + 1) % SCENES.length);
  }

  function previousScene() {
    setScene(
      (current) => (current - 1 + SCENES.length) % SCENES.length,
    );
  }

  function openAuth(mode = 'signin', account = null) {
    setAuthMode(mode);
    setSelectedAccount(account);
    setAuthOpen(true);
  }

  function closeAuth() {
    setAuthOpen(false);
    setSelectedAccount(null);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setScene((current) => (current + 1) % SCENES.length);
    }, 8000);

    return () => window.clearInterval(timer);
  }, []);

  const currentScene = SCENES[scene];

  return (
    <main className="ld-page">
      <Scenes index={scene} />

      <div className="ld-shell">
        <header className="ld-header">
          <Link href="/" className="ld-brand" aria-label="ApparelFlow home">
            <MarkIcon />

            <span className="ld-brand-name">
              ApparelFlow
            </span>
          </Link>

          <span className="ld-header-tag">
            CUTTING GATE
          </span>
        </header>

        <section className="ld-hero" aria-labelledby="landing-title">
          <div className="ld-hero-copy">
            <p className="ld-kicker">
              {currentScene.kicker}
            </p>

            <h1 id="landing-title">
              {currentScene.title}
            </h1>

            <p className="ld-hero-text">
              {currentScene.text}
            </p>

            <div className="ld-hero-actions">
              <button
                type="button"
                className="ld-primary"
                onClick={() => openAuth('signin')}
              >
                Sign in
              </button>

              <button
                type="button"
                className="ld-secondary"
                onClick={() => openAuth('signup')}
              >
                Create an account
              </button>
            </div>
          </div>

          <div className="ld-scene-controls">
            <button
              type="button"
              className="ld-scene-arrow"
              aria-label="Previous background"
              onClick={previousScene}
            >
              <ChevronIcon dir="left" />
            </button>

            <div className="ld-scene-dots" aria-label="Background scenes">
              {SCENES.map((item, index) => (
                <button
                  key={item.kicker + index}
                  type="button"
                  className={
                    index === scene
                      ? 'ld-scene-dot is-active'
                      : 'ld-scene-dot'
                  }
                  aria-label={`Show background ${index + 1}`}
                  aria-current={
                    index === scene ? 'true' : undefined
                  }
                  onClick={() => setScene(index)}
                />
              ))}
            </div>

            <button
              type="button"
              className="ld-scene-arrow"
              aria-label="Next background"
              onClick={nextScene}
            >
              <ChevronIcon />
            </button>
          </div>
        </section>

        <RoleTiles
          onPick={(account) => openAuth('signin', account)}
        />

        <section className="ld-gate-section" aria-label="Production gate">
          <div className="ld-gate-line" aria-hidden="true" />

          <div className="ld-gate">
            <span className="ld-gate-lock">GATE</span>

            <strong>
              VERIFIED
            </strong>

            <span>
              → SEWING
            </span>
          </div>

          <div className="ld-gate-line" aria-hidden="true" />
        </section>

        <footer className="ld-footer">
          <div>
            <MarkIcon />
            <span>
              ApparelFlow ERP
            </span>
          </div>

          <span>
            Cutting control · Verification · Sewing
          </span>

          <button
            type="button"
            onClick={() => openAuth('signin')}
          >
            Open gate →
          </button>
        </footer>
      </div>

      <AuthDialog
        open={authOpen}
        mode={authMode}
        account={selectedAccount}
        busy={busy}
        onClose={closeAuth}
        onLogin={onLogin}
      />
    </main>
  );
}