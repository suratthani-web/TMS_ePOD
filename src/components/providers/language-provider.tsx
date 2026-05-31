"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { dictionaries, Language } from '@/lib/i18n/dictionaries';

type LanguageContextType = {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (path: string, data?: Record<string, any>) => string;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>('th');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem('app_language') as Language;
    if (savedLang && savedLang !== 'th') {
      setLanguage(savedLang);
    }
  }, []);

  const handleSetLanguage = useCallback((lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('app_language', lang);
    document.cookie = `app_language=${lang}; path=/; max-age=31536000`; // 1 year
  }, []);

  // Helper function to get nested values from dictionary (Stable reference)
  const t = useCallback((path: string, data?: Record<string, any>) => {
    const keys = path.split('.');
    let result: any = dictionaries[language];
    
    for (const key of keys) {
      if (result && result[key]) {
        result = result[key];
      } else {
        return path;
      }
    }
    
    let translated = result as string;
    if (typeof translated !== 'string') return path;

    if (data) {
      Object.keys(data).forEach(key => {
        translated = translated.replace(`{${key}}`, data[key]);
        translated = translated.replace(`{{${key}}}`, data[key]);
      });
    }
    
    return translated;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      <div style={{ visibility: mounted ? 'visible' : 'hidden' }}>
        {children}
      </div>
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
