"use client";

import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";
import {
  emitAuthChange,
  getAuthSnapshot,
  parseStoredUser,
  STORAGE_KEY,
  subscribeToAuthStore,
} from "./tennis/authStore";
import { AuthDialog } from "./tennis/AuthDialog";
import { CreateMatchPanel } from "./tennis/CreateMatchPanel";
import { Header } from "./tennis/Header";
import { Hero } from "./tennis/Hero";
import { MatchesSection } from "./tennis/MatchesSection";
import type { ApiResponse, AuthMode, StoredUser } from "./tennis/types";

export default function TennisHome() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [ntrpLevel, setNtrpLevel] = useState("3.0");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthStore,
    getAuthSnapshot,
    () => ""
  );

  const currentUser = useMemo(
    () => parseStoredUser(authSnapshot),
    [authSnapshot]
  );

  function resetForm(nextMode: AuthMode) {
    setAuthMode(nextMode);
    setStatusMessage("");
    setPassword("");
    if (nextMode === "register" && currentUser?.email) {
      setEmail(currentUser.email);
    }
  }

  function closeDialog() {
    setAuthMode(null);
    setStatusMessage("");
    setIsSubmitting(false);
  }

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!authMode) return;

    setIsSubmitting(true);
    setStatusMessage("");

    const endpoint =
      authMode === "register" ? "/api/user/register" : "/api/user/login";
    const body =
      authMode === "register"
        ? {
            email,
            password,
            nickname,
            ntrp_level: Number(ntrpLevel),
          }
        : {
            email,
            password,
          };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setStatusMessage(data.message ?? data.error ?? "操作失敗，請稍後再試。");
        return;
      }

      if (authMode === "login" && data.user) {
        const nextUser: StoredUser = {
          id: data.user.id,
          email: data.user.email ?? email,
          name: data.user.profile?.nickname ?? data.user.email ?? email,
          ntrpLevel: data.user.profile?.ntrp_level ?? undefined,
        };

        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextUser));
        emitAuthChange();
        closeDialog();
        return;
      }

      setStatusMessage(
        data.message ?? "註冊信已寄出，請完成 Email 驗證後再登入。"
      );
      setAuthMode("login");
      setPassword("");
    } catch {
      setStatusMessage("網路連線異常，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await fetch("/api/user/logout", {
        method: "POST",
      });
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      emitAuthChange();
      setEmail("");
      setPassword("");
      setNickname("");
      setStatusMessage("");
      setAuthMode(null);
    }
  }

  return (
    <main className="app-shell">
      <Header
        currentUser={currentUser}
        onLogin={() => resetForm("login")}
        onLogout={handleLogout}
        onRegister={() => resetForm("register")}
      />

      <Hero />

      <section className="workspace" aria-label="約球工作區">
        <div className="content-grid">
          <MatchesSection
            currentUser={currentUser}
            onRequireLogin={() => resetForm("login")}
            refreshKey={matchesRefreshKey}
            onMatchesChanged={() =>
              setMatchesRefreshKey((current) => current + 1)
            }
          />
          <CreateMatchPanel
            currentUser={currentUser}
            onMatchCreated={() => setMatchesRefreshKey((current) => current + 1)}
            onRequireLogin={() => resetForm("login")}
          />
        </div>
      </section>

      {authMode ? (
        <AuthDialog
          authMode={authMode}
          email={email}
          isSubmitting={isSubmitting}
          nickname={nickname}
          ntrpLevel={ntrpLevel}
          password={password}
          statusMessage={statusMessage}
          onClose={closeDialog}
          onEmailChange={setEmail}
          onModeChange={setAuthMode}
          onNicknameChange={setNickname}
          onNtrpLevelChange={setNtrpLevel}
          onPasswordChange={setPassword}
          onSubmit={handleAuthSubmit}
        />
      ) : null}
    </main>
  );
}
