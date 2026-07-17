import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { closeExpiredMatches } from "../matches/expiration";
import {
    loadParticipantsByMatchId,
    loadVisibleParticipantContacts,
} from "../matches/participants";
import type {
    ParticipantSummary,
    VisibleParticipantContacts,
} from "../matches/participants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROFILE_MATCHES_PAGE_SIZE = 10;

type CourtRecord = {
    id: string;
    name: string;
    city: string;
    district: string | null;
    address: string | null;
};

type MatchRecord = {
    id: string;
    host_user_id: string;
    court_id: string;
    play_time: string;
    required_players: number;
    joined_players: number;
    estimated_fee_per_person: number | string;
    note: string | null;
    status: string;
    created_at: string;
};

type ParticipantRecord = {
    match_id: string;
    role: string | null;
    status: string | null;
};

type UserRecord = {
    id: string;
    email: string | null;
    nickname: string | null;
    ntrp_level: number | null;
    preferred_court_id: string | null;
    created_at: string | null;
};

type HostRecord = {
    id: string;
    nickname: string | null;
    ntrp_level: number | null;
};

type UpdateProfileBody = {
    nickname?: string;
    ntrpLevel?: number;
};

function createAuthenticatedSupabaseClient(request: NextRequest) {
    const cookiesToSet: {
        name: string;
        value: string;
        options: CookieOptions;
    }[] = [];

    if (!supabaseUrl || !supabasePublishableKey) {
        return {
            supabase: null,
            applyCookies: (response: NextResponse) => response,
        };
    }

    const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookies) {
                cookiesToSet.push(...cookies);
            },
        },
    });

    return {
        supabase,
        applyCookies(response: NextResponse) {
            cookiesToSet.forEach(({ name, value, options }) => {
                response.cookies.set(name, value, options);
            });

            return response;
        },
    };
}

function isValidUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
}

function toMatchSummary(
    match: MatchRecord,
    court: CourtRecord | undefined,
    host: HostRecord | undefined,
    viewerJoinedMatchIds: Set<string>,
    participantsByMatchId: Map<string, ParticipantSummary[]>,
    visibleContacts: VisibleParticipantContacts
) {
    return {
        id: match.id,
        playTime: match.play_time,
        requiredPlayers: match.required_players,
        joinedPlayers: match.joined_players,
        feePerPerson: Number(match.estimated_fee_per_person),
        note: match.note,
        status: match.status,
        hasJoined: viewerJoinedMatchIds.has(match.id),
        canViewContacts: visibleContacts.has(match.id),
        court: court
            ? {
                  id: court.id,
                  name: court.name,
                  city: court.city,
                  district: court.district,
                  address: court.address,
              }
            : null,
        host: {
            id: match.host_user_id,
            email:
                visibleContacts
                    .get(match.id)
                    ?.get(match.host_user_id) ?? "",
            nickname: host?.nickname ?? "未命名球友",
        },
        participants: participantsByMatchId.get(match.id) ?? [],
    };
}

export async function GET(request: NextRequest) {
    const {
        supabase: authenticatedSupabase,
        applyCookies,
    } = createAuthenticatedSupabaseClient(request);
    const json = (body: Record<string, unknown>, status = 200) =>
        applyCookies(
            NextResponse.json(body, {
                status,
                headers: {
                    "Cache-Control": "private, no-store",
                    Vary: "Cookie",
                },
            })
        );

    try {
        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return json(
                { message: "Supabase environment variables are missing." },
                500
            );
        }

        const searchParams = new URL(request.url).searchParams;
        const userId = searchParams.get("userId")?.trim();
        const createdPage = Number(searchParams.get("createdPage") ?? "1");
        const joinedPage = Number(searchParams.get("joinedPage") ?? "1");

        if (!userId) {
            return json(
                { message: "缺少必要欄位：userId。" },
                400
            );
        }

        if (!isValidUuid(userId)) {
            return json(
                { message: "userId 格式不正確。" },
                400
            );
        }

        if (
            !Number.isInteger(createdPage) ||
            createdPage < 1 ||
            !Number.isInteger(joinedPage) ||
            joinedPage < 1
        ) {
            return json(
                { message: "分頁參數格式不正確。" },
                400
            );
        }

        const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
        const {
            data: { user: viewer },
        } = authenticatedSupabase
            ? await authenticatedSupabase.auth.getUser()
            : { data: { user: null } };
        const { error: expirationError } = await closeExpiredMatches(supabase);

        if (expirationError) {
            return json(
                {
                    message: "更新過期球局狀態失敗。",
                    error: expirationError.message,
                },
                500
            );
        }

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id, email, nickname, ntrp_level, preferred_court_id, created_at")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            return json(
                { message: "讀取個人資料失敗。", error: userError.message },
                500
            );
        }

        if (!user) {
            return json(
                { message: "找不到指定的使用者。" },
                404
            );
        }

        const [
            { data: createdRows, error: createdError, count: createdCount },
            { data: participantRows, error: participantError },
        ] = await Promise.all([
            supabase
                .from("matches")
                .select(
                    "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at",
                    { count: "exact" }
                )
                .eq("host_user_id", userId)
                .order("play_time", { ascending: true })
                .range(
                    (createdPage - 1) * PROFILE_MATCHES_PAGE_SIZE,
                    createdPage * PROFILE_MATCHES_PAGE_SIZE - 1
                ),
            supabase
                .from("match_participants")
                .select("match_id, role, status")
                .eq("user_id", userId),
        ]);

        if (createdError) {
            return json(
                { message: "讀取建立球局失敗。", error: createdError.message },
                500
            );
        }

        if (participantError) {
            return json(
                { message: "讀取參與紀錄失敗。", error: participantError.message },
                500
            );
        }

        const createdMatches = (createdRows ?? []) as MatchRecord[];
        const participantRecords = ((participantRows ?? []) as ParticipantRecord[])
            .filter((participant) => participant.role !== "創建者")
            .filter((participant) => participant.status !== "已取消");
        const profileJoinedMatchIds = new Set(
            participantRecords.map((participant) => participant.match_id)
        );

        const joinedResult =
            profileJoinedMatchIds.size > 0
                ? await supabase
                      .from("matches")
                      .select(
                          "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at",
                          { count: "exact" }
                      )
                      .in("id", Array.from(profileJoinedMatchIds))
                      .order("play_time", { ascending: true })
                      .range(
                          (joinedPage - 1) * PROFILE_MATCHES_PAGE_SIZE,
                          joinedPage * PROFILE_MATCHES_PAGE_SIZE - 1
                      )
                : { data: [], error: null, count: 0 };
        const { data: joinedRows, error: joinedError, count: joinedCount } =
            joinedResult;

        if (joinedError) {
            return json(
                { message: "讀取參加球局失敗。", error: joinedError.message },
                500
            );
        }

        const joinedMatches = ((joinedRows ?? []) as MatchRecord[]).filter(
            (match) => match.host_user_id !== userId
        );
        const allMatches = [...createdMatches, ...joinedMatches];
        const matchIds = Array.from(new Set(allMatches.map((match) => match.id)));
        const courtIds = Array.from(new Set(allMatches.map((match) => match.court_id)));
        const hostIds = Array.from(new Set(allMatches.map((match) => match.host_user_id)));

        const [
            { data: courtRows, error: courtError },
            { data: hostRows, error: hostError },
            { data: visibleContacts, error: contactsError },
        ] = await Promise.all([
            courtIds.length > 0
                ? supabase
                      .from("courts")
                      .select("id, name, city, district, address")
                      .in("id", courtIds)
                : Promise.resolve({ data: [], error: null }),
            hostIds.length > 0
                ? supabase
                      .from("users")
                      .select("id, nickname, ntrp_level")
                      .in("id", hostIds)
                : Promise.resolve({ data: [], error: null }),
            loadVisibleParticipantContacts(
                viewer ? authenticatedSupabase : null,
                matchIds
            ),
        ]);

        if (courtError) {
            return json(
                { message: "讀取球場資料失敗。", error: courtError.message },
                500
            );
        }

        if (hostError) {
            return json(
                { message: "讀取創建者資料失敗。", error: hostError.message },
                500
            );
        }

        if (contactsError || !visibleContacts) {
            return json(
                {
                    message: "讀取球局聯絡權限失敗。",
                    error: contactsError?.message,
                },
                500
            );
        }

        const { data: participantsByMatchId, error: participantsError } =
            await loadParticipantsByMatchId(supabase, matchIds, visibleContacts);

        if (participantsError || !participantsByMatchId) {
            return json(
                {
                    message: "讀取參與者資料失敗。",
                    error: participantsError?.message,
                },
                500
            );
        }

        const courtsById = new Map(
            ((courtRows ?? []) as CourtRecord[]).map((court) => [court.id, court])
        );
        const hostsById = new Map(
            ((hostRows ?? []) as HostRecord[]).map((host) => [host.id, host])
        );
        const viewerJoinedMatchIds = new Set(visibleContacts.keys());
        const isOwnProfile = viewer?.id === userId;
        const profileUser = isOwnProfile
            ? {
                  ...(user as UserRecord),
                  email: viewer.email ?? (user as UserRecord).email,
              }
            : {
                  id: (user as UserRecord).id,
                  nickname: (user as UserRecord).nickname,
                  ntrp_level: (user as UserRecord).ntrp_level,
              };

        return json(
            {
                user: profileUser,
                createdMatches: createdMatches.map((match) =>
                    toMatchSummary(
                        match,
                        courtsById.get(match.court_id),
                        hostsById.get(match.host_user_id),
                        viewerJoinedMatchIds,
                        participantsByMatchId,
                        visibleContacts
                    )
                ),
                joinedMatches: joinedMatches.map((match) =>
                    toMatchSummary(
                        match,
                        courtsById.get(match.court_id),
                        hostsById.get(match.host_user_id),
                        viewerJoinedMatchIds,
                        participantsByMatchId,
                        visibleContacts
                    )
                ),
                pagination: {
                    created: {
                        page: createdPage,
                        pageSize: PROFILE_MATCHES_PAGE_SIZE,
                        total: createdCount ?? 0,
                        totalPages: Math.ceil(
                            (createdCount ?? 0) / PROFILE_MATCHES_PAGE_SIZE
                        ),
                    },
                    joined: {
                        page: joinedPage,
                        pageSize: PROFILE_MATCHES_PAGE_SIZE,
                        total: joinedCount ?? 0,
                        totalPages: Math.ceil(
                            (joinedCount ?? 0) / PROFILE_MATCHES_PAGE_SIZE
                        ),
                    },
                },
            },
            200
        );
    } catch (error) {
        return json(
            {
                message: "伺服器發生未預期錯誤。",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            500
        );
    }
}

export async function PATCH(request: NextRequest) {
    const { supabase, applyCookies } = createAuthenticatedSupabaseClient(request);
    const json = (
        body: Record<string, unknown>,
        init: { status: number }
    ) => applyCookies(NextResponse.json(body, init));

    try {
        if (!supabase) {
            return json(
                { message: "Supabase 環境變數尚未設定。" },
                { status: 500 }
            );
        }

        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return json(
                { message: "請先登入後再編輯個人資料。", error: userError?.message },
                { status: 401 }
            );
        }

        const body = (await request.json()) as UpdateProfileBody;
        const nickname = body.nickname?.trim();
        const ntrpLevel = body.ntrpLevel;

        if (!nickname || ntrpLevel === undefined) {
            return json(
                { message: "請填寫暱稱與 NTRP。" },
                { status: 400 }
            );
        }

        if (nickname.length < 2 || nickname.length > 40) {
            return json(
                { message: "暱稱長度必須介於 2 到 40 個字元。" },
                { status: 400 }
            );
        }

        if (
            typeof ntrpLevel !== "number" ||
            !Number.isFinite(ntrpLevel) ||
            ntrpLevel < 1 ||
            ntrpLevel > 7 ||
            !Number.isInteger(ntrpLevel * 2)
        ) {
            return json(
                { message: "NTRP 必須介於 1.0 到 7.0，並以 0.5 為間隔。" },
                { status: 400 }
            );
        }

        const { data: updatedUser, error: updateError } = await supabase
            .from("users")
            .update({
                nickname,
                ntrp_level: ntrpLevel,
            })
            .eq("id", user.id)
            .select("id, nickname, ntrp_level")
            .single();

        if (updateError) {
            return json(
                { message: "更新個人資料失敗。", error: updateError.message },
                { status: 500 }
            );
        }

        return json(
            {
                message: "個人資料已更新。",
                user: {
                    ...updatedUser,
                    email: user.email ?? null,
                    preferred_court_id: null,
                    created_at: user.created_at ?? null,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        return json(
            {
                message: "伺服器發生未預期錯誤。",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
        );
    }
}
