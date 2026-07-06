package settings

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	appembedding "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/embedding"
	appstorage "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/objectstorage"
	appruntime "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/runtime"
	appsettings "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/settings"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/config"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/objectstore"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/shared/nativetool"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/shared/response"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/middleware"
	"github.com/gin-gonic/gin"
)

const (
	runtimeActionTimeout      = 5 * time.Minute
	maxSiteAssetUploadBytes   = 2 * 1024 * 1024
	siteAssetObjectKeyPrefix  = "site-assets"
	siteAssetPublicPathPrefix = "/api/v1/site-assets/"
)

var siteAssetFileNamePattern = regexp.MustCompile(`^site-[a-f0-9]{24}\.(?:png|jpe?g|webp|svg|ico)$`)

type nativeToolCatalogProvider interface {
	ListNativeToolDefinitions(ctx context.Context) ([]nativetool.Definition, error)
}

// Handler 封装 settings HTTP 处理。
type Handler struct {
	service         *appsettings.Service
	runtimeSettings *appsettings.RuntimeSettings
	runtimeSvc      *appruntime.Service
	runtime         *config.Runtime
	embeddingSvc    *appembedding.Service // 可选，用于模型变更后触发向量失效
	nativeTools     nativeToolCatalogProvider
	storeProvider   appstorage.Provider
}

// NewHandler 创建处理器。
func NewHandler(service *appsettings.Service, runtimeSettings *appsettings.RuntimeSettings, runtimeSvc *appruntime.Service, runtime *config.Runtime) *Handler {
	return &Handler{
		service:         service,
		runtimeSettings: runtimeSettings,
		runtimeSvc:      runtimeSvc,
		runtime:         runtime,
	}
}

// SetEmbeddingService 注入 Embedding 服务（可选），用于在模型配置变更时自动标记向量失效。
func (h *Handler) SetEmbeddingService(svc *appembedding.Service) {
	h.embeddingSvc = svc
}

// SetNativeToolCatalogProvider 注入平台级官方原生工具目录提供者。
func (h *Handler) SetNativeToolCatalogProvider(provider nativeToolCatalogProvider) {
	h.nativeTools = provider
}

// SetObjectStoreProvider 注入对象存储 provider，用于站点品牌素材上传与公开读取。
func (h *Handler) SetObjectStoreProvider(provider appstorage.Provider) {
	if provider != nil {
		h.storeProvider = provider
	}
}

func (h *Handler) objectStore(ctx context.Context) (objectstore.Store, error) {
	provider := h.storeProvider
	if provider == nil {
		provider = appstorage.NewRuntimeProvider(h.runtime, nil)
	}
	return provider.Open(ctx)
}

// ListAll godoc
// @Summary 查询全部动态配置
// @Description 按 namespace 分组返回全部动态配置项
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings [get]
func (h *Handler) ListAll(c *gin.Context) {
	data, err := h.service.ListAll(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "list settings failed")
		return
	}
	response.Success(c, toSettingResponseMap(data))
}

// ListByNamespace godoc
// @Summary 查询指定 namespace 的配置
// @Description 查询指定 namespace 下的全部配置项
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Param namespace path string true "命名空间"
// @Success 200 {object} response.Envelope
// @Router /admin/settings/{namespace} [get]
func (h *Handler) ListByNamespace(c *gin.Context) {
	ns := c.Param("namespace")
	if !appsettings.IsValidNamespace(ns) {
		response.Error(c, http.StatusBadRequest, "invalid namespace")
		return
	}

	data, err := h.service.ListByNamespace(c.Request.Context(), ns)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "list settings failed")
		return
	}
	response.Success(c, toSettingResponseList(data))
}

// GetLoginPageSettings godoc
// @Summary 查询公开登录页配置
// @Tags settings
// @Produce json
// @Success 200 {object} response.Envelope
// @Router /settings/login-page [get]
func (h *Handler) GetLoginPageSettings(c *gin.Context) {
	items, err := h.service.ListByNamespace(c.Request.Context(), "auth")
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "list login page settings failed")
		return
	}
	values := map[string]string{
		"login_page_title":        "Sign in to DEEIX Chat",
		"login_default_next_path": "/chat",
	}
	for _, item := range items {
		if _, ok := values[item.Key]; ok {
			values[item.Key] = item.Value
		}
	}
	siteProfile, siteErr := h.siteProfile(c.Request.Context(), c.GetHeader("Accept-Language"))
	if siteErr != nil {
		response.Error(c, http.StatusInternalServerError, "list site profile failed")
		return
	}
	if strings.TrimSpace(values["login_page_title"]) == "Sign in to DEEIX Chat" && strings.TrimSpace(siteProfile.Name) != "" && strings.TrimSpace(siteProfile.Name) != "DEEIX Chat" {
		values["login_page_title"] = "Sign in to " + strings.TrimSpace(siteProfile.Name)
	}
	if strings.TrimSpace(values["login_page_title"]) == "" {
		values["login_page_title"] = "Sign in to DEEIX Chat"
	}
	if strings.TrimSpace(values["login_default_next_path"]) == "" ||
		!strings.HasPrefix(values["login_default_next_path"], "/") ||
		strings.HasPrefix(values["login_default_next_path"], "//") {
		values["login_default_next_path"] = "/chat"
	}
	response.Success(c, LoginPageSettingsResponse{
		Title:           values["login_page_title"],
		DefaultNextPath: values["login_default_next_path"],
	})
}

// GetSiteProfile godoc
// @Summary 查询公开站点信息
// @Tags settings
// @Produce json
// @Success 200 {object} response.Envelope
// @Router /settings/site-profile [get]
func (h *Handler) GetSiteProfile(c *gin.Context) {
	profile, err := h.siteProfile(c.Request.Context(), c.Query("locale"), c.GetHeader("Accept-Language"))
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "list site profile failed")
		return
	}
	response.Success(c, profile)
}

// UploadSiteAsset 上传站点品牌素材。
func (h *Handler) UploadSiteAsset(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxSiteAssetUploadBytes+(1<<20))
	fileHeader, err := c.FormFile("file")
	if err != nil {
		response.Error(c, http.StatusBadRequest, "file is required")
		return
	}
	fileReader, err := fileHeader.Open()
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalid file stream")
		return
	}
	defer fileReader.Close() //nolint:errcheck

	data, err := io.ReadAll(io.LimitReader(fileReader, maxSiteAssetUploadBytes+1))
	if err != nil {
		response.Error(c, http.StatusBadRequest, "invalid file stream")
		return
	}
	if len(data) == 0 {
		response.Error(c, http.StatusBadRequest, "file is required")
		return
	}
	if len(data) > maxSiteAssetUploadBytes {
		response.Error(c, http.StatusRequestEntityTooLarge, "file too large")
		return
	}

	contentType, extension, err := normalizeSiteAsset(fileHeader.Filename, fileHeader.Header.Get("Content-Type"), data)
	if err != nil {
		response.ErrorWithCode(c, http.StatusBadRequest, "settings.site_asset_unsupported_type", "unsupported site asset type")
		return
	}
	fileName, err := randomSiteAssetFileName(extension)
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "upload site asset failed")
		return
	}
	store, err := h.objectStore(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "open object storage failed")
		return
	}
	if _, err = store.Put(c.Request.Context(), siteAssetObjectKey(fileName), bytes.NewReader(data), objectstore.PutOptions{
		SizeBytes:   int64(len(data)),
		ContentType: contentType,
	}); err != nil {
		response.Error(c, http.StatusInternalServerError, "upload site asset failed")
		return
	}

	h.service.RecordAudit(c.Request.Context(), appsettings.AuditInput{
		UserID:    middleware.MustUserID(c),
		RequestID: middleware.MustRequestID(c),
		Action:    "settings.site_asset.upload",
		ClientIP:  c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
		Detail: map[string]interface{}{
			"file_name":    fileName,
			"content_type": contentType,
			"size_bytes":   len(data),
		},
	})

	response.Success(c, SiteAssetUploadResponse{
		URL:         siteAssetPublicPathPrefix + fileName,
		FileName:    fileName,
		ContentType: contentType,
		SizeBytes:   int64(len(data)),
	})
}

// GetSiteAsset 公开读取站点品牌素材。
func (h *Handler) GetSiteAsset(c *gin.Context) {
	fileName := strings.TrimSpace(c.Param("file_name"))
	if !siteAssetFileNamePattern.MatchString(fileName) {
		response.Error(c, http.StatusNotFound, "site asset not found")
		return
	}
	store, err := h.objectStore(c.Request.Context())
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "open object storage failed")
		return
	}
	reader, info, err := store.Open(c.Request.Context(), siteAssetObjectKey(fileName))
	if err != nil {
		if errors.Is(err, objectstore.ErrNotFound) {
			response.Error(c, http.StatusNotFound, "site asset not found")
			return
		}
		response.Error(c, http.StatusInternalServerError, "open site asset failed")
		return
	}
	defer reader.Close() //nolint:errcheck

	contentType := siteAssetContentTypeFromFileName(fileName)
	if strings.TrimSpace(info.ContentType) != "" {
		contentType = strings.TrimSpace(info.ContentType)
	}
	c.Header("Content-Type", contentType)
	c.Header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
	c.Header("X-Content-Type-Options", "nosniff")
	if info.SizeBytes > 0 {
		c.Header("Content-Length", fmt.Sprintf("%d", info.SizeBytes))
	}
	if !info.ModTime.IsZero() {
		c.Header("Last-Modified", info.ModTime.UTC().Format(http.TimeFormat))
	}
	if _, err = io.Copy(c.Writer, reader); err != nil {
		c.Abort()
		return
	}
}

func (h *Handler) siteProfile(ctx context.Context, locales ...string) (SiteProfileResponse, error) {
	items, err := h.service.ListByNamespace(ctx, "site")
	if err != nil {
		return SiteProfileResponse{}, err
	}
	locale := resolveSiteProfileLocale(locales...)
	values := map[string]string{
		"name":                    "DEEIX Chat",
		"short_name":              "DEEIX",
		"description":             "A multi-model AI conversation workspace.",
		"logo_url":                "/logo.svg",
		"logo_dark_url":           "/logo-white.svg",
		"favicon_url":             "/favicon.ico",
		"home_title":              "DEEIX Chat",
		"home_subtitle":           "A private AI workspace for chat, files, tools, and usage-aware model access.",
		"footer_text":             "Powered by DEEIX Chat",
		"contact_email":           "support@deeix.com",
		"terms_url":               "",
		"privacy_url":             "",
		"terms_title_en_us":       "Terms of Service",
		"terms_content_en_us":     "Please read these Terms of Service before using this service. By creating an account, signing in, subscribing, or making a payment, you agree to follow platform rules, applicable laws, and the billing terms shown before payment.",
		"privacy_title_en_us":     "Privacy Policy",
		"privacy_content_en_us":   "Please read this Privacy Policy to understand how account information, usage data, billing records, and uploaded content may be processed to provide and secure this service.",
		"terms_title_zh_cn":       "服务条款",
		"terms_content_zh_cn":     "使用本服务前，请阅读服务条款。创建账号、登录、订阅或付款，即表示你同意遵守平台规则、适用法律法规，以及支付前展示的计费条款。",
		"privacy_title_zh_cn":     "隐私政策",
		"privacy_content_zh_cn":   "请阅读隐私政策，了解本服务如何为提供、维护和保障服务而处理账号信息、使用数据、计费记录和上传内容。",
		"terms_title_zh_tw":       "服務條款",
		"terms_content_zh_tw":     "使用本服務前，請閱讀服務條款。建立帳號、登入、訂閱或付款，即表示你同意遵守平台規則、適用法律法規，以及付款前展示的計費條款。",
		"privacy_title_zh_tw":     "隱私政策",
		"privacy_content_zh_tw":   "請閱讀隱私政策，了解本服務如何為提供、維護和保障服務而處理帳號資訊、使用資料、計費記錄和上傳內容。",
		"agreement_title_en_us":   "User Agreement",
		"agreement_content_en_us": "Please read and agree to the user agreement before using this service. By continuing, you confirm that you will comply with platform rules, applicable laws, and the billing or subscription terms shown before payment.",
		"agreement_title_zh_cn":   "用户协议",
		"agreement_content_zh_cn": "使用本服务前，请阅读并同意用户协议。继续操作即表示你确认将遵守平台规则、适用法律法规，以及支付或订阅前展示的计费条款。",
		"agreement_title_zh_tw":   "使用者協議",
		"agreement_content_zh_tw": "使用本服務前，請閱讀並同意使用者協議。繼續操作即表示你確認將遵守平台規則、適用法律法規，以及付款或訂閱前展示的計費條款。",
	}
	for _, item := range items {
		if _, ok := values[item.Key]; ok {
			values[item.Key] = item.Value
		}
	}
	termsTitleKey, termsContentKey := siteLegalDocumentKeys(locale, "terms")
	privacyTitleKey, privacyContentKey := siteLegalDocumentKeys(locale, "privacy")
	agreementTitleKey, agreementContentKey := siteAgreementKeys(locale)
	termsTitleDefault, termsContentDefault := siteLegalDocumentDefaults(locale, "terms")
	privacyTitleDefault, privacyContentDefault := siteLegalDocumentDefaults(locale, "privacy")
	agreementTitleDefault, agreementContentDefault := siteAgreementDefaults(locale)
	profile := SiteProfileResponse{
		Name:         firstNonEmpty(values["name"], "DEEIX Chat"),
		ShortName:    firstNonEmpty(values["short_name"], "DEEIX"),
		Description:  firstNonEmpty(values["description"], "A multi-model AI conversation workspace."),
		LogoURL:      firstNonEmpty(values["logo_url"], "/logo.svg"),
		LogoDarkURL:  firstNonEmpty(values["logo_dark_url"], "/logo-white.svg"),
		FaviconURL:   firstNonEmpty(values["favicon_url"], "/favicon.ico"),
		HomeTitle:    firstNonEmpty(values["home_title"], values["name"], "DEEIX Chat"),
		HomeSubtitle: firstNonEmpty(values["home_subtitle"], values["description"], "A private AI workspace for chat, files, tools, and usage-aware model access."),
		FooterText:   values["footer_text"],
		ContactEmail: values["contact_email"],
		TermsURL:     values["terms_url"],
		PrivacyURL:   values["privacy_url"],
	}
	profile.Terms = SiteLegalDocumentResponse{
		Title: resolveLegalDocumentValue(
			values[termsTitleKey],
			values["terms_title_en_us"],
			values[agreementTitleKey],
			values["agreement_title_en_us"],
			termsTitleDefault,
			"Terms of Service",
			agreementTitleDefault,
			"User Agreement",
		),
		Content: resolveLegalDocumentValue(
			values[termsContentKey],
			values["terms_content_en_us"],
			values[agreementContentKey],
			values["agreement_content_en_us"],
			termsContentDefault,
			"Please read these Terms of Service before using this service. By creating an account, signing in, subscribing, or making a payment, you agree to follow platform rules, applicable laws, and the billing terms shown before payment.",
			agreementContentDefault,
			"Please read and agree to the user agreement before using this service. By continuing, you confirm that you will comply with platform rules, applicable laws, and the billing or subscription terms shown before payment.",
		),
	}
	profile.Privacy = SiteLegalDocumentResponse{
		Title:   firstNonEmpty(values[privacyTitleKey], values["privacy_title_en_us"], privacyTitleDefault, "Privacy Policy"),
		Content: firstNonEmpty(values[privacyContentKey], values["privacy_content_en_us"], privacyContentDefault),
	}
	profile.Agreement = profile.Terms
	return profile, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func resolveLegalDocumentValue(localizedNew string, enNew string, localizedLegacy string, enLegacy string, localizedNewDefault string, enNewDefault string, localizedLegacyDefault string, enLegacyDefault string) string {
	if isCustomLegalValue(localizedNew, localizedNewDefault) {
		return strings.TrimSpace(localizedNew)
	}
	if strings.TrimSpace(localizedNew) == "" && isCustomLegalValue(enNew, enNewDefault) {
		return strings.TrimSpace(enNew)
	}
	if legacy := firstCustomLegalValue(localizedLegacy, localizedLegacyDefault, enLegacy, enLegacyDefault); legacy != "" {
		newValue := firstNonEmpty(localizedNew, enNew)
		if newValue == "" || newValue == strings.TrimSpace(localizedNewDefault) || newValue == strings.TrimSpace(enNewDefault) {
			return legacy
		}
	}
	return firstNonEmpty(localizedNew, enNew, localizedLegacy, enLegacy, localizedNewDefault, enNewDefault)
}

func firstCustomLegalValue(localized string, localizedDefault string, en string, enDefault string) string {
	if isCustomLegalValue(localized, localizedDefault) {
		return strings.TrimSpace(localized)
	}
	if strings.TrimSpace(localized) == "" && isCustomLegalValue(en, enDefault) {
		return strings.TrimSpace(en)
	}
	return ""
}

func isCustomLegalValue(value string, defaultValue string) bool {
	trimmed := strings.TrimSpace(value)
	return trimmed != "" && trimmed != strings.TrimSpace(defaultValue)
}

func resolveSiteProfileLocale(values ...string) string {
	for _, value := range values {
		for _, part := range strings.Split(value, ",") {
			normalized := strings.ToLower(strings.TrimSpace(strings.Split(part, ";")[0]))
			normalized = strings.ReplaceAll(normalized, "_", "-")
			switch {
			case normalized == "zh-tw" || normalized == "zh-hk" || normalized == "zh-mo" || strings.HasPrefix(normalized, "zh-hant"):
				return "zh-TW"
			case normalized == "zh" || normalized == "zh-cn" || strings.HasPrefix(normalized, "zh-hans"):
				return "zh-CN"
			case normalized == "en" || normalized == "en-us" || strings.HasPrefix(normalized, "en-"):
				return "en-US"
			}
		}
	}
	return "en-US"
}

func siteAgreementKeys(locale string) (string, string) {
	switch locale {
	case "zh-CN":
		return "agreement_title_zh_cn", "agreement_content_zh_cn"
	case "zh-TW":
		return "agreement_title_zh_tw", "agreement_content_zh_tw"
	default:
		return "agreement_title_en_us", "agreement_content_en_us"
	}
}

func siteAgreementDefaults(locale string) (string, string) {
	switch locale {
	case "zh-CN":
		return "用户协议", "使用本服务前，请阅读并同意用户协议。继续操作即表示你确认将遵守平台规则、适用法律法规，以及支付或订阅前展示的计费条款。"
	case "zh-TW":
		return "使用者協議", "使用本服務前，請閱讀並同意使用者協議。繼續操作即表示你確認將遵守平台規則、適用法律法規，以及付款或訂閱前展示的計費條款。"
	default:
		return "User Agreement", "Please read and agree to the user agreement before using this service. By continuing, you confirm that you will comply with platform rules, applicable laws, and the billing or subscription terms shown before payment."
	}
}

func siteLegalDocumentKeys(locale string, document string) (string, string) {
	prefix := "terms"
	if document == "privacy" {
		prefix = "privacy"
	}
	switch locale {
	case "zh-CN":
		return prefix + "_title_zh_cn", prefix + "_content_zh_cn"
	case "zh-TW":
		return prefix + "_title_zh_tw", prefix + "_content_zh_tw"
	default:
		return prefix + "_title_en_us", prefix + "_content_en_us"
	}
}

func siteLegalDocumentDefaults(locale string, document string) (string, string) {
	if document == "privacy" {
		switch locale {
		case "zh-CN":
			return "隐私政策", "请阅读隐私政策，了解本服务如何为提供、维护和保障服务而处理账号信息、使用数据、计费记录和上传内容。"
		case "zh-TW":
			return "隱私政策", "請閱讀隱私政策，了解本服務如何為提供、維護和保障服務而處理帳號資訊、使用資料、計費記錄和上傳內容。"
		default:
			return "Privacy Policy", "Please read this Privacy Policy to understand how account information, usage data, billing records, and uploaded content may be processed to provide and secure this service."
		}
	}
	switch locale {
	case "zh-CN":
		return "服务条款", "使用本服务前，请阅读服务条款。创建账号、登录、订阅或付款，即表示你同意遵守平台规则、适用法律法规，以及支付前展示的计费条款。"
	case "zh-TW":
		return "服務條款", "使用本服務前，請閱讀服務條款。建立帳號、登入、訂閱或付款，即表示你同意遵守平台規則、適用法律法規，以及付款前展示的計費條款。"
	default:
		return "Terms of Service", "Please read these Terms of Service before using this service. By creating an account, signing in, subscribing, or making a payment, you agree to follow platform rules, applicable laws, and the billing terms shown before payment."
	}
}

func siteAssetObjectKey(fileName string) string {
	return path.Join(siteAssetObjectKeyPrefix, fileName)
}

func randomSiteAssetFileName(extension string) (string, error) {
	var buf [12]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	return "site-" + hex.EncodeToString(buf[:]) + extension, nil
}

func normalizeSiteAsset(fileName string, declaredContentType string, data []byte) (string, string, error) {
	extension := strings.ToLower(filepath.Ext(strings.TrimSpace(fileName)))
	if extension == ".jpeg" {
		extension = ".jpg"
	}
	declaredType, _, _ := mime.ParseMediaType(strings.TrimSpace(declaredContentType))
	declaredType = strings.ToLower(strings.TrimSpace(declaredType))
	detectedType := strings.ToLower(http.DetectContentType(data))

	if extension == ".svg" || declaredType == "image/svg+xml" {
		if !looksLikeSVG(data) {
			return "", "", fmt.Errorf("invalid svg")
		}
		return "image/svg+xml", ".svg", nil
	}
	if extension == ".ico" || declaredType == "image/x-icon" || declaredType == "image/vnd.microsoft.icon" {
		return "image/x-icon", ".ico", nil
	}

	switch detectedType {
	case "image/png":
		return "image/png", ".png", nil
	case "image/jpeg":
		return "image/jpeg", ".jpg", nil
	case "image/webp":
		return "image/webp", ".webp", nil
	default:
		return "", "", fmt.Errorf("unsupported site asset content type: %s", detectedType)
	}
}

func looksLikeSVG(data []byte) bool {
	snippet := strings.ToLower(strings.TrimSpace(string(data)))
	if strings.HasPrefix(snippet, "\ufeff") {
		snippet = strings.TrimPrefix(snippet, "\ufeff")
	}
	if strings.Contains(snippet, "<script") || strings.Contains(snippet, "javascript:") || strings.Contains(snippet, " onload=") {
		return false
	}
	return strings.HasPrefix(snippet, "<svg") || strings.Contains(snippet, "<svg")
}

func siteAssetContentTypeFromFileName(fileName string) string {
	switch strings.ToLower(filepath.Ext(fileName)) {
	case ".png":
		return "image/png"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	case ".ico":
		return "image/x-icon"
	default:
		return "application/octet-stream"
	}
}

// GetModelOptionPolicy godoc
// @Summary 查询模型 options 透传策略
// @Tags settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /settings/model-option-policy [get]
func (h *Handler) GetModelOptionPolicy(c *gin.Context) {
	items, err := h.service.RuntimeValuesByNamespace(c.Request.Context(), "chat")
	if err != nil {
		response.Error(c, http.StatusInternalServerError, "list model option policy failed")
		return
	}
	mode := strings.TrimSpace(items["model_option_policy_mode"])
	if mode == "" {
		mode = "allowlist"
	}
	allowedPathsJSON := strings.TrimSpace(items["model_option_allowed_paths"])
	if allowedPathsJSON == "" {
		allowedPathsJSON = config.DefaultModelOptionAllowedPathsJSON()
	}
	deniedPathsJSON := strings.TrimSpace(items["model_option_denied_paths"])
	if deniedPathsJSON == "" {
		deniedPathsJSON = config.DefaultModelOptionDeniedPathsJSON()
	}
	nativeTools := nativetool.Definitions()
	if h.nativeTools != nil {
		items, err := h.nativeTools.ListNativeToolDefinitions(c.Request.Context())
		if err != nil {
			response.Error(c, http.StatusInternalServerError, "list native tools failed")
			return
		}
		nativeTools = items
	}
	response.Success(c, ModelOptionPolicyResponse{
		Mode:             mode,
		AllowedPathsJSON: allowedPathsJSON,
		DeniedPathsJSON:  deniedPathsJSON,
		NativeTools:      toNativeToolDefinitionResponses(nativeTools),
	})
}

// GetMCPPolicy godoc
// @Summary 查询 MCP 工具运行策略
// @Tags settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /settings/mcp-policy [get]
func (h *Handler) GetMCPPolicy(c *gin.Context) {
	cfg := h.runtime.Snapshot()
	limit := cfg.MCPMaxSelectedToolsPerMessage
	if limit <= 0 {
		limit = config.DefaultMCPMaxSelectedToolsPerMessage
	}
	if limit > config.MaxMCPSelectedToolsPerMessage {
		limit = config.MaxMCPSelectedToolsPerMessage
	}
	response.Success(c, MCPPolicyResponse{MaxSelectedToolsPerMessage: limit})
}

// GetChatContextPolicy godoc
// @Summary 查询聊天上下文策略
// @Tags settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /settings/chat-context-policy [get]
func (h *Handler) GetChatContextPolicy(c *gin.Context) {
	cfg := h.runtime.Snapshot()
	response.Success(c, ChatContextPolicyResponse{ContextCompactEnabled: cfg.ContextCompactEnabled})
}

// Patch godoc
// @Summary 批量更新配置项
// @Description 批量更新动态配置并清除缓存，下次读取自动刷新
// @Tags admin/settings
// @Accept json
// @Produce json
// @Security BearerAuth
// @Param body body PatchSettingsRequest true "更新项"
// @Success 200 {object} response.Envelope
// @Router /admin/settings [patch]
func (h *Handler) Patch(c *gin.Context) {
	var req PatchSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.InvalidRequestBody(c, err)
		return
	}

	// 记录变更前的模型配置，用于检测模型变更
	prevCfg := h.runtime.Snapshot()
	prevSignature := appembedding.ComputeModelSignature(prevCfg.RAGModel, prevCfg.EmbeddingOutputDimensions)

	data, err := h.service.BatchUpdate(c.Request.Context(), toAppPatchItems(req.Items))
	if err != nil {
		if errors.Is(err, appsettings.ErrInvalidSetting) {
			response.ErrorFrom(c, http.StatusBadRequest, err)
			return
		}
		response.Error(c, http.StatusInternalServerError, "update settings failed")
		return
	}

	// 清除 Redis 缓存，下次读取自动从 DB 刷新
	h.runtimeSettings.InvalidateCacheMulti(c.Request.Context(), toAppPatchItems(req.Items))
	if err = h.runtimeSettings.ApplyTo(c.Request.Context(), h.runtime); err != nil {
		response.Error(c, http.StatusInternalServerError, "refresh runtime settings failed")
		return
	}

	// 检测 Embedding 模型签名：模型变更时标记旧向量为 stale；签名缺失时只补写当前签名。
	newCfg := h.runtime.Snapshot()
	newSignature := appembedding.ComputeModelSignature(newCfg.RAGModel, newCfg.EmbeddingOutputDimensions)
	signatureMissing := strings.TrimSpace(newCfg.EmbeddingModelSignature) == "" && strings.TrimSpace(newCfg.RAGModel) != ""
	if (newSignature != prevSignature || signatureMissing) && h.embeddingSvc != nil {
		go func() {
			staleCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			if newSignature != prevSignature {
				if _, staleErr := h.embeddingSvc.MarkAllFilesStale(staleCtx); staleErr != nil {
					return
				}
			}
			_, _ = h.service.BatchUpdate(staleCtx, []appsettings.PatchItem{
				{Namespace: "file", Key: "embedding_model_signature", Value: newSignature},
			})
			_ = h.runtimeSettings.ApplyTo(staleCtx, h.runtime)
		}()
	}

	h.service.RecordAudit(c.Request.Context(), appsettings.AuditInput{
		UserID:    middleware.MustUserID(c),
		RequestID: middleware.MustRequestID(c),
		Action:    "settings.update",
		ClientIP:  c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
		Detail:    sanitizePatchItemsForAudit(req.Items),
	})

	response.Success(c, toSettingResponseMap(data))
}

// GetTikaRuntime godoc
// @Summary 查询 Tika 运行状态
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/tika/runtime [get]
func (h *Handler) GetTikaRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "tika runtime service unavailable")
		return
	}
	response.Success(c, toTikaRuntimeResponse(h.runtimeSvc.GetTikaStatus(c.Request.Context())))
}

// GetDoclingRuntime godoc
// @Summary 查询 Docling 运行状态
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/docling/runtime [get]
func (h *Handler) GetDoclingRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "docling runtime service unavailable")
		return
	}
	response.Success(c, toDoclingRuntimeResponse(h.runtimeSvc.GetDoclingStatus(c.Request.Context())))
}

// GetTesseractRuntime godoc
// @Summary 查询 Tesseract OCR 运行状态
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/tesseract/runtime [get]
func (h *Handler) GetTesseractRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "tesseract runtime service unavailable")
		return
	}
	response.Success(c, toTesseractRuntimeResponse(h.runtimeSvc.GetTesseractStatus(c.Request.Context())))
}

// GetRapidOCRRuntime godoc
// @Summary 查询 RapidOCR 运行状态
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/rapidocr/runtime [get]
func (h *Handler) GetRapidOCRRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "rapidocr runtime service unavailable")
		return
	}
	response.Success(c, toRapidOCRRuntimeResponse(h.runtimeSvc.GetRapidOCRStatus(c.Request.Context())))
}

// GetMinerURuntime godoc
// @Summary 查询 MinerU 运行状态
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/mineru/runtime [get]
func (h *Handler) GetMinerURuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "mineru runtime service unavailable")
		return
	}
	response.Success(c, toMinerURuntimeResponse(h.runtimeSvc.GetMinerUStatus(c.Request.Context())))
}

// StartTikaRuntime godoc
// @Summary 启动托管 Tika
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/tika/runtime/start [post]
func (h *Handler) StartTikaRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "tika runtime service unavailable")
		return
	}
	h.handleTikaRuntimeAction(c, h.runtimeSvc.StartTika)
}

// StartRapidOCRRuntime godoc
// @Summary 启动托管 RapidOCR
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/rapidocr/runtime/start [post]
func (h *Handler) StartRapidOCRRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "rapidocr runtime service unavailable")
		return
	}
	h.handleRapidOCRRuntimeAction(c, h.runtimeSvc.StartRapidOCR)
}

// StopTikaRuntime godoc
// @Summary 停止托管 Tika
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/tika/runtime/stop [post]
func (h *Handler) StopTikaRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "tika runtime service unavailable")
		return
	}
	h.handleTikaRuntimeAction(c, h.runtimeSvc.StopTika)
}

// StopRapidOCRRuntime godoc
// @Summary 停止托管 RapidOCR
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/rapidocr/runtime/stop [post]
func (h *Handler) StopRapidOCRRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "rapidocr runtime service unavailable")
		return
	}
	h.handleRapidOCRRuntimeAction(c, h.runtimeSvc.StopRapidOCR)
}

// RestartTikaRuntime godoc
// @Summary 重启托管 Tika
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/tika/runtime/restart [post]
func (h *Handler) RestartTikaRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "tika runtime service unavailable")
		return
	}
	h.handleTikaRuntimeAction(c, h.runtimeSvc.RestartTika)
}

// RestartRapidOCRRuntime godoc
// @Summary 重启托管 RapidOCR
// @Tags admin/settings
// @Produce json
// @Security BearerAuth
// @Success 200 {object} response.Envelope
// @Router /admin/settings/rapidocr/runtime/restart [post]
func (h *Handler) RestartRapidOCRRuntime(c *gin.Context) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "rapidocr runtime service unavailable")
		return
	}
	h.handleRapidOCRRuntimeAction(c, h.runtimeSvc.RestartRapidOCR)
}

func (h *Handler) handleTikaRuntimeAction(c *gin.Context, action func(ctx context.Context) (appruntime.ServiceRuntimeView, error)) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "tika runtime service unavailable")
		return
	}
	actionCtx, cancel := context.WithTimeout(context.Background(), runtimeActionTimeout)
	defer cancel()
	view, err := action(actionCtx)
	if err != nil {
		response.ErrorFrom(c, http.StatusInternalServerError, err)
		return
	}
	response.Success(c, toTikaRuntimeResponse(view))
}

func (h *Handler) handleRapidOCRRuntimeAction(c *gin.Context, action func(ctx context.Context) (appruntime.ServiceRuntimeView, error)) {
	if h.runtimeSvc == nil {
		response.Error(c, http.StatusInternalServerError, "rapidocr runtime service unavailable")
		return
	}
	actionCtx, cancel := context.WithTimeout(context.Background(), runtimeActionTimeout)
	defer cancel()
	view, err := action(actionCtx)
	if err != nil {
		response.ErrorFrom(c, http.StatusInternalServerError, err)
		return
	}
	response.Success(c, toRapidOCRRuntimeResponse(view))
}
