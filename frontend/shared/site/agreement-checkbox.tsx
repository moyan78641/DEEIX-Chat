"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { StreamdownRender } from "@/shared/components/markdown/streamdown-render";
import { useSiteProfile } from "@/shared/site/site-profile-context";

type LegalDocumentKind = "terms" | "privacy";

export function AgreementCheckbox({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("common.legalConsent");
  const commonT = useTranslations("common");
  const { profile } = useSiteProfile();
  const [openDocument, setOpenDocument] = React.useState<LegalDocumentKind | null>(null);
  const checkboxID = React.useId();
  const termsTitle = profile.terms.title.trim() || t("terms");
  const termsContent = profile.terms.content.trim();
  const privacyTitle = profile.privacy.title.trim() || t("privacy");
  const privacyContent = profile.privacy.content.trim();
  const activeDocument = openDocument === "privacy"
    ? { title: privacyTitle, content: privacyContent }
    : { title: termsTitle, content: termsContent };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <Checkbox
          id={checkboxID}
          checked={checked}
          disabled={disabled}
          className="mt-0.5"
          onCheckedChange={(value) => onCheckedChange(value === true)}
        />
        <span>
          <label htmlFor={checkboxID} className={disabled ? "cursor-not-allowed" : "cursor-pointer"}>
            {t("prefix")}
          </label>{" "}
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => setOpenDocument("terms")}
          >
            {termsTitle}
          </button>
          <span aria-hidden="true"> {t("and")} </span>
          <button
            type="button"
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
            onClick={() => setOpenDocument("privacy")}
          >
            {privacyTitle}
          </button>
        </span>
      </div>
      <Dialog open={openDocument !== null} onOpenChange={(open) => {
        if (!open) setOpenDocument(null);
      }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{activeDocument.title}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60svh] overflow-y-auto rounded-md bg-muted/35 px-3 py-3 text-xs leading-5 text-muted-foreground">
            <StreamdownRender content={activeDocument.content || t("empty")} className="text-xs" />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpenDocument(null)}>
              {commonT("actions.close")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
