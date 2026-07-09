"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, useSyncExternalStore } from "react";

type AuthMode = "login" | "register";

type StoredUser = {
  id: string;
  email: string;
  name: string;
  ntrpLevel?: number;
};

type ApiResponse = {
  message?: string;
  error?: string;
  user?: {
    id: string;
    email?: string;
    profile?: {
      nickname?: string | null;
      ntrp_level?: number | null;
    } | null;
  };
};

const STORAGE_KEY = "tennis-taiwan-user";

const sampleMatches = [
  {
    court: "台北青年公園網球場",
    time: "今天 19:30",
    level: "NTRP 3.0-4.0",
    players: "2/4",
    fee: "NT$180",
    host: "Ming",
  },
  {
    court: "台中惠文網球場",
    time: "明天 08:00",
    level: "NTRP 2.5+",
    players: "1/2",
    fee: "AA",
    host: "Ariel",
  },
  {
    court: "高雄陽明網球中心",
    time: "週六 16:00",
    level: "NTRP 4.0",
    players: "3/4",
    fee: "NT$220",
    host: "Ken",
  },
];

function parseStoredUser(snapshot: string): StoredUser | null {
  try {
    return snapshot ? (JSON.parse(snapshot) as StoredUser) : null;
  } catch {
    return null;
  }
}

function getAuthSnapshot() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

function subscribeToAuthStore(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  window.addEventListener("storage", onStoreChange);
  window.addEventListener("tennis-auth-change", onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("tennis-auth-change", onStoreChange);
  };
}

function emitAuthChange() {
  window.dispatchEvent(new Event("tennis-auth-change"));
}

export default function TennisHome() {
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [ntrpLevel, setNtrpLevel] = useState("3.0");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthStore,
    getAuthSnapshot,
    () => ""
  );

  const currentUser = useMemo(
    () => parseStoredUser(authSnapshot),
    [authSnapshot]
  );

  const dialogTitle = authMode === "register" ? "建立帳號" : "登入帳號";
  const primaryText = authMode === "register" ? "送出註冊" : "登入";

  const userInitial = useMemo(() => {
    const source = currentUser?.name || currentUser?.email || "T";
    return source.slice(0, 1).toUpperCase();
  }, [currentUser]);

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
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Taiwan Tennis Match">
          <span className="brand-mark">T</span>
          <span>
            <strong>Tennis Taiwan</strong>
            <small>約球平台</small>
          </span>
        </Link>

        <nav className="auth-actions" aria-label="會員功能">
          {currentUser ? (
            <>
              <span className="user-pill">
                <span className="avatar" aria-hidden="true">
                  {userInitial}
                </span>
                <span>{currentUser.name}</span>
              </span>
              <button className="ghost-button" type="button" onClick={handleLogout}>
                登出
              </button>
            </>
          ) : (
            <>
              <button
                className="ghost-button"
                type="button"
                onClick={() => resetForm("register")}
              >
                註冊
              </button>
              <button
                className="solid-button"
                type="button"
                onClick={() => resetForm("login")}
              >
                登入
              </button>
            </>
          )}
        </nav>
      </header>

      <section className="overview">
        <div className="intro">
          <p className="eyebrow">Taiwan tennis finder</p>
          <h1>今天想打球，就從一場剛好的約球開始。</h1>
          <p className="lead">
            依城市、程度、時間快速找到球友。登入後即可建立自己的球局，讓臨時手癢變成穩定上場。
          </p>
          <div className="quick-stats" aria-label="平台摘要">
            <span>
              <strong>18</strong>
              <small>開放球局</small>
            </span>
            <span>
              <strong>6</strong>
              <small>熱門球場</small>
            </span>
            <span>
              <strong>3.5</strong>
              <small>平均 NTRP</small>
            </span>
          </div>
        </div>

        <div className="court-visual" aria-label="網球場視覺">
          <div className="court-frame">
            <div className="court-line court-line-vertical" />
            <div className="court-line court-line-horizontal" />
            <div className="court-service court-service-left" />
            <div className="court-service court-service-right" />
            <span className="player-dot player-one" />
            <span className="player-dot player-two" />
            <span className="ball-dot" />
          </div>
        </div>
      </section>

      <section className="workspace" aria-label="約球工作區">
        <div className="toolbar">
          <div>
            <p className="eyebrow">Open matches</p>
            <h2>近期球局</h2>
          </div>
          <div className="filters" aria-label="篩選條件">
            <button className="filter-chip active" type="button">
              全台
            </button>
            <button className="filter-chip" type="button">
              台北
            </button>
            <button className="filter-chip" type="button">
              台中
            </button>
            <button className="filter-chip" type="button">
              高雄
            </button>
          </div>
        </div>

        <div className="content-grid">
          <div className="match-list">
            {sampleMatches.map((match) => (
              <article className="match-card" key={`${match.court}-${match.time}`}>
                <div>
                  <p className="match-time">{match.time}</p>
                  <h3>{match.court}</h3>
                  <p>{match.level}</p>
                </div>
                <div className="match-meta">
                  <span>{match.players}</span>
                  <span>{match.fee}</span>
                  <span>Host {match.host}</span>
                </div>
                <button className="join-button" type="button">
                  加入
                </button>
              </article>
            ))}
          </div>

          <aside className="create-panel" aria-label="建立球局">
            <p className="eyebrow">Create</p>
            <h2>發起新球局</h2>
            <div className="compact-form">
              <label>
                球場
                <input placeholder="例：台北青年公園網球場" />
              </label>
              <label>
                時間
                <input type="datetime-local" />
              </label>
              <label>
                人數
                <select defaultValue="4">
                  <option value="2">2 人</option>
                  <option value="4">4 人</option>
                </select>
              </label>
              <button className="solid-button full-width" type="button">
                {currentUser ? "建立球局" : "登入後建立"}
              </button>
            </div>
          </aside>
        </div>
      </section>

      {authMode ? (
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
                aria-label="關閉"
                className="icon-button"
                type="button"
                onClick={closeDialog}
              >
                ×
              </button>
            </div>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label>
                Email
                <input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </label>

              <label>
                密碼
                <input
                  autoComplete={
                    authMode === "register" ? "new-password" : "current-password"
                  }
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>

              {authMode === "register" ? (
                <>
                  <label>
                    暱稱
                    <input
                      autoComplete="nickname"
                      minLength={2}
                      onChange={(event) => setNickname(event.target.value)}
                      required
                      value={nickname}
                    />
                  </label>

                  <label>
                    NTRP 程度
                    <select
                      onChange={(event) => setNtrpLevel(event.target.value)}
                      required
                      value={ntrpLevel}
                    >
                      {["1.0", "1.5", "2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0", "5.5", "6.0", "6.5", "7.0"].map(
                        (level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        )
                      )}
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
                {isSubmitting ? "處理中..." : primaryText}
              </button>
            </form>

            <button
              className="text-button"
              type="button"
              onClick={() =>
                setAuthMode(authMode === "register" ? "login" : "register")
              }
            >
              {authMode === "register" ? "已有帳號，改用登入" : "還沒有帳號，前往註冊"}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
