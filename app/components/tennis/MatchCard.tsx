"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatFee, formatMatchTime } from "./format";
import type { MatchParticipant, MatchSummary, StoredUser } from "./types";

export type MatchCardActionType = "cancel" | "delete" | "join" | "leave";

export type MatchCardActionConfig = {
  className: string;
  disabled?: boolean;
  isPending?: boolean;
  label: string;
  onClick?: () => void;
  pendingLabel: string;
  type: MatchCardActionType | null;
};

type MatchCardProps = {
  action: MatchCardActionConfig | null;
  currentUser: StoredUser | null;
  match: MatchSummary;
};

type GetMatchCardActionProps = {
  currentUser: StoredUser | null;
  match: MatchSummary;
  onAction: (matchId: string, action: MatchCardActionType) => void;
  pendingAction?: MatchCardActionType | null;
};

export function getMatchCardAction({
  currentUser,
  match,
  onAction,
  pendingAction = null,
}: GetMatchCardActionProps): MatchCardActionConfig {
  const isHost = currentUser?.id === match.host.id;
  const isEnded = match.status === "已結束";
  const isFull = match.status === "已滿團";

  if (isHost && isEnded) {
    return {
      className: "cancel-match-button",
      isPending: pendingAction === "delete",
      label: "刪除",
      onClick: () => onAction(match.id, "delete"),
      pendingLabel: "刪除中",
      type: "delete",
    };
  }

  if (isEnded) {
    return {
      className: "full-match-button",
      disabled: true,
      label: "已結束",
      pendingLabel: "已結束",
      type: null,
    };
  }

  if (isHost) {
    return {
      className: "cancel-match-button",
      isPending: pendingAction === "cancel",
      label: "取消",
      onClick: () => onAction(match.id, "cancel"),
      pendingLabel: "取消中",
      type: "cancel",
    };
  }

  if (match.hasJoined) {
    return {
      className: "cancel-match-button",
      isPending: pendingAction === "leave",
      label: "退出",
      onClick: () => onAction(match.id, "leave"),
      pendingLabel: "退出中",
      type: "leave",
    };
  }

  if (isFull) {
    return {
      className: "full-match-button",
      disabled: true,
      label: "已滿團",
      pendingLabel: "已滿團",
      type: null,
    };
  }

  return {
    className: "join-button",
    isPending: pendingAction === "join",
    label: "加入",
    onClick: () => onAction(match.id, "join"),
    pendingLabel: "加入中",
    type: "join",
  };
}

export function MatchCard({ action, currentUser, match }: MatchCardProps) {
  const courtAddress = match.court?.address?.trim();
  const mapsUrl = courtAddress
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
        courtAddress
      )}`
    : "";

  return (
    <article className="match-card">
      <div className="match-card-content">
        <div className="match-primary">
          <p className="match-time">{formatMatchTime(match.playTime)}</p>
          <div className="match-title-row">
            <h3>{match.court?.name ?? "未知球場"}</h3>
            {courtAddress ? (
              <a
                className="match-address-link"
                href={mapsUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                {courtAddress}
              </a>
            ) : null}
          </div>
        </div>

        {match.note ? (
          <dl className="match-details" aria-label="球局資訊">
            <div className="match-detail-row match-note-row">
              <dt>備註</dt>
              <dd>{match.note}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="match-action-area">
        <div className="match-meta">
          <span className="match-status-pill">{match.status}</span>
          <span className="player-count">
            {match.joinedPlayers} / {match.requiredPlayers} 人
          </span>
          <span>{formatFee(match.feePerPerson)} / 人</span>
        </div>
        {action ? (
          <button
            className={action.className}
            disabled={action.disabled || action.isPending}
            onClick={action.onClick}
            type="button"
          >
            {action.isPending && action.type ? action.pendingLabel : action.label}
          </button>
        ) : null}
      </div>
      <ParticipantList currentUser={currentUser} match={match} />
    </article>
  );
}

type ParticipantListProps = {
  currentUser: StoredUser | null;
  match: MatchSummary;
};

function ParticipantList({ currentUser, match }: ParticipantListProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const participants = match.participants;
  const displayParticipants = useMemo(
    () => getDisplayParticipants(match, participants),
    [match, participants]
  );
  const canExpand = displayParticipants.length > 1;

  return (
    <section
      className={`match-participants-panel ${isExpanded ? "expanded" : ""}`}
      aria-label="參與者名單"
    >
      {displayParticipants.length > 0 ? (
        <div className="match-participant-shell">
          <div className="match-participant-table">
            <div className="match-participant-table-head" aria-hidden="true">
              <span>玩家</span>
              <span>信箱</span>
              <span>NTRP</span>
            </div>
            <div className="match-participant-table-body">
              {displayParticipants.map((participant) => (
                <ParticipantRow
                  currentUser={currentUser}
                  key={`${match.id}-${participant.id}`}
                  participant={participant}
                />
              ))}
            </div>
          </div>
          {canExpand ? (
            <button
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "收合參與者名單" : "展開全部參與者"}
              className="match-participant-toggle"
              onClick={() => setIsExpanded((current) => !current)}
              type="button"
            >
              <span aria-hidden="true">⌄</span>
            </button>
          ) : null}
        </div>
      ) : (
        <p className="match-participant-empty">目前沒有參與者資料。</p>
      )}
    </section>
  );
}

type ParticipantRowProps = {
  currentUser: StoredUser | null;
  participant: MatchParticipant;
};

function ParticipantRow({ currentUser, participant }: ParticipantRowProps) {
  const profileHref =
    currentUser?.id === participant.id ? "/profile" : `/profile/${participant.id}`;
  const ntrpLabel =
    participant.ntrpLevel === null ? "未提供" : String(participant.ntrpLevel);
  const isCreator = participant.role === "創建者";

  return (
    <div className="match-participant-row">
      <Link
        aria-label={isCreator ? `${participant.nickname}，創建者` : participant.nickname}
        className={`match-host-link${isCreator ? " match-host-link-creator" : ""}`}
        href={profileHref}
        title={isCreator ? "創建者" : undefined}
      >
        {participant.nickname}
      </Link>
      {participant.email ? (
        <a className="match-email-link" href={`mailto:${participant.email}`}>
          {participant.email}
        </a>
      ) : (
        <span className="match-participant-muted">未提供信箱</span>
      )}
      <span className="match-participant-ntrp">{ntrpLabel}</span>
    </div>
  );
}

function getDisplayParticipants(
  match: MatchSummary,
  participants: MatchParticipant[]
): MatchParticipant[] {
  const hostParticipant =
    participants.find((participant) => participant.id === match.host.id) ?? {
      id: match.host.id,
      email: match.host.email,
      nickname: match.host.nickname,
      ntrpLevel: null,
      role: "創建者",
      status: "已加入",
    };
  const otherParticipants = participants.filter(
    (participant) => participant.id !== match.host.id
  );

  return [hostParticipant, ...otherParticipants];
}
