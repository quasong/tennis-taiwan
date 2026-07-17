import { FormEvent, useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import { getCityLabel, getSurfaceLabel } from "../../i18n/locationLabels";
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
  const { locale, t } = useI18n();
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
    if (!selectedCity) return t("create.selectCityFirst");
    if (courtsStatus) return courtsStatus;
    return t("create.selectCourt");
  }, [courtsStatus, selectedCity, t]);

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
          setCourtsStatus(formatApiMessage(data, t("create.courtsFailed")));
          return;
        }

        const nextCourts = data.courts ?? [];
        setCourts(nextCourts);
        setCourtsStatus(nextCourts.length > 0 ? "" : t("create.noCourts"));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setCourtsStatus(t("create.courtsFailed"));
      }
    }

    loadCourts();

    return () => {
      controller.abort();
    };
  }, [selectedCity, selectedDistrict, t]);

  function handleCitySelect(city: string) {
    setSelectedCity(city);
    setSelectedDistrict("");
    setSelectedCourtId("");
    setCourts([]);
    setCourtsStatus(t("create.loadingCourts"));
    setCreateStatus("");
  }

  async function handleCreateMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateStatus("");

    if (!currentUser) {
      onRequireLogin();
      setCreateStatus(t("create.loginRequired"));
      return;
    }

    if (!selectedCity || !selectedCourtId || !matchTime) {
      setCreateStatus(t("create.missingFields"));
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
        setCreateStatus(formatApiMessage(data, t("create.failed")));
        return;
      }

      setCreateStatus(formatApiMessage(data, t("create.success")));
      setSelectedCourtId("");
      setMatchTime("");
      setFee("0");
      setNotes("");
      onMatchCreated();
    } catch {
      setCreateStatus(t("common.networkError"));
    } finally {
      setIsCreatingMatch(false);
    }
  }

  return (
    <aside className="create-column" aria-labelledby="create-title">
      <div className="column-heading">
        <p className="eyebrow">{t("create.eyebrow")}</p>
        <h2 id="create-title">{t("create.title")}</h2>
      </div>
      <div className="create-panel">
        <div className="city-field">
          <span className="field-caption">{t("create.city")}</span>
          <div className="city-toggle" aria-label={t("create.city")}>
            {municipalities.map(({ city }) => (
              <button
                className={`filter-chip ${selectedCity === city ? "active" : ""}`}
                key={city}
                onClick={() => handleCitySelect(city)}
                type="button"
              >
                {getCityLabel(city, locale)}
              </button>
            ))}
          </div>
        </div>
        <form className="compact-form" onSubmit={handleCreateMatch}>
          <label>
            {t("create.district")}
            <select
              disabled={!selectedCity || districtOptions.length === 0}
              onChange={(event) => {
                setSelectedDistrict(event.target.value);
                setSelectedCourtId("");
                setCourts([]);
                setCourtsStatus(t("create.loadingCourts"));
                setCreateStatus("");
              }}
              value={selectedDistrict}
            >
              <option value="">{t("create.allDistricts")}</option>
              {districtOptions.map((district) => (
                <option key={district} value={district}>
                  {district}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("create.court")}
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
              <span>{selectedCourt.address ?? t("create.noAddress")}</span>
              <small>
                {getCityLabel(selectedCourt.city, locale)}
                {selectedCourt.district ? ` / ${selectedCourt.district}` : ""}
                {selectedCourt.surface ? ` / ${getSurfaceLabel(selectedCourt.surface, locale)}` : ""}
              </small>
            </div>
          ) : null}

          <label>
            {t("create.time")}
            <input
              onChange={(event) => setMatchTime(event.target.value)}
              required
              type="datetime-local"
              value={matchTime}
            />
          </label>
          <label>
            {t("create.players")}
            <select
              onChange={(event) => setMaxPlayers(event.target.value)}
              value={maxPlayers}
            >
              {playerOptions.map((players) => (
                <option key={players} value={players}>
                  {t("create.playerOption", { count: players })}
                </option>
              ))}
            </select>
          </label>

          <label>
            {t("create.fee")}
            <input
              min="0"
              onChange={(event) => setFee(event.target.value)}
              step="1"
              type="number"
              value={fee}
            />
          </label>

          <label>
            {t("create.note")}
            <textarea
              onChange={(event) => setNotes(event.target.value)}
              placeholder={t("create.notePlaceholder")}
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
              ? t("create.submitting")
              : currentUser
                ? t("create.submit")
                : t("create.loginToSubmit")}
          </button>
        </form>
      </div>
    </aside>
  );
}
