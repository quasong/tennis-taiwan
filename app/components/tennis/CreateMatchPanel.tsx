import { FormEvent, useEffect, useMemo, useState } from "react";
import { handleUnauthorizedResponse } from "./authStore";
import { formatApiMessage } from "./format";
import { municipalities } from "./locations";
import type { Court, CourtsResponse, MatchResponse, StoredUser } from "./types";

type CreateMatchPanelProps = {
  currentUser: StoredUser | null;
  onMatchCreated: () => void;
  onRequireLogin: () => void;
};

const playerOptions = Array.from({ length: 7 }, (_, index) => index + 2);

export function CreateMatchPanel({
  currentUser,
  onMatchCreated,
  onRequireLogin,
}: CreateMatchPanelProps) {
  const [courts, setCourts] = useState<Court[]>([]);
  const [courtsStatus, setCourtsStatus] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedDistrict, setSelectedDistrict] = useState("");
  const [selectedCourtId, setSelectedCourtId] = useState("");
  const [matchTime, setMatchTime] = useState("");
  const [maxPlayers, setMaxPlayers] = useState("4");
  const [fee, setFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [createStatus, setCreateStatus] = useState("");
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);

  const districtOptions = useMemo(() => {
    if (!selectedCity) return [];

    return (
      municipalities.find((municipality) => municipality.city === selectedCity)
        ?.districts ?? []
    );
  }, [selectedCity]);

  const selectedCourt = useMemo(
    () => courts.find((court) => court.id === selectedCourtId),
    [courts, selectedCourtId]
  );

  const courtPlaceholder = useMemo(() => {
    if (!selectedCity) return "請先選擇城市";
    if (courtsStatus) return courtsStatus;
    return "選擇球場";
  }, [courtsStatus, selectedCity]);

  useEffect(() => {
    if (!selectedCity) {
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ city: selectedCity });

    if (selectedDistrict) {
      params.set("district", selectedDistrict);
    }

    async function loadCourts() {
      try {
        const response = await fetch(`/api/courts?${params.toString()}`, {
          signal: controller.signal,
        });
      const data = (await response.json()) as CourtsResponse;

      if (!response.ok) {
          setCourtsStatus(formatApiMessage(data, "讀取球場資料失敗。"));
          return;
        }

        const nextCourts = data.courts ?? [];
        setCourts(nextCourts);
        setCourtsStatus(nextCourts.length > 0 ? "" : "這個條件目前沒有球場。");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCourtsStatus("無法讀取球場資料，請稍後再試。");
      }
    }

    loadCourts();

    return () => {
      controller.abort();
    };
  }, [selectedCity, selectedDistrict]);

  function handleCitySelect(city: string) {
    setSelectedCity(city);
    setSelectedDistrict("");
    setSelectedCourtId("");
    setCourts([]);
    setCourtsStatus("正在載入球場...");
    setCreateStatus("");
  }

  async function handleCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStatus("");

    if (!currentUser) {
      onRequireLogin();
      setCreateStatus("請先登入後再建立球局。");
      return;
    }

    if (!selectedCity || !selectedCourtId || !matchTime) {
      setCreateStatus("請選擇城市、球場和時間。");
      return;
    }

    setIsCreatingMatch(true);

    try {
      const response = await fetch("/api/matches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: currentUser.id,
          courtId: selectedCourtId,
          matchTime,
          maxPlayers: Number(maxPlayers),
          fee: Number(fee || 0),
          notes,
        }),
      });
      const data = (await response.json()) as MatchResponse;

      if (handleUnauthorizedResponse(response)) {
        onRequireLogin();
      }

      if (!response.ok) {
        setCreateStatus(formatApiMessage(data, "建立球局失敗。"));
        return;
      }

      setCreateStatus(formatApiMessage(data, "約球建立成功。"));
      setSelectedCourtId("");
      setMatchTime("");
      setFee("0");
      setNotes("");
      onMatchCreated();
    } catch {
      setCreateStatus("網路連線異常，請稍後再試。");
    } finally {
      setIsCreatingMatch(false);
    }
  }

  return (
    <aside className="create-column" aria-labelledby="create-title">
      <div className="column-heading">
        <p className="eyebrow">Create</p>
        <h2 id="create-title">發起新球局</h2>
      </div>
      <div className="create-panel">
        <div className="city-field">
          <span className="field-caption">選擇城市</span>
          <div className="city-toggle" aria-label="選擇城市">
            {municipalities.map(({ city }) => (
              <button
                className={`filter-chip ${selectedCity === city ? "active" : ""}`}
                key={city}
                onClick={() => handleCitySelect(city)}
                type="button"
              >
                {city}
              </button>
            ))}
          </div>
        </div>
        <form className="compact-form" onSubmit={handleCreateMatch}>
          <label>
            行政區
            <select
              disabled={!selectedCity || districtOptions.length === 0}
              onChange={(event) => {
                setSelectedDistrict(event.target.value);
                setSelectedCourtId("");
                setCourts([]);
                setCourtsStatus("正在載入球場...");
                setCreateStatus("");
              }}
              value={selectedDistrict}
            >
              <option value="">不限行政區</option>
              {districtOptions.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>

          <label>
            球場
            <select
              disabled={!selectedCity}
              onChange={(event) => {
                setSelectedCourtId(event.target.value);
                setCreateStatus("");
              }}
              required
              value={selectedCourtId}
            >
              <option value="">{courtPlaceholder}</option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name}
                  {court.district ? `｜${court.district}` : ""}
                </option>
              ))}
            </select>
          </label>

          {selectedCourt ? (
            <div className="court-detail">
              <strong>{selectedCourt.name}</strong>
              <span>{selectedCourt.address ?? "尚未提供地址"}</span>
              <small>
                {selectedCourt.city}
                {selectedCourt.district ? ` / ${selectedCourt.district}` : ""}
                {selectedCourt.surface ? ` / ${selectedCourt.surface}` : ""}
              </small>
            </div>
          ) : null}

          <label>
            時間
            <input
              onChange={(event) => setMatchTime(event.target.value)}
              required
              type="datetime-local"
              value={matchTime}
            />
          </label>
          <label>
            人數
            <select
              onChange={(event) => setMaxPlayers(event.target.value)}
              value={maxPlayers}
            >
              {playerOptions.map((players) => (
                <option key={players} value={players}>
                  {players} 人
                </option>
              ))}
            </select>
          </label>

          <label>
            每人費用
            <input
              min="0"
              onChange={(event) => setFee(event.target.value)}
              step="1"
              type="number"
              value={fee}
            />
          </label>

          <label>
            備註
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder="例：雙打、程度 3.0 以上、歡迎新朋友"
              rows={3}
              value={notes}
            />
          </label>

          {courtsStatus || createStatus ? (
            <p className="form-message" role="status">
              {createStatus || courtsStatus}
            </p>
          ) : null}

          <button
            className="solid-button full-width"
            disabled={isCreatingMatch || Boolean(courtsStatus)}
          >
            {isCreatingMatch
              ? "建立中..."
              : currentUser
                ? "建立球局"
                : "登入後建立"}
          </button>
        </form>
      </div>
    </aside>
  );
}
