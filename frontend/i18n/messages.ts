import enAdminAnnouncements from "@/i18n/messages/en-US/admin-announcements.json";
import enAdminBilling from "@/i18n/messages/en-US/admin-billing.json";
import enAdminConversation from "@/i18n/messages/en-US/admin-conversation.json";
import enAdminFiles from "@/i18n/messages/en-US/admin-files.json";
import enAdminGroups from "@/i18n/messages/en-US/admin-groups.json";
import enAdminLogin from "@/i18n/messages/en-US/admin-login.json";
import enAdminLogs from "@/i18n/messages/en-US/admin-logs.json";
import enAdminModels from "@/i18n/messages/en-US/admin-models.json";
import enAdminPrompts from "@/i18n/messages/en-US/admin-prompts.json";
import enAdminSite from "@/i18n/messages/en-US/admin-site.json";
import enAdminTools from "@/i18n/messages/en-US/admin-tools.json";
import enAdminUpstreams from "@/i18n/messages/en-US/admin-upstreams.json";
import enAdminUsers from "@/i18n/messages/en-US/admin-users.json";
import enChat from "@/i18n/messages/en-US/chat.json";
import enAnnouncements from "@/i18n/messages/en-US/announcements.json";
import enCommon from "@/i18n/messages/en-US/common.json";
import enErrors from "@/i18n/messages/en-US/errors.json";
import enFiles from "@/i18n/messages/en-US/files.json";
import enGuide from "@/i18n/messages/en-US/guide.json";
import enLogin from "@/i18n/messages/en-US/login.json";
import enPrompts from "@/i18n/messages/en-US/prompts.json";
import enRecent from "@/i18n/messages/en-US/recent.json";
import enSettings from "@/i18n/messages/en-US/settings.json";
import enShare from "@/i18n/messages/en-US/share.json";
import enSite from "@/i18n/messages/en-US/site.json";
import type { AppLocale } from "@/i18n/config";

export type AppMessages = typeof DEFAULT_MESSAGES;

export const DEFAULT_MESSAGES = {
  common: enCommon,
  errors: enErrors,
  login: enLogin,
  prompts: enPrompts,
  guide: enGuide,
  chat: enChat,
  announcements: enAnnouncements,
  recent: enRecent,
  share: enShare,
  files: enFiles,
  settings: enSettings,
  site: enSite,
  adminAnnouncements: enAdminAnnouncements,
  adminBilling: enAdminBilling,
  adminConversation: enAdminConversation,
  adminFiles: enAdminFiles,
  adminGroups: enAdminGroups,
  adminLogin: enAdminLogin,
  adminLogs: enAdminLogs,
  adminModels: enAdminModels,
  adminPrompts: enAdminPrompts,
  adminSite: enAdminSite,
  adminTools: enAdminTools,
  adminUpstreams: enAdminUpstreams,
  adminUsers: enAdminUsers,
};

export async function loadLocaleMessages(locale: AppLocale): Promise<AppMessages> {
  if (locale === "en-US") {
    return DEFAULT_MESSAGES;
  }
  const localeDir = locale === "zh-TW" ? "zh-TW" : "zh-CN";

  const [
    common,
    errors,
    login,
    prompts,
    guide,
    chat,
    announcements,
    recent,
    share,
    files,
    settings,
    site,
    adminAnnouncements,
    adminBilling,
    adminConversation,
    adminFiles,
    adminGroups,
    adminLogin,
    adminLogs,
    adminModels,
    adminPrompts,
    adminSite,
    adminTools,
    adminUpstreams,
    adminUsers,
  ] = await Promise.all([
    import(`@/i18n/messages/${localeDir}/common.json`),
    import(`@/i18n/messages/${localeDir}/errors.json`),
    import(`@/i18n/messages/${localeDir}/login.json`),
    import(`@/i18n/messages/${localeDir}/prompts.json`),
    import(`@/i18n/messages/${localeDir}/guide.json`),
    import(`@/i18n/messages/${localeDir}/chat.json`),
    import(`@/i18n/messages/${localeDir}/announcements.json`),
    import(`@/i18n/messages/${localeDir}/recent.json`),
    import(`@/i18n/messages/${localeDir}/share.json`),
    import(`@/i18n/messages/${localeDir}/files.json`),
    import(`@/i18n/messages/${localeDir}/settings.json`),
    import(`@/i18n/messages/${localeDir}/site.json`),
    import(`@/i18n/messages/${localeDir}/admin-announcements.json`),
    import(`@/i18n/messages/${localeDir}/admin-billing.json`),
    import(`@/i18n/messages/${localeDir}/admin-conversation.json`),
    import(`@/i18n/messages/${localeDir}/admin-files.json`),
    import(`@/i18n/messages/${localeDir}/admin-groups.json`),
    import(`@/i18n/messages/${localeDir}/admin-login.json`),
    import(`@/i18n/messages/${localeDir}/admin-logs.json`),
    import(`@/i18n/messages/${localeDir}/admin-models.json`),
    import(`@/i18n/messages/${localeDir}/admin-prompts.json`),
    import(`@/i18n/messages/${localeDir}/admin-site.json`),
    import(`@/i18n/messages/${localeDir}/admin-tools.json`),
    import(`@/i18n/messages/${localeDir}/admin-upstreams.json`),
    import(`@/i18n/messages/${localeDir}/admin-users.json`),
  ]);

  return {
    common: common.default,
    errors: errors.default,
    login: login.default,
    prompts: prompts.default,
    guide: guide.default,
    chat: chat.default,
    announcements: announcements.default,
    recent: recent.default,
    share: share.default,
    files: files.default,
    settings: settings.default,
    site: site.default,
    adminAnnouncements: adminAnnouncements.default,
    adminBilling: adminBilling.default,
    adminConversation: adminConversation.default,
    adminFiles: adminFiles.default,
    adminGroups: adminGroups.default,
    adminLogin: adminLogin.default,
    adminLogs: adminLogs.default,
    adminModels: adminModels.default,
    adminPrompts: adminPrompts.default,
    adminSite: adminSite.default,
    adminTools: adminTools.default,
    adminUpstreams: adminUpstreams.default,
    adminUsers: adminUsers.default,
  };
}
