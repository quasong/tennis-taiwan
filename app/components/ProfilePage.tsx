"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  emitAuthChange,
  getAuthSnapshot,
  parseStoredUser,
  STORAGE_KEY,
  subscribeToAuthStore,
} from "./tennis/authStore";
import { formatFee, formatMatchTime } from "./tennis/format";
import { Header } from "./tennis/Header";
import type {
  MatchResponse,
  MatchSummary,
  ProfileResponse,
  StoredUser,
} from "./tennis/types";

type ProfileTab = "created" | "joined";
type ProfileMatchAction = "cancel" | "leave";

function formatJoinDate(value: string | null | undefined) {
  if (!value) return "未提供";

  return new Intl.DateTimeFormat("zh-Hant-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getUserInitial(user: StoredUser | null) {
  return (user?.name || user?.email || "T").slice(0, 1).toUpperCase();
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState("正在載入個人資料...");
  const [actionStatus, setActionStatus] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("created");
  const [actingMatchId, setActingMatchId] = useState<string | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const authSnapshot = useSyncExternalStore(
    subscribeToAuthStore,
    getAuthSnapshot,
    () => ""
  );

  const currentUser = useMemo(
    () => parseStoredUser(authSnapshot),
    [authSnapshot]
  );

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    const userId = currentUser.id;
    const controller = new AbortController();

    async function loadProfile() {
      setStatus("正在載入個人資料...");

      try {
        const response = await fetch(`/api/profile?userId=${userId}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as ProfileResponse;

        if (!response.ok) {
          setStatus(data.message ?? data.error ?? "讀取個人資料失敗。");
          return;
        }

        setProfile(data);
        setStatus("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setStatus("無法讀取個人資料，請稍後再試。");
      }
    }

    loadProfile();

    return () => {
      controller.abort();
    };
  }, [currentUser, profileRefreshKey]);

  async function handleLogout() {
    try {
      await fetch("/api/user/logout", {
        method: "POST",
      });
    } finally {
      window.localStorage.removeItem(STORAGE_KEY);
      emitAuthChange();
      window.location.href = "/";
    }
  }

  async function handleMatchAction(matchId: string, action: ProfileMatchAction) {
    if (!currentUser) {
      setActionStatus("請先登入後再操作球局。");
      return;
    }

    setActionStatus("");
    setActingMatchId(matchId);

    try {
      const response = await fetch("/api/matches", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          matchId,
          userId: currentUser.id,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (!response.ok) {
        setActionStatus(data.message ?? data.error ?? "操作球局失敗。");
        return;
      }

      setActionStatus(
        data.message ?? (action === "cancel" ? "球局已取消。" : "已退出球局。")
      );
      setProfileRefreshKey((current) => current + 1);
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setActingMatchId(null);
    }
  }

  const createdMatches = profile?.createdMatches ?? [];
  const joinedMatches = profile?.joinedMatches ?? [];
  const visibleMatches = activeTab === "created" ? createdMatches : joinedMatches;
  const visibleStatus = currentUser ? status : "請先登入後查看個人主頁。";

  return (
    <main className="app-shell profile-shell">
      <Header
        currentUser={currentUser}
        onLogin={() => {
          window.location.href = "/";
        }}
        onLogout={handleLogout}
        onRegister={() => {
          window.location.href = "/";
        }}
      />

      <section className="profile-hero" aria-labelledby="profile-title">
        <div className="profile-identity">
          <span className="profile-avatar" aria-hidden="true">
            {getUserInitial(currentUser)}
          </span>
          <div>
            <p className="eyebrow">Profile</p>
            <h1 id="profile-title">{currentUser?.name ?? "個人主頁"}</h1>
            <p>{currentUser?.email ?? "登入後查看完整個人資訊"}</p>
          </div>
        </div>
        <Link className="ghost-button" href="/">
          返回首頁
        </Link>
      </section>

      {visibleStatus ? (
        <div className="inline-status profile-status" role="status">
          {visibleStatus}
        </div>
      ) : null}

      {actionStatus ? (
        <div className="inline-status profile-status" role="status">
          {actionStatus}
        </div>
      ) : null}

      {currentUser && profile ? (
        <section className="profile-grid" aria-label="個人資料與球局">
          <aside className="profile-panel">
            <p className="eyebrow">Account</p>
            <h2>個人資訊</h2>
            <dl className="profile-info-list">
              <div>
                <dt>暱稱</dt>
                <dd>{profile.user?.nickname ?? currentUser.name}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  <a href={`mailto:${profile.user?.email ?? currentUser.email}`}>
                    {profile.user?.email ?? currentUser.email}
                  </a>
                </dd>
              </div>
              <div>
                <dt>NTRP</dt>
                <dd>
                  {profile.user?.ntrp_level ?? currentUser.ntrpLevel ?? "未提供"}
                </dd>
              </div>
              <div>
                <dt>加入日期</dt>
                <dd>{formatJoinDate(profile.user?.created_at)}</dd>
              </div>
              <div>
                <dt>建立球局</dt>
                <dd>{createdMatches.length} 場</dd>
              </div>
              <div>
                <dt>參加球局</dt>
                <dd>{joinedMatches.length} 場</dd>
              </div>
            </dl>
          </aside>

          <section className="profile-panel profile-matches-panel">
            <div className="profile-section-heading">
              <div>
                <p className="eyebrow">Matches</p>
                <h2>我的球局</h2>
              </div>
              <div className="profile-tabs" aria-label="切換球局分類">
                <button
                  aria-pressed={activeTab === "created"}
                  className={activeTab === "created" ? "active" : ""}
                  onClick={() => setActiveTab("created")}
                  type="button"
                >
                  我建立的
                </button>
                <button
                  aria-pressed={activeTab === "joined"}
                  className={activeTab === "joined" ? "active" : ""}
                  onClick={() => setActiveTab("joined")}
                  type="button"
                >
                  我參加的
                </button>
              </div>
            </div>

            <div className="profile-match-list">
              {visibleMatches.length > 0 ? (
                visibleMatches.map((match) => (
                  <ProfileMatchCard
                    action={activeTab === "created" ? "cancel" : "leave"}
                    isActing={actingMatchId === match.id}
                    key={match.id}
                    match={match}
                    onAction={handleMatchAction}
                  />
                ))
              ) : (
                <p className="empty-state">
                  {activeTab === "created"
                    ? "你目前還沒有建立球局。"
                    : "你目前還沒有參加別人的球局。"}
                </p>
              )}
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}

type ProfileMatchCardProps = {
  action: ProfileMatchAction;
  isActing: boolean;
  match: MatchSummary;
  onAction: (matchId: string, action: ProfileMatchAction) => void;
};

function ProfileMatchCard({
  action,
  isActing,
  match,
  onAction,
}: ProfileMatchCardProps) {
  const courtAddress = match.court?.address?.trim();
  const mapsUrl = courtAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        courtAddress
      )}`
    : "";
  const isEnded = match.status === "已結束";
  const actionLabel = action === "cancel" ? "取消" : "退出";
  const pendingLabel = action === "cancel" ? "取消中" : "退出中";

  return (
    <article className="profile-match-card">
      <div className="profile-match-main">
        <div className="profile-match-header">
          <div>
            <p className="match-time">{formatMatchTime(match.playTime)}</p>
            <div className="match-title-row">
              <h3>{match.court?.name ?? "未知球場"}</h3>
              {courtAddress ? (
                <a
                  className="match-address-link"
                  href={mapsUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {courtAddress}
                </a>
              ) : null}
            </div>
          </div>
          <span className="profile-match-status">{match.status}</span>
        </div>

        <div className="profile-match-details">
          <p>創建者：{match.host.nickname}</p>
          {match.note ? (
            <p className="profile-match-note">備註：{match.note}</p>
          ) : null}
        </div>
      </div>

      <div className="profile-match-side">
        <div className="profile-match-meta">
          <span>
            {match.joinedPlayers} / {match.requiredPlayers} 人
          </span>
          <span>{formatFee(match.feePerPerson)} / 人</span>
        </div>
        <button
          className={isEnded ? "full-match-button" : "cancel-match-button"}
          disabled={isActing || isEnded}
          onClick={() => onAction(match.id, action)}
          type="button"
        >
          {isEnded ? "已結束" : isActing ? pendingLabel : actionLabel}
        </button>
      </div>
    </article>
  );
}
