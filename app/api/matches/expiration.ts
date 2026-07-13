import type { SupabaseClient } from "@supabase/supabase-js";

export async function closeExpiredMatches(supabase: SupabaseClient) {
    return supabase
        .from("matches")
        .update({ status: "已結束" })
        .lt("play_time", new Date().toISOString())
        .in("status", ["徵求中", "已滿團"]);
}
