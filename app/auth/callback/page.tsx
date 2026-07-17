// app/auth/callback/page.tsx

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useI18n } from "../../i18n/I18nProvider";

export default function AuthCallbackPage() {
    const { locale, t } = useI18n();
    const [message, setMessage] = useState(() => t("auth.confirming"));

    useEffect(() => {
        async function handleCallback() {
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabasePublishableKey =
                process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

            if (!supabaseUrl || !supabasePublishableKey) {
                setMessage(t("common.missingSupabase"));
                return;
            }

            const supabase = createClient(supabaseUrl, supabasePublishableKey);
            const hash = new URLSearchParams(window.location.hash.slice(1));

            const error = hash.get("error");
            const errorCode = hash.get("error_code");
            const errorDescription = hash.get("error_description");

            if (error) {
                setMessage(
                    locale === "en"
                      ? `Verification failed: ${errorCode ?? error}. ${errorDescription ?? ""}`
                      : `驗證失敗：${errorCode ?? error}。${errorDescription ?? ""}`
                );
                return;
            }

            const { data, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !data.session) {
                setMessage(t("auth.confirmFailed"));
                return;
            }

            setMessage(t("auth.confirmed"));

            setTimeout(() => {
                window.location.href = "/";
            }, 1500);
        }

        handleCallback();
    }, [locale, t]);

    return (
        <main className="callback-page">
            <h1>{message}</h1>
        </main>
    );
}
