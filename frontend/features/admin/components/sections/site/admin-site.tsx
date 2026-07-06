"use client";

import * as React from "react";
import { Save, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import { SettingsFieldEditor } from "@/features/admin/components/sections/shared/settings-runtime-panel";
import { listAdminSettingsByNamespace, patchAdminSettings, uploadSiteAsset } from "@/features/admin/api";
import { resolveAdminErrorMessage } from "@/features/admin/utils/admin-error";
import { cn } from "@/lib/utils";
import { resolveAccessToken } from "@/shared/auth/resolve-access-token";
import {
  SettingsFieldItem,
  SettingsFieldList,
  SettingsPage,
  SettingsSection,
  SettingsSectionSeparator,
} from "@/shared/components/settings-layout";
import type { PatchSettingItem, SettingItem } from "@/shared/api/settings.types";

type SiteSettingKey =
  | "name"
  | "short_name"
  | "description"
  | "logo_url"
  | "logo_dark_url"
  | "favicon_url"
  | "home_title"
  | "home_subtitle"
  | "footer_text"
  | "contact_email"
  | "terms_url"
  | "privacy_url"
  | "terms_title_en_us"
  | "terms_content_en_us"
  | "privacy_title_en_us"
  | "privacy_content_en_us"
  | "terms_title_zh_cn"
  | "terms_content_zh_cn"
  | "privacy_title_zh_cn"
  | "privacy_content_zh_cn"
  | "terms_title_zh_tw"
  | "terms_content_zh_tw"
  | "privacy_title_zh_tw"
  | "privacy_content_zh_tw";

type SiteFieldType = "string" | "textarea";
type AssetSettingKey = Extract<SiteSettingKey, "logo_url" | "logo_dark_url" | "favicon_url">;

type SiteSettingsField = {
  namespace: "site";
  key: SiteSettingKey;
  label: string;
  description: string;
  type: SiteFieldType;
  placeholder?: string;
};

type SiteSettingsGroup = {
  title: string;
  fields: SiteSettingsField[];
};

const DEFAULT_TERMS_CONTENT_EN = "Please read these Terms of Service before using this service. By creating an account, signing in, subscribing, or making a payment, you agree to follow platform rules, applicable laws, and the billing terms shown before payment.";
const DEFAULT_LEGACY_AGREEMENT_CONTENT_EN = "Please read and agree to the user agreement before using this service. By continuing, you confirm that you will comply with platform rules, applicable laws, and the billing or subscription terms shown before payment.";
const DEFAULT_PRIVACY_CONTENT_EN = "Please read this Privacy Policy to understand how account information, usage data, billing records, and uploaded content may be processed to provide and secure this service.";
const DEFAULT_TERMS_CONTENT_ZH_CN = "使用本服务前，请阅读服务条款。创建账号、登录、订阅或付款，即表示你同意遵守平台规则、适用法律法规，以及支付前展示的计费条款。";
const DEFAULT_LEGACY_AGREEMENT_CONTENT_ZH_CN = "使用本服务前，请阅读并同意用户协议。继续操作即表示你确认将遵守平台规则、适用法律法规，以及支付或订阅前展示的计费条款。";
const DEFAULT_PRIVACY_CONTENT_ZH_CN = "请阅读隐私政策，了解本服务如何为提供、维护和保障服务而处理账号信息、使用数据、计费记录和上传内容。";
const DEFAULT_TERMS_CONTENT_ZH_TW = "使用本服務前，請閱讀服務條款。建立帳號、登入、訂閱或付款，即表示你同意遵守平台規則、適用法律法規，以及付款前展示的計費條款。";
const DEFAULT_LEGACY_AGREEMENT_CONTENT_ZH_TW = "使用本服務前，請閱讀並同意使用者協議。繼續操作即表示你確認將遵守平台規則、適用法律法規，以及付款或訂閱前展示的計費條款。";
const DEFAULT_PRIVACY_CONTENT_ZH_TW = "請閱讀隱私政策，了解本服務如何為提供、維護和保障服務而處理帳號資訊、使用資料、計費記錄和上傳內容。";

function fieldID(field: SiteSettingsField): string {
  return `${field.namespace}.${field.key}`;
}

function flattenSiteSettings(items: SettingItem[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const item of items) {
    result[`site.${item.key}`] = item.value ?? "";
  }
  return applySiteDefaults(result);
}

function applySiteDefaults(settings: Record<string, string>): Record<string, string> {
  const termsTitleEn = legalSettingValue(settings["site.terms_title_en_us"], "Terms of Service", settings["site.agreement_title_en_us"], "User Agreement");
  const termsContentEn = legalSettingValue(settings["site.terms_content_en_us"], DEFAULT_TERMS_CONTENT_EN, settings["site.agreement_content_en_us"], DEFAULT_LEGACY_AGREEMENT_CONTENT_EN);
  const termsTitleZh = legalSettingValue(settings["site.terms_title_zh_cn"], "服务条款", settings["site.agreement_title_zh_cn"], "用户协议");
  const termsContentZh = legalSettingValue(settings["site.terms_content_zh_cn"], DEFAULT_TERMS_CONTENT_ZH_CN, settings["site.agreement_content_zh_cn"], DEFAULT_LEGACY_AGREEMENT_CONTENT_ZH_CN);
  const termsTitleTw = legalSettingValue(settings["site.terms_title_zh_tw"], "服務條款", settings["site.agreement_title_zh_tw"], "使用者協議");
  const termsContentTw = legalSettingValue(settings["site.terms_content_zh_tw"], DEFAULT_TERMS_CONTENT_ZH_TW, settings["site.agreement_content_zh_tw"], DEFAULT_LEGACY_AGREEMENT_CONTENT_ZH_TW);
  return {
    ...settings,
    "site.name": settings["site.name"]?.trim() || "DEEIX Chat",
    "site.short_name": settings["site.short_name"]?.trim() || "DEEIX",
    "site.description": settings["site.description"]?.trim() || "A multi-model AI conversation workspace.",
    "site.logo_url": settings["site.logo_url"]?.trim() || "/logo.svg",
    "site.logo_dark_url": settings["site.logo_dark_url"]?.trim() || "/logo-white.svg",
    "site.favicon_url": settings["site.favicon_url"]?.trim() || "/favicon.ico",
    "site.home_title": settings["site.home_title"]?.trim() || settings["site.name"]?.trim() || "DEEIX Chat",
    "site.home_subtitle": settings["site.home_subtitle"]?.trim() || "A private AI workspace for chat, files, tools, and usage-aware model access.",
    "site.footer_text": settings["site.footer_text"] ?? "Powered by DEEIX Chat",
    "site.contact_email": settings["site.contact_email"] ?? "support@deeix.com",
    "site.terms_url": settings["site.terms_url"] ?? "",
    "site.privacy_url": settings["site.privacy_url"] ?? "",
    "site.terms_title_en_us": termsTitleEn,
    "site.terms_content_en_us": termsContentEn,
    "site.privacy_title_en_us": settings["site.privacy_title_en_us"] ?? "Privacy Policy",
    "site.privacy_content_en_us": settings["site.privacy_content_en_us"] ?? DEFAULT_PRIVACY_CONTENT_EN,
    "site.terms_title_zh_cn": termsTitleZh,
    "site.terms_content_zh_cn": termsContentZh,
    "site.privacy_title_zh_cn": settings["site.privacy_title_zh_cn"] ?? "隐私政策",
    "site.privacy_content_zh_cn": settings["site.privacy_content_zh_cn"] ?? DEFAULT_PRIVACY_CONTENT_ZH_CN,
    "site.terms_title_zh_tw": termsTitleTw,
    "site.terms_content_zh_tw": termsContentTw,
    "site.privacy_title_zh_tw": settings["site.privacy_title_zh_tw"] ?? "隱私政策",
    "site.privacy_content_zh_tw": settings["site.privacy_content_zh_tw"] ?? DEFAULT_PRIVACY_CONTENT_ZH_TW,
  };
}

function legalSettingValue(value: string | undefined, defaultValue: string, legacyValue: string | undefined, legacyDefault: string): string {
  const normalized = value?.trim() ?? "";
  if (normalized && normalized !== defaultValue) {
    return normalized;
  }
  const legacy = legacyValue?.trim() ?? "";
  if (legacy && legacy !== legacyDefault) {
    return legacy;
  }
  return normalized || defaultValue;
}

function toEditorField(field: SiteSettingsField) {
  return {
    id: fieldID(field),
    label: field.label,
    description: field.description,
    type: field.type,
    placeholder: field.placeholder,
  } as const;
}

function isAssetSettingKey(key: SiteSettingKey): key is AssetSettingKey {
  return key === "logo_url" || key === "logo_dark_url" || key === "favicon_url";
}

function resolveAssetSettingKey(key: SiteSettingKey): AssetSettingKey | null {
  return isAssetSettingKey(key) ? key : null;
}

function acceptForAsset(key: AssetSettingKey): string {
  return key === "favicon_url" ? "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.ico" : "image/png,image/jpeg,image/webp,image/svg+xml";
}

export function AdminSiteSettingsPage() {
  const t = useTranslations("adminSite");
  const commonT = useTranslations("common");
  const groups = React.useMemo<SiteSettingsGroup[]>(
    () => [
      {
        title: t("groups.identity"),
        fields: [
          { namespace: "site", key: "name", label: t("fields.name.label"), description: t("fields.name.description"), type: "string", placeholder: "DEEIX Chat" },
          { namespace: "site", key: "short_name", label: t("fields.shortName.label"), description: t("fields.shortName.description"), type: "string", placeholder: "DEEIX" },
          { namespace: "site", key: "description", label: t("fields.description.label"), description: t("fields.description.description"), type: "textarea" },
        ],
      },
      {
        title: t("groups.assets"),
        fields: [
          { namespace: "site", key: "logo_url", label: t("fields.logoURL.label"), description: t("fields.logoURL.description"), type: "string", placeholder: "/logo.svg" },
          { namespace: "site", key: "logo_dark_url", label: t("fields.logoDarkURL.label"), description: t("fields.logoDarkURL.description"), type: "string", placeholder: "/logo-white.svg" },
          { namespace: "site", key: "favicon_url", label: t("fields.faviconURL.label"), description: t("fields.faviconURL.description"), type: "string", placeholder: "/favicon.ico" },
        ],
      },
      {
        title: t("groups.home"),
        fields: [
          { namespace: "site", key: "home_title", label: t("fields.homeTitle.label"), description: t("fields.homeTitle.description"), type: "string" },
          { namespace: "site", key: "home_subtitle", label: t("fields.homeSubtitle.label"), description: t("fields.homeSubtitle.description"), type: "textarea" },
          { namespace: "site", key: "footer_text", label: t("fields.footerText.label"), description: t("fields.footerText.description"), type: "string" },
        ],
      },
      {
        title: t("groups.links"),
        fields: [
          { namespace: "site", key: "contact_email", label: t("fields.contactEmail.label"), description: t("fields.contactEmail.description"), type: "string", placeholder: "support@example.com" },
          { namespace: "site", key: "terms_url", label: t("fields.termsURL.label"), description: t("fields.termsURL.description"), type: "string", placeholder: "https://example.com/terms" },
          { namespace: "site", key: "privacy_url", label: t("fields.privacyURL.label"), description: t("fields.privacyURL.description"), type: "string", placeholder: "https://example.com/privacy" },
        ],
      },
      {
        title: t("groups.legal"),
        fields: [
          { namespace: "site", key: "terms_title_en_us", label: t("fields.termsTitleEnUS.label"), description: t("fields.termsTitleEnUS.description"), type: "string" },
          { namespace: "site", key: "terms_content_en_us", label: t("fields.termsContentEnUS.label"), description: t("fields.termsContentEnUS.description"), type: "textarea" },
          { namespace: "site", key: "privacy_title_en_us", label: t("fields.privacyTitleEnUS.label"), description: t("fields.privacyTitleEnUS.description"), type: "string" },
          { namespace: "site", key: "privacy_content_en_us", label: t("fields.privacyContentEnUS.label"), description: t("fields.privacyContentEnUS.description"), type: "textarea" },
          { namespace: "site", key: "terms_title_zh_cn", label: t("fields.termsTitleZhCN.label"), description: t("fields.termsTitleZhCN.description"), type: "string" },
          { namespace: "site", key: "terms_content_zh_cn", label: t("fields.termsContentZhCN.label"), description: t("fields.termsContentZhCN.description"), type: "textarea" },
          { namespace: "site", key: "privacy_title_zh_cn", label: t("fields.privacyTitleZhCN.label"), description: t("fields.privacyTitleZhCN.description"), type: "string" },
          { namespace: "site", key: "privacy_content_zh_cn", label: t("fields.privacyContentZhCN.label"), description: t("fields.privacyContentZhCN.description"), type: "textarea" },
          { namespace: "site", key: "terms_title_zh_tw", label: t("fields.termsTitleZhTW.label"), description: t("fields.termsTitleZhTW.description"), type: "string" },
          { namespace: "site", key: "terms_content_zh_tw", label: t("fields.termsContentZhTW.label"), description: t("fields.termsContentZhTW.description"), type: "textarea" },
          { namespace: "site", key: "privacy_title_zh_tw", label: t("fields.privacyTitleZhTW.label"), description: t("fields.privacyTitleZhTW.description"), type: "string" },
          { namespace: "site", key: "privacy_content_zh_tw", label: t("fields.privacyContentZhTW.label"), description: t("fields.privacyContentZhTW.description"), type: "textarea" },
        ],
      },
    ],
    [t],
  );
  const [settingsMap, setSettingsMap] = React.useState<Record<string, string>>(() => applySiteDefaults({}));
  const [savedMap, setSavedMap] = React.useState<Record<string, string>>(() => applySiteDefaults({}));
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [uploadingFieldID, setUploadingFieldID] = React.useState("");

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      const token = await resolveAccessToken();
      if (!token) {
        toast.error(t("toast.sessionExpired"), { description: t("toast.signInAgain") });
        return;
      }
      const items = await listAdminSettingsByNamespace(token, "site");
      const flattened = flattenSiteSettings(items);
      setSettingsMap(flattened);
      setSavedMap(flattened);
    } catch (error) {
      toast.error(t("toast.loadFailed"), { description: resolveAdminErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const dirtyFieldIDs = React.useMemo(() => {
    const result = new Set<string>();
    for (const group of groups) {
      for (const field of group.fields) {
        const id = fieldID(field);
        if ((settingsMap[id] ?? "") !== (savedMap[id] ?? "")) {
          result.add(id);
        }
      }
    }
    return result;
  }, [groups, savedMap, settingsMap]);

  const handleSaveGroup = React.useCallback(async (group: SiteSettingsGroup) => {
    const nextSettingsMap = applySiteDefaults(settingsMap);
    const items: PatchSettingItem[] = group.fields
      .map((field) => ({
        namespace: field.namespace,
        key: field.key,
        value: nextSettingsMap[fieldID(field)] ?? "",
      }))
      .filter((item) => item.value !== (savedMap[`${item.namespace}.${item.key}`] ?? ""));
    if (items.length === 0) {
      return;
    }
    setSaving(true);
    try {
      const token = await resolveAccessToken();
      if (!token) {
        toast.error(t("toast.sessionExpired"), { description: t("toast.signInAgain") });
        return;
      }
      const grouped = await patchAdminSettings(token, { items });
      const flattened = flattenSiteSettings(grouped.site ?? []);
      setSettingsMap(flattened);
      setSavedMap(flattened);
      toast.success(t("toast.saved"));
    } catch (error) {
      toast.error(t("toast.saveFailed"), { description: resolveAdminErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }, [savedMap, settingsMap, t]);

  const handleUploadAsset = React.useCallback(async (field: SiteSettingsField, file: File) => {
    if (!isAssetSettingKey(field.key)) {
      return;
    }
    const id = fieldID(field);
    setUploadingFieldID(id);
    try {
      const token = await resolveAccessToken();
      if (!token) {
        toast.error(t("toast.sessionExpired"), { description: t("toast.signInAgain") });
        return;
      }
      const result = await uploadSiteAsset(token, file);
      const nextValue = result.url.trim();
      setSettingsMap((current) => ({ ...current, [id]: nextValue }));
      await patchAdminSettings(token, {
        items: [{ namespace: field.namespace, key: field.key, value: nextValue }],
      });
      setSavedMap((current) => ({ ...current, [id]: nextValue }));
      toast.success(t("toast.assetUploaded"));
    } catch (error) {
      toast.error(t("toast.assetUploadFailed"), { description: resolveAdminErrorMessage(error) });
    } finally {
      setUploadingFieldID("");
    }
  }, [t]);

  return (
    <SettingsPage>
      {groups.map((group, index) => {
        const groupDirty = group.fields.some((field) => dirtyFieldIDs.has(fieldID(field)));
        return (
          <React.Fragment key={group.title}>
            <SettingsSection
              title={group.title}
              actions={
                groupDirty ? (
                  <Button type="button" size="sm" disabled={loading || saving} onClick={() => void handleSaveGroup(group)}>
                    <Save className="size-3.5" />
                    {commonT("actions.save")}
                  </Button>
                ) : null
              }
            >
              <SettingsFieldList>
                {group.fields.map((field, fieldIndex) => {
                  const id = fieldID(field);
                  const assetKey = resolveAssetSettingKey(field.key);
                  const uploadDisabled = loading || saving || Boolean(uploadingFieldID);
                  return (
                    <SettingsFieldItem key={id} index={fieldIndex}>
                      <SettingsFieldEditor
                        field={toEditorField(field)}
                        value={settingsMap[id] ?? ""}
                        dirty={(settingsMap[id] ?? "") !== (savedMap[id] ?? "")}
                        disabled={loading || saving || uploadingFieldID === id}
                        labelAction={assetKey ? (
                          <label
                            className={cn(
                              buttonVariants({ variant: "outline", size: "sm" }),
                              "relative h-7 overflow-hidden rounded-md px-2.5 text-xs shadow-none",
                              uploadDisabled ? "pointer-events-none opacity-50" : "",
                            )}
                            aria-disabled={uploadDisabled}
                          >
                            <Upload className={`size-3.5 ${uploadingFieldID === id ? "animate-pulse" : ""}`} />
                            {t("actions.upload")}
                            <input
                              type="file"
                              accept={acceptForAsset(assetKey)}
                              className="absolute inset-0 cursor-pointer opacity-0"
                              disabled={loading || saving || Boolean(uploadingFieldID)}
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (file) {
                                  void handleUploadAsset(field, file);
                                }
                              }}
                            />
                          </label>
                        ) : undefined}
                        onChange={(value) => setSettingsMap((current) => ({ ...current, [id]: value }))}
                      />
                    </SettingsFieldItem>
                  );
                })}
              </SettingsFieldList>
            </SettingsSection>
            {index < groups.length - 1 ? <SettingsSectionSeparator /> : null}
          </React.Fragment>
        );
      })}
    </SettingsPage>
  );
}
