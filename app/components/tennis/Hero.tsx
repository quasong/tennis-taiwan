"use client";

import { useEffect, useState } from "react";

type StatsResponse = {
  averageNtrp?: number | null;
  recentCourtCount?: number;
  totalMatchCount?: number;
};

export function Hero() {
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
        <p className="eyebrow">Taiwan tennis finder</p>
        <h1>今天想打球，就從一場剛好的約球開始。</h1>
        <p className="lead">
          依城市、程度、時間快速找到球友。登入後即可建立自己的球局，讓臨時手癢變成穩定上場。
        </p>
        <div className="quick-stats" aria-label="平台摘要">
          <span>
            <strong>{totalMatchCount ?? "—"}</strong>
            <small>所有球局</small>
          </span>
          <span>
            <strong>{recentCourtCount ?? "—"}</strong>
            <small>近期球場</small>
          </span>
          <span>
            <strong>{averageNtrp}</strong>
            <small>平均 NTRP</small>
          </span>
        </div>
      </div>

      <div className="court-visual" aria-label="網球場視覺">
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
