import { Button, Modal } from './ui';

interface LegalModalProps {
  section: 'privacy' | 'terms';
  onClose: () => void;
}

export function LegalModal({ section, onClose }: LegalModalProps) {
  return (
    <Modal
      title={section === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
      eyebrow="legal · transparency"
      onClose={onClose}
    >
      <div className="legal-copy">
        {section === 'privacy' ? (
          <>
            <p>
              <strong>What InPursuit stores:</strong> In local workspace mode, your goals, projects, tasks, habits, and daily reviews stay in your browser&apos;s local storage on this device. When you sign in with Google, your workspace is synced to your personal Firestore document so you can access it across devices.
            </p>
            <p>
              <strong>What we do not do:</strong> InPursuit does not sell your personal productivity data, run third-party advertising trackers, or share your workspace with other users.
            </p>
            <p>
              <strong>Portability &amp; deletion:</strong> You can export a full versioned JSON backup of your data at any time on any tier. If you signed in, you can permanently delete your cloud workspace and account from Settings.
            </p>
          </>
        ) : (
          <>
            <p>
              <strong>Personal execution workspace:</strong> InPursuit is provided to help organize your personal goals, projects, habits, and reflections. You retain full ownership of all content you record in your workspace.
            </p>
            <p>
              <strong>Service &amp; backups:</strong> While we protect cloud synchronization with authentication and strict ownership rules, we recommend exporting periodic JSON backups if you store critical personal plans.
            </p>
            <p>
              <strong>Plans &amp; billing:</strong> Core execution features are available on the Free tier. Any future Pro upgrades never lock your existing data or prevent exporting your backups.
            </p>
          </>
        )}
        <div className="modal-actions">
          <Button variant="solid" onClick={onClose}>Close</Button>
        </div>
      </div>
    </Modal>
  );
}
