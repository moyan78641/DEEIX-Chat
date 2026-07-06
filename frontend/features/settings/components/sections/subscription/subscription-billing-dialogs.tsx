"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { SpinnerLabel } from "@/components/ui/spinner";
import { AgreementCheckbox } from "@/shared/site/agreement-checkbox";
import type { PaymentQuoteDTO } from "@/shared/api/billing.types";
import {
  billingDisplayAmountToUSD,
  billingDisplayInputSymbol,
  formatPaymentMinorUnits,
  formatPlanCredit,
  formatProviderPaymentAmountFromUSD,
} from "@/features/settings/model/subscription-format";
import type { BillingDisplayOptions } from "@/shared/lib/billing-display";

type PaymentProvider = "stripe" | "epay";

type EPayTypeOption = {
  name: string;
  type: string;
};

function resolveEPayTypeLabel(type: string, labels: { alipay: string; wxpay: string; qqpay: string; custom: (type: string) => string }): string {
  if (type === "alipay") return labels.alipay;
  if (type === "wxpay") return labels.wxpay;
  if (type === "qqpay") return labels.qqpay;
  return labels.custom(type);
}

type TopUpDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: string;
  couponCode: string;
  couponQuote: PaymentQuoteDTO | null;
  couponQuoteLoading: boolean;
  couponNeedsApply: boolean;
  currentBalance: string;
  billingLoading: boolean;
  topUpLoading: boolean;
  paymentDisabled: boolean;
  paymentProviders: string[];
  selectedPaymentProvider: PaymentProvider;
  selectedEPayType: string;
  epayTypes: EPayTypeOption[];
  billingDisplay: BillingDisplayOptions;
  epayLabels: {
    alipay: string;
    wxpay: string;
    qqpay: string;
    custom: (type: string) => string;
  };
  onAmountChange: (value: string) => void;
  onCouponCodeChange: (value: string) => void;
  onPaymentProviderChange: (provider: PaymentProvider) => void;
  onEPayTypeChange: (type: string) => void;
  onApplyCoupon: () => void;
  onSubmit: () => void;
  agreementAccepted: boolean;
  onAgreementAcceptedChange: (accepted: boolean) => void;
};

export function TopUpDialog({
  open,
  onOpenChange,
  amount,
  couponCode,
  couponQuote,
  couponQuoteLoading,
  couponNeedsApply,
  currentBalance,
  billingLoading,
  topUpLoading,
  paymentDisabled,
  paymentProviders,
  selectedPaymentProvider,
  selectedEPayType,
  epayTypes,
  billingDisplay,
  epayLabels,
  onAmountChange,
  onCouponCodeChange,
  onPaymentProviderChange,
  onEPayTypeChange,
  onApplyCoupon,
  onSubmit,
  agreementAccepted,
  onAgreementAcceptedChange,
}: TopUpDialogProps) {
  const t = useTranslations("settings.subscriptionPage");
  const displayAmount = Number(amount);
  const paymentAmountUSD = billingDisplayAmountToUSD(displayAmount, billingDisplay);
  const stripePaymentAmount = formatProviderPaymentAmountFromUSD(paymentAmountUSD, "stripe", billingDisplay);
  const epayPaymentAmount = formatProviderPaymentAmountFromUSD(paymentAmountUSD, "epay", billingDisplay);
  const inputSymbol = billingDisplayInputSymbol(billingDisplay);
  const busy = billingLoading || topUpLoading || paymentDisabled || couponQuoteLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("topUp.title")}</DialogTitle>
          <DialogDescription>{t("topUp.description")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{t("topUp.amount")}</p>
            <p className="truncate text-xs text-muted-foreground tabular-nums">
              {t("topUp.currentBalance", { value: currentBalance })}
            </p>
          </div>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{inputSymbol}</span>
            <Input
              value={amount}
              type="number"
              min="0"
              step="0.01"
              className="pl-7"
              onChange={(event) => onAmountChange(event.target.value)}
              disabled={busy}
              aria-label={t("topUp.amountAria")}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("coupon.code")}</p>
          <div className="flex gap-2">
            <Input
              value={couponCode}
              autoComplete="off"
              className="font-mono"
              placeholder={t("coupon.placeholder")}
              disabled={busy}
              onChange={(event) => onCouponCodeChange(event.target.value)}
              aria-label={t("coupon.code")}
            />
            <Button type="button" variant="outline" disabled={busy || !couponCode.trim()} onClick={onApplyCoupon}>
              {couponQuoteLoading ? <SpinnerLabel>{t("coupon.applying")}</SpinnerLabel> : t("coupon.apply")}
            </Button>
          </div>
          {couponNeedsApply ? <p className="text-xs text-amber-600 dark:text-amber-400">{t("coupon.needsApply")}</p> : null}
        </div>

        {couponQuote ? (
          <div className="space-y-2 rounded-lg bg-muted/30 p-3 text-xs">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{t("payment.originalAmount")}</span>
              <span className="font-medium tabular-nums">{formatPlanCredit(couponQuote.originalBaseAmountCents / 100, billingDisplay)}</span>
            </div>
            {couponQuote.discountAmountCents > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">{t("payment.couponDiscount")}</span>
                <span className="font-medium tabular-nums">-{formatPlanCredit(couponQuote.discountAmountCents / 100, billingDisplay)}</span>
              </div>
            ) : null}
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <span className="font-medium">{t("payment.onlinePayAmount")}</span>
              <span className="font-semibold tabular-nums">{formatPaymentMinorUnits(couponQuote.payAmountCents, couponQuote.payCurrency)}</span>
            </div>
          </div>
        ) : null}

        {!paymentDisabled ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t("payment.method")}</p>
            <div className="grid grid-cols-2 gap-2">
              {paymentProviders.includes("stripe") ? (
                <button
                  type="button"
                  className={`flex min-h-9 flex-col items-center justify-center rounded-md border px-2 py-1 text-xs ${
                    selectedPaymentProvider === "stripe" ? "border-foreground bg-muted/25 font-medium" : "border-border bg-transparent text-muted-foreground"
                  }`}
                  disabled={busy}
                  onClick={() => onPaymentProviderChange("stripe")}
                >
                  <span>Stripe</span>
                  <span className="text-[11px] font-normal tabular-nums opacity-80">{stripePaymentAmount}</span>
                </button>
              ) : null}
              {paymentProviders.includes("epay")
                ? epayTypes.map((item) => {
                  const selected = selectedPaymentProvider === "epay" && selectedEPayType === item.type;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      className={`flex min-h-9 flex-col items-center justify-center rounded-md border px-2 py-1 text-xs ${
                        selected ? "border-foreground bg-muted/25 font-medium" : "border-border bg-transparent text-muted-foreground"
                      }`}
                      disabled={busy}
                      onClick={() => {
                        onPaymentProviderChange("epay");
                        onEPayTypeChange(item.type);
                      }}
                    >
                      <span>{item.name || resolveEPayTypeLabel(item.type, epayLabels)}</span>
                      <span className="text-[11px] font-normal tabular-nums opacity-80">{epayPaymentAmount}</span>
                    </button>
                  );
                })
                : null}
            </div>
          </div>
        ) : null}

        <AgreementCheckbox
          checked={agreementAccepted}
          disabled={busy}
          onCheckedChange={onAgreementAcceptedChange}
        />

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={topUpLoading || couponQuoteLoading}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" disabled={busy || !agreementAccepted || couponNeedsApply} onClick={onSubmit}>
            {topUpLoading ? <SpinnerLabel>{t("actions.processing")}</SpinnerLabel> : t("topUp.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RedemptionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  code: string;
  billingLoading: boolean;
  redemptionLoading: boolean;
  onCodeChange: (value: string) => void;
  onSubmit: () => void;
};

export function RedemptionDialog({
  open,
  onOpenChange,
  code,
  billingLoading,
  redemptionLoading,
  onCodeChange,
  onSubmit,
}: RedemptionDialogProps) {
  const t = useTranslations("settings.subscriptionPage");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{t("redemption.title")}</DialogTitle>
          <DialogDescription>{t("redemption.description")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("redemption.code")}</p>
          <Input
            value={code}
            autoComplete="off"
            className="font-mono"
            disabled={billingLoading || redemptionLoading}
            onChange={(event) => onCodeChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSubmit();
              }
            }}
            aria-label={t("redemption.code")}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={redemptionLoading}>
            {t("actions.cancel")}
          </Button>
          <Button type="button" disabled={billingLoading || redemptionLoading} onClick={onSubmit}>
            {redemptionLoading ? <SpinnerLabel>{t("actions.processing")}</SpinnerLabel> : t("redemption.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
