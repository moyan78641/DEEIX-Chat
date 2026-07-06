package billing

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	domainbilling "github.com/DEEIX-AI/DEEIX-Chat/backend/internal/domain/billing"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/pkg/secretbox"
	"github.com/DEEIX-AI/DEEIX-Chat/backend/internal/repository"
)

// CouponCodeInput 定义管理员创建优惠码的入参。
type CouponCodeInput struct {
	Code              string
	Scope             string
	DiscountType      string
	DiscountPercent   int
	DiscountAmountUSD float64
	MinAmountUSD      float64
	MaxDiscountUSD     float64
	PlanID            uint
	MaxRedemptions    *int
	PerUserLimit      int
	ExpiresAt         *time.Time
	Description       string
}

// CouponCodeListInput 定义管理员查询优惠码列表的入参。
type CouponCodeListInput struct {
	Scope        string
	Status       string
	Availability string
	Query        string
	Page         int
	PageSize     int
}

// CouponCodeUpdateInput 定义管理员更新优惠码管理字段的入参。
type CouponCodeUpdateInput struct {
	Status            *string
	MaxRedemptionsSet bool
	MaxRedemptions    *int
	PerUserLimit      *int
	ExpiresAtSet      bool
	ExpiresAt         *time.Time
	Description       *string
}

// CouponCodeValidationError 表示优惠码配置字段校验失败。
type CouponCodeValidationError struct {
	Field  string `json:"field"`
	Reason string `json:"reason"`
}

func (e CouponCodeValidationError) Error() string {
	return ErrInvalidCouponCode.Error()
}

func (e CouponCodeValidationError) Is(target error) bool {
	return target == ErrInvalidCouponCode
}

// CouponCodeView 表示后台优惠码列表视图。
type CouponCodeView struct {
	domainbilling.CouponCode
	Code string
}

// CouponQuoteView 表示优惠码在订单上的折扣结果。
type CouponQuoteView struct {
	Coupon              domainbilling.CouponCode
	Code                string
	OriginalAmountCents int64
	DiscountAmountCents int64
	FinalAmountCents    int64
	SnapshotJSON        string
}

// ListCouponCodes 查询管理员优惠码列表。
func (s *Service) ListCouponCodes(ctx context.Context, input CouponCodeListInput) ([]CouponCodeView, int64, error) {
	page, pageSize := normalizePage(input.Page, input.PageSize)
	scope := strings.TrimSpace(input.Scope)
	if scope != "" {
		scope = normalizeCouponScope(scope)
	}
	items, total, err := s.repo.ListCouponCodes(ctx, repository.CouponCodeListFilter{
		Scope:        scope,
		Status:       strings.TrimSpace(input.Status),
		Availability: strings.TrimSpace(input.Availability),
		Query:        strings.TrimSpace(input.Query),
	}, (page-1)*pageSize, pageSize)
	if err != nil {
		return nil, 0, err
	}
	results := make([]CouponCodeView, 0, len(items))
	for _, item := range items {
		results = append(results, CouponCodeView{CouponCode: item})
	}
	return results, total, nil
}

// RevealCouponCode 按需解密管理员指定的优惠码明文。
func (s *Service) RevealCouponCode(ctx context.Context, id uint) (*CouponCodeView, error) {
	if id == 0 {
		return nil, repository.ErrInvalidInput
	}
	item, err := s.repo.GetCouponCodeByID(ctx, id)
	if err != nil {
		return nil, mapCouponRepositoryError(err)
	}
	code, err := s.couponCodePlaintext(item.CodeEncrypted)
	if err != nil {
		return nil, err
	}
	if code == "" {
		return nil, ErrCouponCodePlaintextUnavailable
	}
	return &CouponCodeView{CouponCode: *item, Code: code}, nil
}

// CreateCouponCode 创建优惠码。
func (s *Service) CreateCouponCode(ctx context.Context, actorUserID uint, input CouponCodeInput) (*CouponCodeView, error) {
	if actorUserID == 0 {
		return nil, repository.ErrInvalidInput
	}
	normalized, err := s.normalizeCouponCodeInput(ctx, input)
	if err != nil {
		return nil, err
	}
	code := normalized.Code
	if code == "" {
		code, err = generateRedemptionCode()
		if err != nil {
			return nil, err
		}
	}
	codeHash, err := s.couponCodeHash(code)
	if err != nil {
		return nil, err
	}
	codeEncrypted, err := s.couponCodeEncrypted(code)
	if err != nil {
		return nil, err
	}
	item := &domainbilling.CouponCode{
		CodeHash:            codeHash,
		CodeEncrypted:       codeEncrypted,
		CodeHint:            redemptionCodeHint(code),
		Scope:               normalized.Scope,
		DiscountType:        normalized.DiscountType,
		DiscountPercent:     normalized.DiscountPercent,
		DiscountAmountCents: normalized.DiscountAmountCents,
		MinAmountCents:      normalized.MinAmountCents,
		MaxDiscountCents:    normalized.MaxDiscountCents,
		PlanID:              normalized.PlanID,
		MaxRedemptions:      copyIntPointer(normalized.MaxRedemptions),
		PerUserLimit:        normalized.PerUserLimit,
		Status:              domainbilling.CouponStatusActive,
		ExpiresAt:           normalized.ExpiresAt,
		Description:         normalized.Description,
		CreatedByUserID:     actorUserID,
	}
	created, err := s.repo.CreateCouponCode(ctx, item)
	if err != nil {
		if errors.Is(err, repository.ErrDuplicate) {
			return nil, ErrCouponCodeConflict
		}
		return nil, err
	}
	return &CouponCodeView{CouponCode: *created, Code: code}, nil
}

// UpdateCouponCode 更新优惠码管理字段，不允许修改优惠规则本身。
func (s *Service) UpdateCouponCode(ctx context.Context, id uint, input CouponCodeUpdateInput) (*CouponCodeView, error) {
	if id == 0 {
		return nil, repository.ErrInvalidInput
	}
	patch := repository.CouponCodePatch{
		MaxRedemptionsSet: input.MaxRedemptionsSet,
		MaxRedemptions:    copyIntPointer(input.MaxRedemptions),
		ExpiresAtSet:      input.ExpiresAtSet,
		ExpiresAt:         input.ExpiresAt,
		Description:       input.Description,
	}
	if input.Status != nil {
		status := normalizeCouponStatus(*input.Status)
		if status == "" {
			return nil, couponCodeValidationError("status", "status")
		}
		patch.Status = &status
	}
	if input.PerUserLimit != nil {
		if *input.PerUserLimit <= 0 {
			return nil, couponCodeValidationError("perUserLimit", "per_user_limit")
		}
		patch.PerUserLimit = input.PerUserLimit
	}
	if input.MaxRedemptionsSet && input.MaxRedemptions != nil && *input.MaxRedemptions <= 0 {
		return nil, couponCodeValidationError("maxRedemptions", "max_redemptions")
	}
	if input.MaxRedemptionsSet && input.MaxRedemptions != nil && input.PerUserLimit != nil && *input.PerUserLimit > *input.MaxRedemptions {
		return nil, couponCodeValidationError("perUserLimit", "limit_relationship")
	}
	if input.ExpiresAtSet && input.ExpiresAt != nil && !input.ExpiresAt.After(time.Now()) {
		return nil, couponCodeValidationError("expiresAt", "expires_at")
	}
	updated, err := s.repo.PatchCouponCode(ctx, id, patch)
	if err != nil {
		return nil, mapCouponRepositoryError(err)
	}
	return &CouponCodeView{CouponCode: *updated}, nil
}

// DeleteCouponCode 软删除优惠码，保留历史使用记录。
func (s *Service) DeleteCouponCode(ctx context.Context, id uint) error {
	if id == 0 {
		return repository.ErrInvalidInput
	}
	return mapCouponRepositoryError(s.repo.DeleteCouponCode(ctx, id))
}

// ResolveCouponQuote 校验并计算优惠码折扣。金额单位为 USD cents。
func (s *Service) ResolveCouponQuote(
	ctx context.Context,
	userID uint,
	code string,
	orderType string,
	planID uint,
	originalAmountCents int64,
	allowFullDiscount bool,
) (*CouponQuoteView, error) {
	code = normalizeRedemptionCode(code)
	if code == "" {
		return nil, nil
	}
	if userID == 0 || originalAmountCents <= 0 {
		return nil, repository.ErrInvalidInput
	}
	codeHash, err := s.couponCodeHash(code)
	if err != nil {
		return nil, err
	}
	coupon, err := s.repo.GetCouponCodeByHash(ctx, codeHash)
	if err != nil {
		return nil, mapCouponRepositoryError(err)
	}
	if err := s.validateCouponForOrder(ctx, *coupon, userID, orderType, planID, originalAmountCents, time.Now()); err != nil {
		return nil, err
	}
	discount := calculateCouponDiscount(*coupon, originalAmountCents)
	maxDiscount := originalAmountCents
	if !allowFullDiscount {
		maxDiscount = originalAmountCents - 1
	}
	if maxDiscount < 0 {
		maxDiscount = 0
	}
	if discount > maxDiscount {
		discount = maxDiscount
	}
	if discount <= 0 {
		return nil, ErrCouponCodeUnavailable
	}
	finalAmount := originalAmountCents - discount
	if finalAmount < 0 {
		finalAmount = 0
	}
	snapshot := couponSnapshotJSON(*coupon, code, originalAmountCents, discount, finalAmount)
	return &CouponQuoteView{
		Coupon:              *coupon,
		Code:                code,
		OriginalAmountCents: originalAmountCents,
		DiscountAmountCents: discount,
		FinalAmountCents:    finalAmount,
		SnapshotJSON:        snapshot,
	}, nil
}

type normalizedCouponCodeInput struct {
	Code                string
	Scope               string
	DiscountType        string
	DiscountPercent     int
	DiscountAmountCents int64
	MinAmountCents      int64
	MaxDiscountCents    int64
	PlanID              uint
	MaxRedemptions      *int
	PerUserLimit        int
	ExpiresAt           *time.Time
	Description         string
}

func (s *Service) normalizeCouponCodeInput(ctx context.Context, input CouponCodeInput) (normalizedCouponCodeInput, error) {
	code := normalizeRedemptionCode(input.Code)
	if code != "" && !validRedemptionCode(code) {
		return normalizedCouponCodeInput{}, couponCodeValidationError("code", "code_format")
	}
	perUserLimit := input.PerUserLimit
	if perUserLimit <= 0 {
		perUserLimit = 1
	}
	if input.MaxRedemptions != nil && *input.MaxRedemptions <= 0 {
		return normalizedCouponCodeInput{}, couponCodeValidationError("maxRedemptions", "max_redemptions")
	}
	maxRedemptions := copyIntPointer(input.MaxRedemptions)
	if maxRedemptions != nil && perUserLimit > *maxRedemptions {
		return normalizedCouponCodeInput{}, couponCodeValidationError("perUserLimit", "limit_relationship")
	}
	if input.ExpiresAt != nil && !input.ExpiresAt.After(time.Now()) {
		return normalizedCouponCodeInput{}, couponCodeValidationError("expiresAt", "expires_at")
	}
	scope := normalizeCouponScope(input.Scope)
	if scope == "" {
		return normalizedCouponCodeInput{}, couponCodeValidationError("scope", "scope")
	}
	discountType := normalizeCouponDiscountType(input.DiscountType)
	if discountType == "" {
		return normalizedCouponCodeInput{}, couponCodeValidationError("discountType", "discount_type")
	}
	discountPercent := clampPercent(input.DiscountPercent)
	discountAmountCents := usdFloatToCents(input.DiscountAmountUSD)
	if discountType == domainbilling.CouponDiscountTypePercent {
		if discountPercent <= 0 {
			return normalizedCouponCodeInput{}, couponCodeValidationError("discountPercent", "discount_percent")
		}
		discountAmountCents = 0
	} else if discountAmountCents <= 0 {
		return normalizedCouponCodeInput{}, couponCodeValidationError("discountAmountUSD", "discount_amount")
	}
	minAmountCents := usdFloatToCents(input.MinAmountUSD)
	maxDiscountCents := usdFloatToCents(input.MaxDiscountUSD)
	planID := input.PlanID
	if planID > 0 {
		plan, err := s.repo.GetPlanByID(ctx, planID)
		if err != nil {
			if errors.Is(err, repository.ErrNotFound) {
				return normalizedCouponCodeInput{}, couponCodeValidationError("planID", "plan")
			}
			return normalizedCouponCodeInput{}, err
		}
		if !plan.IsActive {
			return normalizedCouponCodeInput{}, couponCodeValidationError("planID", "plan")
		}
	}
	if planID > 0 && scope == domainbilling.CouponScopeTopUp {
		return normalizedCouponCodeInput{}, couponCodeValidationError("planID", "scope")
	}
	return normalizedCouponCodeInput{
		Code:                code,
		Scope:               scope,
		DiscountType:        discountType,
		DiscountPercent:     discountPercent,
		DiscountAmountCents: discountAmountCents,
		MinAmountCents:      minAmountCents,
		MaxDiscountCents:    maxDiscountCents,
		PlanID:              planID,
		MaxRedemptions:      maxRedemptions,
		PerUserLimit:        perUserLimit,
		ExpiresAt:           input.ExpiresAt,
		Description:         strings.TrimSpace(input.Description),
	}, nil
}

func (s *Service) validateCouponForOrder(ctx context.Context, coupon domainbilling.CouponCode, userID uint, orderType string, planID uint, originalAmountCents int64, now time.Time) error {
	if coupon.Status != domainbilling.CouponStatusActive {
		return ErrCouponCodeUnavailable
	}
	if coupon.ExpiresAt != nil && !coupon.ExpiresAt.After(now) {
		return ErrCouponCodeUnavailable
	}
	if coupon.MaxRedemptions != nil && coupon.RedeemedCount >= *coupon.MaxRedemptions {
		return ErrCouponCodeExhausted
	}
	if coupon.PerUserLimit <= 0 {
		return ErrInvalidCouponCode
	}
	if originalAmountCents < coupon.MinAmountCents {
		return ErrCouponCodeUnavailable
	}
	if coupon.PlanID > 0 && coupon.PlanID != planID {
		return ErrCouponCodeUnavailable
	}
	if !couponScopeMatchesOrderType(coupon.Scope, orderType) {
		return ErrCouponCodeUnavailable
	}
	count, err := s.repo.CountCouponRedemptionsByUser(ctx, coupon.ID, userID)
	if err != nil {
		return err
	}
	if count >= int64(coupon.PerUserLimit) {
		return ErrCouponUserLimitExceeded
	}
	return nil
}

func calculateCouponDiscount(coupon domainbilling.CouponCode, amountCents int64) int64 {
	if amountCents <= 0 {
		return 0
	}
	var discount int64
	switch normalizeCouponDiscountType(coupon.DiscountType) {
	case domainbilling.CouponDiscountTypeAmount:
		discount = coupon.DiscountAmountCents
	default:
		if coupon.DiscountPercent <= 0 {
			return 0
		}
		discount = (amountCents*int64(clampPercent(coupon.DiscountPercent)) + 50) / 100
	}
	if coupon.MaxDiscountCents > 0 && discount > coupon.MaxDiscountCents {
		discount = coupon.MaxDiscountCents
	}
	if discount > amountCents {
		return amountCents
	}
	return discount
}

func couponScopeMatchesOrderType(scope string, orderType string) bool {
	switch normalizeCouponScope(scope) {
	case domainbilling.CouponScopeAll:
		return true
	case domainbilling.CouponScopeTopUp:
		return strings.TrimSpace(orderType) == domainbilling.PaymentOrderTypeTopUp
	case domainbilling.CouponScopeSubscription:
		return strings.TrimSpace(orderType) == domainbilling.PaymentOrderTypeSubscription
	default:
		return false
	}
}

func couponSnapshotJSON(coupon domainbilling.CouponCode, code string, originalAmountCents int64, discountAmountCents int64, finalAmountCents int64) string {
	payload := map[string]interface{}{
		"coupon_id":             coupon.ID,
		"coupon_code_hint":      redemptionCodeHint(code),
		"scope":                 coupon.Scope,
		"discount_type":         coupon.DiscountType,
		"discount_percent":      coupon.DiscountPercent,
		"discount_amount_cents": coupon.DiscountAmountCents,
		"min_amount_cents":      coupon.MinAmountCents,
		"max_discount_cents":    coupon.MaxDiscountCents,
		"plan_id":               coupon.PlanID,
		"original_amount_cents": originalAmountCents,
		"applied_discount_cents": discountAmountCents,
		"final_amount_cents":    finalAmountCents,
		"description":           strings.TrimSpace(coupon.Description),
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return "{}"
	}
	return string(raw)
}

func (s *Service) couponCodeHash(code string) (string, error) {
	normalized := normalizeRedemptionCode(code)
	if normalized == "" || !validRedemptionCode(normalized) {
		return "", ErrInvalidCouponCode
	}
	if s == nil || strings.TrimSpace(s.redemptionCodeSecret) == "" {
		return "", ErrRedemptionCodeHashUnavailable
	}
	mac := hmac.New(sha256.New, []byte(strings.TrimSpace(s.redemptionCodeSecret)))
	mac.Write([]byte(normalized)) //nolint:errcheck
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func (s *Service) couponCodeEncrypted(code string) (string, error) {
	normalized := normalizeRedemptionCode(code)
	if normalized == "" || !validRedemptionCode(normalized) {
		return "", ErrInvalidCouponCode
	}
	if s == nil || strings.TrimSpace(s.redemptionCodeSecret) == "" {
		return "", ErrRedemptionCodeHashUnavailable
	}
	return secretbox.EncryptString(strings.TrimSpace(s.redemptionCodeSecret), normalized)
}

func (s *Service) couponCodePlaintext(encrypted string) (string, error) {
	encrypted = strings.TrimSpace(encrypted)
	if encrypted == "" {
		return "", nil
	}
	if s == nil || strings.TrimSpace(s.redemptionCodeSecret) == "" {
		return "", ErrRedemptionCodeHashUnavailable
	}
	code, err := secretbox.DecryptString(strings.TrimSpace(s.redemptionCodeSecret), encrypted)
	if err != nil {
		return "", ErrRedemptionCodeHashUnavailable
	}
	return normalizeRedemptionCode(code), nil
}

func generateCouponOrderNo() (string, error) {
	var random [8]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", err
	}
	return "balance_" + time.Now().UTC().Format("20060102150405") + "_" + hex.EncodeToString(random[:]), nil
}

func normalizeCouponScope(value string) string {
	switch strings.TrimSpace(value) {
	case "":
		return domainbilling.CouponScopeAll
	case domainbilling.CouponScopeAll:
		return domainbilling.CouponScopeAll
	case domainbilling.CouponScopeTopUp:
		return domainbilling.CouponScopeTopUp
	case domainbilling.CouponScopeSubscription:
		return domainbilling.CouponScopeSubscription
	default:
		return ""
	}
}

func normalizeCouponDiscountType(value string) string {
	switch strings.TrimSpace(value) {
	case domainbilling.CouponDiscountTypePercent:
		return domainbilling.CouponDiscountTypePercent
	case domainbilling.CouponDiscountTypeAmount:
		return domainbilling.CouponDiscountTypeAmount
	default:
		return domainbilling.CouponDiscountTypePercent
	}
}

func normalizeCouponStatus(value string) string {
	switch strings.TrimSpace(value) {
	case domainbilling.CouponStatusActive:
		return domainbilling.CouponStatusActive
	case domainbilling.CouponStatusInactive:
		return domainbilling.CouponStatusInactive
	default:
		return ""
	}
}

func couponCodeValidationError(field string, reason string) CouponCodeValidationError {
	return CouponCodeValidationError{
		Field:  strings.TrimSpace(field),
		Reason: strings.TrimSpace(reason),
	}
}

func discountAmountCents(quote *CouponQuoteView) int64 {
	if quote == nil {
		return 0
	}
	return quote.DiscountAmountCents
}

func couponID(quote *CouponQuoteView) uint {
	if quote == nil {
		return 0
	}
	return quote.Coupon.ID
}

func couponCodeHint(quote *CouponQuoteView) string {
	if quote == nil {
		return ""
	}
	return redemptionCodeHint(quote.Code)
}

func couponOrderApplyInput(quote *CouponQuoteView, userID uint, orderNo string, orderType string, planID uint) *repository.CouponOrderApplyInput {
	if quote == nil {
		return nil
	}
	return &repository.CouponOrderApplyInput{
		CouponID:            quote.Coupon.ID,
		UserID:              userID,
		OrderNo:             strings.TrimSpace(orderNo),
		OrderType:           strings.TrimSpace(orderType),
		PlanID:              planID,
		OriginalAmountCents: quote.OriginalAmountCents,
		DiscountAmountCents: quote.DiscountAmountCents,
		FinalAmountCents:    quote.FinalAmountCents,
		SnapshotJSON:        quote.SnapshotJSON,
	}
}

func mapCouponRepositoryError(err error) error {
	switch {
	case errors.Is(err, repository.ErrInvalidInput):
		return ErrInvalidCouponCode
	case errors.Is(err, repository.ErrRedemptionUnavailable), errors.Is(err, repository.ErrNotFound):
		return ErrCouponCodeUnavailable
	case errors.Is(err, repository.ErrRedemptionExhausted):
		return ErrCouponCodeExhausted
	case errors.Is(err, repository.ErrRedemptionUserLimitExceeded):
		return ErrCouponUserLimitExceeded
	default:
		return err
	}
}

func usdFloatToCents(value float64) int64 {
	if value <= 0 || math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	return int64(math.Round(value * 100))
}
