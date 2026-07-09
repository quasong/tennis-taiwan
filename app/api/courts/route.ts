import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
        { message: "Supabase 環境變數尚未設定。" },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city")?.trim();
    const district = searchParams.get("district")?.trim();
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from("courts")
      .select("id, name, city, district, address, surface")
      .order("city", { ascending: true })
      .order("district", { ascending: true })
      .order("name", { ascending: true });

    if (city) {
      query = query.in("city", getCityValues(city));
    }

    if (district) {
      query = query.eq("district", district);
    }

    const { data: courts, error } = await query;

    if (error) {
      return NextResponse.json(
        { message: "讀取球場資料失敗。", error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ courts: courts ?? [] }, { status: 200 });
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
