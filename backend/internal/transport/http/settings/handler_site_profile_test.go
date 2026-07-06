package settings

import (
	"context"
	"testing"

	appsettings "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/application/settings"
	domainsettings "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/settings"
)

type siteProfileSettingsRepo struct {
	items []domainsettings.SystemSetting
}

func (r siteProfileSettingsRepo) ListAll(context.Context) ([]domainsettings.SystemSetting, error) {
	return r.items, nil
}

func (r siteProfileSettingsRepo) ListByNamespace(_ context.Context, namespace string) ([]domainsettings.SystemSetting, error) {
	results := make([]domainsettings.SystemSetting, 0, len(r.items))
	for _, item := range r.items {
		if item.Namespace == namespace {
			results = append(results, item)
		}
	}
	return results, nil
}

func (r siteProfileSettingsRepo) Upsert(context.Context, []domainsettings.SystemSetting) error {
	return nil
}

func (r siteProfileSettingsRepo) UpsertWithDescription(context.Context, []domainsettings.SystemSetting) error {
	return nil
}

func (r siteProfileSettingsRepo) Delete(context.Context, string, string) error {
	return nil
}

func TestSiteProfileResolvesLocalizedLegalDocuments(t *testing.T) {
	service := appsettings.NewService(siteProfileSettingsRepo{items: []domainsettings.SystemSetting{
		{Namespace: "site", Key: "name", Value: "Acme AI"},
		{Namespace: "site", Key: "terms_title_en_us", Value: "Terms"},
		{Namespace: "site", Key: "terms_content_en_us", Value: "English terms"},
		{Namespace: "site", Key: "privacy_title_en_us", Value: "Privacy"},
		{Namespace: "site", Key: "privacy_content_en_us", Value: "English privacy"},
		{Namespace: "site", Key: "terms_title_zh_cn", Value: "服务条款"},
		{Namespace: "site", Key: "terms_content_zh_cn", Value: "简体条款"},
		{Namespace: "site", Key: "privacy_title_zh_cn", Value: "隐私政策"},
		{Namespace: "site", Key: "privacy_content_zh_cn", Value: "简体隐私"},
		{Namespace: "site", Key: "terms_title_zh_tw", Value: "服務條款"},
		{Namespace: "site", Key: "terms_content_zh_tw", Value: "繁體條款"},
		{Namespace: "site", Key: "privacy_title_zh_tw", Value: "隱私政策"},
		{Namespace: "site", Key: "privacy_content_zh_tw", Value: "繁體隱私"},
	}}, "test-data-encryption-key")
	handler := NewHandler(service, nil, nil, nil)

	profile, err := handler.siteProfile(context.Background(), "zh-HK,zh;q=0.9,en;q=0.8")
	if err != nil {
		t.Fatalf("siteProfile failed: %v", err)
	}

	if profile.Terms.Title != "服務條款" {
		t.Fatalf("expected zh-TW terms title, got %q", profile.Terms.Title)
	}
	if profile.Terms.Content != "繁體條款" {
		t.Fatalf("expected zh-TW terms content, got %q", profile.Terms.Content)
	}
	if profile.Privacy.Title != "隱私政策" {
		t.Fatalf("expected zh-TW privacy title, got %q", profile.Privacy.Title)
	}
	if profile.Privacy.Content != "繁體隱私" {
		t.Fatalf("expected zh-TW privacy content, got %q", profile.Privacy.Content)
	}
}

func TestSiteProfileFallsBackFromLegacyAgreementToTerms(t *testing.T) {
	service := appsettings.NewService(siteProfileSettingsRepo{items: []domainsettings.SystemSetting{
		{Namespace: "site", Key: "agreement_title_zh_cn", Value: "旧协议"},
		{Namespace: "site", Key: "agreement_content_zh_cn", Value: "旧正文"},
	}}, "test-data-encryption-key")
	handler := NewHandler(service, nil, nil, nil)

	profile, err := handler.siteProfile(context.Background(), "zh-CN")
	if err != nil {
		t.Fatalf("siteProfile failed: %v", err)
	}

	if profile.Terms.Title != "旧协议" {
		t.Fatalf("expected legacy agreement title fallback, got %q", profile.Terms.Title)
	}
	if profile.Terms.Content != "旧正文" {
		t.Fatalf("expected legacy agreement content fallback, got %q", profile.Terms.Content)
	}
}
