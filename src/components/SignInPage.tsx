import { useState } from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, LoaderCircle } from 'lucide-react';
import { useHabits } from '../context/HabitContext';
import { useLanguage } from '../context/LanguageContext';
import { getReadableAuthError } from '../utils/authErrors';
import alpineLandscape from '../assets/images/alpine_meadow_sky_1794511898838.jpg';
import { LanguageToggle } from './LanguageToggle';
import { LegalModal } from './LegalModal';
import './sign-in.css';

type SignInPageProps = {
  onContinueLocal: () => void;
};

function TrainPanorama() {
  return (
    <div className="train-panorama" aria-hidden="true">
      <div className="sky-fallback" />
      <img
        src={alpineLandscape}
        alt=""
        className="panorama-img"
        decoding="async"
        referrerPolicy="no-referrer"
      />
      <div className="panorama-atmosphere" />
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function SignInPage({ onContinueLocal }: SignInPageProps) {
  const { signIn, authNotice, accountNotice, clearAccountNotice } = useHabits();
  const { l } = useLanguage();
  const [googleBusy, setGoogleBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);

  const hour = new Date().getHours();
  const timeGreeting =
    hour < 12
      ? l('Good morning', 'Selamat pagi')
      : hour < 15
        ? l('Good afternoon', 'Selamat siang')
        : hour < 18
          ? l('Good afternoon', 'Selamat sore')
          : l('Good evening', 'Selamat malam');

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setGoogleBusy(true);
    try {
      await signIn();
    } catch (error) {
      setAuthError(getReadableAuthError(error));
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="train-auth-shell">
      <header className="carriage-topbar">
        <a href="#top" className="carriage-brand" onClick={e => e.preventDefault()}>
          <img className="carriage-brand-mark" src="/inpursuit-mark.svg" alt="" />
          <span className="carriage-brand-name">InPursuit</span>
        </a>

        <div className="carriage-top-actions">
          <LanguageToggle />
          <button type="button" className="carriage-top-link" onClick={onContinueLocal}>
            {l('Local workspace', 'Ruang kerja lokal')}
          </button>
        </div>
      </header>

      <main className="carriage-stage">
        <div className="carriage-windows">
          <TrainPanorama />

          <div className="train-window side-window side-left" aria-hidden="true">
            <div className="window-glass-sheen" />
            <div className="window-rubber-seal" />
            <div className="window-bezel" />
          </div>

          <div className="carriage-pillar pillar-left" aria-hidden="true" />

          <section className="train-window main-window" aria-labelledby="signin-heading">
            <div className="window-scrim" aria-hidden="true" />
            <div className="window-glass-sheen" aria-hidden="true" />
            <div className="window-rubber-seal" aria-hidden="true" />
            <div className="window-bezel" aria-hidden="true" />

            <div className="signin-frame-content">
              <div className="signin-badge">{timeGreeting}</div>

              <h1 id="signin-heading" className="signin-heading">
                {l('Direction, then action.', 'Arah jelas, lalu aksi.')}
              </h1>

              <p className="signin-subtitle">
                {l(
                  'Sign in with Google to keep your goals, projects, habits, and daily reviews synced across devices.',
                  'Masuk dengan Google agar tujuan, proyek, kebiasaan, dan evaluasi harian Anda tersinkron di semua perangkat.',
                )}
              </p>

              <button
                type="button"
                className="signin-btn-google"
                disabled={googleBusy}
                onClick={handleGoogleSignIn}
              >
                {googleBusy ? (
                  <>
                    <LoaderCircle size={16} className="signin-spin" aria-hidden="true" />
                    <span>{l('Connecting to Google…', 'Menghubungkan ke Google…')}</span>
                  </>
                ) : (
                  <>
                    <GoogleMark />
                    <span>{l('Continue with Google', 'Lanjutkan dengan Google')}</span>
                    <ArrowRight size={15} className="signin-arrow" aria-hidden="true" />
                  </>
                )}
              </button>

              {accountNotice && !authError && !authNotice && (
                <div className="signin-auth-success" role="status">
                  <CheckCircle2 size={15} aria-hidden="true" />
                  <span>{accountNotice}</span>
                  <button type="button" className="signin-notice-link" onClick={clearAccountNotice}>
                    {l('Dismiss', 'Tutup')}
                  </button>
                </div>
              )}

              {(authError || authNotice) && (
                <div className="signin-auth-error" role="alert">
                  <AlertCircle size={15} aria-hidden="true" />
                  <span>{authError || authNotice}</span>
                </div>
              )}

              <div className="signin-divider" role="separator" aria-label={l('or', 'atau')}>
                <span>{l('or', 'atau')}</span>
              </div>

              <button
                type="button"
                className="signin-btn-primary"
                disabled={googleBusy}
                onClick={onContinueLocal}
              >
                <span>{l('Continue locally on this device', 'Lanjutkan secara lokal di perangkat ini')}</span>
              </button>

              <p className="signin-footer">
                {l(
                  'Local workspaces stay in this browser and can be backed up or synced anytime.',
                  'Ruang kerja lokal tersimpan di browser ini dan dapat dicadangkan atau disinkronkan kapan saja.',
                )}{' '}
                <button type="button" className="text-link" onClick={() => setLegalDoc('privacy')}>{l('Privacy', 'Privasi')}</button>
                {' · '}
                <button type="button" className="text-link" onClick={() => setLegalDoc('terms')}>{l('Terms', 'Ketentuan')}</button>
              </p>
            </div>
          </section>

          <div className="carriage-pillar pillar-right" aria-hidden="true" />

          <div className="train-window side-window side-right" aria-hidden="true">
            <div className="window-glass-sheen" />
            <div className="window-rubber-seal" />
            <div className="window-bezel" />
          </div>
        </div>

        <div className="carriage-sill" aria-hidden="true" />
        <div className="carriage-lower-panel" aria-hidden="true" />
        <div className="carriage-seat carriage-seat-left" aria-hidden="true" />
        <div className="carriage-seat carriage-seat-right" aria-hidden="true" />
      </main>

      {legalDoc && <LegalModal section={legalDoc} onClose={() => setLegalDoc(null)} />}
    </div>
  );
}
