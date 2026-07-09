import { useEffect, useMemo, useState } from "react";
import { formatFee, formatMatchTime } from "./format";
import { municipalities } from "./locations";
import type { MatchesResponse, MatchSummary } from "./types";

type MatchesSectionProps = {
  refreshKey: number;
};

export function MatchesSection({ refreshKey }: MatchesSectionProps) {
  const [openMatches, setOpenMatches] = useState<MatchSummary[]>([]);
  const [matchesStatus, setMatchesStatus] = useState("正在載入球局...");
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
  }

  function handleMatchDistrictSelect(district: string) {
    setSelectedMatchDistrict(district);
    setOpenMatches([]);
    setMatchesStatus("正在載入球局...");
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

        {openMatches.map((match) => (
          <article className="match-card" key={match.id}>
            <div>
              <p className="match-time">{formatMatchTime(match.playTime)}</p>
              <h3>{match.court?.name ?? "未知球場"}</h3>
              <p>創建者：{match.host.nickname}</p>
            </div>
            <div className="match-meta">
              <span>{formatFee(match.feePerPerson)} / 人</span>
            </div>
            <button className="join-button" type="button">
              加入
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
