"use client";

import * as React from "react";
import { Activity, CircleOff, MoreHorizontal, RefreshCw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableEmptyRow,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from "@/components/ui/table";
import { resolveAccessToken } from "@/shared/auth/resolve-access-token";
import {
  deleteAdminLLMUpstreamModel,
  listAdminLLMModelUpstreamSources,
  openAdminLLMUpstreamModelCircuit,
  resetAdminLLMUpstreamModelCircuit,
  testAdminLLMUpstreamModelRoute,
  updateAdminLLMModelUpstreamSource,
} from "@/features/admin/api";
import type {
  AdminLLMModelDTO,
  AdminLLMModelProbeResult,
  AdminLLMModelUpstreamSourceDTO,
  AdminLLMStatus,
} from "@/features/admin/api/llm.types";

import { TablePagination } from "@/components/ui/table-tools";
import {
  ADAPTER_LABELS,
  formatDateTime,
  resolveErrorMessage,
  resolveValue,
} from "@/features/admin/types/llm";
import { ModelProbeDialog } from "./model-probe-dialog";

type UpstreamSourcesSheetProps = {
  model: AdminLLMModelDTO | null;
  onClose: () => void;
  onRefreshModel: () => void;
  onSourceStatusChange?: (modelID: number, previous: AdminLLMStatus, next: AdminLLMStatus) => void;
};

type RouteDraft = {
  priority: string;
  weight: string;
};

export function UpstreamSourcesSheet({
  model,
  onClose,
  onRefreshModel,
  onSourceStatusChange,
}: UpstreamSourcesSheetProps) {
  const t = useTranslations("adminModels.sources");
  const probeT = useTranslations("adminModels");
  const toastT = useTranslations("adminModels.toast");
  const commonT = useTranslations("common");
  const locale = useLocale();
  const [sources, setSources] = React.useState<AdminLLMModelUpstreamSourceDTO[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [actionSourceID, setActionSourceID] = React.useState<number | null>(null);
  const [routeDrafts, setRouteDrafts] = React.useState<Record<number, RouteDraft>>({});
  const [probeOpen, setProbeOpen] = React.useState(false);
  const [probeLoading, setProbeLoading] = React.useState(false);
  const [probeTargetName, setProbeTargetName] = React.useState("");
  const [probeResults, setProbeResults] = React.useState<AdminLLMModelProbeResult[]>([]);
  const pageSize = 25;

  const loadSources = React.useCallback(
    async (modelId: number, nextPage = 1) => {
      setLoading(true);
      try {
        const token = await resolveAccessToken();
        if (!token) {
          toast.error(toastT("sessionExpired"), { description: toastT("signInAgain") });
          return;
        }
        const data = await listAdminLLMModelUpstreamSources(token, modelId, {
          page: nextPage,
          pageSize,
        });
        setSources(data.results);
        setRouteDrafts(
          Object.fromEntries(
            data.results.map((item) => [
              item.id,
              {
                priority: String(item.priority),
                weight: String(item.weight),
              },
            ]),
          ),
        );
        setTotal(data.total);
        setPage(nextPage);
      } catch (error) {
        toast.error(toastT("sourcesLoadFailed"), { description: resolveErrorMessage(error) });
      } finally {
        setLoading(false);
      }
    },
    [pageSize, toastT],
  );

  React.useEffect(() => {
    if (model) {
      void loadSources(model.id, 1);
      return;
    }

    setSources([]);
    setTotal(0);
    setPage(1);
    setActionSourceID(null);
    setRouteDrafts({});
    setProbeResults([]);
  }, [loadSources, model]);

  const setRouteDraft = React.useCallback(
    (sourceID: number, field: keyof RouteDraft, value: string) => {
      setRouteDrafts((prev) => ({
        ...prev,
        [sourceID]: {
          priority: prev[sourceID]?.priority ?? "",
          weight: prev[sourceID]?.weight ?? "",
          [field]: value,
        },
      }));
    },
    [],
  );

  const handleRouteValueCommit = React.useCallback(
    async (source: AdminLLMModelUpstreamSourceDTO, field: keyof RouteDraft) => {
      if (!model) return;

      const raw = routeDrafts[source.id]?.[field] ?? String(source[field]);
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0) {
        toast.error(field === "priority" ? t("priorityMustBePositive") : t("weightMustBePositive"));
        setRouteDraft(source.id, field, String(source[field]));
        return;
      }
      if (value === source[field]) {
        return;
      }

      const token = await resolveAccessToken();
      if (!token) {
        toast.error(toastT("sessionExpired"), { description: toastT("signInAgain") });
        return;
      }

      const previousSource = source;
      const nextSource = { ...source, [field]: value };
      setActionSourceID(source.id);
      setSources((current) => current.map((item) => (item.id === source.id ? nextSource : item)));
      setRouteDraft(source.id, field, String(value));
      try {
        const data = await updateAdminLLMModelUpstreamSource(
          token,
          model.id,
          source.id,
          field === "priority" ? { priority: value } : { weight: value },
        );
        setSources((current) => current.map((item) => (item.id === source.id ? data.source : item)));
        setRouteDrafts((current) => ({
          ...current,
          [source.id]: {
            priority: String(data.source.priority),
            weight: String(data.source.weight),
          },
        }));
        toast.success(field === "priority" ? t("priorityUpdated") : t("weightUpdated"));
      } catch (error) {
        setSources((current) => current.map((item) => (item.id === source.id ? previousSource : item)));
        setRouteDraft(source.id, field, String(source[field]));
        toast.error(toastT("routeUpdateFailed"), { description: resolveErrorMessage(error) });
      } finally {
        setActionSourceID(null);
      }
    },
    [model, routeDrafts, setRouteDraft, t, toastT],
  );

  const handleRouteInputKeyDown = React.useCallback(
    (
      event: React.KeyboardEvent<HTMLInputElement>,
      source: AdminLLMModelUpstreamSourceDTO,
      field: keyof RouteDraft,
    ) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.currentTarget.blur();
      }
      if (event.key === "Escape") {
        setRouteDraft(source.id, field, String(source[field]));
        event.currentTarget.blur();
      }
    },
    [setRouteDraft],
  );

  const handleToggleStatus = React.useCallback(
    async (source: AdminLLMModelUpstreamSourceDTO, nextStatus: AdminLLMStatus) => {
      if (!model) return;

      const token = await resolveAccessToken();
      if (!token) {
        toast.error(toastT("sessionExpired"), { description: toastT("signInAgain") });
        return;
      }

      const previousSource = source;
      const nextSource = { ...source, status: nextStatus };
      setActionSourceID(source.id);
      setSources((current) => current.map((item) => (item.id === source.id ? nextSource : item)));
      onSourceStatusChange?.(model.id, source.status, nextStatus);
      try {
        const data = await updateAdminLLMModelUpstreamSource(token, model.id, source.id, {
          status: nextStatus,
        });
        setSources((current) => current.map((item) => (item.id === source.id ? data.source : item)));
        toast.success(nextStatus === "active" ? toastT("sourceEnabled") : toastT("sourceDisabled"));
        onRefreshModel();
      } catch (error) {
        setSources((current) => current.map((item) => (item.id === source.id ? previousSource : item)));
        onSourceStatusChange?.(model.id, nextStatus, source.status);
        toast.error(toastT("sourceStatusUpdateFailed"), { description: resolveErrorMessage(error) });
      } finally {
        setActionSourceID(null);
      }
    },
    [model, onRefreshModel, onSourceStatusChange, toastT],
  );

  const handleCircuitAction = React.useCallback(
    async (source: AdminLLMModelUpstreamSourceDTO, action: "open" | "reset") => {
      if (!model) return;

      const token = await resolveAccessToken();
      if (!token) {
        toast.error(toastT("sessionExpired"), { description: toastT("signInAgain") });
        return;
      }

      const previousSource = source;
      const nextSource =
        action === "open"
          ? {
              ...source,
              circuitOpen: true,
              circuitUntil: String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
            }
          : { ...source, circuitOpen: false, circuitUntil: "" };
      setActionSourceID(source.id);
      setSources((current) => current.map((item) => (item.id === source.id ? nextSource : item)));
      try {
        if (action === "open") {
          await openAdminLLMUpstreamModelCircuit(token, source.upstreamID, source.id);
          toast.success(toastT("circuitOpened"));
        } else {
          await resetAdminLLMUpstreamModelCircuit(token, source.upstreamID, source.id);
          toast.success(toastT("circuitReset"));
        }
      } catch (error) {
        setSources((current) => current.map((item) => (item.id === source.id ? previousSource : item)));
        toast.error(toastT("operationFailed"), { description: resolveErrorMessage(error) });
      } finally {
        setActionSourceID(null);
      }
    },
    [model, toastT],
  );

  const handleTestSource = React.useCallback(
    async (source: AdminLLMModelUpstreamSourceDTO) => {
      setProbeTargetName(`${source.upstreamName} / ${source.upstreamModelName}`);
      setProbeResults([]);
      setProbeOpen(true);
      setProbeLoading(true);
      try {
        const token = await resolveAccessToken();
        if (!token) {
          toast.error(toastT("sessionExpired"), { description: toastT("signInAgain") });
          setProbeOpen(false);
          return;
        }
        setProbeResults([await testAdminLLMUpstreamModelRoute(token, source.upstreamID, source.id)]);
      } catch (error) {
        toast.error(toastT("operationFailed"), { description: resolveErrorMessage(error) });
        setProbeOpen(false);
      } finally {
        setProbeLoading(false);
      }
    },
    [toastT],
  );

  const handleDeleteProbeRoute = React.useCallback(
    async (result: AdminLLMModelProbeResult) => {
      const token = await resolveAccessToken();
      if (!token) {
        toast.error(toastT("sessionExpired"), { description: toastT("signInAgain") });
        throw new Error("session expired");
      }
      try {
        await deleteAdminLLMUpstreamModel(token, result.upstreamID, result.routeID);
        const nextResults = probeResults.filter((item) => item.routeID !== result.routeID);
        setSources((current) => current.filter((item) => item.id !== result.routeID));
        setTotal((current) => Math.max(0, current - 1));
        setProbeResults(nextResults);
        if (nextResults.length === 0) {
          setProbeOpen(false);
        }
        toast.success(toastT("sourceDeleted"));
        onRefreshModel();
      } catch (error) {
        toast.error(toastT("sourceDeleteFailed"), { description: resolveErrorMessage(error) });
        throw error;
      }
    },
    [onRefreshModel, probeResults, toastT],
  );

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <Sheet open={!!model} onOpenChange={(open) => !open && onClose()}>
        <SheetContent className="flex flex-col sm:max-w-[720px]">
          <SheetHeader className="px-4 pb-4">
            <SheetTitle>{t("title")}</SheetTitle>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t("upstream")}</TableHead>
                  <TableHead>{t("upstreamModel")}</TableHead>
                  <TableHead>{t("protocol")}</TableHead>
                  <TableHead className="w-[150px] text-center">{t("priorityWeight")}</TableHead>
                  <TableHead className="w-[72px] text-center">{t("status")}</TableHead>
                  <TableHead className="w-[140px]">{t("updatedAt")}</TableHead>
                  <TableHead className="w-[56px]" stickyEnd />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableSkeletonRows colSpan={7} rowCount={8} /> : null}
                {sources.map((source) => {
                  const actionPending = actionSourceID === source.id;

                  return (
                    <TableRow key={source.id}>
                      <TableCell className="py-1">
                        <div className="whitespace-nowrap">
                          <span className="font-medium">{resolveValue(source.upstreamName)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1 font-mono text-xs">
                        {resolveValue(source.upstreamModelName)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-1">
                        <Badge variant="secondary" className="whitespace-nowrap">
                          {ADAPTER_LABELS[source.protocol] ?? source.protocol}
                        </Badge>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-1">
                        <div className="flex h-6 items-center justify-center gap-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={routeDrafts[source.id]?.priority ?? String(source.priority)}
                            disabled={actionPending}
                            onChange={(event) =>
                              setRouteDraft(source.id, "priority", event.target.value)
                            }
                            onBlur={() => void handleRouteValueCommit(source, "priority")}
                            onKeyDown={(event) =>
                              handleRouteInputKeyDown(event, source, "priority")
                            }
                            aria-label={t("priorityAria", { name: source.upstreamModelName })}
                            className="w-[58px] px-2 text-center font-mono tabular-nums"
                          />
                          <span className="text-xs text-muted-foreground">/</span>
                          <Input
                            type="text"
                            inputMode="numeric"
                            value={routeDrafts[source.id]?.weight ?? String(source.weight)}
                            disabled={actionPending}
                            onChange={(event) =>
                              setRouteDraft(source.id, "weight", event.target.value)
                            }
                            onBlur={() => void handleRouteValueCommit(source, "weight")}
                            onKeyDown={(event) => handleRouteInputKeyDown(event, source, "weight")}
                            aria-label={t("weightAria", { name: source.upstreamModelName })}
                            className="w-[58px] px-2 text-center font-mono tabular-nums"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="w-[72px] whitespace-nowrap py-1">
                        <div className="flex h-8 items-center justify-center">
                          <Switch
                            size="sm"
                            checked={source.status === "active"}
                            disabled={actionPending}
                            onCheckedChange={(checked) =>
                              void handleToggleStatus(source, checked ? "active" : "inactive")
                            }
                            aria-label={t("sourceStatusAria", { name: source.upstreamModelName })}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-1 text-muted-foreground">
                        {formatDateTime(source.updatedAt, locale)}
                      </TableCell>
                      <TableCell className="w-[56px] whitespace-nowrap py-1" stickyEnd>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon-sm"
                              variant="ghost"
                              className="text-muted-foreground shadow-none"
                              aria-label={t("sourceActions")}
                              disabled={actionPending}
                            >
                              {actionPending ? (
                                <Spinner className="size-3.5" />
                              ) : (
                                <MoreHorizontal className="size-3.5 stroke-1" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => void handleTestSource(source)}>
                              <Activity className="size-3.5 stroke-1" />
                              {probeT("actions.test")}
                            </DropdownMenuItem>
                            {source.circuitOpen ? (
                              <DropdownMenuItem
                                onSelect={() => void handleCircuitAction(source, "reset")}
                              >
                                <RefreshCw className="size-3.5 stroke-1" />
                                {t("resetCircuit")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() => void handleCircuitAction(source, "open")}
                              >
                                <CircleOff className="size-3.5 stroke-1" />
                                {t("openCircuit")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}

                {!loading && sources.length === 0 ? (
                  <TableEmptyRow colSpan={7}>{t("empty")}</TableEmptyRow>
                ) : null}
              </TableBody>
            </Table>

          {total > pageSize ? (
            <div className="mt-4">
              <TablePagination
                total={total}
                page={page}
                pageCount={pageCount}
                pageSize={pageSize}
                onPageChange={(nextPage) => {
                  if (model) {
                    void loadSources(model.id, nextPage);
                  }
                }}
                onPageSizeChange={() => void 0}
                showPageSize={false}
                loading={loading}
              />
            </div>
          ) : null}
          </div>

          <SheetFooter className="flex flex-row justify-end gap-2 px-4 py-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              {commonT("actions.close")}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

    <ModelProbeDialog
      open={probeOpen}
      loading={probeLoading}
      targetName={probeTargetName}
      result={null}
      results={probeResults}
      onDeleteRoute={handleDeleteProbeRoute}
      onOpenChange={(open) => {
        if (!open && !probeLoading) {
          setProbeOpen(false);
        }
      }}
    />
    </>
  );
}
