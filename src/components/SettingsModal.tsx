import { useRef, useState } from 'react';
import { LogOut } from 'lucide-react';
import { useHabits } from '../context/HabitContext';
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
      setError(err instanceof Error ? err.message : 'Could not sign out right now.');
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deletePhrase.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to permanently remove your cloud account and workspace.');
      return;
    }
    setError('');
    setBusy(true);
    try {
      await deleteAccount();
      onOpenSignIn();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Account deletion failed. Please try again.');
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
      setError(err instanceof Error ? err.message : 'Could not retry synchronization.');
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
      setError(err instanceof Error ? err.message : 'Could not export recovery backup.');
    } finally {
      setBusy(false);
    }
  };

  const syncSummary = () => {
    if (!user) return 'Local-only mode. Sign in with Google to synchronize across devices.';
    if (incompatibleSchema !== null) {
      return `Cloud workspace uses schema v${incompatibleSchema}. Sync writes are locked to protect your data—export a recovery backup below.`;
    }
    if (syncStatus === 'synced') {
      return lastSyncedAt
        ? `Cloud sync active · last confirmed ${new Date(lastSyncedAt).toLocaleString()}`
        : 'Cloud sync active.';
    }
    if (syncStatus === 'syncing' || syncStatus === 'hydrating') return 'Synchronizing changes with Firestore…';
    if (syncStatus === 'offline') {
      return pendingSync
        ? 'Currently offline. Recent changes are stored on this device and will upload automatically when reconnected.'
        : 'Currently offline. Using cached workspace on this device.';
    }
    if (syncStatus === 'deleting') return 'Deleting your cloud account and workspace data…';
    if (syncStatus === 'conflict') return 'A workspace conflict needs your confirmation.';
    return syncError || 'Cloud synchronization failed. Your changes remain safe on this device.';
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
              <div className="eyebrow">workspace · account</div>
              <h2 id="settings-title">Settings</h2>
            </div>
            <button className="icon-btn" type="button" aria-label="Close settings" disabled={busy} onClick={onClose}>
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
                    alt={user?.displayName ?? user?.email ?? 'Account profile'}
                    referrerPolicy="no-referrer"
                    onError={() => setFailedPhotoUrl(avatarPhotoUrl)}
                  />
                ) : (
                  <User size={18} />
                )}
              </div>
              <div className="settings-card-copy">
                <p className="settings-card-title">{user ? (user.displayName || 'Signed in') : 'Local workspace'}</p>
                <p className="settings-card-sub">{user ? (user.email ?? 'Connected account') : 'Saved in this browser only'}</p>
              </div>
              <span className="tier-badge">{entitlement.isPro ? 'PRO' : 'FREE'}</span>
            </div>

            <div className="settings-sync-box">
              <div className="eyebrow">synchronization</div>
              <p className="settings-note">{syncSummary()}</p>
              {user && incompatibleSchema !== null && (
                <button type="button" className="text-action" disabled={busy} onClick={() => void handleExportRecovery()}>
                  Export v{incompatibleSchema} recovery backup
                </button>
              )}
              {user && incompatibleSchema === null && (syncStatus === 'error' || (syncStatus === 'offline' && pendingSync)) && (
                <button type="button" className="text-action" disabled={busy} onClick={() => void handleRetrySync()}>
                  Retry sync now
                </button>
              )}
            </div>

            <div className="settings-backup-box">
              <div className="eyebrow">plan &amp; tier</div>
              <p className="settings-note">
                Current tier: <strong>{entitlement.planLabel}</strong>
                {entitlement.expiresAt ? ` · expires ${new Date(entitlement.expiresAt).toLocaleDateString()}` : ''}.
                Your workspace and JSON backups are always yours on any tier.
              </p>
              {!entitlement.isPro && (
                <button type="button" className="text-action" onClick={() => setShowPlanOverview(v => !v)}>
                  {showPlanOverview ? 'Hide plan roadmap' : 'View proposed Pro plans'}
                </button>
              )}
              {showPlanOverview && !entitlement.isPro && (
                <div className="upgrade-preview-box">
                  <p className="settings-note">
                    Planned tiers: Free (Rp0), Monthly Pro (Rp{PRO_TIER_MONTHLY_IDR.toLocaleString('id-ID')}/mo), Annual Pro (Rp{PRO_TIER_ANNUAL_IDR.toLocaleString('id-ID')}/yr).
                    Self-serve checkout and payment verification are not enabled yet—all current features and portable backups remain unlocked on Free.
                  </p>
                </div>
              )}
            </div>

            {(onExportBackup || onRestoreBackup || onShowOnboarding) && (
              <div className="settings-backup-box">
                <div className="eyebrow">portable snapshots &amp; guide</div>
                <p className="settings-note">
                  Export or restore versioned JSON backups of your goals, projects, habits, and reviews.
                </p>
                <div className="settings-backup-actions">
                  {onExportBackup && (
                    <button type="button" className="ui-btn ui-btn-outline" onClick={onExportBackup}>
                      Export backup
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
                      Restore backup
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
                      Show onboarding guide
                    </button>
                  )}
                </div>
              </div>
            )}

            {confirmPendingSignOut && (
              <div className="settings-danger-box" role="alert">
                <div className="eyebrow">unsynced changes detected</div>
                <p className="settings-note">
                  Recent edits on this device have not finished syncing to the cloud yet. Export a backup or retry sync before signing out.
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
                    Retry sync first
                  </button>
                  <button
                    type="button"
                    className="ui-btn ui-btn-danger"
                    disabled={busy}
                    onClick={() => void handleSignOut(true)}
                  >
                    Sign out anyway
                  </button>
                </div>
              </div>
            )}

            {user && (
              <div className="settings-danger-box">
                <div className="eyebrow">account deletion</div>
                <p className="settings-note">
                  Permanently delete your cloud workspace and account credentials. Export a JSON backup first if you want a copy.
                </p>
                {!showDeleteConfirm ? (
                  <button type="button" className="text-action danger-text" onClick={() => setShowDeleteConfirm(true)}>
                    Delete cloud account &amp; data…
                  </button>
                ) : (
                  <div className="delete-account-confirm">
                    <input
                      className="search-input"
                      type="text"
                      placeholder="Type DELETE to confirm"
                      value={deletePhrase}
                      onChange={e => setDeletePhrase(e.target.value)}
                    />
                    <div className="settings-backup-actions">
                      <button type="button" className="ui-btn ui-btn-outline" disabled={busy} onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn-danger"
                        disabled={busy || deletePhrase.trim().toUpperCase() !== 'DELETE'}
                        onClick={() => void handleDeleteAccount()}
                      >
                        {busy
                          ? deletionPhase === 'reauthenticating'
                            ? 'Confirming identity…'
                            : deletionPhase === 'deleting-firestore'
                              ? 'Deleting cloud data…'
                              : 'Removing account…'
                          : deletionPhase === 'partial-failure'
                            ? 'Retry permanent deletion'
                            : 'Permanently delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="legal-links-row">
              <button type="button" className="text-link" onClick={() => setLegalDoc('privacy')}>Privacy Policy</button>
              <span aria-hidden="true">·</span>
              <button type="button" className="text-link" onClick={() => setLegalDoc('terms')}>Terms of Service</button>
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
                  Sign-in screen
                </button>
              )}
              <button className="ui-btn ui-btn-outline" type="button" onClick={onClose}>
                Close
              </button>
              {user ? (
                <button className="ui-btn ui-btn-danger" type="button" disabled={busy} onClick={() => void handleSignOut(false)}>
                  <LogOut size={15} /> {busy ? 'Signing out…' : 'Sign out'}
                </button>
              ) : (
                <button className="ui-btn ui-btn-solid" type="button" disabled={busy} onClick={handleSignIn}>
                  <Sparkles size={15} /> {busy ? 'Connecting…' : 'Sign in with Google'}
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
