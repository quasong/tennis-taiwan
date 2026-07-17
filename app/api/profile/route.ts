import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { closeExpiredMatches } from "../matches/expiration";
import { loadParticipantsByMatchId } from "../matches/participants";
import type { ParticipantSummary } from "../matches/participants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
    host: UserRecord | undefined,
    viewerJoinedMatchIds: Set<string>,
    participantsByMatchId: Map<string, ParticipantSummary[]>
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
            email: host?.email ?? "",
            nickname: host?.nickname ?? host?.email ?? "未命名球友",
        },
        participants: participantsByMatchId.get(match.id) ?? [],
    };
}

export async function GET(request: NextRequest) {
    try {
        const supabaseKey = supabaseServiceRoleKey ?? supabasePublishableKey;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json(
                { message: "Supabase environment variables are missing." },
                { status: 500 }
            );
        }

        const searchParams = new URL(request.url).searchParams;
        const userId = searchParams.get("userId")?.trim();
        const viewerUserId = searchParams.get("viewerUserId")?.trim();

        if (!userId) {
            return NextResponse.json(
                { message: "缺少必要欄位：userId。" },
                { status: 400 }
            );
        }

        if (!isValidUuid(userId)) {
            return NextResponse.json(
                { message: "userId 格式不正確。" },
                { status: 400 }
            );
        }

        if (viewerUserId && !isValidUuid(viewerUserId)) {
            return NextResponse.json(
                { message: "viewerUserId 格式不正確。" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const { error: expirationError } = await closeExpiredMatches(supabase);

        if (expirationError) {
            return NextResponse.json(
                {
                    message: "更新過期球局狀態失敗。",
                    error: expirationError.message,
                },
                { status: 500 }
            );
        }

        const { data: user, error: userError } = await supabase
            .from("users")
            .select("id, email, nickname, ntrp_level, preferred_court_id, created_at")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            return NextResponse.json(
                { message: "讀取個人資料失敗。", error: userError.message },
                { status: 500 }
            );
        }

        if (!user) {
            return NextResponse.json(
                { message: "找不到指定的使用者。" },
                { status: 404 }
            );
        }

        const [
            { data: createdRows, error: createdError },
            { data: participantRows, error: participantError },
        ] = await Promise.all([
            supabase
                .from("matches")
                .select(
                    "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at"
                )
                .eq("host_user_id", userId)
                .order("play_time", { ascending: true }),
            supabase
                .from("match_participants")
                .select("match_id, role, status")
                .eq("user_id", userId),
        ]);

        if (createdError) {
            return NextResponse.json(
                { message: "讀取建立球局失敗。", error: createdError.message },
                { status: 500 }
            );
        }

        if (participantError) {
            return NextResponse.json(
                { message: "讀取參與紀錄失敗。", error: participantError.message },
                { status: 500 }
            );
        }

        const createdMatches = (createdRows ?? []) as MatchRecord[];
        const participantRecords = ((participantRows ?? []) as ParticipantRecord[])
            .filter((participant) => participant.role !== "創建者")
            .filter((participant) => participant.status !== "已取消");
        const profileJoinedMatchIds = new Set(
            participantRecords.map((participant) => participant.match_id)
        );

        const { data: joinedRows, error: joinedError } =
            profileJoinedMatchIds.size > 0
                ? await supabase
                      .from("matches")
                      .select(
                          "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at"
                      )
                      .in("id", Array.from(profileJoinedMatchIds))
                      .order("play_time", { ascending: true })
                : { data: [], error: null };

        if (joinedError) {
            return NextResponse.json(
                { message: "讀取參加球局失敗。", error: joinedError.message },
                { status: 500 }
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
            { data: viewerParticipantRows, error: viewerParticipantError },
            { data: participantsByMatchId, error: participantsError },
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
                      .select(
                          "id, email, nickname, ntrp_level, preferred_court_id, created_at"
                      )
                      .in("id", hostIds)
                : Promise.resolve({ data: [], error: null }),
            viewerUserId && matchIds.length > 0
                ? supabase
                      .from("match_participants")
                      .select("match_id, role, status")
                      .eq("user_id", viewerUserId)
                      .eq("status", "已加入")
                      .in("match_id", matchIds)
                : Promise.resolve({ data: [], error: null }),
            loadParticipantsByMatchId(supabase, matchIds),
        ]);

        if (courtError) {
            return NextResponse.json(
                { message: "讀取球場資料失敗。", error: courtError.message },
                { status: 500 }
            );
        }

        if (hostError) {
            return NextResponse.json(
                { message: "讀取創建者資料失敗。", error: hostError.message },
                { status: 500 }
            );
        }

        if (viewerParticipantError) {
            return NextResponse.json(
                {
                    message: "讀取目前使用者參與狀態失敗。",
                    error: viewerParticipantError.message,
                },
                { status: 500 }
            );
        }

        if (participantsError || !participantsByMatchId) {
            return NextResponse.json(
                {
                    message: "讀取參與者資料失敗。",
                    error: participantsError?.message,
                },
                { status: 500 }
            );
        }

        const courtsById = new Map(
            ((courtRows ?? []) as CourtRecord[]).map((court) => [court.id, court])
        );
        const hostsById = new Map(
            ((hostRows ?? []) as UserRecord[]).map((host) => [host.id, host])
        );
        const viewerJoinedMatchIds = new Set(
            ((viewerParticipantRows ?? []) as ParticipantRecord[]).map(
                (participant) => participant.match_id
            )
        );

        return NextResponse.json(
            {
                user: user as UserRecord,
                createdMatches: createdMatches.map((match) =>
                    toMatchSummary(
                        match,
                        courtsById.get(match.court_id),
                        hostsById.get(match.host_user_id),
                        viewerJoinedMatchIds,
                        participantsByMatchId
                    )
                ),
                joinedMatches: joinedMatches.map((match) =>
                    toMatchSummary(
                        match,
                        courtsById.get(match.court_id),
                        hostsById.get(match.host_user_id),
                        viewerJoinedMatchIds,
                        participantsByMatchId
                    )
                ),
            },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            {
                message: "伺服器發生未預期錯誤。",
                error: error instanceof Error ? error.message : "Unknown error",
            },
            { status: 500 }
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
            .select("id, email, nickname, ntrp_level, preferred_court_id, created_at")
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
                user: updatedUser as UserRecord,
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
