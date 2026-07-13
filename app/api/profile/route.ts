import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function isValidUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
}

function toMatchSummary(
    match: MatchRecord,
    court: CourtRecord | undefined,
    host: UserRecord | undefined,
    joinedMatchIds: Set<string>
) {
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
            nickname: host?.nickname ?? host?.email ?? "未命名球友",
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

        const userId = new URL(request.url).searchParams.get("userId")?.trim();

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

        const supabase = createClient(supabaseUrl, supabaseKey);
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
        const joinedMatchIds = new Set(
            participantRecords.map((participant) => participant.match_id)
        );

        const { data: joinedRows, error: joinedError } =
            joinedMatchIds.size > 0
                ? await supabase
                      .from("matches")
                      .select(
                          "id, host_user_id, court_id, play_time, required_players, joined_players, estimated_fee_per_person, note, status, created_at"
                      )
                      .in("id", Array.from(joinedMatchIds))
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
        const courtIds = Array.from(new Set(allMatches.map((match) => match.court_id)));
        const hostIds = Array.from(new Set(allMatches.map((match) => match.host_user_id)));

        const [
            { data: courtRows, error: courtError },
            { data: hostRows, error: hostError },
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

        const courtsById = new Map(
            ((courtRows ?? []) as CourtRecord[]).map((court) => [court.id, court])
        );
        const hostsById = new Map(
            ((hostRows ?? []) as UserRecord[]).map((host) => [host.id, host])
        );

        return NextResponse.json(
            {
                user: user as UserRecord,
                createdMatches: createdMatches.map((match) =>
                    toMatchSummary(
                        match,
                        courtsById.get(match.court_id),
                        hostsById.get(match.host_user_id),
                        joinedMatchIds
                    )
                ),
                joinedMatches: joinedMatches.map((match) =>
                    toMatchSummary(
                        match,
                        courtsById.get(match.court_id),
                        hostsById.get(match.host_user_id),
                        joinedMatchIds
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
