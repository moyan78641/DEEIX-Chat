import { apiRequest } from "@/shared/api/http-client";
import { resolveApiBaseURL } from "@/shared/api/http-client";
import type { SiteProfile } from "@/shared/api/site-profile.types";

export const DEFAULT_SITE_PROFILE: SiteProfile = {
  name: "DEEIX Chat",
  shortName: "DEEIX",
  description: "A multi-model AI conversation workspace.",
  logoURL: "/logo.svg",
  logoDarkURL: "/logo-white.svg",
  faviconURL: "/favicon.ico",
  homeTitle: "DEEIX Chat",
  homeSubtitle: "A private AI workspace for chat, files, tools, and usage-aware model access.",
  footerText: "Powered by DEEIX Chat",
  contactEmail: "support@deeix.com",
  termsURL: "",
  privacyURL: "",
  agreement: {
    title: "Terms of Service",
    content: "Please read these Terms of Service before using this service.",
  },
  terms: {
    title: "Terms of Service",
    content: "Please read these Terms of Service before using this service.",
  },
  privacy: {
    title: "Privacy Policy",
    content: "Please read this Privacy Policy before using this service.",
  },
};

export async function getSiteProfile(locale?: string): Promise<SiteProfile> {
  const query = locale ? `?locale=${encodeURIComponent(locale)}` : "";
  return apiRequest<SiteProfile>(`/api/v1/settings/site-profile${query}`);
}

export function mergeSiteProfile(profile?: Partial<SiteProfile> | null): SiteProfile {
  const merged = {
    ...DEFAULT_SITE_PROFILE,
    ...(profile ?? {}),
  };
  const terms = {
    ...DEFAULT_SITE_PROFILE.terms,
    ...(profile?.terms ?? profile?.agreement ?? {}),
  };
  return {
    ...merged,
    agreement: {
      ...terms,
    },
    terms,
    privacy: {
      ...DEFAULT_SITE_PROFILE.privacy,
      ...(profile?.privacy ?? {}),
    },
    logoURL: normalizeSiteAssetURL(merged.logoURL),
    logoDarkURL: normalizeSiteAssetURL(merged.logoDarkURL),
    faviconURL: normalizeSiteAssetURL(merged.faviconURL),
  };
}

function normalizeSiteAssetURL(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith("/api/")) {
    return trimmed;
  }
  const apiBaseURL = resolveApiBaseURL();
  return apiBaseURL ? `${apiBaseURL}${trimmed}` : trimmed;
}
