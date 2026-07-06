package repository

import (
	"context"
	"time"

	domainbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/billing"
)

// BillingRepository 定义计费流程依赖的持久化能力。
type BillingRepository interface {
	ListActivePlans(ctx context.Context) ([]domainbilling.Plan, error)
	ListActivePricesByPlanIDs(ctx context.Context, planIDs []uint) ([]domainbilling.Price, error)
	GetPriceByID(ctx context.Context, priceID uint) (*domainbilling.Price, error)
	GetPlanByID(ctx context.Context, planID uint) (*domainbilling.Plan, error)
	ListPlansByIDs(ctx context.Context, planIDs []uint) ([]domainbilling.Plan, error)
	GetActivePlanByCode(ctx context.Context, code string) (*domainbilling.Plan, error)
	CreatePlanWithDefaultPrice(ctx context.Context, plan *domainbilling.Plan, price *domainbilling.Price) error
	UpdatePlanWithDefaultPrice(ctx context.Context, plan *domainbilling.Plan, price *domainbilling.Price) error
	ReorderPlans(ctx context.Context, orderedPlanIDs []uint) error
	ListCurrentSubscriptionsByUserIDs(ctx context.Context, userIDs []uint, now time.Time) ([]domainbilling.Subscription, error)
	ListSubscriptionEntitlementsByUserIDs(ctx context.Context, userIDs []uint, now time.Time) ([]domainbilling.Subscription, error)
	ReplaceSubscription(ctx context.Context, item *domainbilling.Subscription) error
	CreatePaymentOrder(ctx context.Context, item *domainbilling.PaymentOrder, coupon *CouponOrderApplyInput) (*domainbilling.PaymentOrder, error)
	CreateBalanceSubscriptionOrder(ctx context.Context, item *domainbilling.PaymentOrder, subscription *domainbilling.Subscription, debitNanousd int64, coupon *CouponOrderApplyInput) (*domainbilling.PaymentOrder, *domainbilling.BillingAccount, *domainbilling.Subscription, error)
	UpdatePaymentOrderCheckout(ctx context.Context, orderNo string, externalCheckoutID string, checkoutURL string) error
	GetPaymentOrderByOrderNo(ctx context.Context, orderNo string) (*domainbilling.PaymentOrder, error)
	MarkPaymentOrderPaidAndGrantSubscription(ctx context.Context, orderNo string, externalPaymentID string, paidAt time.Time, subscription *domainbilling.Subscription) (*domainbilling.PaymentOrder, bool, error)
	AddUsage(ctx context.Context, usage *domainbilling.UsageLedger) error
	AddUsageAndDebitBalance(ctx context.Context, usage *domainbilling.UsageLedger) error
	AddUsageAndSettleBalance(ctx context.Context, usage *domainbilling.UsageLedger, reservation *domainbilling.UsageBalanceReservation) error
	AddPeriodUsageAndSettleOverage(ctx context.Context, usage *domainbilling.UsageLedger, periodStart time.Time, periodEnd time.Time, periodCreditNanousd int64, reservation *domainbilling.UsageBalanceReservation) error
	ReserveUsageBalance(ctx context.Context, userID uint, amountNanousd int64, refNo string) (*domainbilling.UsageBalanceReservation, error)
	ReleaseUsageBalanceReservation(ctx context.Context, userID uint, refNo string, description string) error
	GetOrCreateBillingAccount(ctx context.Context, userID uint) (*domainbilling.BillingAccount, error)
	ListBillingAccountsByUserIDs(ctx context.Context, userIDs []uint) ([]domainbilling.BillingAccount, error)
	SetBillingAccountBalance(ctx context.Context, userID uint, balanceNanousd int64, refNo string, description string) (*domainbilling.BillingAccount, error)
	MarkPaymentOrderPaidAndCreditBalance(ctx context.Context, orderNo string, externalPaymentID string, paidAt time.Time) (*domainbilling.PaymentOrder, bool, error)
	ListCouponCodes(ctx context.Context, filter CouponCodeListFilter, offset int, limit int) ([]domainbilling.CouponCode, int64, error)
	GetCouponCodeByID(ctx context.Context, id uint) (*domainbilling.CouponCode, error)
	GetCouponCodeByHash(ctx context.Context, codeHash string) (*domainbilling.CouponCode, error)
	CountCouponRedemptionsByUser(ctx context.Context, couponID uint, userID uint) (int64, error)
	CreateCouponCode(ctx context.Context, item *domainbilling.CouponCode) (*domainbilling.CouponCode, error)
	PatchCouponCode(ctx context.Context, id uint, patch CouponCodePatch) (*domainbilling.CouponCode, error)
	DeleteCouponCode(ctx context.Context, id uint) error
	ListRedemptionCodes(ctx context.Context, filter RedemptionCodeListFilter, offset int, limit int) ([]domainbilling.RedemptionCode, int64, error)
	GetRedemptionCodeByID(ctx context.Context, id uint) (*domainbilling.RedemptionCode, error)
	CreateRedemptionCode(ctx context.Context, item *domainbilling.RedemptionCode) (*domainbilling.RedemptionCode, error)
	PatchRedemptionCode(ctx context.Context, id uint, patch RedemptionCodePatch) (*domainbilling.RedemptionCode, error)
	DeleteRedemptionCode(ctx context.Context, id uint) error
	RedeemCode(ctx context.Context, input RedemptionApplyInput) (*RedemptionApplyResult, error)
	GetBillingMode(ctx context.Context) (string, error)
	GetBillingPrepaidAmountNanousd(ctx context.Context) (int64, error)
	GetNativeToolBillingEnabled(ctx context.Context) (bool, error)
	GetNativeToolPricingJSON(ctx context.Context) (string, error)
	GetModelPricing(ctx context.Context, platformModelName string) (*domainbilling.ModelPricing, error)
	ListModelPricing(ctx context.Context, query string, offset int, limit int) ([]domainbilling.ModelPricing, int64, error)
	UpsertModelPricing(ctx context.Context, item *domainbilling.ModelPricing) (*domainbilling.ModelPricing, error)
	GetOrCreateAffiliateProfile(ctx context.Context, userID uint) (*domainbilling.AffiliateProfile, error)
	GetAffiliateProfileByInviteCode(ctx context.Context, inviteCode string) (*domainbilling.AffiliateProfile, error)
	CreateAffiliateReferral(ctx context.Context, item *domainbilling.AffiliateReferral) (*domainbilling.AffiliateReferral, error)
	GetAffiliateReferralByInvitee(ctx context.Context, inviteeUserID uint) (*domainbilling.AffiliateReferral, error)
	CountAffiliateReferrals(ctx context.Context, inviterUserID uint) (int64, error)
	SumAffiliateCommissions(ctx context.Context, inviterUserID uint) (availableNanousd int64, withdrawnNanousd int64, totalNanousd int64, err error)
	ListUsageByUser(ctx context.Context, userID uint, filter UsageListFilter, offset int, limit int) ([]domainbilling.UsageLedger, int64, error)
	ListUsageLogs(ctx context.Context, filter UsageLogListFilter, offset int, limit int) ([]domainbilling.UsageLedger, int64, error)
	ListPaymentOrders(ctx context.Context, filter PaymentOrderListFilter, offset int, limit int) ([]domainbilling.PaymentOrder, int64, error)
	GetUserCreatedAt(ctx context.Context, userID uint) (time.Time, error)
	ListMonthlyUsageByUser(ctx context.Context, userID uint, limit int) ([]domainbilling.UsageMonthlySummary, error)
	ListDailyUsageByUser(ctx context.Context, userID uint, startDate time.Time, endDate time.Time) ([]domainbilling.UsageDailySummary, error)
	SumBillableNanousd(ctx context.Context, userID uint, startAt time.Time, endAt time.Time) (int64, error)
}

// CouponCodeListFilter 描述管理员优惠码列表筛选条件。
type CouponCodeListFilter struct {
	Scope        string
	Status       string
	Availability string
	Query        string
}

// CouponCodePatch 描述可更新的优惠码管理字段。
type CouponCodePatch struct {
	Status            *string
	MaxRedemptionsSet bool
	MaxRedemptions    *int
	PerUserLimit      *int
	ExpiresAtSet      bool
	ExpiresAt         *time.Time
	Description       *string
}

// CouponOrderApplyInput 描述一次订单使用优惠码需要写入的折扣快照。
type CouponOrderApplyInput struct {
	CouponID            uint
	UserID              uint
	OrderNo             string
	OrderType           string
	PlanID              uint
	OriginalAmountCents int64
	DiscountAmountCents int64
	FinalAmountCents    int64
	SnapshotJSON        string
}

// RedemptionCodeListFilter 描述管理员兑换码列表筛选条件。
type RedemptionCodeListFilter struct {
	Mode         string
	Modes        []string
	Status       string
	Availability string
	Query        string
}

// RedemptionCodePatch 描述可更新的兑换码管理字段。
type RedemptionCodePatch struct {
	Status            *string
	MaxRedemptionsSet bool
	MaxRedemptions    *int
	PerUserLimit      *int
	ExpiresAtSet      bool
	ExpiresAt         *time.Time
	Description       *string
}

// RedemptionApplyInput 描述一次兑换需要在事务中完成的写入参数。
type RedemptionApplyInput struct {
	CodeHash       string
	UserID         uint
	CurrentMode    string
	RefNo          string
	SubscriptionAt time.Time
}

// RedemptionApplyResult 描述兑换事务写入结果。
type RedemptionApplyResult struct {
	Code         domainbilling.RedemptionCode
	Redemption   domainbilling.Redemption
	Account      *domainbilling.BillingAccount
	Subscription *domainbilling.Subscription
}

// UsageListFilter 描述用户用量账本的筛选和排序条件。
type UsageListFilter struct {
	Query  string
	Status string
	Sort   string
}

// UsageLogListFilter 描述管理员调用日志筛选和排序条件。
type UsageLogListFilter struct {
	Query             string
	PlatformModelName string
	BillingMode       string
	UserID            uint
	CreatedFrom       *time.Time
	CreatedTo         *time.Time
	Sort              string
}

// PaymentOrderListFilter 描述管理员支付订单列表筛选和排序条件。
type PaymentOrderListFilter struct {
	Query       string
	OrderType   string
	Provider    string
	Status      string
	UserID      uint
	CreatedFrom *time.Time
	CreatedTo   *time.Time
	Sort        string
}
