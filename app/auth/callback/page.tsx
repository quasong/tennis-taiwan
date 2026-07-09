// app/auth/callback/page.tsx

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

export default function AuthCallbackPage() {
    const [message, setMessage] = useState("正在確認 Email...");

    useEffect(() => {
        async function handleCallback() {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabasePublishableKey =
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

            if (!supabaseUrl || !supabasePublishableKey) {
                setMessage("Supabase 環境變數尚未設定。");
                return;
            }

            const supabase = createClient(supabaseUrl, supabasePublishableKey);
            const hash = new URLSearchParams(window.location.hash.slice(1));

            const error = hash.get("error");
            const errorCode = hash.get("error_code");
            const errorDescription = hash.get("error_description");

            if (error) {
                setMessage(
                    `驗證失敗：${errorCode ?? error}。${errorDescription ?? ""}`
                );
                return;
            }

            const { data, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !data.session) {
                setMessage("驗證失敗，請重新登入或重新發送驗證信。");
                return;
            }

            setMessage("Email 驗證成功，帳號已啟用。");

            setTimeout(() => {
                window.location.href = "/";
            }, 1500);
        }

        handleCallback();
    }, []);

    return (
        <main className="callback-page">
            <h1>{message}</h1>
        </main>
    );
}
