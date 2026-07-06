# DEEIX Chat 定制化改造备忘

> 记录时间：2026-07-04
> 目的：方便后续继续开发、合并官方更新时不忘记已讨论过的产品判断和代码落点。

## 本轮落地状态

已经落地：

- Git remote 调整为自己的 fork + 官方 upstream。
- 新增 `site` 设置命名空间和公开站点信息接口。
- 新增后台“Site”页面，用来维护网站名称、Logo、首页文案、联系/协议链接。
- `/` 改为公开首页，不再让新用户第一次访问就直接撞到登录页。
- 登录页读取站点名称、描述和动态 Logo。
- 前台用户设置移除“关于”入口，旧 `/setting/about` 重定向到 `/setting/general`。
- 周期计费语义已调整为“订阅额度 + 按量余额”：无有效付费订阅时默认按量扣余额；有付费订阅时优先消耗套餐额度，额度用尽后继续按量扣余额。
- 新安装库不再默认创建 `free` 套餐；后台创建用户未指定套餐时不再自动挂 `free` 订阅。
- 旧库中已有的 `free` 订阅会被核心计费视为“无付费订阅”，避免继续提供默认套餐额度。
- 管理后台“模型定价独立分页”已记录为后续后台体验优化项。

尚未落地：

- 模型定价从后台计费长页面拆成独立 tab/页面。
- 邮件、TOTP issuer、PWA manifest、分享页、聊天截图等更深层品牌覆盖。

## Git 仓库策略

当前建议采用双 remote：

- `origin`：自己的 fork，`https://github.com/moyan78641/DEEIX-Chat.git`
- `upstream`：官方仓库，`https://github.com/DEEIX-AI/DEEIX-Chat.git`

本地已经做过的设置：

```powershell
git remote rename origin upstream
git remote add origin https://github.com/moyan78641/DEEIX-Chat.git
git remote set-url --push upstream DISABLED
git config branch.dev.remote origin
git config branch.dev.merge refs/heads/dev
```

说明：

- `upstream` 的 push 地址被设为 `DISABLED`，避免误推官方仓库。
- `dev` 分支建议跟踪自己的 fork：`origin/dev`。
- 如果网络正常后首次推送失败，通常是 GitHub 登录/凭据问题，不是仓库配置问题。

推荐后续分支方式：

```powershell
git checkout dev
git pull origin dev
git checkout -b custom/brand-billing-home
git push -u origin custom/brand-billing-home
```

官方更新合并流程建议：

```powershell
git fetch upstream
git checkout dev
git merge upstream/dev
git push origin dev

git checkout custom/brand-billing-home
git merge dev
git push origin custom/brand-billing-home
```

## 当前产品问题

### 1. 访问网站直接进入登录页

现状：

- `frontend/app/page.tsx` 会把 `/` 直接重定向到 `/chat`。
- `/chat` 不是公开路径，未登录会被 `AuthGuard` 重定向到 `/login?next=...`。
- 用户第一次访问时看不到产品说明，只看到登录表单。

关键文件：

- `frontend/app/page.tsx`
- `frontend/features/layouts/components/sections/workspace-shell.tsx`
- `frontend/shared/auth/auth-guard.tsx`

建议：

- 将 `/` 改成公开首页。
- 在 `workspace-shell.tsx` 中把 `/` 纳入公开路径。
- 首页承担产品说明、登录/注册入口和基础品牌展示。

### 2. 前台 `/setting/about` 专业性不足

现状：

- 用户设置侧边栏包含“关于”。
- 前台 about 页面展示官方 DEEIX/仓库/社媒/博客/License 等信息。
- 后台 `/admin/about` 也复用了同一个 about 组件。

关键文件：

- `frontend/features/settings/components/settings-sidebar.tsx`
- `frontend/app/(project)/setting/about/page.tsx`
- `frontend/features/settings/components/sections/about/settings-about.tsx`
- `frontend/features/admin/components/sections/about/admin-about.tsx`
- `frontend/shared/components/about-settings-content.tsx`

建议：

- 前台设置里移除 about 入口。
- `/setting/about` 可重定向到 `/setting/general`，避免旧链接 404。
- 后台 `/admin/about` 保留官方项目/版本/更新检查信息。
- 不要直接大改共享的 `AboutSettingsContent`，否则后台 about 也会被影响。

### 3. 网站品牌信息硬编码分散

现状：

前端硬编码点包括：

- `frontend/app/layout.tsx`：metadata 中的 `DEEIX Chat`
- `frontend/app/manifest.ts`：PWA name/short_name/description
- `frontend/shared/components/app-logo.tsx`：logo 路径和 alt
- `frontend/features/auth/model/login-page.ts`：登录标题默认值
- `frontend/features/auth/components/login-page.tsx`：登录页仅有表单，缺少站点上下文
- `frontend/features/share/components/public-share-page.tsx`：分享页品牌标识
- `frontend/features/chat/components/sections/chat-area.tsx`：截图/聊天区域 logo
- `frontend/features/chat/components/message/message-bot.tsx`：图片占位水印 `DEEIX`
- `frontend/features/chat/model/chat-artifacts.ts`：`DEEIX Artifact`
- `frontend/i18n/messages/*`：多语言文案里大量品牌名

后端硬编码点包括：

- `backend/internal/application/settings/seed.go`：默认登录页标题
- `backend/internal/transport/http/settings/handler.go`：公开登录配置 fallback
- `backend/internal/application/auth/registration.go`：验证码邮件主题、正文、logo alt
- `backend/internal/application/auth/two_factor.go`：TOTP issuer
- `backend/internal/infra/llm/openai.go`：OpenRouter 默认归因标题和地址

建议架构：

- 新增 `site` 动态配置命名空间。
- 新增公开接口，例如 `GET /api/v1/site-profile`。
- 前端通过统一 hook/API 读取站点信息。
- 初期图片配置用 URL 字段，降低存储和上传复杂度。
- 后续如有需要，再增加后台上传图片能力。

建议配置项：

```text
site.name
site.short_name
site.description
site.logo_url
site.logo_dark_url
site.favicon_url
site.pwa_icon_url
site.home_title
site.home_subtitle
site.footer_text
site.icp_text
site.contact_email
site.terms_url
site.privacy_url
```

注意：

- 不建议全局搜索替换 `DEEIX`。
- Go module path、package name、localStorage key、缓存 key、官方更新检查等内部标识可以先保留。
- 用户可见品牌和外发邮件优先改。

### 4. 计费模式希望改成“按量基础 + 订阅额度”

目标逻辑：

- 不再有默认免费套餐。
- 默认按量计费，用户账户余额足够就能使用。
- 用户订阅付费套餐后，优先消耗套餐周期额度。
- 套餐额度用尽后，继续按量扣余额。

现状：

- 当前 `billing.mode` 是三选一：`self` / `period` / `usage`。
- 后端已经有周期套餐超额后扣余额的能力。
- 关键阻碍是无订阅时会自动 fallback 到 `free` 套餐。

关键文件：

- `backend/internal/application/billing/service.go`
- `backend/internal/infra/persistence/postgres/billing/repository.go`
- `backend/internal/infra/persistence/schema/schema.go`
- `frontend/shared/api/billing.types.ts`
- `frontend/features/settings/model/subscription-format.ts`
- `frontend/features/settings/components/sections/subscription/settings-subscription.tsx`
- `frontend/features/settings/components/sections/subscription/subscription-summary.tsx`
- `frontend/features/admin/components/sections/billing/admin-billing.tsx`

后端关键点：

- `currentPeriodPlan()` 当前无订阅时会查 `free` plan。
- `EnsureModelUsable()` 周期模式依赖 `currentPeriodPlan()`。
- `ReserveUsageBalance()` 周期模式只预扣可能超额部分。
- `RecordUsageWithReservation()` 周期模式调用 `AddPeriodUsageAndSettleOverage()`。

建议改法：

- 尽量不新增数据库表结构。
- 保留 `period` 这个模式名，降低和官方代码的冲突面，但在产品文案上解释为“订阅额度 + 按量余额”。
- 无订阅时不要 fallback 到 `free` plan，而是按 usage balance 逻辑走。
- 已订阅时继续使用 `AddPeriodUsageAndSettleOverage()`。
- `free` plan 可隐藏或废弃，不作为默认权限来源。

建议补测试：

- 无订阅且余额充足：允许调用并扣余额。
- 无订阅且余额不足：拒绝调用。
- 有订阅且周期额度未用完：不扣余额。
- 有订阅且周期额度用完：扣余额。
- 数据库不存在 `free` plan：服务仍能正常运行。

### 5. 管理后台模型定价需要独立分页

现状：

- 后台计费页面同时承载计费模式、套餐、支付配置、模型定价、兑换码、工具定价等内容。
- 模型数量增多后，模型定价表会成为最高频、最重的操作区。

建议：

- 将“模型定价”从计费设置长页面中拆成独立 tab。
- 保留虚拟滚动、筛选、导入导出、批量操作能力。
- 后续模型很多时，可进一步做服务端分页/搜索。
- 这项属于后台体验优化，不影响计费核心语义，可以放在计费语义调整前后单独做。

## 实施优先级

### 第一阶段：低风险产品外壳

- 新增 `site` 设置和公开 `site-profile`。
- 首页从 `/` 提供公开访问。
- 登录页读取站点名/logo。
- AppLogo 支持动态 logo URL。
- 前台移除 `/setting/about` 入口。

### 第二阶段：品牌覆盖补齐

- 邮件验证码主题/正文/Logo 使用站点配置。
- TOTP issuer 使用站点名。
- OpenRouter attribution 使用站点配置。
- PWA manifest、metadata、分享页、聊天截图 logo 逐步接入。
- i18n 中用户可见的 `DEEIX Chat` 文案改为变量或站点配置。

### 第三阶段：计费语义调整

- 已将 period 模式解释为“订阅额度 + 按量余额”。
- 已移除无订阅 fallback free 的核心逻辑。
- 已调整用户订阅页和后台计费文案。
- 已增加计费单元测试。

### 第四阶段：后台运营体验优化

- 将模型定价拆成独立 tab。
- 如果模型规模继续变大，再考虑模型定价接口服务端分页和搜索。

## 合并官方更新时的原则

- 把定制改动集中在少量新增文件和小入口适配里。
- 不做大规模格式化和无关重构。
- 不全局替换项目名。
- 大功能拆成独立提交：品牌/首页/about 一个提交，计费一个提交。
- 每次合并 upstream 前先确保本地定制分支干净。

## 当前额外注意事项

当前工作区在开始定制前已有未提交改动：

- `backend/go.mod`
- `config.example.yaml` 被删除
- `frontend/package.json`
- `frontend/public/sw.js`
- `frontend/shared/generated/lobehub-icon-manifest.ts`
- `frontend/shared/generated/pwa-assets.ts`

这些不是本备忘产生的改动，后续处理时不要误删或回滚。
