import { useLanguage } from '../context/LanguageContext';

export function LanguageToggle({ className = '' }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      className={`lang-toggle ${className}`.trim()}
      role="group"
      aria-label={language === 'id' ? 'Pilih bahasa' : 'Select language'}
    >
      <button
        type="button"
        className={language === 'en' ? 'active' : ''}
        aria-pressed={language === 'en'}
        aria-label="English"
        title="English"
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
      <button
        type="button"
        className={language === 'id' ? 'active' : ''}
        aria-pressed={language === 'id'}
        aria-label="Bahasa Indonesia"
        title="Bahasa Indonesia"
        onClick={() => setLanguage('id')}
      >
        ID
      </button>
    </div>
  );
}
