import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

type RegisterBody = {
    email?: string;
    password?: string;
    nickname?: string;
    ntrp_level?: number;
};

function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(request: NextRequest) {
    try {
        if (!supabaseUrl || !supabasePublishableKey) {
            return NextResponse.json(
                { message: "Supabase 環境變數尚未設定。" },
                { status: 500 }
            );
        }

        const body = (await request.json()) as RegisterBody;
        const { email, password, nickname, ntrp_level } = body;

        if (!email || !password || !nickname || ntrp_level === undefined) {
            return NextResponse.json(
                { message: "缺少必要欄位：email、password、nickname、ntrp_level。" },
                { status: 400 }
            );
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedNickname = nickname.trim();

        if (!isValidEmail(normalizedEmail)) {
            return NextResponse.json(
                { message: "email 格式不正確。" },
                { status: 400 }
            );
        }

        if (password.length < 8) {
            return NextResponse.json(
                { message: "password 至少需要 8 個字元。" },
                { status: 400 }
            );
        }

        if (normalizedNickname.length < 2) {
            return NextResponse.json(
                { message: "nickname 至少需要 2 個字元。" },
                { status: 400 }
            );
        }

        if (typeof ntrp_level !== "number" || ntrp_level < 1.0 || ntrp_level > 7.0) {
            return NextResponse.json(
                { message: "ntrp_level 必須介於 1.0 到 7.0 之間。" },
                { status: 400 }
            );
        }

        const supabase = createClient(supabaseUrl, supabasePublishableKey);

        const { error } = await supabase.auth.signUp({
            email: normalizedEmail,
            password,
            options: {
                emailRedirectTo: `${siteUrl}/auth/callback`,
                data: {
                    nickname: normalizedNickname,
                    ntrp_level,
                },
            },
        });

        if (error) {
            return NextResponse.json(
                { message: "註冊失敗。", error: error.message },
                { status: 400 }
            );
        }

        return NextResponse.json(
            { message: "註冊信已寄出，請到信箱點擊驗證連結完成註冊。" },
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