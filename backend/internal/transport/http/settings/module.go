package settings

import "context"

// Module 聚合 settings HTTP 处理器。
type Module struct {
	Handler *Handler
}

// NewModule 创建 settings HTTP 模块。
func NewModule(handler *Handler) *Module {
	return &Module{Handler: handler}
}

// SiteProfile 返回公开站点信息，供 HTTP 静态页注入等内部场景复用。
func (m *Module) SiteProfile(ctx context.Context) (SiteProfileResponse, error) {
	if m == nil || m.Handler == nil {
		return SiteProfileResponse{}, nil
	}
	return m.Handler.siteProfile(ctx)
}
