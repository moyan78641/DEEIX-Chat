"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Separator } from "@/components/ui/separator";
import { useAppLocale } from "@/i18n/app-i18n-provider";
import { useLocalizedErrorMessage } from "@/i18n/use-localized-error";
import { useAuthSession } from "@/shared/auth/auth-session-context";
import {
  createBillingCheckout,
  getBillingConfig,
  getBillingOverview,
  listBillingDailyUsage,
  listBillingMonthlyUsage,
  listBillingPlans,
  listBillingUsage,
  purchaseBillingPlanWithBalance,
  quoteBillingPayment,
  redeemBillingCode,
  subscribeBillingPlan,
} from "@/shared/api/billing";
import type {
  BillingConfigData,
  BillingMode,
  BillingOverviewData,
  BillingUsageDailyDTO,
  BillingUsageLedgerDTO,
  BillingUsageMonthlyDTO,
  PaymentQuoteDTO,
} from "@/shared/api/billing.types";
import type { BillingPlanDTO, BillingPlanPriceDTO } from "@/shared/api/billing.types";
import type { UserDTO } from "@/shared/api/auth.types";
import { SettingsPage, SettingsSectionHeader } from "@/shared/components/settings-layout";
import {
  formatAccountBalance,
  isFreePlan,
  planRank,
  resolveDefaultPrice,
  resolvePlanActionKind,
  billingDisplayAmountToMinorUnits,
} from "@/features/settings/model/subscription-format";
import {
  normalizeBillingDisplayCurrency,
  type BillingDisplayOptions,
} from "@/shared/lib/billing-display";
import { RedemptionDialog, TopUpDialog } from "./subscription-billing-dialogs";
import { SubscriptionSummary } from "./subscription-summary";
import { SubscriptionUsageLog } from "./subscription-usage-log";
import type { UsageTrendView } from "./subscription-trend";

const SubscriptionTrend = dynamic(
  () => import("./subscription-trend").then((module) => module.SubscriptionTrend),
  {
    ssr: false,
    loading: () => <SubscriptionTrendSkeleton />,
  },
);

function SubscriptionTrendSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex h-9 items-center justify-between gap-3">
        <div className="h-4 w-28 rounded-full bg-muted/50" />
        <div className="h-7 w-24 rounded-full bg-muted/50" />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={`subscription-trend-skeleton-${index}`} className="rounded-md bg-muted/40 p-3">
            <div className="h-3 w-16 rounded-full bg-muted/60" />
            <div className="mt-2 h-4 w-20 rounded-full bg-muted/60" />
          </div>
        ))}
      </div>
      <div className="rounded-md bg-muted/35 p-3">
        <div className="h-[260px] rounded-md bg-muted/30" />
      </div>
    </div>
  );
}

type BillingRuntimeConfig = BillingConfigData["config"];
type PaymentProvider = "stripe" | "epay";

export function SettingsSubscription() {
  const t = useTranslations("settings.subscriptionPage");
  const resolveErrorMessage = useLocalizedErrorMessage();
  const { locale } = useAppLocale();
  const { accessToken, user } = useAuthSession();
  const [viewer, setViewer] = React.useState<UserDTO | null>(null);
  const [billingPlans, setBillingPlans] = React.useState<BillingPlanDTO[]>([]);
  const [billingConfig, setBillingConfig] = React.useState<BillingRuntimeConfig | null>(null);
  const [billingOverview, setBillingOverview] = React.useState<BillingOverviewData["overview"] | null>(null);
  const [usageLedgers, setUsageLedgers] = React.useState<BillingUsageLedgerDTO[]>([]);
  const [dailyUsage, setDailyUsage] = React.useState<BillingUsageDailyDTO[]>([]);
  const [monthlyUsage, setMonthlyUsage] = React.useState<BillingUsageMonthlyDTO[]>([]);
  const [usageTotal, setUsageTotal] = React.useState(0);
  const [usagePage, setUsagePage] = React.useState(1);
  const [usagePageSize, setUsagePageSize] = React.useState(25);
  const [usageQuery, setUsageQuery] = React.useState("");
  const [usageStatus, setUsageStatus] = React.useState("");
  const [usageSort, setUsageSort] = React.useState("newest");
  const [usageView, setUsageView] = React.useState<UsageTrendView>("daily");
  const [billingLoading, setBillingLoading] = React.useState(true);
  const [usageLoading, setUsageLoading] = React.useState(true);
  const [checkoutPriceID, setCheckoutPriceID] = React.useState<number | null>(null);
  const [topUpAmount, setTopUpAmount] = React.useState("20");
  const [topUpCouponCode, setTopUpCouponCode] = React.useState("");
  const [topUpLoading, setTopUpLoading] = React.useState(false);
  const [balancePurchaseLoading, setBalancePurchaseLoading] = React.useState(false);
  const [pricingDialogOpen, setPricingDialogOpen] = React.useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = React.useState(false);
  const [selectedPlan, setSelectedPlan] = React.useState<BillingPlanDTO | null>(null);
  const [selectedPrice, setSelectedPrice] = React.useState<BillingPlanPriceDTO | null>(null);
  const [selectedPaymentProvider, setSelectedPaymentProvider] = React.useState<PaymentProvider>("stripe");
  const [selectedEPayType, setSelectedEPayType] = React.useState("alipay");
  const [subscriptionCouponCode, setSubscriptionCouponCode] = React.useState("");
  const [subscriptionQuote, setSubscriptionQuote] = React.useState<PaymentQuoteDTO | null>(null);
  const [subscriptionQuoteLoading, setSubscriptionQuoteLoading] = React.useState(false);
  const [subscriptionQuoteAppliedCode, setSubscriptionQuoteAppliedCode] = React.useState("");
  const [subscriptionUseBalance, setSubscriptionUseBalance] = React.useState(false);
  const [topUpDialogOpen, setTopUpDialogOpen] = React.useState(false);
  const [topUpQuote, setTopUpQuote] = React.useState<PaymentQuoteDTO | null>(null);
  const [topUpQuoteLoading, setTopUpQuoteLoading] = React.useState(false);
  const [topUpQuoteAppliedCode, setTopUpQuoteAppliedCode] = React.useState("");
  const [redemptionDialogOpen, setRedemptionDialogOpen] = React.useState(false);
  const [topUpAgreementAccepted, setTopUpAgreementAccepted] = React.useState(false);
  const [subscriptionAgreementAccepted, setSubscriptionAgreementAccepted] = React.useState(false);
  const [redemptionCode, setRedemptionCode] = React.useState("");
  const [redemptionLoading, setRedemptionLoading] = React.useState(false);
  const billingMode: BillingMode = billingConfig?.mode ?? "self";
  const billingDisplay = React.useMemo<BillingDisplayOptions>(
    () => ({
      currency: normalizeBillingDisplayCurrency(billingConfig?.displayCurrency),
      usdToCnyRate: billingConfig?.usdToCNYRate ?? null,
    }),
    [billingConfig?.displayCurrency, billingConfig?.usdToCNYRate],
  );

  const intervalLabels = React.useMemo(
    () => ({
      lifetime: t("interval.lifetime"),
      year: t("interval.year"),
      month: t("interval.month"),
    }),
    [t],
  );
  const planActionLabels = React.useMemo(
    () => ({
      current: t("plans.actions.current"),
      unavailable: t("plans.actions.unavailable"),
      renew: t("plans.actions.renew"),
      subscribe: t("plans.actions.subscribe"),
      switch: t("plans.actions.switch"),
      upgrade: t("plans.actions.upgrade"),
      freeBlocked: t("plans.actions.freeBlocked"),
    }),
    [t],
  );
  const planFeatureLabels = React.useMemo(
    () => ({
      monthlyCredit: (credit: string) => t("plans.features.monthlyCredit", { credit }),
      freeModelsNotIncluded: t("plans.features.freeModelsNotIncluded"),
    }),
    [t],
  );
  const entitlementLabels = React.useMemo(
    () => ({
      title: t("entitlements.title"),
      count: (count: number) => t("entitlements.count", { count }),
      current: t("entitlements.current"),
      upcoming: t("entitlements.upcoming"),
      range: (start: string, end: string) => t("entitlements.range", { start, end }),
      credit: (credit: string) => t("entitlements.credit", { credit }),
    }),
    [t],
  );
  const epayLabels = React.useMemo(
    () => ({
      alipay: t("payment.epay.alipay"),
      wxpay: t("payment.epay.wxpay"),
      qqpay: t("payment.epay.qqpay"),
      custom: (type: string) => t("payment.epay.custom", { type }),
    }),
    [t],
  );

  React.useEffect(() => {
    let mounted = true;
    setBillingLoading(true);
    void Promise.all([
      getBillingConfig(accessToken),
      listBillingPlans(accessToken),
      getBillingOverview(accessToken),
      listBillingDailyUsage(accessToken),
      listBillingMonthlyUsage(accessToken, 12),
    ])
      .then(([configData, plans, overviewData, dailyUsageData, monthlyUsageData]) => ({
        viewer: user,
        config: configData.config,
        plans,
        overview: overviewData.overview,
        dailyUsage: dailyUsageData,
        monthlyUsage: monthlyUsageData,
      }))
      .then(({ viewer: nextViewer, config, plans, overview, dailyUsage: nextDailyUsage, monthlyUsage: nextMonthlyUsage }) => {
        if (!mounted) return;
        setViewer(nextViewer);
        setBillingConfig(config);
        setBillingPlans(plans);
        setBillingOverview(overview);
        setDailyUsage(nextDailyUsage ?? []);
        setMonthlyUsage(nextMonthlyUsage ?? []);
      })
      .catch((error) => {
        if (mounted) toast.error(t("toasts.subscriptionLoadFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
      })
      .finally(() => {
        if (mounted) setBillingLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [accessToken, resolveErrorMessage, t, user]);

  const loadUsageLogs = React.useCallback(async (page: number, pageSize: number, query: string, status: string, sort: string) => {
    setUsageLoading(true);
    try {
      const usage = await listBillingUsage(accessToken, { page, pageSize, query, status, sort });
      setUsageLedgers(usage.results ?? []);
      setUsageTotal(usage.total ?? 0);
    } catch (error) {
      toast.error(t("toasts.usageLogLoadFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setUsageLoading(false);
    }
  }, [accessToken, resolveErrorMessage, t]);

  React.useEffect(() => {
    void loadUsageLogs(usagePage, usagePageSize, usageQuery, usageStatus, usageSort);
  }, [loadUsageLogs, usagePage, usagePageSize, usageQuery, usageStatus, usageSort]);

  const epayTypes = React.useMemo(() => {
    const values = billingConfig?.epayTypes?.filter((item) => item.type.trim()) ?? [];
    return values.length > 0 ? values : [{ name: epayLabels.alipay, type: "alipay" }, { name: epayLabels.wxpay, type: "wxpay" }];
  }, [billingConfig?.epayTypes, epayLabels.alipay, epayLabels.wxpay]);
  const paymentProviders = React.useMemo(() => billingConfig?.paymentProviders?.filter((item) => item === "stripe" || item === "epay") ?? [], [billingConfig?.paymentProviders]);

  React.useEffect(() => {
    if (paymentProviders.length > 0 && !paymentProviders.includes(selectedPaymentProvider)) {
      setSelectedPaymentProvider(paymentProviders[0] ?? "stripe");
      setSubscriptionQuote(null);
      setSubscriptionQuoteAppliedCode("");
      setTopUpQuote(null);
      setTopUpQuoteAppliedCode("");
    }
  }, [paymentProviders, selectedPaymentProvider]);

  React.useEffect(() => {
    if (selectedPaymentProvider !== "epay") return;
    if (!epayTypes.some((item) => item.type === selectedEPayType)) {
      setSelectedEPayType(epayTypes[0]?.type ?? "alipay");
    }
  }, [epayTypes, selectedEPayType, selectedPaymentProvider]);

  const handleCheckout = React.useCallback(async (price: BillingPlanPriceDTO, paymentProvider: PaymentProvider, epayType?: string) => {
    setCheckoutPriceID(price.id);
    try {
      const data = await createBillingCheckout(accessToken, {
        orderType: "subscription",
        priceID: price.id,
        cycles: 1,
        paymentProvider,
        epayType: paymentProvider === "epay" ? epayType : undefined,
        couponCode: subscriptionCouponCode.trim() || undefined,
        useBalance: subscriptionUseBalance,
        successURL: `${window.location.origin}/setting/subscription?payment=success`,
        cancelURL: `${window.location.origin}/setting/subscription?payment=cancel`,
        termsAccepted: true,
        privacyAccepted: true,
      });
      if (!data.checkout.checkoutURL) {
        toast.error(t("toasts.checkoutCreateFailed"), { description: t("toasts.checkoutURLMissing") });
        return;
      }
      window.open(data.checkout.checkoutURL, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(t("toasts.checkoutCreateFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setCheckoutPriceID(null);
    }
  }, [accessToken, resolveErrorMessage, subscriptionCouponCode, subscriptionUseBalance, t]);

  const handleSubscribeFreePlan = React.useCallback(async (price: BillingPlanPriceDTO) => {
    setCheckoutPriceID(price.id);
    try {
      await subscribeBillingPlan(accessToken, price.id, {
        termsAccepted: true,
        privacyAccepted: true,
      });
      toast.success(t("toasts.planUpdated"));
      window.location.reload();
    } catch (error) {
      toast.error(t("toasts.subscribeFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setCheckoutPriceID(null);
    }
  }, [accessToken, resolveErrorMessage, t]);

  const handleTopUp = React.useCallback(async () => {
    if (!topUpAgreementAccepted) {
      toast.error(t("toasts.agreementRequired"));
      return;
    }
    const displayAmount = Number(topUpAmount);
    const amountMinorUnits = billingDisplayAmountToMinorUnits(displayAmount);
    if (!Number.isFinite(displayAmount) || displayAmount <= 0 || amountMinorUnits <= 0) {
      toast.error(t("toasts.invalidTopUpAmount"), { description: t("toasts.invalidTopUpAmountDescription") });
      return;
    }
    setTopUpLoading(true);
    try {
      const data = await createBillingCheckout(accessToken, {
        orderType: "topup",
        amountMinorUnits,
        cycles: 1,
        paymentProvider: selectedPaymentProvider,
        epayType: selectedPaymentProvider === "epay" ? selectedEPayType : undefined,
        couponCode: topUpCouponCode.trim() || undefined,
        successURL: `${window.location.origin}/setting/subscription?payment=success`,
        cancelURL: `${window.location.origin}/setting/subscription?payment=cancel`,
        termsAccepted: true,
        privacyAccepted: true,
      });
      if (!data.checkout.checkoutURL) {
        toast.error(t("toasts.checkoutCreateFailed"), { description: t("toasts.checkoutURLMissing") });
        return;
      }
      window.open(data.checkout.checkoutURL, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(t("toasts.checkoutCreateFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setTopUpLoading(false);
    }
  }, [accessToken, resolveErrorMessage, selectedEPayType, selectedPaymentProvider, t, topUpAgreementAccepted, topUpAmount, topUpCouponCode]);

  const handleApplyTopUpCoupon = React.useCallback(async () => {
    const code = topUpCouponCode.trim();
    if (!code) {
      toast.error(t("toasts.couponCodeRequired"));
      return;
    }
    const displayAmount = Number(topUpAmount);
    const amountMinorUnits = billingDisplayAmountToMinorUnits(displayAmount);
    if (!Number.isFinite(displayAmount) || displayAmount <= 0 || amountMinorUnits <= 0) {
      toast.error(t("toasts.invalidTopUpAmount"), { description: t("toasts.invalidTopUpAmountDescription") });
      return;
    }
    setTopUpQuoteLoading(true);
    try {
      const data = await quoteBillingPayment(accessToken, {
        orderType: "topup",
        amountMinorUnits,
        cycles: 1,
        paymentProvider: selectedPaymentProvider,
        epayType: selectedPaymentProvider === "epay" ? selectedEPayType : undefined,
        couponCode: code,
      });
      setTopUpQuote(data.quote);
      setTopUpQuoteAppliedCode(code.toUpperCase());
      toast.success(t("toasts.couponApplied"));
    } catch (error) {
      setTopUpQuote(null);
      setTopUpQuoteAppliedCode("");
      toast.error(t("toasts.couponApplyFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setTopUpQuoteLoading(false);
    }
  }, [accessToken, resolveErrorMessage, selectedEPayType, selectedPaymentProvider, t, topUpAmount, topUpCouponCode]);

  const handleApplySubscriptionCoupon = React.useCallback(async () => {
    if (!selectedPrice) {
      toast.error(t("toasts.noPlanSelected"), { description: t("toasts.noPlanSelectedDescription") });
      return;
    }
    const code = subscriptionCouponCode.trim();
    if (!code && !subscriptionUseBalance) {
      toast.error(t("toasts.couponCodeRequired"));
      return;
    }
    setSubscriptionQuoteLoading(true);
    try {
      const data = await quoteBillingPayment(accessToken, {
        orderType: "subscription",
        priceID: selectedPrice.id,
        cycles: 1,
        paymentProvider: selectedPaymentProvider,
        epayType: selectedPaymentProvider === "epay" ? selectedEPayType : undefined,
        couponCode: code || undefined,
        useBalance: subscriptionUseBalance,
      });
      setSubscriptionQuote(data.quote);
      setSubscriptionQuoteAppliedCode(code.toUpperCase());
      toast.success(code ? t("toasts.couponApplied") : t("toasts.balanceDeductionApplied"));
    } catch (error) {
      setSubscriptionQuote(null);
      setSubscriptionQuoteAppliedCode("");
      toast.error(t("toasts.couponApplyFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setSubscriptionQuoteLoading(false);
    }
  }, [accessToken, resolveErrorMessage, selectedEPayType, selectedPaymentProvider, selectedPrice, subscriptionCouponCode, subscriptionUseBalance, t]);

  const handleRedeemCode = React.useCallback(async () => {
    const code = redemptionCode.trim();
    if (!code) {
      toast.error(t("toasts.invalidRedemptionCode"));
      return;
    }
    setRedemptionLoading(true);
    try {
      const data = await redeemBillingCode(accessToken, { code });
      setBillingOverview(data.overview);
      setRedemptionDialogOpen(false);
      setRedemptionCode("");
      toast.success(t("toasts.redemptionSucceeded"));
    } catch (error) {
      toast.error(t("toasts.redemptionFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setRedemptionLoading(false);
    }
  }, [accessToken, redemptionCode, resolveErrorMessage, t]);

  const subscriptionEntitlements = React.useMemo(
    () => billingOverview?.subscriptionEntitlements ?? [],
    [billingOverview?.subscriptionEntitlements],
  );
  const paymentDisabled = paymentProviders.length === 0;
  const currentPlan = React.useMemo(() => {
    if (billingOverview) return billingOverview.plan;
    return billingPlans.find((plan) => viewer?.subscriptionPlanID === plan.id || viewer?.subscriptionTier === plan.code) ?? null;
  }, [billingOverview, billingPlans, viewer?.subscriptionPlanID, viewer?.subscriptionTier]);
  const currentPrice = React.useMemo(() => resolveDefaultPrice(currentPlan), [currentPlan]);
  const protectedPaidPlanRank = React.useMemo(
    () => Math.max(
      currentPlan && !isFreePlan(currentPlan) ? planRank(currentPlan) : 0,
      ...subscriptionEntitlements.map((item) => isFreePlan(item.plan) ? 0 : planRank(item.plan)),
    ),
    [currentPlan, subscriptionEntitlements],
  );

  const handleSelectPlan = React.useCallback(
    async (plan: BillingPlanDTO, price: BillingPlanPriceDTO | null, isCurrent: boolean) => {
      if (isCurrent && isFreePlan(plan)) {
        return;
      }
      if (!price) {
        toast.error(t("toasts.planUnavailable"), { description: t("toasts.planUnavailableDescription") });
        return;
      }
      const actionKind = resolvePlanActionKind(
        plan,
        price,
        isCurrent,
        currentPlan,
        protectedPaidPlanRank,
      );
      if (actionKind === "freeBlocked") {
        toast.error(t("toasts.freeSwitchBlocked"), { description: t("toasts.freeSwitchBlockedDescription") });
        return;
      }
      if (price.amountCents > 0) {
        if (paymentDisabled) {
          toast.error(t("toasts.paymentDisabled"), { description: t("toasts.paymentDisabledDescription") });
          return;
        }
        setSelectedPlan(plan);
        setSelectedPrice(price);
        setSubscriptionAgreementAccepted(false);
        setSubscriptionCouponCode("");
        setSubscriptionQuote(null);
        setSubscriptionQuoteAppliedCode("");
        setSubscriptionUseBalance((billingOverview?.account?.balanceUSD ?? 0) > 0);
        setPricingDialogOpen(false);
        setPaymentDialogOpen(true);
        return;
      }
      if (!subscriptionAgreementAccepted) {
        toast.error(t("toasts.agreementRequired"));
        return;
      }
      await handleSubscribeFreePlan(price);
    },
    [billingOverview?.account?.balanceUSD, currentPlan, handleSubscribeFreePlan, paymentDisabled, protectedPaidPlanRank, subscriptionAgreementAccepted, t],
  );

  const handleConfirmPayment = React.useCallback(async () => {
    if (!subscriptionAgreementAccepted) {
      toast.error(t("toasts.agreementRequired"));
      return;
    }
    if (!selectedPrice) {
      toast.error(t("toasts.noPlanSelected"), { description: t("toasts.noPlanSelectedDescription") });
      return;
    }
    await handleCheckout(selectedPrice, selectedPaymentProvider, selectedEPayType);
  }, [handleCheckout, selectedEPayType, selectedPaymentProvider, selectedPrice, subscriptionAgreementAccepted, t]);

  const handleBalancePurchase = React.useCallback(async () => {
    if (!subscriptionAgreementAccepted) {
      toast.error(t("toasts.agreementRequired"));
      return;
    }
    if (!selectedPrice) {
      toast.error(t("toasts.noPlanSelected"), { description: t("toasts.noPlanSelectedDescription") });
      return;
    }
    setBalancePurchaseLoading(true);
    setCheckoutPriceID(selectedPrice.id);
    try {
      const data = await purchaseBillingPlanWithBalance(accessToken, {
        priceID: selectedPrice.id,
        cycles: 1,
        couponCode: subscriptionCouponCode.trim() || undefined,
        termsAccepted: true,
        privacyAccepted: true,
      });
      setBillingOverview(data.overview);
      setPaymentDialogOpen(false);
      setPricingDialogOpen(false);
      setSubscriptionCouponCode("");
      setSubscriptionQuote(null);
      setSubscriptionQuoteAppliedCode("");
      setSubscriptionUseBalance(false);
      toast.success(t("toasts.balancePurchaseSucceeded"));
    } catch (error) {
      toast.error(t("toasts.balancePurchaseFailed"), { description: resolveErrorMessage(error, t("toasts.retryLater")) });
    } finally {
      setCheckoutPriceID(null);
      setBalancePurchaseLoading(false);
    }
  }, [accessToken, resolveErrorMessage, selectedPrice, subscriptionAgreementAccepted, subscriptionCouponCode, t]);

  const periodCredit = billingOverview?.periodCreditUSD ?? currentPlan?.periodCreditUSD ?? 0;
  const periodUsed = billingOverview?.periodUsedUSD ?? 0;
  const periodPercent = periodCredit > 0 ? Math.min(100, Math.max(0, (periodUsed / periodCredit) * 100)) : 0;
  const billingAccount = billingOverview?.account ?? null;
  const normalizedSubscriptionCouponCode = subscriptionCouponCode.trim().toUpperCase();
  const normalizedTopUpCouponCode = topUpCouponCode.trim().toUpperCase();
  const subscriptionCouponNeedsApply = Boolean(normalizedSubscriptionCouponCode && subscriptionQuoteAppliedCode !== normalizedSubscriptionCouponCode);
  const topUpCouponNeedsApply = Boolean(normalizedTopUpCouponCode && topUpQuoteAppliedCode !== normalizedTopUpCouponCode);

  return (
    <SettingsPage className="space-y-6">
      <SettingsSectionHeader title={t("title")} className="px-1" />

      <SubscriptionSummary
        billingMode={billingMode}
        billingLoading={billingLoading}
        redemptionLoading={redemptionLoading}
        topUpLoading={topUpLoading}
        paymentDisabled={paymentDisabled}
        billingPlans={billingPlans}
        billingOverview={billingOverview}
        currentPlan={currentPlan}
        currentPrice={currentPrice}
        viewer={viewer}
        billingAccount={billingAccount}
        subscriptionEntitlements={subscriptionEntitlements}
        locale={locale}
        intervalLabels={intervalLabels}
        entitlementLabels={entitlementLabels}
        planActionLabels={planActionLabels}
        planFeatureLabels={planFeatureLabels}
        epayLabels={epayLabels}
        epayTypes={epayTypes}
        paymentProviders={paymentProviders}
        selectedPlan={selectedPlan}
        selectedPrice={selectedPrice}
        selectedPaymentProvider={selectedPaymentProvider}
        selectedEPayType={selectedEPayType}
        subscriptionCouponCode={subscriptionCouponCode}
        subscriptionQuote={subscriptionQuote}
        subscriptionQuoteLoading={subscriptionQuoteLoading}
        subscriptionCouponNeedsApply={subscriptionCouponNeedsApply}
        subscriptionUseBalance={subscriptionUseBalance}
        checkoutPriceID={checkoutPriceID}
        balancePurchaseLoading={balancePurchaseLoading}
        pricingDialogOpen={pricingDialogOpen}
        paymentDialogOpen={paymentDialogOpen}
        protectedPaidPlanRank={protectedPaidPlanRank}
        periodCredit={periodCredit}
        periodUsed={periodUsed}
        periodPercent={periodPercent}
        billingDisplay={billingDisplay}
        onOpenRedemptionDialog={() => setRedemptionDialogOpen(true)}
        agreementAccepted={subscriptionAgreementAccepted}
        onAgreementAcceptedChange={setSubscriptionAgreementAccepted}
        onOpenTopUpDialog={() => {
          setTopUpAgreementAccepted(false);
          setTopUpCouponCode("");
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
          setTopUpDialogOpen(true);
        }}
        onPricingDialogOpenChange={(open) => {
          if (open) {
            setSubscriptionAgreementAccepted(false);
            setSubscriptionCouponCode("");
            setSubscriptionQuote(null);
            setSubscriptionQuoteAppliedCode("");
            setSubscriptionUseBalance(false);
          }
          setPricingDialogOpen(open);
        }}
        onPaymentDialogOpenChange={(open) => {
          if (!open) {
            setSubscriptionCouponCode("");
            setSubscriptionQuote(null);
            setSubscriptionQuoteAppliedCode("");
            setSubscriptionUseBalance(false);
          }
          setPaymentDialogOpen(open);
        }}
        onSelectPlan={(plan, price, isCurrent) => void handleSelectPlan(plan, price, isCurrent)}
        onPaymentProviderChange={(provider) => {
          setSelectedPaymentProvider(provider);
          setSubscriptionQuote(null);
          setSubscriptionQuoteAppliedCode("");
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
        }}
        onEPayTypeChange={(type) => {
          setSelectedEPayType(type);
          setSubscriptionQuote(null);
          setSubscriptionQuoteAppliedCode("");
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
        }}
        onSubscriptionCouponCodeChange={(value) => {
          setSubscriptionCouponCode(value);
          setSubscriptionQuote(null);
          setSubscriptionQuoteAppliedCode("");
        }}
        onSubscriptionUseBalanceChange={(value) => {
          setSubscriptionUseBalance(value);
          setSubscriptionQuote(null);
          setSubscriptionQuoteAppliedCode("");
        }}
        onApplySubscriptionCoupon={() => void handleApplySubscriptionCoupon()}
        onConfirmPayment={() => void handleConfirmPayment()}
        onBalancePurchase={() => void handleBalancePurchase()}
      />

      <section className="space-y-6 px-0.5 md:space-y-7 xl:space-y-8 xl:px-1">
        <Separator />
        <SubscriptionTrend
          dailyUsage={dailyUsage}
          monthlyUsage={monthlyUsage}
          loading={billingLoading}
          view={usageView}
          billingDisplay={billingDisplay}
          onViewChange={setUsageView}
        />
        <Separator />
        <SubscriptionUsageLog
          items={usageLedgers}
          total={usageTotal}
          loading={usageLoading}
          page={usagePage}
          pageSize={usagePageSize}
          query={usageQuery}
          status={usageStatus}
          sort={usageSort}
          billingDisplay={billingDisplay}
          onQueryChange={(value) => {
            setUsageQuery(value);
            setUsagePage(1);
          }}
          onStatusChange={(value) => {
            setUsageStatus(value);
            setUsagePage(1);
          }}
          onSortChange={(value) => {
            setUsageSort(value);
            setUsagePage(1);
          }}
          onRefresh={() => void loadUsageLogs(usagePage, usagePageSize, usageQuery, usageStatus, usageSort)}
          onPageChange={setUsagePage}
          onPageSizeChange={(nextPageSize) => {
            setUsagePageSize(nextPageSize);
            setUsagePage(1);
          }}
        />
      </section>

      <TopUpDialog
        open={topUpDialogOpen}
        onOpenChange={setTopUpDialogOpen}
        amount={topUpAmount}
        couponCode={topUpCouponCode}
        couponQuote={topUpQuote}
        couponQuoteLoading={topUpQuoteLoading}
        couponNeedsApply={topUpCouponNeedsApply}
        currentBalance={formatAccountBalance(billingAccount?.balanceUSD ?? 0, billingDisplay)}
        billingLoading={billingLoading}
        topUpLoading={topUpLoading}
        paymentDisabled={paymentDisabled}
        paymentProviders={paymentProviders}
        selectedPaymentProvider={selectedPaymentProvider}
        selectedEPayType={selectedEPayType}
        epayTypes={epayTypes}
        billingDisplay={billingDisplay}
        epayLabels={epayLabels}
        agreementAccepted={topUpAgreementAccepted}
        onAgreementAcceptedChange={setTopUpAgreementAccepted}
        onAmountChange={(value) => {
          setTopUpAmount(value);
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
        }}
        onCouponCodeChange={(value) => {
          setTopUpCouponCode(value);
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
        }}
        onPaymentProviderChange={(provider) => {
          setSelectedPaymentProvider(provider);
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
          setSubscriptionQuote(null);
          setSubscriptionQuoteAppliedCode("");
        }}
        onEPayTypeChange={(type) => {
          setSelectedEPayType(type);
          setTopUpQuote(null);
          setTopUpQuoteAppliedCode("");
          setSubscriptionQuote(null);
          setSubscriptionQuoteAppliedCode("");
        }}
        onApplyCoupon={() => void handleApplyTopUpCoupon()}
        onSubmit={() => void handleTopUp()}
      />

      <RedemptionDialog
        open={redemptionDialogOpen}
        onOpenChange={setRedemptionDialogOpen}
        code={redemptionCode}
        billingLoading={billingLoading}
        redemptionLoading={redemptionLoading}
        onCodeChange={setRedemptionCode}
        onSubmit={() => void handleRedeemCode()}
      />
    </SettingsPage>
  );
}
