"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  emitAuthChange,
  getAuthSnapshot,
  parseStoredUser,
  STORAGE_KEY,
  subscribeToAuthStore,
} from "./tennis/authStore";
import { formatApiMessage } from "./tennis/format";
import { Header } from "./tennis/Header";
import {
  getMatchCardAction,
  MatchCard,
  type MatchCardActionType,
} from "./tennis/MatchCard";
import { MATCHES_PAGE_SIZE, Pagination } from "./tennis/Pagination";
import type { MatchResponse, ProfileResponse } from "./tennis/types";

type ProfileTab = "created" | "joined";
type ProfileMatchAction = MatchCardActionType;

type ProfilePageProps = {
  viewedUserId?: string;
};

const ntrpLevels = Array.from({ length: 13 }, (_, index) =>
  (1 + index * 0.5).toFixed(1)
);

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
  const [actingMatchAction, setActingMatchAction] =
    useState<ProfileMatchAction | null>(null);
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);
  const [createdPage, setCreatedPage] = useState(1);
  const [joinedPage, setJoinedPage] = useState(1);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editNtrpLevel, setEditNtrpLevel] = useState("3.0");
  const [profileEditStatus, setProfileEditStatus] = useState("");
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

        params.set("createdPage", String(createdPage));
        params.set("joinedPage", String(joinedPage));

        const response = await fetch(`/api/profile?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as ProfileResponse;

        if (!response.ok) {
          setStatus(formatApiMessage(data, "讀取個人資料失敗。"));
          return;
        }

        setProfile(data);
        setEditNickname(data.user?.nickname ?? "");
        setEditNtrpLevel(
          data.user?.ntrp_level === null || data.user?.ntrp_level === undefined
            ? "3.0"
            : Number(data.user.ntrp_level).toFixed(1)
        );
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
  }, [
    targetUserId,
    currentUser?.id,
    profileRefreshKey,
    createdPage,
    joinedPage,
  ]);

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
    setActingMatchAction(action);

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
        setActionStatus(formatApiMessage(data, "操作球局失敗。"));
        return;
      }

      const fallbackMessage =
        action === "cancel"
          ? "球局已取消。"
          : action === "delete"
          ? "球局已刪除。"
          : action === "join"
          ? "已加入球局。"
          : "已退出球局。";

      setActionStatus(formatApiMessage(data, fallbackMessage));
      setCreatedPage(1);
      setJoinedPage(1);
      setProfileRefreshKey((current) => current + 1);
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setActingMatchId(null);
      setActingMatchAction(null);
    }
  }

  function startEditingProfile() {
    setEditNickname(profile?.user?.nickname ?? "");
    setEditNtrpLevel(
      profile?.user?.ntrp_level === null ||
        profile?.user?.ntrp_level === undefined
        ? "3.0"
        : Number(profile.user.ntrp_level).toFixed(1)
    );
    setProfileEditStatus("");
    setIsEditingProfile(true);
  }

  function cancelEditingProfile() {
    setProfileEditStatus("");
    setIsEditingProfile(false);
  }

  async function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!currentUser || !isOwnProfile) {
      setProfileEditStatus("只能編輯自己的個人資料。");
      return;
    }

    setIsSavingProfile(true);
    setProfileEditStatus("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nickname: editNickname,
          ntrpLevel: Number(editNtrpLevel),
        }),
      });
      const data = (await response.json()) as ProfileResponse;

      if (!response.ok || !data.user) {
        setProfileEditStatus(formatApiMessage(data, "更新個人資料失敗。"));
        return;
      }

      setProfile((current) =>
        current
          ? {
              ...current,
              user: data.user,
            }
          : current
      );
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...currentUser,
          name: data.user.nickname ?? currentUser.name,
          ntrpLevel: data.user.ntrp_level ?? undefined,
        })
      );
      emitAuthChange();
      setIsEditingProfile(false);
      setProfileEditStatus(data.message ?? "個人資料已更新。");
    } catch {
      setProfileEditStatus("網路連線異常，請稍後再試。");
    } finally {
      setIsSavingProfile(false);
    }
  }

  const createdMatches = profile?.createdMatches ?? [];
  const joinedMatches = profile?.joinedMatches ?? [];
  const createdMatchesTotal =
    profile?.pagination?.created.total ?? createdMatches.length;
  const joinedMatchesTotal =
    profile?.pagination?.joined.total ?? joinedMatches.length;
  const visibleMatches = activeTab === "created" ? createdMatches : joinedMatches;
  const visiblePage = activeTab === "created" ? createdPage : joinedPage;
  const visibleMatchesTotal =
    activeTab === "created" ? createdMatchesTotal : joinedMatchesTotal;
  const visibleStatus = targetUserId ? status : "請先登入後查看個人主頁。";
  const profileName = profile?.user?.nickname ?? currentUser?.name ?? "個人主頁";
  const profileEmail = profile?.user?.email ?? currentUser?.email ?? "";
  const matchesTitle = isOwnProfile ? "我的球局" : `${profileName} 的球局`;
  const createdTabLabel = isOwnProfile ? "我建立的" : `${profileName} 建立的`;
  const joinedTabLabel = isOwnProfile ? "我參加的" : `${profileName} 參加的`;

  function handleProfilePageChange(page: number) {
    if (page < 1 || page === visiblePage) return;

    setActionStatus("");

    if (activeTab === "created") {
      setCreatedPage(page);
      return;
    }

    setJoinedPage(page);
  }

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
            <div className="profile-account-heading">
              <div>
                <p className="eyebrow">Account</p>
                <h2>個人資訊</h2>
              </div>
              {isOwnProfile && !isEditingProfile ? (
                <button
                  className="profile-edit-trigger"
                  onClick={startEditingProfile}
                  type="button"
                >
                  編輯
                </button>
              ) : null}
            </div>
            <form onSubmit={handleProfileSubmit}>
              <dl className="profile-info-list">
                <div>
                  <dt>暱稱</dt>
                  <dd>
                    {isEditingProfile ? (
                      <input
                        aria-label="暱稱"
                        className="profile-info-input"
                        maxLength={40}
                        minLength={2}
                        onChange={(event) =>
                          setEditNickname(event.target.value)
                        }
                        required
                        value={editNickname}
                      />
                    ) : (
                      profile.user?.nickname ?? "未提供"
                    )}
                  </dd>
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
                    {isEditingProfile ? (
                      <select
                        aria-label="NTRP"
                        className="profile-info-input"
                        onChange={(event) =>
                          setEditNtrpLevel(event.target.value)
                        }
                        required
                        value={editNtrpLevel}
                      >
                        {ntrpLevels.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    ) : (
                      profile.user?.ntrp_level ??
                      currentUser?.ntrpLevel ??
                      "未提供"
                    )}
                  </dd>
                </div>
                <div>
                  <dt>加入日期</dt>
                  <dd>{formatJoinDate(profile.user?.created_at)}</dd>
                </div>
                <div>
                  <dt>建立球局</dt>
                  <dd>{createdMatchesTotal} 場</dd>
                </div>
                <div>
                  <dt>參加球局</dt>
                  <dd>{joinedMatchesTotal} 場</dd>
                </div>
              </dl>

              {isEditingProfile ? (
                <div className="profile-edit-actions">
                  <button
                    className="solid-button"
                    disabled={isSavingProfile}
                    type="submit"
                  >
                    {isSavingProfile ? "儲存中..." : "儲存"}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={isSavingProfile}
                    onClick={cancelEditingProfile}
                    type="button"
                  >
                    取消
                  </button>
                </div>
              ) : null}

              {profileEditStatus ? (
                <p className="profile-edit-message" role="status">
                  {profileEditStatus}
                </p>
              ) : null}
            </form>
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
                visibleMatches.map((match) => {
                  const pendingAction =
                    actingMatchId === match.id ? actingMatchAction : null;

                  return (
                    <MatchCard
                      action={getMatchCardAction({
                        currentUser,
                        match,
                        onAction: handleMatchAction,
                        pendingAction,
                      })}
                      currentUser={currentUser}
                      key={match.id}
                      match={match}
                    />
                  );
                })
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

              <Pagination
                ariaLabel={`${matchesTitle}分頁`}
                currentPage={visiblePage}
                onPageChange={handleProfilePageChange}
                pageSize={MATCHES_PAGE_SIZE}
                totalItems={visibleMatchesTotal}
              />
            </div>
          </section>
        </section>
      ) : null}
    </main>
  );
}
