import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

type LoginBody = {
    email?: string;
    password?: string;
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

        const body = (await request.json()) as LoginBody;
        const email = body.email?.trim().toLowerCase();
        const password = body.password;

        if (!email || !password) {
            return NextResponse.json(
                { message: "缺少必要欄位：email、password。" },
                { status: 400 }
            );
        }

        if (!isValidEmail(email)) {
            return NextResponse.json(
                { message: "email 格式不正確。" },
                { status: 400 }
            );
        }

        const cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
        }[] = [];

        const supabase = createServerClient(
            supabaseUrl,
            supabasePublishableKey,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookies) {
                        cookiesToSet.push(...cookies);
                    },
                },
            }
        );

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (error) {
            const message = error.message.toLowerCase().includes("email not confirmed")
                ? "請先到信箱點擊驗證連結，再進行登入。"
                : "email 或密碼錯誤。";

            return NextResponse.json(
                { message, error: error.message },
                { status: 401 }
            );
        }

        if (!data.user || !data.session) {
            return NextResponse.json(
                { message: "登入失敗，無法建立 session。" },
                { status: 401 }
            );
        }

        const { data: profile, error: profileError } = await supabase
            .from("users")
            .select("id, email, nickname, ntrp_level, preferred_court_id, created_at")
            .eq("id", data.user.id)
            .maybeSingle();

        if (profileError) {
            return NextResponse.json(
                { message: "登入成功，但讀取用戶資料失敗。" },
                { status: 500 }
            );
        }

        const response = NextResponse.json(
            {
                message: "登入成功。",
                user: {
                    id: data.user.id,
                    email: data.user.email,
                    emailConfirmedAt: data.user.email_confirmed_at,
                    profile,
                },
            },
            { status: 200 }
        );

        cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
        });

        return response;
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