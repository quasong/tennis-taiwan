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
type ProfileMatchAction = "cancel" | "join" | "leave";

type ProfilePageProps = {
  viewedUserId?: string;
};

function formatJoinDate(value: string | null | undefined) {
  if (!value) return "未提供";

  return new Intl.DateTimeFormat("zh-Hant-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getUserInitial(name: string | null | undefined) {
  return (name || "T").slice(0, 1).toUpperCase();
}

export default function ProfilePage({ viewedUserId }: ProfilePageProps) {
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
  const targetUserId = viewedUserId ?? currentUser?.id;
  const isOwnProfile = Boolean(currentUser && targetUserId === currentUser.id);

  useEffect(() => {
    if (!targetUserId) {
      return;
    }

    const userId = targetUserId;
    const controller = new AbortController();

    async function loadProfile() {
      setStatus("正在載入個人資料...");

      try {
        const params = new URLSearchParams({ userId });

        if (currentUser?.id) {
          params.set("viewerUserId", currentUser.id);
        }

        const response = await fetch(`/api/profile?${params.toString()}`, {
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
  }, [targetUserId, currentUser?.id, profileRefreshKey]);

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

      const fallbackMessage =
        action === "cancel"
          ? "球局已取消。"
          : action === "join"
          ? "已加入球局。"
          : "已退出球局。";

      setActionStatus(data.message ?? fallbackMessage);
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
  const visibleStatus = targetUserId ? status : "請先登入後查看個人主頁。";
  const profileName = profile?.user?.nickname ?? currentUser?.name ?? "個人主頁";
  const profileEmail = profile?.user?.email ?? currentUser?.email ?? "";
  const matchesTitle = isOwnProfile ? "我的球局" : `${profileName} 的球局`;
  const createdTabLabel = isOwnProfile ? "我建立的" : `${profileName} 建立的`;
  const joinedTabLabel = isOwnProfile ? "我參加的" : `${profileName} 參加的`;

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
            {getUserInitial(profileName || profileEmail)}
          </span>
          <div>
            <p className="eyebrow">Profile</p>
            <h1 id="profile-title">{profileName}</h1>
            <p>{profileEmail || "登入後查看完整個人資訊"}</p>
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

      {targetUserId && profile ? (
        <section className="profile-grid" aria-label="個人資料與球局">
          <aside className="profile-panel">
            <p className="eyebrow">Account</p>
            <h2>個人資訊</h2>
            <dl className="profile-info-list">
              <div>
                <dt>暱稱</dt>
                <dd>{profile.user?.nickname ?? "未提供"}</dd>
              </div>
              <div>
                <dt>Email</dt>
                <dd>
                  {profile.user?.email ? (
                    <a href={`mailto:${profile.user.email}`}>
                      {profile.user.email}
                    </a>
                  ) : (
                    "未提供"
                  )}
                </dd>
              </div>
              <div>
                <dt>NTRP</dt>
                <dd>
                  {profile.user?.ntrp_level ?? currentUser?.ntrpLevel ?? "未提供"}
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
                <h2>{matchesTitle}</h2>
              </div>
              <div className="profile-tabs" aria-label="切換球局分類">
                <button
                  aria-pressed={activeTab === "created"}
                  className={activeTab === "created" ? "active" : ""}
                  onClick={() => setActiveTab("created")}
                  type="button"
                >
                  {createdTabLabel}
                </button>
                <button
                  aria-pressed={activeTab === "joined"}
                  className={activeTab === "joined" ? "active" : ""}
                  onClick={() => setActiveTab("joined")}
                  type="button"
                >
                  {joinedTabLabel}
                </button>
              </div>
            </div>

            <div className="profile-match-list">
              {visibleMatches.length > 0 ? (
                visibleMatches.map((match) => (
                  <ProfileMatchCard
                    currentUser={currentUser}
                    isActing={actingMatchId === match.id}
                    key={match.id}
                    match={match}
                    onAction={handleMatchAction}
                  />
                ))
              ) : (
                <p className="empty-state">
                  {activeTab === "created"
                    ? isOwnProfile
                      ? "你目前還沒有建立球局。"
                      : `${profileName} 目前還沒有建立球局。`
                    : isOwnProfile
                    ? "你目前還沒有參加別人的球局。"
                    : `${profileName} 目前還沒有參加別人的球局。`}
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
  currentUser: StoredUser | null;
  isActing: boolean;
  match: MatchSummary;
  onAction: (matchId: string, action: ProfileMatchAction) => void;
};

function ProfileMatchCard({
  currentUser,
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
  const isFull = match.status === "已滿團";
  const isHost = Boolean(currentUser && currentUser.id === match.host.id);
  const actionConfig = getProfileMatchActionConfig({
    hasCurrentUser: Boolean(currentUser),
    hasJoined: match.hasJoined,
    isEnded,
    isFull,
    isHost,
  });

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
        {actionConfig ? (
          <button
            className={actionConfig.className}
            disabled={isActing || actionConfig.disabled}
            onClick={() => {
              if (actionConfig.action) {
                onAction(match.id, actionConfig.action);
              }
            }}
            type="button"
          >
            {isActing && actionConfig.action
              ? actionConfig.pendingLabel
              : actionConfig.label}
          </button>
        ) : null}
      </div>
    </article>
  );
}

type ProfileMatchActionConfig = {
  action: ProfileMatchAction | null;
  className: string;
  disabled: boolean;
  label: string;
  pendingLabel: string;
};

function getProfileMatchActionConfig({
  hasCurrentUser,
  hasJoined,
  isEnded,
  isFull,
  isHost,
}: {
  hasCurrentUser: boolean;
  hasJoined: boolean;
  isEnded: boolean;
  isFull: boolean;
  isHost: boolean;
}): ProfileMatchActionConfig | null {
  if (!hasCurrentUser) {
    return null;
  }

  if (isEnded) {
    return {
      action: null,
      className: "full-match-button",
      disabled: true,
      label: "已結束",
      pendingLabel: "已結束",
    };
  }

  if (isHost) {
    return {
      action: "cancel",
      className: "cancel-match-button",
      disabled: false,
      label: "取消",
      pendingLabel: "取消中",
    };
  }

  if (hasJoined) {
    return {
      action: "leave",
      className: "cancel-match-button",
      disabled: false,
      label: "退出",
      pendingLabel: "退出中",
    };
  }

  if (isFull) {
    return {
      action: null,
      className: "full-match-button",
      disabled: true,
      label: "已滿團",
      pendingLabel: "已滿團",
    };
  }

  return {
    action: "join",
    className: "join-button",
    disabled: false,
    label: "加入",
    pendingLabel: "加入中",
  };
}
