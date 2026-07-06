"use client";

import Link from "next/link";
import { ArrowUp, LogIn, Search, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { writeNewConversationDraft } from "@/features/chat/hooks/use-chat-composer-state";
import { cn } from "@/lib/utils";
import { resolveAccessToken } from "@/shared/auth/resolve-access-token";
import { useSiteProfile } from "@/shared/site/site-profile-context";

export function PublicHomePage() {
  const t = useTranslations("site.home");
  const { profile } = useSiteProfile();
  const [draft, setDraft] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const startChat = React.useCallback(async () => {
    const prompt = draft.trim();
    if (prompt) {
      writeNewConversationDraft(prompt);
    }
    setSubmitting(true);
    try {
      let token = "";
      try {
        token = await resolveAccessToken();
      } catch {
        token = "";
      }
      const next = "/chat";
      window.location.href = token ? next : `/login?next=${encodeURIComponent(next)}`;
    } finally {
      setSubmitting(false);
    }
  }, [draft]);

  return (
    <main className="h-svh overflow-y-auto bg-[#f6f7f4] text-[#26302d]">
      <div className="mx-auto flex min-h-full w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
        <header className="flex h-16 shrink-0 items-center justify-between">
          <Link href="/" className="inline-flex min-w-0 items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- site logo may be configured as an arbitrary external URL. */}
            <img src={profile.logoURL} alt={profile.name} width={112} height={34} className="h-8 w-auto" />
            <span className="sr-only">{profile.name}</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-medium text-[#68736f] md:flex" aria-label={t("navLabel")}>
            <Link href="/login" className="transition-colors hover:text-[#26302d]">{t("nav.product")}</Link>
            {profile.termsURL ? <a href={profile.termsURL} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#26302d]">{t("terms")}</a> : null}
            {profile.privacyURL ? <a href={profile.privacyURL} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#26302d]">{t("privacy")}</a> : null}
          </nav>
          <Button asChild variant="outline" size="sm" className="h-8 border-[#d8ded8] bg-white/75 text-[#26302d] shadow-none hover:bg-[#edf3f0]">
            <Link href="/login">
              <LogIn className="size-4" />
              {t("signIn")}
            </Link>
          </Button>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center pb-8 pt-6 text-center sm:pb-10 sm:pt-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d8ded8] bg-white/75 px-3 py-1 text-xs font-medium text-[#68736f] shadow-sm">
            <ShieldCheck className="size-3.5 text-[#0f766e]" />
            <span>{t("eyebrow")}</span>
          </div>

          <div className="mt-7 max-w-4xl space-y-3">
            <h1 className="text-balance text-4xl font-semibold leading-tight tracking-normal text-[#26302d] sm:text-5xl lg:text-6xl">
              {profile.homeTitle || profile.name}
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-7 text-[#68736f] sm:text-lg">
              {profile.homeSubtitle || profile.description}
            </p>
          </div>

          <div className="mt-7 w-full max-w-3xl rounded-lg border border-[#d8ded8] bg-white/95 p-2 text-left shadow-[0_20px_70px_hsl(165_18%_24%/0.12)]">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void startChat();
                }
              }}
              placeholder={t("promptPlaceholder")}
              className="max-h-40 min-h-24 resize-none border-0 bg-transparent px-3 py-3 text-base leading-7 text-[#26302d] shadow-none placeholder:text-[#8a938f] focus-visible:ring-0"
            />
            <div className="flex items-center justify-between gap-3 border-t border-[#dfe5df] px-2 pt-2">
              <div className="flex min-w-0 items-center gap-2 text-xs text-[#68736f]">
                <span className="inline-flex items-center gap-1 rounded-md bg-[#e7f0ed] px-2 py-1 text-[#305b55]">
                  <Search className="size-3.5" />
                  {t("modeResearch")}
                </span>
                <span className="hidden sm:inline">{t("draftHint")}</span>
              </div>
              <Button
                type="button"
                size="icon"
                disabled={submitting}
                className={cn("size-9 rounded-md bg-[#26302d] text-white shadow-none hover:bg-[#35413d]", submitting ? "opacity-70" : "")}
                aria-label={t("startChat")}
                title={t("startChat")}
                onClick={() => void startChat()}
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </section>

        <footer className="flex min-h-14 shrink-0 flex-col justify-center gap-2 border-t border-[#d8ded8] py-3 text-xs text-[#68736f] sm:flex-row sm:items-center sm:justify-between">
          <p>{profile.footerText || profile.description}</p>
          <div className="flex flex-wrap items-center gap-4">
            {profile.contactEmail ? <a href={`mailto:${profile.contactEmail}`} className="transition-colors hover:text-[#26302d]">{profile.contactEmail}</a> : null}
            {profile.termsURL ? <a href={profile.termsURL} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#26302d]">{t("terms")}</a> : null}
            {profile.privacyURL ? <a href={profile.privacyURL} target="_blank" rel="noreferrer" className="transition-colors hover:text-[#26302d]">{t("privacy")}</a> : null}
          </div>
        </footer>
      </div>
    </main>
  );
}
