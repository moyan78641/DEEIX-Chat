"use client";

import * as React from "react";
import { LifeBuoy, Mail, MessageCircle, ShieldCheck, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getTawkSettings, type TawkSettings } from "@/shared/api/support";
import { useAuthSession } from "@/shared/auth/auth-session-context";
import { useSiteProfile } from "@/shared/site/site-profile-context";
import { openSupportWidget } from "@/shared/support/tawk-widget-provider";

function supportMailto(email: string, userLabel: string): string {
  const subject = encodeURIComponent("Support request");
  const body = encodeURIComponent(`Account: ${userLabel}\n\nPlease describe the issue:\n`);
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

export function SupportPage() {
  const t = useTranslations("support");
  const common = useTranslations("common");
  const { user } = useAuthSession();
  const { profile } = useSiteProfile();
  const [settings, setSettings] = React.useState<TawkSettings | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const title = settings?.supportPageTitle?.trim() || t("title");
  const description = settings?.supportDescription?.trim() || t("description");
  const contactHint = settings?.supportContactHint?.trim() || t("contactHint");
  const email = profile.contactEmail?.trim();
  const userLabel = user?.email || user?.username || user?.publicID || t("fallbackUser");
  const tawkEnabled = Boolean(settings?.enabled);

  return (
    <main className="h-full min-h-0 overflow-y-auto rounded-lg bg-background px-4 py-5 md:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <section className="flex flex-col gap-4 border-b border-border/70 pb-5 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-md bg-muted/55 px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <LifeBuoy className="size-3.5" />
              {t("eyebrow")}
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-normal text-foreground md:text-3xl">{title}</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {email ? (
              <Button asChild variant="outline" className="h-9 rounded-md shadow-none">
                <a href={supportMailto(email, userLabel)}>
                  <Mail className="size-4" />
                  {t("emailSupport")}
                </a>
              </Button>
            ) : null}
            <Button type="button" className="h-9 rounded-md shadow-none" disabled={!tawkEnabled} onClick={openSupportWidget}>
              <MessageCircle className="size-4" />
              {tawkEnabled ? t("openChat") : t("chatUnavailable")}
            </Button>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <UserRound className="size-4 text-muted-foreground" />
              {t("account.title")}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("account.user")}</span>
                <span className="min-w-0 truncate text-right font-medium">{userLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("account.role")}</span>
                <span className="font-medium">{user?.role || "-"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("account.status")}</span>
                <span className="font-medium">{user?.status || "-"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4 text-muted-foreground" />
              {t("billing.title")}
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("billing.plan")}</span>
                <span className="min-w-0 truncate text-right font-medium">{user?.subscriptionPlanName || "-"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("billing.status")}</span>
                <span className="font-medium">{user?.subscriptionStatus || "-"}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">{t("billing.created")}</span>
                <span className="font-medium">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="size-4 text-muted-foreground" />
              {t("channel.title")}
            </div>
            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("channel.liveChat")}</span>
                <Badge variant="outline" className="rounded-md">
                  {loading ? common("states.loading") : tawkEnabled ? common("states.enabled") : common("states.disabled")}
                </Badge>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">{contactHint}</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
