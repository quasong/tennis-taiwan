import { useEffect, useMemo, useRef, useState } from "react";
import { handleUnauthorizedResponse } from "./authStore";
import { formatApiMessage } from "./format";
import { municipalities } from "./locations";
import {
  getMatchCardAction,
  MatchCard,
  type MatchCardActionType,
  updateMatchParticipation,
} from "./MatchCard";
import { MATCHES_PAGE_SIZE, Pagination } from "./Pagination";
import type {
  MatchResponse,
  MatchesResponse,
  MatchSummary,
  StoredUser,
} from "./types";

type MatchesSectionProps = {
  currentUser: StoredUser | null;
  refreshKey: number;
  onMatchesChanged: () => void;
  onRequireLogin: () => void;
};

type CachedMatchesPage = {
  matches: MatchSummary[];
  total: number;
};

type LocationResponse = {
  city?: string | null;
};

let detectedCityPromise: Promise<string | null> | null = null;

function detectCurrentCity() {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }

  if (!detectedCityPromise) {
    detectedCityPromise = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          try {
            const params = new URLSearchParams({
              latitude: String(coords.latitude),
              longitude: String(coords.longitude),
            });
            const response = await fetch(`/api/location?${params.toString()}`);
            const data = (await response.json()) as LocationResponse;

            resolve(response.ok ? data.city ?? null : null);
          } catch {
            resolve(null);
          }
        },
        () => resolve(null),
        {
          enableHighAccuracy: false,
          maximumAge: 30 * 60 * 1000,
          timeout: 8000,
        }
      );
    });
  }

  return detectedCityPromise;
}

function getMatchesCacheKey(
  userId: string | undefined,
  city: string,
  district: string,
  page: number
) {
  return `${userId ?? "guest"}::${city || "all"}::${
    district || "all"
  }::page-${page}`;
}

export function MatchesSection({
  currentUser,
  refreshKey,
  onMatchesChanged,
  onRequireLogin,
}: MatchesSectionProps) {
  const [openMatches, setOpenMatches] = useState<MatchSummary[]>([]);
  const [matchesStatus, setMatchesStatus] = useState("正在載入球局...");
  const [actionStatus, setActionStatus] = useState("");
  const [cancellingMatchId, setCancellingMatchId] = useState<string | null>(null);
  const [deletingMatchId, setDeletingMatchId] = useState<string | null>(null);
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);
  const [leavingMatchId, setLeavingMatchId] = useState<string | null>(null);
  const [selectedMatchCity, setSelectedMatchCity] = useState("");
  const [selectedMatchDistrict, setSelectedMatchDistrict] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalMatches, setTotalMatches] = useState(0);
  const matchesCacheRef = useRef(new Map<string, CachedMatchesPage>());
  const lastRefreshKeyRef = useRef(refreshKey);
  const hasManuallySelectedCityRef = useRef(false);

  const matchDistrictOptions = useMemo(() => {
    if (!selectedMatchCity) return [];

    return (
      municipalities.find(
        (municipality) => municipality.city === selectedMatchCity
      )?.districts ?? []
    );
  }, [selectedMatchCity]);

  useEffect(() => {
    let isActive = true;

    void detectCurrentCity().then((city) => {
      if (!isActive || !city || hasManuallySelectedCityRef.current) return;

      const isSupportedCity = municipalities.some(
        (municipality) => municipality.city === city
      );

      if (!isSupportedCity) return;

      setSelectedMatchCity(city);
      setSelectedMatchDistrict("");
      setCurrentPage(1);
      setOpenMatches([]);
      setTotalMatches(0);
      setMatchesStatus("正在載入附近球局...");
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (lastRefreshKeyRef.current !== refreshKey) {
      matchesCacheRef.current.clear();
      lastRefreshKeyRef.current = refreshKey;
    }

    const cacheKey = getMatchesCacheKey(
      currentUser?.id,
      selectedMatchCity,
      selectedMatchDistrict,
      currentPage
    );
    const cachedPage = matchesCacheRef.current.get(cacheKey);

    if (cachedPage) {
      setOpenMatches(cachedPage.matches);
      setTotalMatches(cachedPage.total);
      setMatchesStatus(
        cachedPage.matches.length > 0 ? "" : "目前沒有符合條件的球局。"
      );
      return;
    }

    const params = new URLSearchParams();

    if (selectedMatchCity) {
      params.set("city", selectedMatchCity);
    }

    if (selectedMatchDistrict) {
      params.set("district", selectedMatchDistrict);
    }

    if (currentUser?.id) {
      params.set("userId", currentUser.id);
    }

    params.set("page", String(currentPage));

    const controller = new AbortController();

    async function loadMatches() {
      try {
        const queryString = params.toString();
        const response = await fetch(
          queryString ? `/api/matches?${queryString}` : "/api/matches",
          { signal: controller.signal }
        );
        const data = (await response.json()) as MatchesResponse;

        if (!response.ok) {
          setMatchesStatus(formatApiMessage(data, "讀取球局資料失敗。"));
          return;
        }

        const nextMatches = data.matches ?? [];
        const nextTotal = data.pagination?.total ?? nextMatches.length;

        matchesCacheRef.current.set(cacheKey, {
          matches: nextMatches,
          total: nextTotal,
        });
        setOpenMatches(nextMatches);
        setTotalMatches(nextTotal);
        setMatchesStatus(nextMatches.length > 0 ? "" : "目前沒有符合條件的球局。");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setMatchesStatus("無法讀取球局資料，請稍後再試。");
      }
    }

    loadMatches();

    return () => {
      controller.abort();
    };
  }, [
    currentUser?.id,
    selectedMatchCity,
    selectedMatchDistrict,
    currentPage,
    refreshKey,
  ]);

  function preparePage(
    city: string,
    district: string,
    page: number
  ) {
    const cacheKey = getMatchesCacheKey(currentUser?.id, city, district, page);
    const cachedPage = matchesCacheRef.current.get(cacheKey);

    setOpenMatches(cachedPage?.matches ?? []);
    setTotalMatches(cachedPage?.total ?? 0);
    setMatchesStatus(
      cachedPage
        ? cachedPage.matches.length > 0
          ? ""
          : "目前沒有符合條件的球局。"
        : "正在載入球局..."
    );
  }

  function handleMatchCitySelect(city: string) {
    const nextCity = selectedMatchCity === city ? "" : city;

    hasManuallySelectedCityRef.current = true;
    setSelectedMatchCity(nextCity);
    setSelectedMatchDistrict("");
    setCurrentPage(1);
    preparePage(nextCity, "", 1);
    setActionStatus("");
  }

  function handleMatchDistrictSelect(district: string) {
    setSelectedMatchDistrict(district);
    setCurrentPage(1);
    preparePage(selectedMatchCity, district, 1);
    setActionStatus("");
  }

  function handlePageChange(page: number) {
    if (page === currentPage || page < 1) return;

    setCurrentPage(page);
    preparePage(selectedMatchCity, selectedMatchDistrict, page);
    setActionStatus("");
  }

  function refreshMatchesAfterMutation() {
    matchesCacheRef.current.clear();
    setCurrentPage(1);
    onMatchesChanged();
  }

  async function handleCancelMatch(matchId: string) {
    if (!currentUser) {
      setActionStatus("請先登入後再取消球局。");
      return;
    }

    setActionStatus("");
    setCancellingMatchId(matchId);

    try {
      const response = await fetch("/api/matches", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "cancel",
          matchId,
          userId: currentUser.id,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (handleUnauthorizedResponse(response)) {
        onRequireLogin();
      }

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "取消球局失敗。"));
        return;
      }

      setActionStatus(formatApiMessage(data, "球局已取消。"));
      refreshMatchesAfterMutation();
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setCancellingMatchId(null);
    }
  }

  async function handleDeleteMatch(matchId: string) {
    if (!currentUser) {
      setActionStatus("請先登入後再刪除球局。");
      return;
    }

    setActionStatus("");
    setDeletingMatchId(matchId);

    try {
      const response = await fetch("/api/matches", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          matchId,
          userId: currentUser.id,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (handleUnauthorizedResponse(response)) {
        onRequireLogin();
      }

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "刪除球局失敗。"));
        return;
      }

      setActionStatus(formatApiMessage(data, "球局已刪除。"));
      refreshMatchesAfterMutation();
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setDeletingMatchId(null);
    }
  }

  async function handleJoinMatch(matchId: string) {
    if (!currentUser) {
      onRequireLogin();
      setActionStatus("請先登入後再加入球局。");
      return;
    }

    setActionStatus("");
    setJoiningMatchId(matchId);

    try {
      const response = await fetch("/api/matches", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "join",
          matchId,
          userId: currentUser.id,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (handleUnauthorizedResponse(response)) {
        onRequireLogin();
      }

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "加入球局失敗。"));
        return;
      }

      setOpenMatches((matches) =>
        matches.map((match) =>
          match.id === matchId
            ? updateMatchParticipation(match, currentUser, true)
            : match
        )
      );

      if (data.message === "你已經加入此球局。") {
        refreshMatchesAfterMutation();
        return;
      }

      setActionStatus(formatApiMessage(data, "已加入球局。"));
      refreshMatchesAfterMutation();
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setJoiningMatchId(null);
    }
  }

  async function handleLeaveMatch(matchId: string) {
    if (!currentUser) {
      onRequireLogin();
      setActionStatus("請先登入後再退出球局。");
      return;
    }

    setActionStatus("");
    setLeavingMatchId(matchId);

    try {
      const response = await fetch("/api/matches", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "leave",
          matchId,
          userId: currentUser.id,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (handleUnauthorizedResponse(response)) {
        onRequireLogin();
      }

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "退出球局失敗。"));
        return;
      }

      setOpenMatches((matches) =>
        matches.map((match) =>
          match.id === matchId
            ? updateMatchParticipation(match, currentUser, false)
            : match
        )
      );

      setActionStatus(formatApiMessage(data, "已退出球局。"));
      refreshMatchesAfterMutation();
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setLeavingMatchId(null);
    }
  }

  function handleMatchAction(matchId: string, action: MatchCardActionType) {
    if (action === "cancel") {
      handleCancelMatch(matchId);
      return;
    }

    if (action === "delete") {
      handleDeleteMatch(matchId);
      return;
    }

    if (action === "leave") {
      handleLeaveMatch(matchId);
      return;
    }

    handleJoinMatch(matchId);
  }

  return (
    <section className="match-column" aria-labelledby="matches-title">
      <div className="column-heading">
        <p className="eyebrow">Open matches</p>
        <h2 id="matches-title">近期球局</h2>
      </div>

      <div className="match-list">
        <div className="match-filter-panel" aria-label="篩選近期球局">
          <div className="city-field">
            <div
              className="city-toggle match-city-toggle"
              aria-label="選擇球局城市"
            >
              {municipalities.map(({ city }) => (
                <button
                  aria-pressed={selectedMatchCity === city}
                  className={`filter-chip ${
                    selectedMatchCity === city ? "active" : ""
                  }`}
                  key={city}
                  onClick={() => handleMatchCitySelect(city)}
                  type="button"
                >
                  {city}
                </button>
              ))}
            </div>
          </div>

          <label className="match-district-field">
            行政區
            <select
              disabled={!selectedMatchCity}
              onChange={(event) => handleMatchDistrictSelect(event.target.value)}
              value={selectedMatchDistrict}
            >
              <option value="">不限行政區</option>
              {matchDistrictOptions.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>
        </div>

        {matchesStatus ? (
          <div className="empty-state" role="status">
            {matchesStatus}
          </div>
        ) : null}

        {actionStatus ? (
          <div className="inline-status" role="status">
            {actionStatus}
          </div>
        ) : null}

        {openMatches.map((match) => (
          <OpenMatchCard
            currentUser={currentUser}
            isCancelling={cancellingMatchId === match.id}
            isDeleting={deletingMatchId === match.id}
            isJoining={joiningMatchId === match.id}
            isLeaving={leavingMatchId === match.id}
            key={match.id}
            match={match}
            onAction={handleMatchAction}
          />
        ))}

        <Pagination
          ariaLabel="近期球局分頁"
          currentPage={currentPage}
          onPageChange={handlePageChange}
          pageSize={MATCHES_PAGE_SIZE}
          totalItems={totalMatches}
        />
      </div>
    </section>
  );
}

type OpenMatchCardProps = {
  currentUser: StoredUser | null;
  isCancelling: boolean;
  isDeleting: boolean;
  isJoining: boolean;
  isLeaving: boolean;
  match: MatchSummary;
  onAction: (matchId: string, action: MatchCardActionType) => void;
};

function OpenMatchCard({
  currentUser,
  isCancelling,
  isDeleting,
  isJoining,
  isLeaving,
  match,
  onAction,
}: OpenMatchCardProps) {
  const pendingAction =
    isCancelling
      ? "cancel"
      : isDeleting
      ? "delete"
      : isJoining
      ? "join"
      : isLeaving
      ? "leave"
      : null;

  return (
    <MatchCard
      action={getMatchCardAction({
        currentUser,
        match,
        onAction,
        pendingAction,
      })}
      currentUser={currentUser}
      match={match}
    />
  );
}
