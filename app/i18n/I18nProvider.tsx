"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { messages, type Locale, type TranslationKey } from "./messages";

const STORAGE_KEY = "tennis-taiwan-locale";
type TranslationValues = Record<string, string | number>;

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: TranslationValues) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolate(template: string, values?: TranslationValues) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match,
  );
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh-Hant");
  const hasLoadedStoredLocale = useRef(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedLocale = window.localStorage.getItem(STORAGE_KEY);
      hasLoadedStoredLocale.current = true;
      setLocaleState(storedLocale === "en" ? "en" : "zh-Hant");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (hasLoadedStoredLocale.current) {
      window.localStorage.setItem(STORAGE_KEY, locale);
    }
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    hasLoadedStoredLocale.current = true;
    setLocaleState(nextLocale);
  }, []);
  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) => interpolate(messages[locale][key], values),
    [locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
}
