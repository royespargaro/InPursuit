import { useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useHabits } from '../context/HabitContext';
import { useLanguage } from '../context/LanguageContext';
import { useModalFocus } from '../hooks/useModalFocus';
import {
  PRO_TIER_ANNUAL_IDR,
  PRO_TIER_MONTHLY_IDR,
} from '../services/entitlementService';
import { getReadableAuthError } from '../utils/authErrors';
import { Sparkles, User, X } from './Icon';
import { LegalModal } from './LegalModal';

interface SettingsModalProps {
  onClose: () => void;
  onOpenSignIn: () => void;
  onExportBackup?: () => void;
  onRestoreBackup?: () => void;
  onShowOnboarding?: () => void;
}

export const SettingsModal = ({
  onClose,
  onOpenSignIn,
  onExportBackup,
  onRestoreBackup,
  onShowOnboarding,
}: SettingsModalProps) => {
  const { language, locale, setLanguage, l } = useLanguage();
  const {
    user,
    signIn,
    signOut,
    deleteAccount,
    syncStatus,
    syncError,
    lastSyncedAt,
    pendingSync,
    retrySync,
    entitlement,
    deletionPhase,
    incompatibleSchema,
    exportRecoveryBackup,
  } = useHabits();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedPhotoUrl, setFailedPhotoUrl] = useState<string | null>(null);
  const [confirmPendingSignOut, setConfirmPendingSignOut] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePhrase, setDeletePhrase] = useState('');
  const [legalDoc, setLegalDoc] = useState<'privacy' | 'terms' | null>(null);
  const [showPlanOverview, setShowPlanOverview] = useState(false);

  const modalRef = useRef<HTMLDivElement>(null);
  useModalFocus(modalRef, onClose, busy || legalDoc !== null);

  const avatarPhotoUrl = user?.photoURL && user.photoURL !== failedPhotoUrl ? user.photoURL : null;

  const handleSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      await signIn();
      onClose();
    } catch (err) {
      setError(getReadableAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async (force = false) => {
    if (pendingSync && !force) {
      setConfirmPendingSignOut(true);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await signOut({ force });
      onOpenSignIn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : l('Could not sign out right now.', 'Tidak dapat keluar saat ini.'));
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletePhrase.trim().toUpperCase() !== 'DELETE') {
      setError(
        l(
          'Type DELETE to permanently remove your cloud account and workspace.',
          'Ketik DELETE untuk menghapus akun cloud dan ruang kerja Anda secara permanen.',
        ),
      );
      return;
    }
    setError('');
    setBusy(true);
    try {
      await deleteAccount();
      onOpenSignIn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : l('Account deletion failed. Please try again.', 'Penghapusan akun gagal. Silakan coba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const handleRetrySync = async () => {
    setError('');
    setBusy(true);
    try {
      await retrySync();
    } catch (err) {
      setError(err instanceof Error ? err.message : l('Could not retry synchronization.', 'Tidak dapat mencoba ulang sinkronisasi.'));
    } finally {
      setBusy(false);
    }
  };

  const handleExportRecovery = async () => {
    setError('');
    setBusy(true);
    try {
      await exportRecoveryBackup();
    } catch (err) {
      setError(err instanceof Error ? err.message : l('Could not export recovery backup.', 'Tidak dapat mengekspor cadangan pemulihan.'));
    } finally {
      setBusy(false);
    }
  };

  const syncSummary = () => {
    if (!user) {
      return l(
        'Local-only mode. Sign in with Google to synchronize across devices.',
        'Mode lokal saja. Masuk dengan Google untuk sinkronisasi antarperangkat.',
      );
    }
    if (incompatibleSchema !== null) {
      return l(
        `Cloud workspace uses schema v${incompatibleSchema}. Sync writes are locked to protect your data—export a recovery backup below.`,
        `Ruang kerja cloud menggunakan skema v${incompatibleSchema}. Penulisan sinkronisasi dikunci untuk melindungi data Anda—ekspor cadangan pemulihan di bawah.`,
      );
    }
    if (syncStatus === 'synced') {
      return lastSyncedAt
        ? l(
            `Cloud sync active · last confirmed ${new Date(lastSyncedAt).toLocaleString()}`,
            `Sinkronisasi cloud aktif · terakhir dikonfirmasi ${new Date(lastSyncedAt).toLocaleString(locale)}`,
          )
        : l('Cloud sync active.', 'Sinkronisasi cloud aktif.');
    }
    if (syncStatus === 'syncing' || syncStatus === 'hydrating') {
      return l('Synchronizing changes with Firestore…', 'Menyinkronkan perubahan ke Firestore…');
    }
    if (syncStatus === 'offline') {
      return pendingSync
        ? l(
            'Currently offline. Recent changes are stored on this device and will upload automatically when reconnected.',
            'Sedang luring. Perubahan terbaru tersimpan di perangkat ini dan akan otomatis diunggah saat terhubung kembali.',
          )
        : l(
            'Currently offline. Using cached workspace on this device.',
            'Sedang luring. Menggunakan ruang kerja yang tersimpan di perangkat ini.',
          );
    }
    if (syncStatus === 'deleting') return l('Deleting your cloud account and workspace data…', 'Menghapus akun cloud dan data ruang kerja Anda…');
    if (syncStatus === 'conflict') return l('A workspace conflict needs your confirmation.', 'Terdapat konflik ruang kerja yang memerlukan konfirmasi Anda.');
    return syncError || l('Cloud synchronization failed. Your changes remain safe on this device.', 'Sinkronisasi cloud gagal. Perubahan Anda tetap aman di perangkat ini.');
  };

  return (
    <>
      <div className="modal-backdrop" onMouseDown={() => { if (!busy) onClose(); }}>
        <div
          ref={modalRef}
          tabIndex={-1}
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="modal-head">
            <div>
              <div className="eyebrow">{l('workspace · account', 'ruang kerja · akun')}</div>
              <h2 id="settings-title">{l('Settings', 'Pengaturan')}</h2>
            </div>
            <button className="icon-btn" type="button" aria-label={l('Close settings', 'Tutup pengaturan')} disabled={busy} onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <div className="settings-stack">
            <div className="settings-card">
              <div className="settings-avatar">
                {avatarPhotoUrl ? (
                  <img
                    className="settings-avatar-img"
                    src={avatarPhotoUrl}
                    alt={user?.displayName ?? user?.email ?? l('Account profile', 'Profil akun')}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedPhotoUrl(avatarPhotoUrl)}
                  />
                ) : (
                  <User size={18} />
                )}
              </div>
              <div className="settings-card-copy">
                <p className="settings-card-title">{user ? (user.displayName || l('Signed in', 'Sudah masuk')) : l('Local workspace', 'Ruang kerja lokal')}</p>
                <p className="settings-card-sub">{user ? (user.email ?? l('Connected account', 'Akun terhubung')) : l('Saved in this browser only', 'Tersimpan di browser ini saja')}</p>
              </div>
              <span className="tier-badge">{entitlement.isPro ? 'PRO' : l('FREE', 'GRATIS')}</span>
            </div>

            <div className="settings-backup-box">
              <div className="eyebrow">{l('language · bahasa', 'bahasa · language')}</div>
              <p className="settings-note">
                {l('Choose your preferred interface language.', 'Pilih bahasa antarmuka yang Anda inginkan.')}
              </p>
              <div className="segmented" role="group" aria-label={l('Language preference', 'Preferensi bahasa')}>
                <button
                  type="button"
                  className={language === 'en' ? 'selected' : ''}
                  aria-pressed={language === 'en'}
                  onClick={() => setLanguage('en')}
                >
                  English
                </button>
                <button
                  type="button"
                  className={language === 'id' ? 'selected' : ''}
                  aria-pressed={language === 'id'}
                  onClick={() => setLanguage('id')}
                >
                  Bahasa Indonesia
                </button>
              </div>
            </div>

            <div className="settings-sync-box">
              <div className="eyebrow">{l('synchronization', 'sinkronisasi')}</div>
              <p className="settings-note">{syncSummary()}</p>
              {user && incompatibleSchema !== null && (
                <button type="button" className="text-action" disabled={busy} onClick={() => void handleExportRecovery()}>
                  {l(`Export v${incompatibleSchema} recovery backup`, `Ekspor cadangan pemulihan v${incompatibleSchema}`)}
                </button>
              )}
              {user && incompatibleSchema === null && (syncStatus === 'error' || (syncStatus === 'offline' && pendingSync)) && (
                <button type="button" className="text-action" disabled={busy} onClick={() => void handleRetrySync()}>
                  {l('Retry sync now', 'Coba sinkronisasi sekarang')}
                </button>
              )}
            </div>

            <div className="settings-backup-box">
              <div className="eyebrow">{l('plan & tier', 'paket & tingkatan')}</div>
              <p className="settings-note">
                {l('Current tier:', 'Paket saat ini:')} <strong>{entitlement.planLabel}</strong>
                {entitlement.expiresAt ? l(` · expires ${new Date(entitlement.expiresAt).toLocaleDateString()}`, ` · berakhir ${new Date(entitlement.expiresAt).toLocaleDateString(locale)}`) : ''}.
                {' '}
                {l('Your workspace and JSON backups are always yours on any tier.', 'Ruang kerja dan cadangan JSON selalu menjadi milik Anda di paket apa pun.')}
              </p>
              {!entitlement.isPro && (
                <button type="button" className="text-action" onClick={() => setShowPlanOverview(v => !v)}>
                  {showPlanOverview ? l('Hide plan roadmap', 'Sembunyikan rencana paket') : l('View proposed Pro plans', 'Lihat rencana paket Pro')}
                </button>
              )}
              {showPlanOverview && !entitlement.isPro && (
                <div className="upgrade-preview-box">
                  <p className="settings-note">
                    {l(
                      `Planned tiers: Free (Rp0), Monthly Pro (Rp${PRO_TIER_MONTHLY_IDR.toLocaleString('id-ID')}/mo), Annual Pro (Rp${PRO_TIER_ANNUAL_IDR.toLocaleString('id-ID')}/yr). Self-serve checkout and payment verification are not enabled yet—all current features and portable backups remain unlocked on Free.`,
                      `Rencana paket: Gratis (Rp0), Pro Bulanan (Rp${PRO_TIER_MONTHLY_IDR.toLocaleString('id-ID')}/bln), Pro Tahunan (Rp${PRO_TIER_ANNUAL_IDR.toLocaleString('id-ID')}/thn). Pembayaran mandiri belum diaktifkan—seluruh fitur saat ini dan ekspor cadangan tetap terbuka pada paket Gratis.`,
                    )}
                  </p>
                </div>
              )}
            </div>

            {(onExportBackup || onRestoreBackup || onShowOnboarding) && (
              <div className="settings-backup-box">
                <div className="eyebrow">{l('portable snapshots & guide', 'cadangan portabel & panduan')}</div>
                <p className="settings-note">
                  {l(
                    'Export or restore versioned JSON backups of your goals, projects, habits, and reviews.',
                    'Ekspor atau pulihkan cadangan JSON berversi untuk tujuan, proyek, kebiasaan, dan evaluasi Anda.',
                  )}
                </p>
                <div className="settings-backup-actions">
                  {onExportBackup && (
                    <button type="button" className="ui-btn ui-btn-outline" onClick={onExportBackup}>
                      {l('Export backup', 'Ekspor cadangan')}
                    </button>
                  )}
                  {onRestoreBackup && (
                    <button
                      type="button"
                      className="ui-btn ui-btn-outline"
                      onClick={() => {
                        onClose();
                        onRestoreBackup();
                      }}
                    >
                      {l('Restore backup', 'Pulihkan cadangan')}
                    </button>
                  )}
                  {onShowOnboarding && (
                    <button
                      type="button"
                      className="ui-btn ui-btn-outline"
                      onClick={() => {
                        onShowOnboarding();
                        onClose();
                      }}
                    >
                      {l('Show onboarding guide', 'Tampilkan panduan awal')}
                    </button>
                  )}
                </div>
              </div>
            )}

            {confirmPendingSignOut && (
              <div className="settings-danger-box" role="alert">
                <div className="eyebrow">{l('unsynced changes detected', 'perubahan belum tersinkron')}</div>
                <p className="settings-note">
                  {l(
                    'Recent edits on this device have not finished syncing to the cloud yet. Export a backup or retry sync before signing out.',
                    'Perubahan terbaru di perangkat ini belum selesai disinkronkan ke cloud. Ekspor cadangan atau coba sinkronisasi ulang sebelum keluar.',
                  )}
                </p>
                <div className="settings-backup-actions">
                  <button
                    type="button"
                    className="ui-btn ui-btn-outline"
                    disabled={busy}
                    onClick={async () => {
                      await handleRetrySync();
                      setConfirmPendingSignOut(false);
                    }}
                  >
                    {l('Retry sync first', 'Coba sinkronisasi dulu')}
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-danger"
                    disabled={busy}
                    onClick={() => void handleSignOut(true)}
                  >
                    {l('Sign out anyway', 'Tetap keluar')}
                  </button>
                </div>
              </div>
            )}

            {user && (
              <div className="settings-danger-box">
                <div className="eyebrow">{l('account deletion', 'penghapusan akun')}</div>
                <p className="settings-note">
                  {l(
                    'Permanently delete your cloud workspace and account credentials. Export a JSON backup first if you want a copy.',
                    'Hapus ruang kerja cloud dan kredensial akun Anda secara permanen. Ekspor cadangan JSON terlebih dahulu jika Anda ingin menyimpan salinannya.',
                  )}
                </p>
                {!showDeleteConfirm ? (
                  <button type="button" className="text-action danger-text" onClick={() => setShowDeleteConfirm(true)}>
                    {l('Delete cloud account & data…', 'Hapus akun & data cloud…')}
                  </button>
                ) : (
                  <div className="delete-account-confirm">
                    <input
                      className="search-input"
                      type="text"
                      placeholder={l('Type DELETE to confirm', 'Ketik DELETE untuk konfirmasi')}
                      value={deletePhrase}
                      onChange={e => setDeletePhrase(e.target.value)}
                    />
                    <div className="settings-backup-actions">
                      <button type="button" className="ui-btn ui-btn-outline" disabled={busy} onClick={() => setShowDeleteConfirm(false)}>
                        {l('Cancel', 'Batal')}
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-danger"
                        disabled={busy || deletePhrase.trim().toUpperCase() !== 'DELETE'}
                        onClick={() => void handleDeleteAccount()}
                      >
                        {busy
                          ? deletionPhase === 'reauthenticating'
                            ? l('Confirming identity…', 'Mengonfirmasi identitas…')
                            : deletionPhase === 'deleting-firestore'
                              ? l('Deleting cloud data…', 'Menghapus data cloud…')
                              : l('Removing account…', 'Menghapus akun…')
                          : deletionPhase === 'partial-failure'
                            ? l('Retry permanent deletion', 'Coba ulang penghapusan permanen')
                            : l('Permanently delete', 'Hapus permanen')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="legal-links-row">
              <button type="button" className="text-link" onClick={() => setLegalDoc('privacy')}>{l('Privacy Policy', 'Kebijakan Privasi')}</button>
              <span aria-hidden="true">·</span>
              <button type="button" className="text-link" onClick={() => setLegalDoc('terms')}>{l('Terms of Service', 'Ketentuan Layanan')}</button>
            </div>

            {(error || (user && syncError)) && <p className="settings-error" role="alert">{error || syncError}</p>}

            <div className="modal-actions">
              {!user && (
                <button
                  className="ui-btn ui-btn-outline"
                  type="button"
                  onClick={() => {
                    onOpenSignIn();
                    onClose();
                  }}
                >
                  {l('Sign-in screen', 'Halaman masuk')}
                </button>
              )}
              <button className="ui-btn ui-btn-outline" type="button" onClick={onClose}>
                {l('Close', 'Tutup')}
              </button>
              {user ? (
                <button className="ui-btn ui-btn-danger" type="button" disabled={busy} onClick={() => void handleSignOut(false)}>
                  <LogOut size={15} /> {busy ? l('Signing out…', 'Keluar…') : l('Sign out', 'Keluar')}
                </button>
              ) : (
                <button className="ui-btn ui-btn-solid" type="button" disabled={busy} onClick={handleSignIn}>
                  <Sparkles size={15} /> {busy ? l('Connecting…', 'Menghubungkan…') : l('Sign in with Google', 'Masuk dengan Google')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {legalDoc && <LegalModal section={legalDoc} onClose={() => setLegalDoc(null)} />}
    </>
  );
};
