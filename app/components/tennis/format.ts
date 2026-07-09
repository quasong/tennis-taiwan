export function formatMatchTime(value: string) {
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatFee(value: number) {
  return value > 0 ? `NT$${Math.round(value)}` : "免費";
}
