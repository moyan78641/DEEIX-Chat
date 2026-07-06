"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { useAppLocale } from "@/i18n/app-i18n-provider";
import { DEFAULT_SITE_PROFILE, getSiteProfile, mergeSiteProfile } from "@/shared/api/site-profile";
import type { SiteProfile } from "@/shared/api/site-profile.types";

declare global {
  interface Window {
    __DEEIX_SITE_PROFILE__?: Partial<SiteProfile>;
  }
}

type SiteProfileContextValue = {
  profile: SiteProfile;
  ready: boolean;
};

const SiteProfileContext = React.createContext<SiteProfileContextValue>({
  profile: DEFAULT_SITE_PROFILE,
  ready: false,
});

function readInjectedSiteProfile(): Partial<SiteProfile> | null {
  if (typeof document === "undefined") {
    return null;
  }
  const globalProfile = window.__DEEIX_SITE_PROFILE__;
  if (globalProfile && typeof globalProfile === "object") {
    return globalProfile;
  }
  const script = document.getElementById("deeix-site-profile");
  if (!script?.textContent?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(script.textContent) as Partial<SiteProfile>;
    window.__DEEIX_SITE_PROFILE__ = parsed;
    return parsed;
  } catch {
    return null;
  }
}

function inferIconType(href: string): string {
  const cleanHref = href.split(/[?#]/, 1)[0]?.toLowerCase() ?? "";
  if (cleanHref.endsWith(".svg")) return "image/svg+xml";
  if (cleanHref.endsWith(".png")) return "image/png";
  if (cleanHref.endsWith(".jpg") || cleanHref.endsWith(".jpeg")) return "image/jpeg";
  if (cleanHref.endsWith(".webp")) return "image/webp";
  if (cleanHref.endsWith(".ico")) return "image/x-icon";
  return "";
}

function isFaviconLink(link: HTMLLinkElement): boolean {
  if (link.relList.length === 0) {
    return false;
  }
  return link.relList.contains("icon") || link.relList.contains("shortcut");
}

function applyFaviconLink(link: HTMLLinkElement, href: string) {
  const iconType = inferIconType(href);
  if (link.getAttribute("href") !== href) {
    link.setAttribute("href", href);
  }
  if (iconType && link.getAttribute("type") !== iconType) {
    link.setAttribute("type", iconType);
  }
  if (link.hasAttribute("sizes")) {
    link.removeAttribute("sizes");
  }
}

function upsertFaviconLink(href: string) {
  for (const existingLink of Array.from(document.querySelectorAll<HTMLLinkElement>("link[rel]"))) {
    if (isFaviconLink(existingLink)) {
      applyFaviconLink(existingLink, href);
    }
  }

  let link = document.getElementById("deeix-site-favicon") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement("link");
    link.id = "deeix-site-favicon";
    link.rel = "icon";
  }
  link.id = "deeix-site-favicon";
  link.rel = "icon";
  applyFaviconLink(link, href);
  if (link.parentElement !== document.head || document.head.lastElementChild !== link) {
    document.head.appendChild(link);
  }
}

export function SiteProfileProvider({
  children,
  initialProfile,
}: {
  children: React.ReactNode;
  initialProfile?: Partial<SiteProfile> | null;
}) {
  const { locale } = useAppLocale();
  const pathname = usePathname();
  const initial = initialProfile ?? readInjectedSiteProfile();
  const [profile, setProfile] = React.useState<SiteProfile>(() => mergeSiteProfile(initial ?? DEFAULT_SITE_PROFILE));
  const [ready, setReady] = React.useState(Boolean(initial));

  React.useEffect(() => {
    let cancelled = false;
    void getSiteProfile(locale)
      .then((nextProfile) => {
        if (!cancelled) {
          setProfile(mergeSiteProfile(nextProfile));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const title = profile.name?.trim();
    if (!title) {
      return undefined;
    }

    let frame = 0;
    let timer = 0;
    const apply = () => {
      if (document.title !== title) {
        document.title = title;
      }
    };
    const scheduleApply = () => {
      apply();
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          apply();
        });
      }
      if (!timer) {
        timer = window.setTimeout(() => {
          timer = 0;
          apply();
        }, 50);
      }
    };

    scheduleApply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [pathname, profile.name]);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const faviconURL = profile.faviconURL?.trim();
    if (!faviconURL) {
      return undefined;
    }

    let frame = 0;
    const apply = () => {
      upsertFaviconLink(faviconURL);
    };
    const scheduleApply = () => {
      if (frame) {
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        apply();
      });
    };

    apply();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.head, {
      attributes: true,
      attributeFilter: ["href", "rel", "sizes", "type"],
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [profile.faviconURL]);

  const value = React.useMemo(() => ({ profile, ready }), [profile, ready]);
  return <SiteProfileContext.Provider value={value}>{children}</SiteProfileContext.Provider>;
}

export function useSiteProfile() {
  return React.useContext(SiteProfileContext);
}
