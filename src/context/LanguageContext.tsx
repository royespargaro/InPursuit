import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type AppLanguage = 'en' | 'id';

export const LANGUAGE_STORAGE_KEY = 'inpursuit.language.v1';

interface LanguageContextValue {
  language: AppLanguage;
  locale: string;
  isId: boolean;
  setLanguage: (lang: AppLanguage) => void;
  toggleLanguage: () => void;
  l: (en: string, id: string) => string;
}

const DEFAULT_VALUE: LanguageContextValue = {
  language: 'en',
  locale: 'en-GB',
  isId: false,
  setLanguage: () => {},
  toggleLanguage: () => {},
  l: (en: string) => en,
};

const LanguageContext = createContext<LanguageContextValue>(DEFAULT_VALUE);

export function readStoredLanguage(): AppLanguage {
  try {
    const raw = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return raw === 'id' ? 'id' : 'en';
  } catch {
    return 'en';
  }
}

export function writeStoredLanguage(lang: AppLanguage): void {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // Ignore storage restriction errors
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<AppLanguage>(readStoredLanguage);

  const setLanguage = (lang: AppLanguage) => {
    setLanguageState(lang);
    writeStoredLanguage(lang);
  };

  const toggleLanguage = () => {
    setLanguage(language === 'en' ? 'id' : 'en');
  };

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language;
    }
  }, [language]);

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      locale: language === 'id' ? 'id-ID' : 'en-GB',
      isId: language === 'id',
      setLanguage,
      toggleLanguage,
      l: (en: string, id: string) => (language === 'id' ? id : en),
    }),
    [language],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
