import type { SupabaseClient } from "@supabase/supabase-js";

type ParticipantRow = {
    match_id: string;
    role: string | null;
    status: string | null;
    user_id: string;
};

type ParticipantUserRow = {
    id: string;
    nickname: string | null;
    ntrp_level: number | null;
};

type ParticipantContactRow = {
    match_id: string;
    user_id: string;
    email: string | null;
};

export type ParticipantSummary = {
    id: string;
    email: string;
    nickname: string;
    ntrpLevel: number | null;
    role: string | null;
    status: string | null;
};

export type VisibleParticipantContacts = Map<string, Map<string, string>>;

export async function loadVisibleParticipantContacts(
    supabase: SupabaseClient | null,
    matchIds: string[]
) {
    const contacts: VisibleParticipantContacts = new Map();

    if (!supabase || matchIds.length === 0) {
        return { data: contacts, error: null };
    }

    const { data, error } = await supabase.rpc(
        "get_visible_match_participant_contacts",
        { p_match_ids: matchIds }
    );

    if (error) {
        return { data: null, error };
    }

    ((data ?? []) as ParticipantContactRow[]).forEach((contact) => {
        const matchContacts = contacts.get(contact.match_id) ?? new Map();

        matchContacts.set(contact.user_id, contact.email ?? "");
        contacts.set(contact.match_id, matchContacts);
    });

    return { data: contacts, error: null };
}

export async function loadParticipantsByMatchId(
    supabase: SupabaseClient,
    matchIds: string[],
    visibleContacts: VisibleParticipantContacts = new Map()
) {
    if (matchIds.length === 0) {
        return { data: new Map<string, ParticipantSummary[]>(), error: null };
    }

    const { data: participantRows, error: participantError } = await supabase
        .from("match_participants")
        .select("match_id, user_id, role, status")
        .eq("status", "已加入")
        .in("match_id", matchIds);

    if (participantError) {
        return { data: null, error: participantError };
    }

    const participants = (participantRows ?? []) as ParticipantRow[];
    const userIds = Array.from(
        new Set(participants.map((participant) => participant.user_id))
    );

    if (userIds.length === 0) {
        return { data: new Map<string, ParticipantSummary[]>(), error: null };
    }

    const { data: userRows, error: userError } = await supabase
        .from("users")
        .select("id, nickname, ntrp_level")
        .in("id", userIds);

    if (userError) {
        return { data: null, error: userError };
    }

    const usersById = new Map(
        ((userRows ?? []) as ParticipantUserRow[]).map((user) => [user.id, user])
    );
    const participantsByMatchId = new Map<string, ParticipantSummary[]>();

    participants.forEach((participant) => {
        const user = usersById.get(participant.user_id);
        const visibleEmail = visibleContacts
            .get(participant.match_id)
            ?.get(participant.user_id);
        const nextParticipant = {
            id: participant.user_id,
            email: visibleEmail ?? "",
            nickname: user?.nickname ?? "未命名球友",
            ntrpLevel: user?.ntrp_level ?? null,
            role: participant.role,
            status: participant.status,
        };
        const matchParticipants =
            participantsByMatchId.get(participant.match_id) ?? [];

        matchParticipants.push(nextParticipant);
        participantsByMatchId.set(participant.match_id, matchParticipants);
    });

    participantsByMatchId.forEach((matchParticipants) => {
        matchParticipants.sort((left, right) => {
            if (left.role === "創建者" && right.role !== "創建者") return -1;
            if (right.role === "創建者" && left.role !== "創建者") return 1;

            return left.nickname.localeCompare(right.nickname, "zh-Hant-TW");
        });
    });

    return { data: participantsByMatchId, error: null };
}
