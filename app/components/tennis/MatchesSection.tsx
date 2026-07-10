import { useEffect, useMemo, useState } from "react";
import { formatFee, formatMatchTime } from "./format";
import { municipalities } from "./locations";
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
  const [joiningMatchId, setJoiningMatchId] = useState<string | null>(null);
  const [selectedMatchCity, setSelectedMatchCity] = useState("");
  const [selectedMatchDistrict, setSelectedMatchDistrict] = useState("");

  const matchDistrictOptions = useMemo(() => {
    if (!selectedMatchCity) return [];

    return (
      municipalities.find(
        (municipality) => municipality.city === selectedMatchCity
      )?.districts ?? []
    );
  }, [selectedMatchCity]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams();

    if (selectedMatchCity) {
      params.set("city", selectedMatchCity);
    }

    if (selectedMatchDistrict) {
      params.set("district", selectedMatchDistrict);
    }

    async function loadMatches() {
      try {
        const queryString = params.toString();
        const response = await fetch(
          queryString ? `/api/matches?${queryString}` : "/api/matches",
          { signal: controller.signal }
        );
        const data = (await response.json()) as MatchesResponse;

        if (!response.ok) {
          setMatchesStatus(data.message ?? data.error ?? "讀取球局資料失敗。");
          return;
        }

        const nextMatches = data.matches ?? [];
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
  }, [selectedMatchCity, selectedMatchDistrict, refreshKey]);

  function handleMatchCitySelect(city: string) {
    const nextCity = selectedMatchCity === city ? "" : city;

    setSelectedMatchCity(nextCity);
    setSelectedMatchDistrict("");
    setOpenMatches([]);
    setMatchesStatus("正在載入球局...");
    setActionStatus("");
  }

  function handleMatchDistrictSelect(district: string) {
    setSelectedMatchDistrict(district);
    setOpenMatches([]);
    setMatchesStatus("正在載入球局...");
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
        setActionStatus(data.message ?? data.error ?? "取消球局失敗。");
        return;
      }

      setActionStatus(data.message ?? "球局已取消。");
      onMatchesChanged();
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setCancellingMatchId(null);
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
        setActionStatus(data.message ?? data.error ?? "加入球局失敗。");
        return;
      }

      setActionStatus(data.message ?? "已加入球局。");
      onMatchesChanged();
    } catch {
      setActionStatus("網路連線異常，請稍後再試。");
    } finally {
      setJoiningMatchId(null);
    }
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
          <MatchCard
            currentUser={currentUser}
            isCancelling={cancellingMatchId === match.id}
            isJoining={joiningMatchId === match.id}
            key={match.id}
            match={match}
            onCancelMatch={handleCancelMatch}
            onJoinMatch={handleJoinMatch}
          />
        ))}
      </div>
    </section>
  );
}

type MatchCardProps = {
  currentUser: StoredUser | null;
  isCancelling: boolean;
  isJoining: boolean;
  match: MatchSummary;
  onCancelMatch: (matchId: string) => void;
  onJoinMatch: (matchId: string) => void;
};

function MatchCard({
  currentUser,
  isCancelling,
  isJoining,
  match,
  onCancelMatch,
  onJoinMatch,
}: MatchCardProps) {
  const isHost = currentUser?.id === match.host.id;
  const isFull = match.status === "已滿團";

  return (
    <article className="match-card">
      <div>
        <p className="match-time">{formatMatchTime(match.playTime)}</p>
        <h3>{match.court?.name ?? "未知球場"}</h3>
        <p>創建者：{match.host.nickname}</p>
      </div>
      <div className="match-meta">
        <span className="player-count">
          {match.joinedPlayers} / {match.requiredPlayers} 人
        </span>
        <span>{formatFee(match.feePerPerson)} / 人</span>
      </div>
      {isHost ? (
        <button
          className="cancel-match-button"
          disabled={isCancelling}
          onClick={() => onCancelMatch(match.id)}
          type="button"
        >
          {isCancelling ? "取消中" : "取消"}
        </button>
      ) : isFull ? (
        <button className="full-match-button" disabled type="button">
          已滿團
        </button>
      ) : (
        <button
          className="join-button"
          disabled={isJoining}
          onClick={() => onJoinMatch(match.id)}
          type="button"
        >
          {isJoining ? "加入中" : "加入"}
        </button>
      )}
    </article>
  );
}
