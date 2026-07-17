import type { Locale } from "./messages";

const cityLabels: Record<string, string> = {
  台北: "Taipei",
  新北: "New Taipei",
  桃園: "Taoyuan",
  台中: "Taichung",
  台南: "Tainan",
  高雄: "Kaohsiung",
};

const surfaceLabels: Record<string, string> = {
  紅土: "Clay",
  硬地: "Hard",
  草地: "Grass",
  人工草地: "Artificial grass",
};

export function getCityLabel(city: string, locale: Locale) {
  return locale === "en" ? cityLabels[city] ?? city : city;
}

export function getSurfaceLabel(surface: string, locale: Locale) {
  return locale === "en" ? surfaceLabels[surface] ?? surface : surface;
}
