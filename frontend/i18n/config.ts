export const APP_LOCALES = ["en-US", "zh-CN", "zh-TW"] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en-US";
export const LOCALE_COOKIE_NAME = "deeix_chat_locale";

export const APP_LOCALE_LABELS: Record<AppLocale, string> = {
  "en-US": "English",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

export function normalizeAppLocale(value: string | null | undefined): AppLocale {
  const normalized = String(value ?? "").trim();
  const canonical = normalized.replace("_", "-");
  const lower = canonical.toLowerCase();
  if (lower === "zh-tw" || lower === "zh-hk" || lower === "zh-mo" || lower.startsWith("zh-hant")) {
    return "zh-TW";
  }
  if (lower === "zh" || lower === "zh-cn" || lower.startsWith("zh-hans") || lower.startsWith("zh-")) {
    return "zh-CN";
  }
  if (lower === "en" || lower.startsWith("en-")) {
    return "en-US";
  }
  return APP_LOCALES.includes(canonical as AppLocale) ? (canonical as AppLocale) : DEFAULT_LOCALE;
}

export function resolveBrowserLocale(languages: readonly string[] | undefined): AppLocale {
  for (const language of languages ?? []) {
    const normalized = String(language ?? "").trim().toLowerCase().replace("_", "-");
    if (normalized === "zh-tw" || normalized === "zh-hk" || normalized === "zh-mo" || normalized.startsWith("zh-hant")) {
      return "zh-TW";
    }
    if (normalized === "zh" || normalized === "zh-cn" || normalized.startsWith("zh-hans") || normalized.startsWith("zh-")) {
      return "zh-CN";
    }
    if (normalized === "en" || normalized.startsWith("en-")) {
      return "en-US";
    }
  }
  return DEFAULT_LOCALE;
}
