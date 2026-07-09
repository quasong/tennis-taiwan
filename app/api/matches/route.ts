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

type CourtRecord = {
    id: string;
    name: string;
    city: string;
    district: string | null;
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
        const supabase = createClient(supabaseUrl, supabaseKey);
        let scopedCourts: CourtRecord[] | null = null;

        if (city) {
            let courtsQuery = supabase
                .from("courts")
                .select("id, name, city, district")
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
        const userIds = Array.from(
            new Set(matchRecords.map((match) => match.host_user_id))
        );

        const [
            { data: courtRows, error: courtRowsError },
            { data: userRows, error: userRowsError },
        ] = await Promise.all([
            supabase
                .from("courts")
                .select("id, name, city, district")
                .in("id", courtIds),
            supabase.from("users").select("id, email, nickname").in("id", userIds),
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

        const courtsById = new Map(
            ((courtRows ?? []) as CourtRecord[]).map((court) => [court.id, court])
        );
        const usersById = new Map(
            ((userRows ?? []) as UserRecord[]).map((user) => [user.id, user])
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
                        court: court
                            ? {
                                  id: court.id,
                                  name: court.name,
                                  city: court.city,
                                  district: court.district,
                              }
                            : null,
                        host: {
                            id: match.host_user_id,
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

        return NextResponse.json(
            {
                message: "約球建立成功。",
                match: newMatch,
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
