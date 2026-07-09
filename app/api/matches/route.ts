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

function isValidUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
    );
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
