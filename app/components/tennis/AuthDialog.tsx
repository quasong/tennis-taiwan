"use client";

import { FormEvent } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import type { AuthMode } from "./types";

type AuthDialogProps = {
  authMode: AuthMode;
  email: string;
  isSubmitting: boolean;
  nickname: string;
  ntrpLevel: string;
  password: string;
  statusMessage: string;
  onClose: () => void;
  onEmailChange: (value: string) => void;
  onModeChange: (mode: AuthMode) => void;
  onNicknameChange: (value: string) => void;
  onNtrpLevelChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const ntrpLevels = [
  "1.0",
  "1.5",
  "2.0",
  "2.5",
  "3.0",
  "3.5",
  "4.0",
  "4.5",
  "5.0",
  "5.5",
  "6.0",
  "6.5",
  "7.0",
];

export function AuthDialog({
  authMode,
  email,
  isSubmitting,
  nickname,
  ntrpLevel,
  password,
  statusMessage,
  onClose,
  onEmailChange,
  onModeChange,
  onNicknameChange,
  onNtrpLevelChange,
  onPasswordChange,
  onSubmit,
}: AuthDialogProps) {
  const { t } = useI18n();
  const dialogTitle = authMode === "register" ? t("auth.registerTitle") : t("auth.loginTitle");
  const primaryText = authMode === "register" ? t("auth.submitRegister") : t("auth.submitLogin");

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="auth-title"
        aria-modal="true"
        className="auth-dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">Member</p>
            <h2 id="auth-title">{dialogTitle}</h2>
          </div>
          <button
            aria-label={t("auth.close")}
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            {t("auth.email")}
            <input
              autoComplete="email"
              inputMode="email"
              onChange={(event) => onEmailChange(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>

          <label>
            {t("auth.password")}
            <input
              autoComplete={
                authMode === "register" ? "new-password" : "current-password"
              }
              minLength={8}
              onChange={(event) => onPasswordChange(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {authMode === "register" ? (
            <>
              <label>
                {t("auth.nickname")}
                <input
                  autoComplete="nickname"
                  minLength={2}
                  onChange={(event) => onNicknameChange(event.target.value)}
                  required
                  value={nickname}
                />
              </label>

              <label>
                {t("auth.ntrp")}
                <select
                  onChange={(event) => onNtrpLevelChange(event.target.value)}
                  required
                  value={ntrpLevel}
                >
                  {ntrpLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {statusMessage ? (
            <p className="form-message" role="status">
              {statusMessage}
            </p>
          ) : null}

          <button className="solid-button full-width" disabled={isSubmitting}>
            {isSubmitting ? t("auth.processing") : primaryText}
          </button>
        </form>

        <button
          className="text-button"
          type="button"
          onClick={() =>
            onModeChange(authMode === "register" ? "login" : "register")
          }
        >
          {authMode === "register" ? t("auth.switchToLogin") : t("auth.switchToRegister")}
        </button>
      </section>
    </div>
  );
}
