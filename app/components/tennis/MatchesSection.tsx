import { useEffect, useMemo, useRef, useState } from "react";
import { formatApiMessage } from "./format";
import { municipalities } from "./locations";
import {
  getMatchCardAction,
  MatchCard,
  type MatchCardActionType,
} from "./MatchCard";
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

function getMatchesCacheKey(
  userId: string | undefined,
  city: string,
  district: string
) {
  return `${userId ?? "guest"}::${city || "all"}::${district || "all"}`;
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
  const matchesCacheRef = useRef(new Map<string, MatchSummary[]>());
  const lastRefreshKeyRef = useRef(refreshKey);

  const matchDistrictOptions = useMemo(() => {
    if (!selectedMatchCity) return [];

    return (
      municipalities.find(
        (municipality) => municipality.city === selectedMatchCity
      )?.districts ?? []
    );
  }, [selectedMatchCity]);

  useEffect(() => {
    if (lastRefreshKeyRef.current !== refreshKey) {
      matchesCacheRef.current.clear();
      lastRefreshKeyRef.current = refreshKey;
    }

    const cacheKey = getMatchesCacheKey(
      currentUser?.id,
      selectedMatchCity,
      selectedMatchDistrict
    );
    const cachedMatches = matchesCacheRef.current.get(cacheKey);

    if (cachedMatches) {
      setOpenMatches(cachedMatches);
      setMatchesStatus(
        cachedMatches.length > 0 ? "" : "目前沒有符合條件的球局。"
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
        matchesCacheRef.current.set(cacheKey, nextMatches);
        setOpenMatches(nextMatches);
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
  }, [currentUser?.id, selectedMatchCity, selectedMatchDistrict, refreshKey]);

  function handleMatchCitySelect(city: string) {
    const nextCity = selectedMatchCity === city ? "" : city;
    const cacheKey = getMatchesCacheKey(currentUser?.id, nextCity, "");
    const cachedMatches = matchesCacheRef.current.get(cacheKey);

    setSelectedMatchCity(nextCity);
    setSelectedMatchDistrict("");
    setOpenMatches(cachedMatches ?? []);
    setMatchesStatus(
      cachedMatches
        ? cachedMatches.length > 0
          ? ""
          : "目前沒有符合條件的球局。"
        : "正在載入球局..."
    );
    setActionStatus("");
  }

  function handleMatchDistrictSelect(district: string) {
    const cacheKey = getMatchesCacheKey(
      currentUser?.id,
      selectedMatchCity,
      district
    );
    const cachedMatches = matchesCacheRef.current.get(cacheKey);

    setSelectedMatchDistrict(district);
    setOpenMatches(cachedMatches ?? []);
    setMatchesStatus(
      cachedMatches
        ? cachedMatches.length > 0
          ? ""
          : "目前沒有符合條件的球局。"
        : "正在載入球局..."
    );
    setActionStatus("");
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

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "取消球局失敗。"));
        return;
      }

      setActionStatus(formatApiMessage(data, "球局已取消。"));
      matchesCacheRef.current.clear();
      onMatchesChanged();
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

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "刪除球局失敗。"));
        return;
      }

      setActionStatus(formatApiMessage(data, "球局已刪除。"));
      matchesCacheRef.current.clear();
      onMatchesChanged();
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

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "加入球局失敗。"));
        return;
      }

      if (data.message === "你已經加入此球局。") {
        matchesCacheRef.current.clear();
        onMatchesChanged();
        return;
      }

      setActionStatus(formatApiMessage(data, "已加入球局。"));
      matchesCacheRef.current.clear();
      onMatchesChanged();
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

      if (!response.ok) {
        setActionStatus(formatApiMessage(data, "退出球局失敗。"));
        return;
      }

      setActionStatus(formatApiMessage(data, "已退出球局。"));
      matchesCacheRef.current.clear();
      onMatchesChanged();
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
