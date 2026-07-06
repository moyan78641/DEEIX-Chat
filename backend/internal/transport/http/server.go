package httpx

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"runtime/debug"
	"strings"
	"time"

	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/infra/config"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/shared/buildinfo"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/shared/response"
	adminhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/admin"
	announcementhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/announcement"
	authhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/auth"
	billinghttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/billing"
	channelhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/channel"
	conversationhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/conversation"
	mcphttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/mcp"
	memoryhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/memory"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/middleware"
	promptpresethttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/promptpreset"
	settingshttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/settings"
	skillhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/skill"
	userhttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/user"
	usersettingshttp "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/transport/http/usersettings"
	"github.com/gin-gonic/gin"
	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
	"go.uber.org/zap"
)

// HealthCheck 表示单个健康检查项的结果。
type HealthCheck struct {
	Name   string
	Status string
}

// HealthChecker 封装服务健康检查能力。
type HealthChecker interface {
	// CheckHealth 执行所有健康检查，返回检查结果列表。
	// 当所有检查均通过时 healthy 为 true。
	CheckHealth(ctx context.Context) (checks []HealthCheck, healthy bool)
}

// Modules 聚合可注册的业务模块。
type Modules struct {
	Auth         *authhttp.Module
	AuthService  middleware.SessionValidator
	Channel      *channelhttp.Module
	Conversation *conversationhttp.Module
	MCP          *mcphttp.Module
	Memory       *memoryhttp.Module
	Billing      *billinghttp.Module
	Admin        *adminhttp.Module
	Announcement *announcementhttp.Module
	PromptPreset *promptpresethttp.Module
	Skill        *skillhttp.Module
	Settings     *settingshttp.Module
	User         *userhttp.Module
	UserSettings *usersettingshttp.Module
	StartupLog   func(*zap.Logger)
}

type frontendSiteProfileProvider interface {
	SiteProfile(ctx context.Context) (settingshttp.SiteProfileResponse, error)
}

// NewEngine 创建并注册 API 路由。
func NewEngine(cfg *config.Runtime, log *zap.Logger, modules Modules, hc HealthChecker, limiter middleware.RateLimiter) (*gin.Engine, error) {
	snapshot := cfg.Snapshot()
	if snapshot.Env == "prod" {
		gin.SetMode(gin.ReleaseMode)
	}

	engine := gin.New()
	engine.MaxMultipartMemory = 8 << 20
	if err := engine.SetTrustedProxies(snapshot.TrustedProxyList()); err != nil {
		return nil, fmt.Errorf("set trusted proxies: %w", err)
	}
	if err := middleware.ConfigureTrustedProxyHeaders(snapshot.TrustedProxyList()); err != nil {
		return nil, fmt.Errorf("configure trusted proxy headers: %w", err)
	}
	engine.Use(gin.CustomRecovery(func(c *gin.Context, recovered interface{}) {
		if log != nil {
			log.Error("http_panic_recovered", zap.Any("error", recovered), zap.ByteString("stack", debug.Stack()))
		}
		response.ErrorWithCode(c, http.StatusInternalServerError, response.CodeInternal, "internal server error")
		c.Abort()
	}))
	engine.Use(otelgin.Middleware(snapshot.AppName, otelgin.WithFilter(func(req *http.Request) bool {
		return req.URL.Path != "/healthz"
	})))
	engine.Use(middleware.RequestID())
	engine.Use(middleware.AccessLog(log))
	engine.Use(middleware.SecurityHeaders(snapshot.Env))
	engine.Use(middleware.CORS(snapshot.CORSAllowOrigin))

	engine.GET("/healthz", func(c *gin.Context) {
		info := buildinfo.Snapshot()
		c.JSON(http.StatusOK, gin.H{"status": "ok", "version": info.Version})
	})
	engine.GET("/readyz", readyzHandler(hc))
	if swaggerEnabled(snapshot.Env) {
		engine.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	}

	api := engine.Group("/api/v1")
	api.GET("/version", func(c *gin.Context) {
		c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
		c.Header("Pragma", "no-cache")
		c.JSON(http.StatusOK, buildinfo.Snapshot())
	})
	if modules.Auth != nil || modules.Settings != nil || modules.Billing != nil || modules.Conversation != nil || modules.User != nil {
		publicAuth := api.Group("")
		publicAuth.Use(middleware.PublicAuthRateLimit(limiter, cfg))
		if modules.Auth != nil {
			modules.Auth.RegisterPublicRoutes(publicAuth)
		}
		if modules.User != nil {
			modules.User.RegisterPublicRoutes(publicAuth)
		}
		if modules.Conversation != nil {
			modules.Conversation.RegisterPublicRoutes(publicAuth)
		}
		if modules.Settings != nil {
			modules.Settings.RegisterPublicRoutes(publicAuth)
		}
		if modules.Billing != nil {
			modules.Billing.RegisterPublicRoutes(publicAuth)
		}
	}

	authRequired := api.Group("")
	authRequired.Use(middleware.AuthMiddleware(snapshot.JWTSecret, modules.AuthService))
	authRequired.Use(middleware.RateLimit(limiter, cfg))

	if modules.Auth != nil {
		modules.Auth.RegisterProtectedRoutes(authRequired)
	}
	if modules.Conversation != nil {
		modules.Conversation.RegisterRoutes(authRequired)
	}
	if modules.Channel != nil {
		modules.Channel.RegisterRoutes(authRequired)
	}
	if modules.Memory != nil {
		modules.Memory.RegisterRoutes(authRequired)
	}
	if modules.MCP != nil {
		modules.MCP.RegisterRoutes(authRequired)
	}
	if modules.Billing != nil {
		modules.Billing.RegisterRoutes(authRequired)
	}
	if modules.Announcement != nil {
		modules.Announcement.RegisterRoutes(authRequired)
	}
	if modules.PromptPreset != nil {
		modules.PromptPreset.RegisterRoutes(authRequired)
	}
	if modules.Skill != nil {
		modules.Skill.RegisterRoutes(authRequired)
	}
	if modules.UserSettings != nil {
		modules.UserSettings.RegisterRoutes(authRequired)
	}
	if modules.Settings != nil {
		modules.Settings.RegisterRoutes(authRequired)
	}
	if modules.User != nil {
		modules.User.RegisterRoutes(authRequired)
	}
	if modules.Admin != nil || modules.Auth != nil || modules.Billing != nil || modules.Channel != nil || modules.MCP != nil || modules.Settings != nil || modules.Announcement != nil || modules.PromptPreset != nil || modules.Skill != nil {
		adminGroup := authRequired.Group("/admin")
		adminGroup.Use(middleware.AdminOnly())
		if modules.Auth != nil {
			modules.Auth.RegisterAdminRoutes(adminGroup)
		}
		if modules.Admin != nil {
			modules.Admin.RegisterRoutes(adminGroup)
		}
		if modules.Billing != nil {
			modules.Billing.RegisterAdminRoutes(adminGroup)
		}
		if modules.Channel != nil {
			modules.Channel.RegisterAdminRoutes(adminGroup)
		}
		if modules.MCP != nil {
			modules.MCP.RegisterAdminRoutes(adminGroup)
		}
		if modules.Settings != nil {
			modules.Settings.RegisterAdminRoutes(adminGroup)
		}
		if modules.Announcement != nil {
			modules.Announcement.RegisterAdminRoutes(adminGroup)
		}
		if modules.PromptPreset != nil {
			modules.PromptPreset.RegisterAdminRoutes(adminGroup)
		}
		if modules.Skill != nil {
			modules.Skill.RegisterAdminRoutes(adminGroup)
		}
	}

	if modules.StartupLog != nil {
		modules.StartupLog(log)
	}
	registerFrontendStatic(engine, snapshot.FrontendDistDir, log, modules.Settings)

	return engine, nil
}

func registerFrontendStatic(engine *gin.Engine, distDir string, log *zap.Logger, providers ...frontendSiteProfileProvider) {
	root := strings.TrimSpace(distDir)
	if root == "" {
		return
	}
	var siteProfileProvider frontendSiteProfileProvider
	if len(providers) > 0 {
		siteProfileProvider = providers[0]
	}

	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		if log != nil {
			log.Warn("frontend_static_path_invalid", zap.String("path", root), zap.Error(err))
		}
		return
	}

	info, err := os.Stat(absoluteRoot)
	if err != nil || !info.IsDir() {
		if log != nil {
			log.Warn("frontend_static_disabled", zap.String("path", absoluteRoot), zap.Error(err))
		}
		return
	}

	if log != nil {
		log.Info("frontend_static_enabled", zap.String("path", absoluteRoot))
	}

	engine.NoRoute(func(c *gin.Context) {
		requestPath := cleanFrontendPath(c.Request.URL.Path)
		if isBackendOnlyPath(requestPath) {
			response.ErrorWithCode(c, http.StatusNotFound, response.CodeResourceNotFound, "not found")
			return
		}

		if filePath, ok := resolveFrontendStaticFile(absoluteRoot, requestPath); ok {
			applyFrontendCacheHeaders(c, requestPath)
			c.File(filePath)
			return
		}

		if filePath, ok := resolveFrontendPageFile(absoluteRoot, requestPath); ok {
			c.Header("Cache-Control", "no-cache")
			serveFrontendHTML(c, filePath, siteProfileProvider, http.StatusOK)
			return
		}

		notFoundPath := filepath.Join(absoluteRoot, "404.html")
		if isRegularFile(notFoundPath) {
			serveFrontendHTML(c, notFoundPath, siteProfileProvider, http.StatusNotFound)
			return
		}

		response.ErrorWithCode(c, http.StatusNotFound, response.CodeResourceNotFound, "not found")
	})
}

func serveFrontendHTML(c *gin.Context, filePath string, provider frontendSiteProfileProvider, status int) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		c.Status(status)
		c.File(filePath)
		return
	}
	if provider == nil {
		c.Data(status, "text/html; charset=utf-8", content)
		return
	}
	ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second)
	defer cancel()
	profile, err := provider.SiteProfile(ctx)
	if err != nil {
		c.Data(status, "text/html; charset=utf-8", content)
		return
	}
	injected := injectSiteProfileIntoHTML(content, profile)
	c.Data(status, "text/html; charset=utf-8", injected)
}

var (
	htmlTitlePattern           = regexp.MustCompile(`(?is)<title>.*?</title>`)
	htmlDescriptionMetaPattern = regexp.MustCompile(`(?is)<meta\s+name=["']description["']\s+content=["'][^"']*["']\s*/?>`)
	htmlApplicationMetaPattern = regexp.MustCompile(`(?is)<meta\s+name=["']application-name["']\s+content=["'][^"']*["']\s*/?>`)
	htmlAppleTitleMetaPattern  = regexp.MustCompile(`(?is)<meta\s+name=["']apple-mobile-web-app-title["']\s+content=["'][^"']*["']\s*/?>`)
)

func injectSiteProfileIntoHTML(content []byte, profile settingshttp.SiteProfileResponse) []byte {
	htmlText := string(content)
	title := firstHTMLNonEmpty(profile.Name, "DEEIX Chat")
	description := firstHTMLNonEmpty(profile.Description, "DEEIX Chat is a multi-model AI conversation system.")
	faviconURL := firstHTMLNonEmpty(profile.FaviconURL, "/favicon.ico")

	htmlText = htmlTitlePattern.ReplaceAllString(htmlText, "<title>"+html.EscapeString(title)+"</title>")
	htmlText = htmlDescriptionMetaPattern.ReplaceAllString(htmlText, `<meta name="description" content="`+html.EscapeString(description)+`"/>`)
	htmlText = htmlApplicationMetaPattern.ReplaceAllString(htmlText, `<meta name="application-name" content="`+html.EscapeString(title)+`"/>`)
	htmlText = htmlAppleTitleMetaPattern.ReplaceAllString(htmlText, `<meta name="apple-mobile-web-app-title" content="`+html.EscapeString(title)+`"/>`)
	htmlText = injectSiteProfileIconLink(htmlText, faviconURL)

	profileJSON, err := json.Marshal(profile)
	if err != nil {
		return []byte(htmlText)
	}
	injection := `<script id="deeix-site-profile" type="application/json">` + string(profileJSON) + `</script>` +
		`<script>window.__DEEIX_SITE_PROFILE__=JSON.parse(document.getElementById("deeix-site-profile").textContent)</script>`
	if strings.Contains(htmlText, "</head>") {
		htmlText = strings.Replace(htmlText, "</head>", injection+"</head>", 1)
		return []byte(htmlText)
	}
	return append(bytes.TrimRight([]byte(htmlText), "\n\r\t "), []byte(injection)...)
}

func injectSiteProfileIconLink(htmlText string, faviconURL string) string {
	iconType := inferSiteProfileIconType(faviconURL)
	typeAttr := ""
	if iconType != "" {
		typeAttr = ` type="` + html.EscapeString(iconType) + `"`
	}
	iconLink := `<link id="deeix-site-favicon" rel="icon" href="` + html.EscapeString(faviconURL) + `"` + typeAttr + `/>`
	if strings.Contains(htmlText, "</head>") {
		return strings.Replace(htmlText, "</head>", iconLink+"</head>", 1)
	}
	return iconLink + htmlText
}

func inferSiteProfileIconType(iconURL string) string {
	cleanURL := strings.ToLower(strings.TrimSpace(iconURL))
	if index := strings.IndexAny(cleanURL, "?#"); index >= 0 {
		cleanURL = cleanURL[:index]
	}
	switch {
	case strings.HasSuffix(cleanURL, ".svg"):
		return "image/svg+xml"
	case strings.HasSuffix(cleanURL, ".png"):
		return "image/png"
	case strings.HasSuffix(cleanURL, ".jpg"), strings.HasSuffix(cleanURL, ".jpeg"):
		return "image/jpeg"
	case strings.HasSuffix(cleanURL, ".webp"):
		return "image/webp"
	case strings.HasSuffix(cleanURL, ".ico"):
		return "image/x-icon"
	default:
		return ""
	}
}

func firstHTMLNonEmpty(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func swaggerEnabled(env string) bool {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "dev", "development":
		return true
	default:
		return false
	}
}

func cleanFrontendPath(rawPath string) string {
	if rawPath == "" || rawPath == "/" {
		return "/"
	}
	return path.Clean("/" + strings.TrimPrefix(rawPath, "/"))
}

func isBackendOnlyPath(requestPath string) bool {
	return requestPath == "/api" ||
		strings.HasPrefix(requestPath, "/api/") ||
		requestPath == "/swagger" ||
		strings.HasPrefix(requestPath, "/swagger/") ||
		requestPath == "/healthz" ||
		requestPath == "/readyz"
}

func resolveFrontendStaticFile(root string, requestPath string) (string, bool) {
	if requestPath == "/" {
		return "", false
	}
	candidate := filepath.Join(root, filepath.FromSlash(strings.TrimPrefix(requestPath, "/")))
	if !strings.HasPrefix(candidate, root) {
		return "", false
	}
	if isRegularFile(candidate) {
		return candidate, true
	}
	return "", false
}

func resolveFrontendPageFile(root string, requestPath string) (string, bool) {
	candidates := []string{filepath.Join(root, "index.html")}
	if requestPath != "/" {
		cleanPath := filepath.FromSlash(strings.TrimPrefix(requestPath, "/"))
		candidates = []string{
			filepath.Join(root, cleanPath+".html"),
			filepath.Join(root, cleanPath, "index.html"),
			filepath.Join(root, "index.html"),
		}
	}

	for _, candidate := range candidates {
		if strings.HasPrefix(candidate, root) && isRegularFile(candidate) {
			return candidate, true
		}
	}
	return "", false
}

func isRegularFile(filePath string) bool {
	info, err := os.Stat(filePath)
	return err == nil && !info.IsDir()
}

func applyFrontendCacheHeaders(c *gin.Context, requestPath string) {
	if isImmutableFrontendAsset(requestPath) {
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		return
	}
	if isVendorIconAsset(requestPath) {
		c.Header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
		return
	}
	if isNextExportDataAsset(requestPath) {
		c.Header("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800")
		return
	}
	c.Header("Cache-Control", "public, max-age=3600")
}

func isImmutableFrontendAsset(requestPath string) bool {
	return strings.HasPrefix(requestPath, "/_next/static/") ||
		strings.HasPrefix(requestPath, "/fonts/")
}

func isVendorIconAsset(requestPath string) bool {
	return strings.HasPrefix(requestPath, "/vendor/lobehub-icons/")
}

func isNextExportDataAsset(requestPath string) bool {
	fileName := path.Base(requestPath)
	return strings.HasPrefix(fileName, "__next.") && strings.EqualFold(path.Ext(fileName), ".txt")
}

func readyzHandler(hc HealthChecker) gin.HandlerFunc {
	return func(c *gin.Context) {
		ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
		defer cancel()

		var healthy bool
		checksMap := gin.H{}

		if hc != nil {
			results, ok := hc.CheckHealth(ctx)
			healthy = ok
			for _, r := range results {
				checksMap[r.Name] = r.Status
			}
		} else {
			healthy = true
		}

		status := http.StatusOK
		if !healthy {
			status = http.StatusServiceUnavailable
		}
		c.JSON(status, gin.H{
			"status": map[bool]string{true: "ok", false: "degraded"}[healthy],
			"checks": checksMap,
		})
	}
}
