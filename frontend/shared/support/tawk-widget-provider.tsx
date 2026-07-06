"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import { getTawkSettings, getTawkVisitorProfile, type TawkSettings } from "@/shared/api/support";
import { useOptionalAuthSession } from "@/shared/auth/auth-session-context";

declare global {
  interface Window {
    Tawk_API?: TawkAPI;
    Tawk_LoadStart?: Date;
  }
}

type TawkAPI = {
  onLoad?: () => void;
  login?: (
    payload: {
      userId: string;
      hash: string;
      name?: string;
      email?: string;
      [key: string]: string | undefined;
    },
    callback?: (error?: unknown) => void,
  ) => void;
  logout?: (callback?: (error?: unknown) => void) => void;
  maximize?: () => void;
  showWidget?: () => void;
  hideWidget?: () => void;
};

const TAWK_SCRIPT_ID = "deeix-tawk-widget-script";
const OPEN_TAWK_EVENT = "deeix:tawk:open";
let pendingOpen = false;

function tawkScriptURL(settings: TawkSettings): string {
  return `https://embed.tawk.to/${encodeURIComponent(settings.propertyID)}/${encodeURIComponent(settings.widgetID)}`;
}

function removeExistingScript() {
  document.getElementById(TAWK_SCRIPT_ID)?.remove();
}

function resetTawk() {
  try {
    window.Tawk_API?.logout?.();
  } catch {
    // best-effort cleanup only
  }
  delete window.Tawk_API;
  delete window.Tawk_LoadStart;
}

function loadTawkScript(settings: TawkSettings) {
  const src = tawkScriptURL(settings);
  const existing = document.getElementById(TAWK_SCRIPT_ID) as HTMLScriptElement | null;
  if (existing?.src === src) {
    return;
  }
  removeExistingScript();
  resetTawk();

  window.Tawk_API = window.Tawk_API || {};
  window.Tawk_LoadStart = new Date();

  const script = document.createElement("script");
  script.id = TAWK_SCRIPT_ID;
  script.async = true;
  script.src = src;
  script.charset = "UTF-8";
  script.setAttribute("crossorigin", "*");
  document.head.appendChild(script);
}

function openTawkWidget() {
  const api = window.Tawk_API;
  if (!api?.maximize) {
    pendingOpen = true;
    return;
  }
  pendingOpen = false;
  api?.showWidget?.();
  api?.maximize?.();
}

export function TawkWidgetProvider() {
  const authSession = useOptionalAuthSession();
  const accessToken = authSession?.accessToken ?? "";
  const userID = authSession?.user?.publicID ?? "";
  const pathname = usePathname();
  const [settings, setSettings] = React.useState<TawkSettings | null>(null);
  const widgetVisible = pathname === "/" || pathname === "/support";

  React.useEffect(() => {
    let cancelled = false;
    void getTawkSettings()
      .then((nextSettings) => {
        if (!cancelled) {
          setSettings(nextSettings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!settings?.enabled) {
      removeExistingScript();
      resetTawk();
      return;
    }
    loadTawkScript(settings);
  }, [settings]);

  React.useEffect(() => {
    if (!settings?.enabled) {
      return;
    }
    const applyVisibility = () => {
      if (widgetVisible) {
        window.Tawk_API?.showWidget?.();
      } else {
        window.Tawk_API?.hideWidget?.();
      }
    };
    const previousOnLoad = window.Tawk_API?.onLoad;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_API.onLoad = () => {
      previousOnLoad?.();
      applyVisibility();
      if (pendingOpen) {
        openTawkWidget();
      }
    };
    applyVisibility();
  }, [settings, widgetVisible]);

  React.useEffect(() => {
    if (!settings?.enabled || !settings.secureModeConfigured || !accessToken) {
      return;
    }

    let cancelled = false;
    void getTawkVisitorProfile(accessToken)
      .then((profile) => {
        if (cancelled || !profile.enabled || !profile.visitorID || !profile.secureHash) {
          return;
        }
        window.Tawk_API = window.Tawk_API || {};
        const applyProfile = () => {
          const loginPayload: {
            userId: string;
            hash: string;
            name: string;
            email?: string;
            [key: string]: string | undefined;
          } = {
            userId: profile.visitorID,
            hash: profile.secureHash,
            name: profile.name,
            ...profile.attributes,
          };
          if (profile.email) {
            loginPayload.email = profile.email;
          }
          window.Tawk_API?.login?.(loginPayload);
        };
        if (window.Tawk_API.login) {
          applyProfile();
          return;
        }
        const previousOnLoad = window.Tawk_API.onLoad;
        window.Tawk_API.onLoad = () => {
          previousOnLoad?.();
          applyProfile();
        };
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [accessToken, settings, userID]);

  React.useEffect(() => {
    function handleOpen() {
      openTawkWidget();
    }

    window.addEventListener(OPEN_TAWK_EVENT, handleOpen);
    return () => {
      window.removeEventListener(OPEN_TAWK_EVENT, handleOpen);
    };
  }, []);

  return null;
}

export function openSupportWidget() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(OPEN_TAWK_EVENT));
}
