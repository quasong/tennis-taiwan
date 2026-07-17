import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

type UserNtrpRecord = {
  ntrp_level: number | string | null;
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
    const { data, error } = await supabase
      .from("users")
      .select("ntrp_level")
      .not("ntrp_level", "is", null);

    if (error) {
      return NextResponse.json(
        { message: "讀取平台統計失敗。", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        averageNtrp: formatAverageNtrp((data ?? []) as UserNtrpRecord[]),
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
