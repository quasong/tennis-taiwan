import { NextRequest, NextResponse } from "next/server";

type NominatimResult = {
    address?: Record<string, string | undefined>;
    display_name?: string;
};

const municipalityAliases = [
    { city: "新北", aliases: ["新北市", "New Taipei City"] },
    { city: "台北", aliases: ["台北市", "臺北市", "Taipei City"] },
    { city: "桃園", aliases: ["桃園市", "Taoyuan City"] },
    { city: "台中", aliases: ["台中市", "臺中市", "Taichung City"] },
    { city: "台南", aliases: ["台南市", "臺南市", "Tainan City"] },
    { city: "高雄", aliases: ["高雄市", "Kaohsiung City"] },
] as const;

function findMunicipality(result: NominatimResult) {
    if (result.address?.country_code?.toLowerCase() !== "tw") return null;

    const locationText = [
        ...Object.values(result.address ?? {}),
        result.display_name,
    ]
        .filter(Boolean)
        .join(" ");

    return (
        municipalityAliases.find(({ aliases }) =>
            aliases.some((alias) => locationText.includes(alias))
        )?.city ?? null
    );
}

function getCountryCode(result: NominatimResult) {
    return result.address?.country_code?.trim().toLowerCase() || null;
}

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const latitude = Number(searchParams.get("latitude"));
    const longitude = Number(searchParams.get("longitude"));

    if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
    ) {
        return NextResponse.json(
            { message: "定位座標格式不正確。" },
            { status: 400 }
        );
    }

    const query = new URLSearchParams({
        lat: latitude.toFixed(3),
        lon: longitude.toFixed(3),
        format: "jsonv2",
        addressdetails: "1",
        "accept-language": "zh-TW,zh,en",
    });
    const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://tennis-taiwan.vercel.app";

    try {
        const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
            {
                headers: {
                    Accept: "application/json",
                    "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5",
                    "User-Agent": `TennisTaiwan/1.0 (${siteUrl})`,
                },
                next: { revalidate: 86400 },
            }
        );

        if (!response.ok) {
            return NextResponse.json(
                {
                    city: null,
                    countryCode: null,
                    message: "目前無法辨識所在城市。",
                },
                { status: 502 }
            );
        }

        const result = (await response.json()) as NominatimResult;

        return NextResponse.json(
            {
                city: findMunicipality(result),
                countryCode: getCountryCode(result),
            },
            {
                status: 200,
                headers: { "Cache-Control": "private, max-age=3600" },
            }
        );
    } catch {
        return NextResponse.json(
            {
                city: null,
                countryCode: null,
                message: "目前無法辨識所在城市。",
            },
            { status: 502 }
        );
    }
}
