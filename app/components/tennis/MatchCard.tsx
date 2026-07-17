"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
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

export function updateMatchParticipation(
  match: MatchSummary,
  currentUser: StoredUser,
  hasJoined: boolean
): MatchSummary {
  if (match.hasJoined === hasJoined) return match;

  const joinedPlayers = Math.max(
    0,
    Math.min(
      match.requiredPlayers,
      match.joinedPlayers + (hasJoined ? 1 : -1)
    )
  );
  const participants = hasJoined
    ? match.participants.some((participant) => participant.id === currentUser.id)
      ? match.participants
      : [
          ...match.participants,
          {
            id: currentUser.id,
            email: currentUser.email,
            nickname: currentUser.name,
            ntrpLevel: currentUser.ntrpLevel ?? null,
            role: "參與者",
            status: "已加入",
          },
        ]
    : match.participants.filter(
        (participant) => participant.id !== currentUser.id
      );
  const status =
    match.status === "已結束"
      ? match.status
      : joinedPlayers >= match.requiredPlayers
        ? "已滿團"
        : match.status === "已滿團"
          ? "徵求中"
          : match.status;

  return {
    ...match,
    hasJoined,
    canViewContacts: hasJoined,
    joinedPlayers,
    participants,
    status,
  };
}

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
  const { locale, t } = useI18n();
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
          <p className="match-time">{formatMatchTime(match.playTime, locale)}</p>
          <div className="match-title-row">
            <h3>{match.court?.name ?? t("match.unknownCourt")}</h3>
            {courtAddress ? (
              <a
                className="match-address-link"
                href={mapsUrl}
                rel="noopener noreferrer"
                target="_blank"
                title={t("match.openMap")}
              >
                {courtAddress}
              </a>
            ) : null}
          </div>
        </div>

        {match.note ? (
          <dl className="match-details" aria-label={t("match.details")}>
            <div className="match-detail-row match-note-row">
              <dt>{t("match.note")}</dt>
              <dd>{match.note}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="match-action-area">
        <div className="match-meta">
          <span className="match-status-pill">
            {match.status === "徵求中"
              ? t("match.status.recruiting")
              : match.status === "已滿團"
                ? t("match.status.full")
                : t("match.status.ended")}
          </span>
          <span className="player-count">
            {t("match.players", {
              joined: match.joinedPlayers,
              required: match.requiredPlayers,
            })}
          </span>
          <span>
            {t("match.perPerson", {
              fee: formatFee(match.feePerPerson, locale),
            })}
          </span>
        </div>
        {action ? (
          <button
            className={action.className}
            disabled={action.disabled || action.isPending}
            onClick={action.onClick}
            type="button"
          >
            {translateActionLabel(
              action.isPending && action.type ? action.pendingLabel : action.label,
              t,
            )}
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
  const { t } = useI18n();
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
      aria-label={t("match.participants")}
    >
      {displayParticipants.length > 0 ? (
        <div className="match-participant-shell">
          <div className="match-participant-table">
            <div className="match-participant-table-head" aria-hidden="true">
              <span>{t("match.player")}</span>
              <span>{t("match.email")}</span>
              <span>{t("common.ntrp")}</span>
            </div>
            <div className="match-participant-table-body">
              {displayParticipants.map((participant) => (
                <ParticipantRow
                  canViewContacts={match.canViewContacts}
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
              aria-label={
                isExpanded
                  ? t("match.collapsePlayers")
                  : t("match.expandPlayers")
              }
              className="match-participant-toggle"
              onClick={() => setIsExpanded((current) => !current)}
              type="button"
            >
              <span aria-hidden="true">⌄</span>
            </button>
          ) : null}
        </div>
      ) : (
        <p className="match-participant-empty">{t("match.noParticipants")}</p>
      )}
    </section>
  );
}

type ParticipantRowProps = {
  canViewContacts: boolean;
  currentUser: StoredUser | null;
  participant: MatchParticipant;
};

function ParticipantRow({
  canViewContacts,
  currentUser,
  participant,
}: ParticipantRowProps) {
  const { t } = useI18n();
  const profileHref =
    currentUser?.id === participant.id ? "/profile" : `/profile/${participant.id}`;
  const ntrpLabel =
    participant.ntrpLevel === null ? t("common.notProvided") : String(participant.ntrpLevel);
  const isCreator = participant.role === "創建者";

  return (
    <div className="match-participant-row">
      <Link
        aria-label={
          isCreator
            ? `${participant.nickname}, ${t("match.creator")}`
            : participant.nickname
        }
        className={`match-host-link${isCreator ? " match-host-link-creator" : ""}`}
        data-role-label={isCreator ? t("match.creator") : undefined}
        href={profileHref}
        title={isCreator ? t("match.creator") : undefined}
      >
        {participant.nickname}
      </Link>
      {!canViewContacts ? (
        <span className="match-participant-muted">{t("match.privateEmail")}</span>
      ) : participant.email ? (
        <a className="match-email-link" href={`mailto:${participant.email}`}>
          {participant.email}
        </a>
      ) : (
        <span className="match-participant-muted">{t("match.noEmail")}</span>
      )}
      <span className="match-participant-ntrp">{ntrpLabel}</span>
    </div>
  );
}

function translateActionLabel(
  label: string,
  t: ReturnType<typeof useI18n>["t"],
) {
  const labels = {
    刪除: "match.action.delete",
    刪除中: "match.action.deleting",
    已結束: "match.action.ended",
    取消: "match.action.cancel",
    取消中: "match.action.canceling",
    退出: "match.action.leave",
    退出中: "match.action.leaving",
    已滿團: "match.action.full",
    加入: "match.action.join",
    加入中: "match.action.joining",
  } as const;

  return t(labels[label as keyof typeof labels] ?? "match.operationFailed");
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
