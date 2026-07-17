"use client";

import { useEffect, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";

type StatsResponse = {
  averageNtrp?: number | null;
  recentCourtCount?: number;
  totalMatchCount?: number;
};

export function Hero() {
  const { t } = useI18n();
  const [averageNtrp, setAverageNtrp] = useState("3.5");
  const [recentCourtCount, setRecentCourtCount] = useState<number | null>(null);
  const [totalMatchCount, setTotalMatchCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStats() {
      try {
        const response = await fetch("/api/stats", {
          signal: controller.signal,
        });
        const data = (await response.json()) as StatsResponse;

        if (!response.ok) {
          return;
        }

        if (data.averageNtrp !== null && data.averageNtrp !== undefined) {
          setAverageNtrp(data.averageNtrp.toFixed(1));
        }

        if (
          data.recentCourtCount !== undefined &&
          Number.isInteger(data.recentCourtCount) &&
          data.recentCourtCount >= 0
        ) {
          setRecentCourtCount(data.recentCourtCount);
        }

        if (
          data.totalMatchCount !== undefined &&
          Number.isInteger(data.totalMatchCount) &&
          data.totalMatchCount >= 0
        ) {
          setTotalMatchCount(data.totalMatchCount);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
      }
    }

    loadStats();

    return () => {
      controller.abort();
    };
  }, []);

  return (
    <section className="overview">
      <div className="intro">
        <p className="eyebrow">{t("hero.eyebrow")}</p>
        <h1>{t("hero.title")}</h1>
        <p className="lead">{t("hero.description")}</p>
        <div className="quick-stats" aria-label={t("hero.summary")}>
          <span>
            <strong>{totalMatchCount ?? "—"}</strong>
            <small>{t("hero.totalMatches")}</small>
          </span>
          <span>
            <strong>{recentCourtCount ?? "—"}</strong>
            <small>{t("hero.recentCourts")}</small>
          </span>
          <span>
            <strong>{averageNtrp}</strong>
            <small>{t("hero.averageNtrp")}</small>
          </span>
        </div>
      </div>

      <div className="court-visual" aria-label={t("hero.visual")}>
        <div className="court-frame">
          <div className="court-line court-line-vertical" />
          <div className="court-line court-line-horizontal" />
          <div className="court-service court-service-left" />
          <div className="court-service court-service-right" />
          <span className="player-dot player-one" />
          <span className="player-dot player-two" />
          <span className="ball-dot" />
        </div>
      </div>
    </section>
  );
}
