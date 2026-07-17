import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { closeExpiredMatches } from "./expiration";
import { loadParticipantsByMatchId } from "./participants";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MATCHES_PAGE_SIZE = 10;

type CreateMatchBody = {
    userId?: string;
    courtId?: string;
    matchTime?: string;
    maxPlayers?: number;
    fee?: number;
    notes?: string;
};

type MatchActionBody = {
    action?: string;
    matchId?: string;
    userId?: string;
};

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

type UserRecord = {
    id: string;
    email: string | null;
    nickname: string | null;
};

type ParticipantRecord = {
    match_id: string;
};

type MatchMutationResult = {
    message?: string;
    match?: unknown;
    participant?: unknown;
};

type MatchAction = "cancel" | "delete" | "join" | "leave";

const actionRpcNames: Record<MatchAction, string> = {
    cancel: "cancel_match_transaction",
    delete: "delete_match_transaction",
    join: "join_match_transaction",
    leave: "leave_match_transaction",
};

const cityAliases: Record<string, string[]> = {
    台北: ["台北", "台北市", "臺北", "臺北市"],
    臺北: ["台北", "台北市", "臺北", "臺北市"],
    新北: ["新北", "新北市"],
    桃園: ["桃園", "桃園市"],
    台中: ["台中", "台中市", "臺中", "臺中市"],
    臺中: ["台中", "台中市", "臺中", "臺中市"],
    台南: ["台南", "台南市", "臺南", "臺南市"],
    臺南: ["台南", "台南市", "臺南", "臺南市"],
    高雄: ["高雄", "高雄市"],
};

function isValidUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
}

function getCityValues(city: string) {
    const withoutCitySuffix = city.replace(/市$/, "");
    const values = cityAliases[withoutCitySuffix] ?? [city, withoutCitySuffix];

    return Array.from(new Set(values));
}

function getMutationErrorStatus(message: string) {
    if (message.includes("找不到指定的球局")) return 404;
    if (message.includes("找不到指定的使用者")) return 400;
    if (message.includes("找不到指定的球場")) return 400;
    if (message.includes("請先登入")) return 401;
    if (message.includes("登入狀態與操作使用者不一致")) return 403;
    if (message.includes("只有球局創建者")) return 403;
    if (message.includes("創建者請使用取消球局")) return 403;
    if (message.includes("已滿團")) return 409;
    if (message.includes("目前無法")) return 409;
    if (message.includes("只有已結束的球局可以刪除")) return 409;

    return 500;
}

function getMutationFallbackMessage(action: MatchAction) {
    if (action === "cancel") return "取消球局失敗。";
    if (action === "delete") return "刪除球局失敗。";
    if (action === "join") return "加入球局失敗。";

    return "退出球局失敗。";
}

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

export async function GET(request: NextRequest) {
    try {
        const supabaseKey = supabaseServiceRoleKey ?? supabasePublishableKey;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json(
                { message: "Supabase environment variables are missing." },
                { status: 500 }
            );
        }

        const { searchParams } = new URL(request.url);
        const city = searchParams.get("city")?.trim();
        const district = searchParams.get("district")?.trim();
        const userId = searchParams.get("userId")?.trim();
        const page = Number(searchParams.get("page") ?? "1");
        const supabase = createClient(supabaseUrl, supabaseKey);
        let scopedCourts: CourtRecord[] | null = null;

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

        if (userId && !isValidUuid(userId)) {
            return NextResponse.json(
                { message: "userId 格式不正確。" },
                { status: 400 }
            );
        }

        if (!Number.isInteger(page) || page < 1) {
            return NextResponse.json(
                { message: "page 必須是大於 0 的整數。" },
                { status: 400 }
            );
        }

        if (city) {
            let courtsQuery = supabase
                .from("courts")
                .select("id, name, city, district, address")
                .in("city", getCityValues(city));

            if (district) {
                courtsQuery = courtsQuery.eq("district", district);
            }

            const { data: courts, error: courtsError } = await courtsQuery;

            if (courtsError) {
                return NextResponse.json(
                    { message: "讀取球場資料失敗。", error: courtsError.message },
                    { status: 500 }
                );
            }

            scopedCourts = (courts ?? []) as CourtRecord[];

            if (scopedCourts.length === 0) {
                return NextResponse.json(
                    {
                        matches: [],
                        pagination: {
                            page,
                            pageSize: MATCHES_PAGE_SIZE,
                            total: 0,
                            totalPages: 0,
                        },
                    },
                    { status: 200 }
                );
            }
        }

        const pageStart = (page - 1) * MATCHES_PAGE_SIZE;
        let matchesQuery = supabase
            .from("matches")
            .select(
                "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at",
                { count: "exact" }
            )
            .in("status", ["徵求中", "已滿團"])
            .order("play_time", { ascending: true });

        if (scopedCourts) {
            matchesQuery = matchesQuery.in(
                "court_id",
                scopedCourts.map((court) => court.id)
            );
        }

        matchesQuery = matchesQuery.range(
            pageStart,
            pageStart + MATCHES_PAGE_SIZE - 1
        );

        const {
            data: matches,
            error: matchesError,
            count: matchesCount,
        } = await matchesQuery;

        if (matchesError) {
            return NextResponse.json(
                { message: "讀取球局資料失敗。", error: matchesError.message },
                { status: 500 }
            );
        }

        const matchRecords = (matches ?? []) as MatchRecord[];
        const totalMatches = matchesCount ?? 0;
        const pagination = {
            page,
            pageSize: MATCHES_PAGE_SIZE,
            total: totalMatches,
            totalPages: Math.ceil(totalMatches / MATCHES_PAGE_SIZE),
        };

        if (matchRecords.length === 0) {
            return NextResponse.json(
                { matches: [], pagination },
                { status: 200 }
            );
        }

        const courtIds = Array.from(
            new Set(matchRecords.map((match) => match.court_id))
        );
        const matchIds = matchRecords.map((match) => match.id);
        const userIds = Array.from(
            new Set(matchRecords.map((match) => match.host_user_id))
        );

        const [
            { data: courtRows, error: courtRowsError },
            { data: userRows, error: userRowsError },
            { data: participantRows, error: participantRowsError },
            { data: participantsByMatchId, error: participantsError },
        ] = await Promise.all([
            supabase
                .from("courts")
                .select("id, name, city, district, address")
                .in("id", courtIds),
            supabase.from("users").select("id, email, nickname").in("id", userIds),
            userId
                ? supabase
                      .from("match_participants")
                      .select("match_id")
                      .eq("user_id", userId)
                      .eq("status", "已加入")
                      .in("match_id", matchIds)
                : Promise.resolve({ data: [], error: null }),
            loadParticipantsByMatchId(supabase, matchIds),
        ]);

        if (courtRowsError) {
            return NextResponse.json(
                { message: "讀取球場資料失敗。", error: courtRowsError.message },
                { status: 500 }
            );
        }

        if (userRowsError) {
            return NextResponse.json(
                { message: "讀取創建者資料失敗。", error: userRowsError.message },
                { status: 500 }
            );
        }

        if (participantRowsError) {
            return NextResponse.json(
                {
                    message: "讀取參與狀態失敗。",
                    error: participantRowsError.message,
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
        const usersById = new Map(
            ((userRows ?? []) as UserRecord[]).map((user) => [user.id, user])
        );
        const joinedMatchIds = new Set(
            ((participantRows ?? []) as ParticipantRecord[]).map(
                (participant) => participant.match_id
            )
        );

        return NextResponse.json(
            {
                matches: matchRecords.map((match) => {
                    const court = courtsById.get(match.court_id);
                    const host = usersById.get(match.host_user_id);

                    return {
                        id: match.id,
                        playTime: match.play_time,
                        requiredPlayers: match.required_players,
                        joinedPlayers: match.joined_players,
                        feePerPerson: Number(match.estimated_fee_per_person),
                        note: match.note,
                        status: match.status,
                        hasJoined: joinedMatchIds.has(match.id),
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
                            nickname:
                                host?.nickname ?? host?.email ?? "未命名球友",
                        },
                        participants: participantsByMatchId.get(match.id) ?? [],
                    };
                }),
                pagination,
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

export async function POST(request: NextRequest) {
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

        const body = (await request.json()) as CreateMatchBody;
        const { userId, courtId, matchTime, maxPlayers, fee, notes } = body;
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return json(
                { message: "請先登入後再建立球局。", error: userError?.message },
                { status: 401 }
            );
        }

        if (userId && userId !== user.id) {
            return json(
                { message: "登入狀態與操作使用者不一致。" },
                { status: 403 }
            );
        }

        if (!courtId || !matchTime || maxPlayers === undefined) {
            return json(
                { message: "缺少必要欄位。" },
                { status: 400 }
            );
        }

        if (!isValidUuid(user.id) || !isValidUuid(courtId)) {
            return json(
                { message: "userId 或 courtId 格式不正確。" },
                { status: 400 }
            );
        }

        if (!Number.isInteger(maxPlayers) || maxPlayers <= 1) {
            return json(
                { message: "maxPlayers 必須是大於 1 的整數。" },
                { status: 400 }
            );
        }

        const parsedMatchTime = new Date(matchTime);

        if (Number.isNaN(parsedMatchTime.getTime())) {
            return json(
                { message: "matchTime 格式不正確。" },
                { status: 400 }
            );
        }

        const normalizedFee = fee ?? 0;

        if (
            typeof normalizedFee !== "number" ||
            !Number.isFinite(normalizedFee) ||
            normalizedFee < 0
        ) {
            return json(
                { message: "fee 必須是大於或等於 0 的數字。" },
                { status: 400 }
            );
        }

        const { data, error } = await supabase.rpc("create_match_with_host", {
            p_host_user_id: user.id,
            p_court_id: courtId,
            p_play_time: parsedMatchTime.toISOString(),
            p_required_players: maxPlayers,
            p_estimated_fee_per_person: normalizedFee,
            p_note: notes?.trim() ? notes : null,
        });

        if (error) {
            return json(
                {
                    message: "建立約球失敗。",
                    error: error.message,
                },
                { status: getMutationErrorStatus(error.message) }
            );
        }

        const result = (data ?? {}) as MatchMutationResult;

        return json(
            {
                message: result.message ?? "約球建立成功。",
                match: result.match,
                participant: result.participant,
            },
            { status: 201 }
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

        const body = (await request.json()) as MatchActionBody;
        const { action, matchId, userId } = body;
        const {
            data: { user },
            error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
            return json(
                { message: "請先登入後再操作球局。", error: userError?.message },
                { status: 401 }
            );
        }

        if (!action || !(action in actionRpcNames)) {
            return json(
                { message: "不支援的球局操作。" },
                { status: 400 }
            );
        }

        const matchAction = action as MatchAction;

        if (userId && userId !== user.id) {
            return json(
                { message: "登入狀態與操作使用者不一致。" },
                { status: 403 }
            );
        }

        if (!matchId) {
            return json(
                { message: "缺少必要欄位。" },
                { status: 400 }
            );
        }

        if (!isValidUuid(matchId) || !isValidUuid(user.id)) {
            return json(
                { message: "matchId 或 userId 格式不正確。" },
                { status: 400 }
            );
        }

        const { error: expirationError } = await closeExpiredMatches(supabase);

        if (expirationError) {
            return json(
                {
                    message: "更新過期球局狀態失敗。",
                    error: expirationError.message,
                },
                { status: 500 }
            );
        }

        const { data, error } = await supabase.rpc(actionRpcNames[matchAction], {
            p_match_id: matchId,
            p_user_id: user.id,
        });

        if (error) {
            return json(
                {
                    message: getMutationFallbackMessage(matchAction),
                    error: error.message,
                },
                { status: getMutationErrorStatus(error.message) }
            );
        }

        const result = (data ?? {}) as MatchMutationResult;

        return json(
            {
                message: result.message ?? "操作球局成功。",
                match: result.match,
                participant: result.participant,
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
