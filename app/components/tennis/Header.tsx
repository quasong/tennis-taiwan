"use client";

import Link from "next/link";
import { useI18n } from "../../i18n/I18nProvider";
import type { StoredUser } from "./types";

type HeaderProps = {
  currentUser: StoredUser | null;
  onLogin: () => void;
  onLogout: () => void;
  onRegister: () => void;
};

export function Header({
  currentUser,
  onLogin,
  onLogout,
  onRegister,
}: HeaderProps) {
  const { locale, setLocale, t } = useI18n();
  const userInitial = (currentUser?.name || currentUser?.email || "T")
    .slice(0, 1)
    .toUpperCase();

  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="Taiwan Tennis Match">
        <span className="brand-mark">T</span>
        <span>
          <strong>Tennis Taiwan</strong>
          <small>{t("brand.subtitle")}</small>
        </span>
      </Link>

      <nav className="auth-actions" aria-label={t("nav.member")}>
        <div
          className="language-switch"
          role="group"
          aria-label={t("language.label")}
        >
          <button
            aria-label={t("language.zh")}
            aria-pressed={locale === "zh-Hant"}
            className={locale === "zh-Hant" ? "active" : ""}
            onClick={() => setLocale("zh-Hant")}
            type="button"
          >
            <span className="language-long">{t("language.zh")}</span>
            <span aria-hidden="true" className="language-short">
              中
            </span>
          </button>
          <button
            aria-label={t("language.en")}
            aria-pressed={locale === "en"}
            className={locale === "en" ? "active" : ""}
            onClick={() => setLocale("en")}
            type="button"
          >
            {t("language.en")}
          </button>
        </div>
        {currentUser ? (
          <>
            <Link className="user-pill" href="/profile" aria-label={t("nav.profile")}>
              <span className="avatar" aria-hidden="true">
                {userInitial}
              </span>
              <span>{currentUser.name}</span>
            </Link>
            <button className="ghost-button" type="button" onClick={onLogout}>
              {t("auth.logout")}
            </button>
          </>
        ) : (
          <>
            <button className="ghost-button" type="button" onClick={onRegister}>
              {t("auth.register")}
            </button>
            <button className="solid-button" type="button" onClick={onLogin}>
              {t("auth.login")}
            </button>
          </>
        )}
      </nav>
    </header>
  );
}
