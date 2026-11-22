import { useLanguage } from '../context/LanguageContext';
import { Button, Modal } from './ui';

interface LegalModalProps {
  section: 'privacy' | 'terms';
  onClose: () => void;
}

export function LegalModal({ section, onClose }: LegalModalProps) {
  const { isId, l } = useLanguage();

  return (
    <Modal
      title={section === 'privacy' ? l('Privacy Policy', 'Kebijakan Privasi') : l('Terms of Service', 'Ketentuan Layanan')}
      eyebrow={l('legal · transparency', 'hukum · transparansi')}
      onClose={onClose}
    >
      <div className="legal-copy">
        {section === 'privacy' ? (
          isId ? (
            <>
              <p>
                <strong>Apa yang disimpan InPursuit:</strong> Dalam mode ruang kerja lokal, tujuan, proyek, tugas, kebiasaan, dan evaluasi harian Anda tersimpan di penyimpanan lokal browser pada perangkat ini. Saat Anda masuk dengan Google, ruang kerja disinkronkan ke dokumen Firestore pribadi agar dapat diakses lintas perangkat.
              </p>
              <p>
                <strong>Apa yang tidak kami lakukan:</strong> InPursuit tidak menjual data produktivitas pribadi Anda, tidak menjalankan pelacak iklan pihak ketiga, dan tidak membagikan ruang kerja Anda kepada pengguna lain.
              </p>
              <p>
                <strong>Portabilitas &amp; penghapusan:</strong> Anda dapat mengekspor cadangan JSON lengkap kapan saja di paket mana pun. Jika sudah masuk, Anda dapat menghapus ruang kerja cloud dan akun Anda secara permanen melalui Pengaturan.
              </p>
            </>
          ) : (
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
          )
        ) : isId ? (
          <>
            <p>
              <strong>Ruang kerja eksekusi pribadi:</strong> InPursuit disediakan untuk membantu Anda mengatur tujuan, proyek, kebiasaan, dan refleksi pribadi. Anda memegang kepemilikan penuh atas seluruh konten yang Anda catat.
            </p>
            <p>
              <strong>Layanan &amp; cadangan:</strong> Meski kami melindungi sinkronisasi cloud dengan autentikasi dan aturan kepemilikan yang ketat, kami menyarankan Anda mengekspor cadangan JSON secara berkala jika menyimpan rencana pribadi penting.
            </p>
            <p>
              <strong>Paket &amp; penagihan:</strong> Fitur inti eksekusi tersedia pada paket Gratis. Pembaruan ke paket Pro di masa mendatang tidak akan pernah mengunci data yang sudah ada atau menghalangi ekspor cadangan Anda.
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
          <Button variant="solid" onClick={onClose}>{l('Close', 'Tutup')}</Button>
        </div>
      </div>
    </Modal>
  );
}
