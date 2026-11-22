import { useLanguage } from '../context/LanguageContext';
import type { SyncStatus } from '../types';

interface SyncIndicatorProps {
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  pendingSync: boolean;
  onRetry: () => void;
  onOpenSettings: () => void;
}

const formatShortTime = (iso: string | null, locale: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
};

export function SyncIndicator({ syncStatus, lastSyncedAt, pendingSync, onRetry, onOpenSettings }: SyncIndicatorProps) {
  const { locale, l } = useLanguage();

  let dotClass = 'status-dot';
  let label = l('Local workspace · saved on device', 'Ruang kerja lokal · tersimpan di perangkat');
  let actionLabel: string | null = null;
  let actionFn: (() => void) | null = null;

  if (syncStatus === 'hydrating') {
    dotClass = 'status-dot syncing';
    label = l('Connecting to cloud…', 'Menghubungkan ke cloud…');
  } else if (syncStatus === 'syncing') {
    dotClass = 'status-dot syncing';
    label = l('Syncing changes…', 'Menyinkronkan perubahan…');
  } else if (syncStatus === 'synced') {
    dotClass = 'status-dot synced';
    const time = formatShortTime(lastSyncedAt, locale);
    label = time ? l(`Synced · ${time}`, `Tersinkron · ${time}`) : l('Synced to cloud', 'Tersinkron ke cloud');
  } else if (syncStatus === 'offline') {
    dotClass = 'status-dot offline';
    label = pendingSync
      ? l('Offline · changes queued', 'Luring · perubahan antre')
      : l('Offline · saved locally', 'Luring · tersimpan lokal');
  } else if (syncStatus === 'error') {
    dotClass = 'status-dot error';
    label = l('Sync failed · saved locally', 'Sinkron gagal · tersimpan lokal');
    actionLabel = l('Retry', 'Coba lagi');
    actionFn = onRetry;
  } else if (syncStatus === 'conflict') {
    dotClass = 'status-dot error';
    label = l('Sync conflict · action needed', 'Konflik sinkron · perlu tindakan');
    actionLabel = l('Resolve', 'Selesaikan');
    actionFn = onOpenSettings;
  } else if (syncStatus === 'deleting') {
    dotClass = 'status-dot syncing';
    label = l('Deleting account…', 'Menghapus akun…');
  }

  return (
    <div className="local-note" role="status" aria-live="polite">
      <span className={dotClass} aria-hidden="true" />
      <span className="sync-label-text">{label}</span>
      {actionLabel && actionFn && (
        <button type="button" className="sync-retry-btn" onClick={actionFn}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}
