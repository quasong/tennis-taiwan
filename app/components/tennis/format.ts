import type { Locale } from "../../i18n/messages";

export function formatMatchTime(value: string, locale: Locale = "zh-Hant") {
  return new Intl.DateTimeFormat(locale === "en" ? "en-US" : "zh-Hant-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: locale === "en",
  }).format(new Date(value));
}

export function formatFee(value: number, locale: Locale = "zh-Hant") {
  return value > 0 ? `NT$${Math.round(value)}` : locale === "en" ? "Free" : "免費";
}

const enApiMessages: Record<string, string> = {
  "Supabase 環境變數尚未設定。": "Supabase environment variables are missing.",
  "讀取球場資料失敗。": "Unable to load courts.",
  "讀取球局資料失敗。": "Unable to load matches.",
  "讀取個人資料失敗。": "Unable to load the profile.",
  "建立約球失敗。": "Unable to create the match.",
  "約球建立成功。": "Match created.",
  "操作球局成功。": "Match updated.",
  "球局已取消。": "Match canceled.",
  "球局已刪除。": "Match deleted.",
  "已加入球局。": "You joined the match.",
  "已退出球局。": "You left the match.",
  "你已經加入此球局。": "You have already joined this match.",
  "個人資料已更新。": "Profile updated.",
  "更新個人資料失敗。": "Unable to update your profile.",
  "註冊失敗。": "Unable to create the account.",
  "註冊信已寄出，請到信箱點擊驗證連結完成註冊。": "We sent a verification email. Open it to finish creating your account.",
  "登入失敗。": "Unable to log in.",
  "登入成功。": "Logged in.",
  "伺服器發生未預期錯誤。": "An unexpected server error occurred.",
  "請先登入後再操作球局。": "Log in before managing a match.",
  "請先登入後再建立球局。": "Log in before creating a match.",
};

const zhApiMessages: Record<string, string> = {
  "Supabase environment variables are missing.": "Supabase 環境變數尚未設定。",
};

function localizeApiText(value: string, locale: Locale) {
  return locale === "en"
    ? enApiMessages[value] ?? value
    : zhApiMessages[value] ?? value;
}

export function formatApiMessage(
  response: { message?: string; error?: string },
  fallback: string,
  locale: Locale = "zh-Hant",
) {
  const rawMessage = response.message?.trim();
  const message = rawMessage ? localizeApiText(rawMessage, locale) : undefined;
  const error = response.error?.trim();

  if (message && error && message !== error) {
    return `${message} ${locale === "en" ? "Reason:" : "原因："}${error}`;
  }

  return message || error || fallback;
}
