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

export function formatApiMessage(
  response: { message?: string; error?: string },
  fallback: string
) {
  const message = response.message?.trim();
  const error = response.error?.trim();

  if (message && error && message !== error) {
    return `${message}原因：${error}`;
  }

  return message || error || fallback;
}
