import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type UserNtrpRecord = {
  ntrp_level: number | string | null;
};

type RecentMatchRecord = {
  court_id: string;
};

function formatAverageNtrp(records: UserNtrpRecord[]) {
  const ntrpLevels = records
    .map((record) => Number(record.ntrp_level))
    .filter((value) => Number.isFinite(value));

  if (ntrpLevels.length === 0) {
    return null;
  }

  const total = ntrpLevels.reduce((sum, value) => sum + value, 0);

  return Number((total / ntrpLevels.length).toFixed(1));
}

function countRecentCourts(records: RecentMatchRecord[]) {
  return new Set(records.map((record) => record.court_id)).size;
}

export async function GET() {
  try {
    const supabaseKey = supabaseServiceRoleKey ?? supabasePublishableKey;

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { message: "Supabase 環境變數尚未設定。" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const [usersResult, recentMatchesResult, allMatchesResult] = await Promise.all([
      supabase
        .from("users")
        .select("ntrp_level")
        .not("ntrp_level", "is", null),
      supabase
        .from("matches")
        .select("court_id")
        .in("status", ["徵求中", "已滿團"])
        .gte("play_time", new Date().toISOString()),
      supabase.from("matches").select("id", { count: "exact", head: true }),
    ]);

    if (
      usersResult.error ||
      recentMatchesResult.error ||
      allMatchesResult.error
    ) {
      return NextResponse.json(
        {
          message: "讀取平台統計失敗。",
          error:
            usersResult.error?.message ??
            recentMatchesResult.error?.message ??
            allMatchesResult.error?.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        averageNtrp: formatAverageNtrp(
          (usersResult.data ?? []) as UserNtrpRecord[]
        ),
        recentCourtCount: countRecentCourts(
          (recentMatchesResult.data ?? []) as RecentMatchRecord[]
        ),
        totalMatchCount: allMatchesResult.count ?? 0,
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
