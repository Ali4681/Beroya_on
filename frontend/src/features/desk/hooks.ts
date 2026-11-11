"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { useDesk } from "@/features/desk/desk-context";
import { goFailure, noteFormSuccess, type GoFailure } from "@/features/desk/form-report";
import { asRows, go, GoApiError, type GoQuery } from "@/features/desk/go-api";
import { t } from "@/features/desk/i18n/t";

export { goFailure, goFailureFields, goFailureMessage, isGoFailure } from "@/features/desk/form-report";

const BRANCH_LISTS = new Set([
  "/erp/rides",
  "/erp/rides/live",
  "/erp/offers",
  "/erp/drivers",
  "/erp/fleet",
  "/erp/vehicles",
  "/admin/vehicles",
  "/erp/customers",
  "/erp/complaints",
  "/erp/cases",
  "/erp/emergencies",
  "/erp/alerts",
  "/erp/reports/overview",
  "/erp/reports/cancellations",
  "/erp/reports/assignment",
  "/erp/reports/coverage",
  "/erp/reports/drivers",
  "/erp/finance/performance",
  "/erp/wallets",
  "/erp/customer-wallets",
  "/erp/finance/compensations",
  "/erp/finance/driver-entitlements",
  "/auth/admin/staff",
]);

export function useGoList(path: string, query: GoQuery = {}, scope = true, keepPrevious = false) {
  const { branchId } = useDesk();
  const branch = scope && branchId && BRANCH_LISTS.has(path) ? branchId : "";
  const next = branch ? { ...query, branch_id: branch } : query;
  return useQuery({
    queryKey: ["go", path, next],
    queryFn: async () => asRows(await go<unknown>(path, { query: next })),
    placeholderData: keepPrevious ? keepPreviousData : undefined,
  });
}

export function useGoRecord(path: string, enabled = true, query: GoQuery = {}) {
  return useQuery({
    queryKey: ["go", path, query],
    enabled,
    queryFn: () => go<Record<string, unknown>>(path, { query }),
  });
}

export function useGo() {
  const queryClient = useQueryClient();
  const { pushToast } = useDesk();
  return useCallback(
    async function call<T>(path: string, options?: Parameters<typeof go>[1]): Promise<T | GoFailure> {
      const mutation = !!options?.method && options.method !== "GET";
      try {
        const result = await go<T>(path, options);
        if (mutation) {
          noteFormSuccess();
          pushToast(t("تم التنفيذ"));
          try {
            await queryClient.invalidateQueries({ queryKey: ["go"] });
          } catch {
            /* The write already succeeded; a stale list refreshes on the next visit. */
          }
        }
        return result;
      } catch (error) {
        const message = error instanceof GoApiError ? error.message : t("تعذّر التنفيذ");
        const fields = error instanceof GoApiError ? error.fields : {};
        pushToast(message);
        return goFailure(message, fields);
      }
    },
    [queryClient, pushToast],
  );
}

export function useGoMutation<TBody>(path: string, method: "POST" | "PATCH" | "DELETE" = "POST", idempotent = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body?: TBody) => go(path, { method, body, idempotent }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["go"] });
    },
  });
}
