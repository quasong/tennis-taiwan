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
import { detectBrowserLocation } from "../lib/clientLocation";

const STORAGE_KEY = "tennis-taiwan-locale";
const SOURCE_KEY = "tennis-taiwan-locale-source";
const GREATER_CHINA_COUNTRY_CODES = new Set(["tw", "cn", "hk", "mo"]);
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
  const [locale, setLocaleState] = useState<Locale>("en");
  const hasManualSelection = useRef(false);

  useEffect(() => {
    let isActive = true;
    const timeoutId = window.setTimeout(async () => {
      const storedLocale = window.localStorage.getItem(STORAGE_KEY);
      if (storedLocale === "en" || storedLocale === "zh-Hant") {
        if (isActive && !hasManualSelection.current) {
          setLocaleState(storedLocale);
        }
        return;
      }

      const { countryCode } = await detectBrowserLocation();
      if (!isActive || hasManualSelection.current) return;

      const nextLocale =
        countryCode && GREATER_CHINA_COUNTRY_CODES.has(countryCode.toLowerCase())
          ? "zh-Hant"
          : "en";

      setLocaleState(nextLocale);
      window.localStorage.setItem(STORAGE_KEY, nextLocale);
      window.localStorage.setItem(SOURCE_KEY, "auto");
    }, 0);

    return () => {
      isActive = false;
      window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    hasManualSelection.current = true;
    window.localStorage.setItem(STORAGE_KEY, nextLocale);
    window.localStorage.setItem(SOURCE_KEY, "manual");
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
