"use client";

import { t } from "@/features/desk/i18n/t";

import { X } from "lucide";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { BusyMark, btnGhost, btnIconQuiet, btnPrimary } from "@/features/desk/ui";
import { Icon } from "@/shared/ui/icon";

export type ConfirmAsk = {
  title: string;
  body: string;
  confirm?: string;
  danger?: boolean;
  perform?: () => Promise<unknown> | unknown;
};

type Pending = ConfirmAsk & { resolve: (ok: boolean) => void };

const ConfirmContext = createContext<(ask: ConfirmAsk) => Promise<boolean>>(async () => false);

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmButton({
  ask,
  onConfirm,
  className,
  children,
}: {
  ask: ConfirmAsk;
  onConfirm: () => unknown;
  className?: string;
  children: ReactNode;
}) {
  const confirm = useConfirm();
  return (
    <button className={className} type="button" onClick={() => void confirm({ ...ask, perform: () => onConfirm() })}>
      {children}
    </button>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [working, setWorking] = useState(false);

  function ask(input: ConfirmAsk) {
    return new Promise<boolean>((resolve) => {
      setPending({ ...input, resolve });
    });
  }

  function close(ok: boolean) {
    if (working) return;
    pending?.resolve(ok);
    setPending(null);
  }

  async function accept() {
    if (!pending || working) return;
    const job = pending.perform;
    const resolve = pending.resolve;
    if (!job) {
      resolve(true);
      setPending(null);
      return;
    }
    setWorking(true);
    try {
      await job();
      resolve(true);
    } finally {
      setWorking(false);
      setPending(null);
    }
  }

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && typeof document !== "undefined" ? createPortal(
        <div className="desk-fade fixed inset-0 z-[90] grid place-items-center bg-ink/45 p-4 backdrop-blur-[2px]" onMouseDown={() => close(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-busy={working || undefined}
            aria-label={pending.title}
            className="desk-pop grid w-full max-w-md gap-4 rounded-2xl border border-line bg-surface p-5 shadow-float"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h2 className="text-base font-semibold text-heading">{pending.title}</h2>
              <button className={btnIconQuiet} type="button" aria-label={t("إغلاق")} disabled={working} onClick={() => close(false)}>
                <Icon node={X} size={18} />
              </button>
            </div>
            <p className="text-sm leading-7 text-body">{pending.body}</p>
            <div className="flex justify-end gap-2">
              <button className={btnGhost} type="button" disabled={working} onClick={() => close(false)}>{t("إلغاء")}</button>
              <button
                className={pending.danger ? "inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-danger px-4 text-sm font-semibold text-white transition-colors hover:bg-danger/90 disabled:cursor-wait disabled:opacity-70" : btnPrimary}
                type="button"
                disabled={working}
                onClick={() => void accept()}
              >
                {working ? <BusyMark /> : null}
                {working ? t("جارٍ التنفيذ…") : (pending.confirm ?? t("تأكيد"))}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </ConfirmContext.Provider>
  );
}
