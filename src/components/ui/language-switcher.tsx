"use client";

import React from 'react';
import { useLanguage } from '@/components/providers/language-provider';
import { cn } from '@/lib/utils';
import { Languages } from 'lucide-react';

export function LanguageSwitcher({ className }: { className?: string }) {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={cn("flex items-center gap-1 bg-background/50 p-1 rounded-xl border border-border", className)}>
      <button
        onClick={() => setLanguage('th')}
        className={cn(
          "px-3 py-1.5 rounded-lg text-base font-bold font-black transition-all",
          language === 'th' 
            ? "bg-primary text-white shadow-sm" 
            : "text-muted-foreground hover:text-muted-foreground"
        )}
      >
        TH
      </button>
      <button
        onClick={() => setLanguage('en')}
        className={cn(
          "px-3 py-1.5 rounded-lg text-base font-bold font-black transition-all",
          language === 'en' 
            ? "bg-primary text-white shadow-sm" 
            : "text-muted-foreground hover:text-muted-foreground"
        )}
      >
        EN
      </button>
    </div>
  );
}

