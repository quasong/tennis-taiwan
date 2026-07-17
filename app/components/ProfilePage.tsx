"use client";

import Link from "next/link";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { useI18n } from "../i18n/I18nProvider";
import type { Locale } from "../i18n/messages";
import {
  emitAuthChange,
  getAuthSnapshot,
  handleUnauthorizedResponse,
  parseStoredUser,
  STORAGE_KEY,
  subscribeToAuthStore,
  validateAuthSession,
} from "./tennis/authStore";
import { formatApiMessage } from "./tennis/format";
import { Header } from "./tennis/Header";
import {
  getMatchCardAction,
  MatchCard,
  type MatchCardActionType,
  updateMatchParticipation,
} from "./tennis/MatchCard";
import { MATCHES_PAGE_SIZE, Pagination } from "./tennis/Pagination";
import type {
  MatchResponse,
  MatchSummary,
  ProfileResponse,
} from "./tennis/types";

type ProfileTab = "created" | "joined";
type ProfileMatchAction = MatchCardActionType;

type ProfilePageProps = {
  viewedUserId?: string;
};

const ntrpLevels = Array.from({ length: 13 }, (_, index) =>
  (1 + index * 0.5).toFixed(1)
);

function formatJoinDate(value: string | null | undefined, locale: Locale) {
  if (!value) return null;

  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-Hant-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function getUserInitial(name: string | null | undefined) {
  return (name || "T").slice(0, 1).toUpperCase();
}

export default function ProfilePage({ viewedUserId }: ProfilePageProps) {
  const { locale, t } = useI18n();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [status, setStatus] = useState(() => t("profile.loading"));
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
    if (!currentUser) return;

    void validateAuthSession();
  }, [currentUser]);

  useEffect(() => {
    if (!targetUserId) {
      return;
    }

    const userId = targetUserId;
    const controller = new AbortController();

    async function loadProfile() {
      setStatus(t("profile.loading"));

      try {
        const params = new URLSearchParams({ userId });

        params.set("createdPage", String(createdPage));
        params.set("joinedPage", String(joinedPage));

        const response = await fetch(`/api/profile?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await response.json()) as ProfileResponse;

        if (!response.ok) {
          setStatus(formatApiMessage(data, t("profile.loadFailed"), locale));
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

        setStatus(t("profile.loadFailed"));
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
    locale,
    t,
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
      setActionStatus(t("auth.signInRequired"));
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

      handleUnauthorizedResponse(response);

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, t("match.operationFailed"), locale));
        return;
      }

      const fallbackMessage =
        action === "cancel"
          ? t("match.canceled")
          : action === "delete"
          ? t("match.deleted")
          : action === "join"
          ? t("match.joined")
          : t("match.left");

      if (action === "join" || action === "leave") {
        const hasJoined = action === "join";
        const updateMatches = (matches: MatchSummary[] = []) =>
          matches.map((match) =>
            match.id === matchId
              ? updateMatchParticipation(match, currentUser, hasJoined)
              : match
          );

        setProfile((current) =>
          current
            ? {
                ...current,
                createdMatches: updateMatches(current.createdMatches),
                joinedMatches: updateMatches(current.joinedMatches),
              }
            : current
        );
      }

      setActionStatus(formatApiMessage(data, fallbackMessage, locale));
      setCreatedPage(1);
      setJoinedPage(1);
      setProfileRefreshKey((current) => current + 1);
    } catch {
      setActionStatus(t("common.networkError"));
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
      setProfileEditStatus(t("profile.editOwnOnly"));
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

      handleUnauthorizedResponse(response);

      if (!response.ok || !data.user) {
        setProfileEditStatus(formatApiMessage(data, t("profile.updateFailed"), locale));
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
      setProfileEditStatus(formatApiMessage(data, t("profile.updated"), locale));
    } catch {
      setProfileEditStatus(t("common.networkError"));
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
  const visibleStatus = targetUserId ? status : t("profile.loginRequired");
  const profileName = profile?.user?.nickname ?? currentUser?.name ?? t("profile.page");
  const profileEmail = isOwnProfile
    ? profile?.user?.email ?? currentUser?.email ?? ""
    : "";
  const matchesTitle = isOwnProfile
    ? t("profile.myMatches")
    : t("profile.otherMatches", { name: profileName });
  const createdTabLabel = isOwnProfile
    ? t("profile.createdByMe")
    : t("profile.createdByOther", { name: profileName });
  const joinedTabLabel = isOwnProfile
    ? t("profile.joinedByMe")
    : t("profile.joinedByOther", { name: profileName });

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
            <p className="eyebrow">{t("profile.eyebrow")}</p>
            <h1 id="profile-title">{profileName}</h1>
            {isOwnProfile && profileEmail ? <p>{profileEmail}</p> : null}
          </div>
        </div>
        <Link className="ghost-button" href="/">
          {t("profile.backHome")}
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
        <section className="profile-grid" aria-label={t("profile.content")}>
          <aside className="profile-panel">
            <div className="profile-account-heading">
              <div>
                <p className="eyebrow">{t("profile.accountEyebrow")}</p>
                <h2>{t("profile.account")}</h2>
              </div>
              {isOwnProfile && !isEditingProfile ? (
                <button
                  className="profile-edit-trigger"
                  onClick={startEditingProfile}
                  type="button"
                >
                  {t("profile.edit")}
                </button>
              ) : null}
            </div>
            <form onSubmit={handleProfileSubmit}>
              <dl className="profile-info-list">
                <div>
                  <dt>{t("profile.nickname")}</dt>
                  <dd>
                    {isEditingProfile ? (
                      <input
                        aria-label={t("profile.nickname")}
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
                      profile.user?.nickname ?? t("common.notProvided")
                    )}
                  </dd>
                </div>
                {isOwnProfile ? (
                  <div>
                    <dt>{t("common.email")}</dt>
                    <dd>
                      {profile.user?.email ? (
                        <a href={`mailto:${profile.user.email}`}>
                          {profile.user.email}
                        </a>
                      ) : (
                        t("common.notProvided")
                      )}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t("common.ntrp")}</dt>
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
                      t("common.notProvided")
                    )}
                  </dd>
                </div>
                {isOwnProfile ? (
                  <div>
                    <dt>{t("profile.joinDate")}</dt>
                    <dd>
                      {formatJoinDate(profile.user?.created_at, locale) ??
                        t("common.notProvided")}
                    </dd>
                  </div>
                ) : null}
                <div>
                  <dt>{t("profile.createdCount")}</dt>
                  <dd>{t("common.matchesUnit", { count: createdMatchesTotal })}</dd>
                </div>
                <div>
                  <dt>{t("profile.joinedCount")}</dt>
                  <dd>{t("common.matchesUnit", { count: joinedMatchesTotal })}</dd>
                </div>
              </dl>

              {isEditingProfile ? (
                <div className="profile-edit-actions">
                  <button
                    className="solid-button"
                    disabled={isSavingProfile}
                    type="submit"
                  >
                    {isSavingProfile ? t("profile.saving") : t("profile.save")}
                  </button>
                  <button
                    className="ghost-button"
                    disabled={isSavingProfile}
                    onClick={cancelEditingProfile}
                    type="button"
                  >
                    {t("profile.cancel")}
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
                <p className="eyebrow">{t("profile.matchesEyebrow")}</p>
                <h2>{matchesTitle}</h2>
              </div>
              <div className="profile-tabs" aria-label={t("profile.switchTabs")}>
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
                      ? t("profile.emptyCreatedSelf")
                      : t("profile.emptyCreatedOther", { name: profileName })
                    : isOwnProfile
                    ? t("profile.emptyJoinedSelf")
                    : t("profile.emptyJoinedOther", { name: profileName })}
                </p>
              )}

              <Pagination
                ariaLabel={t("profile.pagination", { title: matchesTitle })}
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
