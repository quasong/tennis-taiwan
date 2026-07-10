import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        const supabase = createClient(supabaseUrl, supabaseKey);
        let scopedCourts: CourtRecord[] | null = null;

        if (userId && !isValidUuid(userId)) {
            return NextResponse.json(
                { message: "userId 格式不正確。" },
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
                return NextResponse.json({ matches: [] }, { status: 200 });
            }
        }

        let matchesQuery = supabase
            .from("matches")
            .select(
                "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at"
            )
            .in("status", ["徵求中", "已滿團"])
            .order("play_time", { ascending: true });

        if (scopedCourts) {
            matchesQuery = matchesQuery.in(
                "court_id",
                scopedCourts.map((court) => court.id)
            );
        }

        const { data: matches, error: matchesError } = await matchesQuery;

        if (matchesError) {
            return NextResponse.json(
                { message: "讀取球局資料失敗。", error: matchesError.message },
                { status: 500 }
            );
        }

        const matchRecords = (matches ?? []) as MatchRecord[];

        if (matchRecords.length === 0) {
            return NextResponse.json({ matches: [] }, { status: 200 });
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
                    };
                }),
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
    try {
        const supabaseKey = supabaseServiceRoleKey ?? supabasePublishableKey;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json(
                { message: "Supabase environment variables are missing." },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const body = (await request.json()) as CreateMatchBody;

        const { userId, courtId, matchTime, maxPlayers, fee, notes } = body;

        if (!userId || !courtId || !matchTime || maxPlayers === undefined) {
            return NextResponse.json(
                { message: "缺少必要欄位。" },
                { status: 400 }
            );
        }

        if (!isValidUuid(userId) || !isValidUuid(courtId)) {
            return NextResponse.json(
                { message: "userId 或 courtId 格式不正確。" },
                { status: 400 }
            );
        }

        if (!Number.isInteger(maxPlayers) || maxPlayers <= 1) {
            return NextResponse.json(
                { message: "maxPlayers 必須是大於 1 的整數。" },
                { status: 400 }
            );
        }

        const parsedMatchTime = new Date(matchTime);

        if (Number.isNaN(parsedMatchTime.getTime())) {
            return NextResponse.json(
                { message: "matchTime 格式不正確。" },
                { status: 400 }
            );
        }

        const normalizedFee = fee ?? 0;

        if (typeof normalizedFee !== "number" || normalizedFee < 0) {
            return NextResponse.json(
                { message: "fee 必須是大於或等於 0 的數字。" },
                { status: 400 }
            );
        }

        const { data: existingUser, error: userError } = await supabase
            .from("users")
            .select("id")
            .eq("id", userId)
            .maybeSingle();

        if (userError) {
            return NextResponse.json(
                { message: "檢查使用者時發生錯誤。" },
                { status: 500 }
            );
        }

        if (!existingUser) {
            return NextResponse.json(
                { message: "找不到指定的使用者。" },
                { status: 400 }
            );
        }

        const { data: newMatch, error: insertError } = await supabase
            .from("matches")
            .insert({
                host_user_id: userId,
                court_id: courtId,
                play_time: parsedMatchTime.toISOString(),
                required_players: maxPlayers,
                joined_players: 1,
                estimated_fee_per_person: normalizedFee,
                note: notes ?? null,
                status: "徵求中",
            })
            .select()
            .single();

        if (insertError) {
            return NextResponse.json(
                {
                    message: "建立約球失敗。",
                    error: insertError.message,
                },
                { status: 500 }
            );
        }

        const { data: participant, error: participantError } = await supabase
            .from("match_participants")
            .insert({
                match_id: newMatch.id,
                user_id: userId,
                role: "創建者",
                status: "已加入",
            })
            .select()
            .single();

        if (participantError) {
            const { error: cleanupError } = await supabase
                .from("matches")
                .delete()
                .eq("id", newMatch.id);

            return NextResponse.json(
                {
                    message: "建立約球失敗，無法寫入創建者參加紀錄。",
                    error: participantError.message,
                    cleanupError: cleanupError?.message,
                },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                message: "約球建立成功。",
                match: newMatch,
                participant,
            },
            { status: 201 }
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
    try {
        const supabaseKey = supabaseServiceRoleKey ?? supabasePublishableKey;

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json(
                { message: "Supabase environment variables are missing." },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseKey);
        const body = (await request.json()) as MatchActionBody;
        const { action, matchId, userId } = body;

        if (action !== "cancel" && action !== "join" && action !== "leave") {
            return NextResponse.json(
                { message: "不支援的球局操作。" },
                { status: 400 }
            );
        }

        if (!matchId || !userId) {
            return NextResponse.json(
                { message: "缺少必要欄位。" },
                { status: 400 }
            );
        }

        if (!isValidUuid(matchId) || !isValidUuid(userId)) {
            return NextResponse.json(
                { message: "matchId 或 userId 格式不正確。" },
                { status: 400 }
            );
        }

        const { data: existingMatch, error: matchError } = await supabase
            .from("matches")
            .select("id, host_user_id, status, required_players, joined_players")
            .eq("id", matchId)
            .maybeSingle();

        if (matchError) {
            return NextResponse.json(
                { message: "檢查球局時發生錯誤。", error: matchError.message },
                { status: 500 }
            );
        }

        if (!existingMatch) {
            return NextResponse.json(
                { message: "找不到指定的球局。" },
                { status: 404 }
            );
        }

        if (action === "leave") {
            if (existingMatch.host_user_id === userId) {
                return NextResponse.json(
                    { message: "創建者請使用取消球局。" },
                    { status: 403 }
                );
            }

            if (
                existingMatch.status !== "徵求中" &&
                existingMatch.status !== "已滿團"
            ) {
                return NextResponse.json(
                    { message: "此球局目前無法退出。" },
                    { status: 409 }
                );
            }

            const { data: existingParticipant, error: participantLookupError } =
                await supabase
                    .from("match_participants")
                    .select("id")
                    .eq("match_id", matchId)
                    .eq("user_id", userId)
                    .eq("status", "已加入")
                    .maybeSingle();

            if (participantLookupError) {
                return NextResponse.json(
                    {
                        message: "檢查參與紀錄時發生錯誤。",
                        error: participantLookupError.message,
                    },
                    { status: 500 }
                );
            }

            if (!existingParticipant) {
                return NextResponse.json(
                    { message: "你尚未加入此球局。" },
                    { status: 200 }
                );
            }

            const nextJoinedPlayers = Math.max(
                1,
                existingMatch.joined_players - 1
            );
            const nextStatus =
                nextJoinedPlayers >= existingMatch.required_players
                    ? "已滿團"
                    : "徵求中";

            const { data: updatedMatch, error: updateMatchError } = await supabase
                .from("matches")
                .update({
                    joined_players: nextJoinedPlayers,
                    status: nextStatus,
                })
                .eq("id", matchId)
                .eq("joined_players", existingMatch.joined_players)
                .select()
                .maybeSingle();

            if (updateMatchError) {
                return NextResponse.json(
                    {
                        message: "退出球局失敗。",
                        error: updateMatchError.message,
                    },
                    { status: 500 }
                );
            }

            if (!updatedMatch) {
                return NextResponse.json(
                    { message: "人數已變動，請重新整理後再試。" },
                    { status: 409 }
                );
            }

            const { error: deleteParticipantError } = await supabase
                .from("match_participants")
                .delete()
                .eq("id", existingParticipant.id);

            if (deleteParticipantError) {
                await supabase
                    .from("matches")
                    .update({
                        joined_players: existingMatch.joined_players,
                        status: existingMatch.status,
                    })
                    .eq("id", matchId);

                return NextResponse.json(
                    {
                        message: "退出球局失敗，無法刪除參與紀錄。",
                        error: deleteParticipantError.message,
                    },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                {
                    message: "已退出球局。",
                    match: updatedMatch,
                },
                { status: 200 }
            );
        }

        if (action === "join") {
            if (existingMatch.host_user_id === userId) {
                return NextResponse.json(
                    { message: "創建者已經在此球局中。" },
                    { status: 400 }
                );
            }

            if (existingMatch.status !== "徵求中") {
                return NextResponse.json(
                    { message: "此球局目前無法加入。" },
                    { status: 409 }
                );
            }

            const { data: existingParticipant, error: participantLookupError } =
                await supabase
                    .from("match_participants")
                    .select("id, status")
                    .eq("match_id", matchId)
                    .eq("user_id", userId)
                    .maybeSingle();

            if (participantLookupError) {
                return NextResponse.json(
                    {
                        message: "檢查參與紀錄時發生錯誤。",
                        error: participantLookupError.message,
                    },
                    { status: 500 }
                );
            }

            if (existingParticipant?.status === "已加入") {
                return NextResponse.json(
                    { message: "你已經加入此球局。" },
                    { status: 200 }
                );
            }

            if (existingMatch.joined_players >= existingMatch.required_players) {
                return NextResponse.json(
                    { message: "此球局已滿團。" },
                    { status: 409 }
                );
            }

            const nextJoinedPlayers = existingMatch.joined_players + 1;
            const nextStatus =
                nextJoinedPlayers >= existingMatch.required_players
                    ? "已滿團"
                    : "徵求中";

            const { data: updatedMatch, error: updateMatchError } = await supabase
                .from("matches")
                .update({
                    joined_players: nextJoinedPlayers,
                    status: nextStatus,
                })
                .eq("id", matchId)
                .eq("joined_players", existingMatch.joined_players)
                .eq("status", "徵求中")
                .select()
                .maybeSingle();

            if (updateMatchError) {
                return NextResponse.json(
                    {
                        message: "加入球局失敗。",
                        error: updateMatchError.message,
                    },
                    { status: 500 }
                );
            }

            if (!updatedMatch) {
                return NextResponse.json(
                    { message: "名額已變動，請重新整理後再試。" },
                    { status: 409 }
                );
            }

            const participantPayload = {
                role: "參與者",
                status: "已加入",
                updated_at: new Date().toISOString(),
            };
            const participantQuery = existingParticipant
                ? supabase
                      .from("match_participants")
                      .update(participantPayload)
                      .eq("id", existingParticipant.id)
                      .select()
                      .single()
                : supabase
                      .from("match_participants")
                      .insert({
                          match_id: matchId,
                          user_id: userId,
                          ...participantPayload,
                      })
                      .select()
                      .single();

            const { data: participant, error: participantError } =
                await participantQuery;

            if (participantError) {
                await supabase
                    .from("matches")
                    .update({
                        joined_players: existingMatch.joined_players,
                        status: existingMatch.status,
                    })
                    .eq("id", matchId);

                return NextResponse.json(
                    {
                        message: "加入球局失敗，無法寫入參與紀錄。",
                        error: participantError.message,
                    },
                    { status: 500 }
                );
            }

            return NextResponse.json(
                {
                    message: "已加入球局。",
                    match: updatedMatch,
                    participant,
                },
                { status: 200 }
            );
        }

        if (existingMatch.host_user_id !== userId) {
            return NextResponse.json(
                { message: "只有球局創建者可以取消此球局。" },
                { status: 403 }
            );
        }

        if (existingMatch.status === "已結束") {
            return NextResponse.json(
                { message: "球局已經結束。" },
                { status: 200 }
            );
        }

        const { data: updatedMatch, error: updateMatchError } = await supabase
            .from("matches")
            .update({ status: "已結束" })
            .eq("id", matchId)
            .eq("host_user_id", userId)
            .select()
            .single();

        if (updateMatchError) {
            return NextResponse.json(
                {
                    message: "取消球局失敗。",
                    error: updateMatchError.message,
                },
                { status: 500 }
            );
        }

        const { error: participantError } = await supabase
            .from("match_participants")
            .update({
                status: "已取消",
                updated_at: new Date().toISOString(),
            })
            .eq("match_id", matchId);

        if (participantError) {
            await supabase
                .from("matches")
                .update({ status: existingMatch.status })
                .eq("id", matchId);

            return NextResponse.json(
                {
                    message: "取消球局失敗，無法更新參與者狀態。",
                    error: participantError.message,
                },
                { status: 500 }
            );
        }

        return NextResponse.json(
            {
                message: "球局已取消。",
                match: updatedMatch,
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
