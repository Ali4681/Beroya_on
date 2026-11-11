"use client";

import { Headset, MessageCircle, Phone as PhoneIcon, X } from "lucide";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

import {
  telHref,
  whatsappHref,
  type SupportContacts,
} from "../support-contacts";

type Labels = {
  title: string;
  call: string;
  whatsapp: string;
  soon: string;
};

type SupportContactActionsProps = {
  support: SupportContacts;
  labels: Labels;
  /** Visible row label, e.g. خدمة العملاء */
  label: string;
  className?: string;
  tone?: "footer" | "faq";
};

export function SupportContactActions({
  support,
  labels,
  label,
  className,
  tone = "footer",
}: SupportContactActionsProps) {
  const phone = support.phone || support.whatsapp;
  const whatsapp = support.whatsapp || support.phone;
  const canCall = Boolean(support.phone || support.whatsapp);
  const canWhatsapp = Boolean(support.whatsapp || support.phone);
  const available = canCall || canWhatsapp;

  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  if (!available) {
    return (
      <span className={cx("inline-flex items-center gap-2 text-muted/80", className)}>
        <Icon node={Headset} size={16} />
        {label}
        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10.5px] font-semibold text-muted ring-1 ring-line">
          {labels.soon}
        </span>
      </span>
    );
  }

  return (
    <div ref={rootRef} className={cx("relative inline-flex", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cx(
          "inline-flex items-center gap-2 transition",
          tone === "faq"
            ? "h-11 rounded-full border border-line-strong bg-surface px-5 text-sm font-semibold text-heading hover:bg-surface-2"
            : "text-muted hover:text-heading",
        )}
      >
        <Icon node={Headset} size={tone === "faq" ? 17 : 16} />
        <span>{label}</span>
        {phone ? (
          <span dir="ltr" className="text-[12px] font-medium opacity-80">
            {phone}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={labels.title}
          className="absolute end-0 bottom-[calc(100%+0.55rem)] z-30 w-[15.5rem] overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
        >
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
            <button
              type="button"
              className="grid size-7 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-heading"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              <Icon node={X} size={14} />
            </button>
            <p className="text-[13px] font-semibold text-heading">{labels.title}</p>
          </div>
          <ul className="grid gap-0.5 p-1.5">
            {canCall && phone ? (
              <li>
                <ActionLink href={telHref(phone)} onNavigate={() => setOpen(false)}>
                  <Icon node={PhoneIcon} size={16} className="text-accent" />
                  <span className="flex-1 text-start">{labels.call}</span>
                  <span dir="ltr" className="text-[11px] text-muted">
                    {phone}
                  </span>
                </ActionLink>
              </li>
            ) : null}
            {canWhatsapp && whatsapp ? (
              <li>
                <ActionLink href={whatsappHref(whatsapp)} external onNavigate={() => setOpen(false)}>
                  <Icon node={MessageCircle} size={16} className="text-accent" />
                  <span className="flex-1 text-start">{labels.whatsapp}</span>
                  <span dir="ltr" className="text-[11px] text-muted">
                    {whatsapp}
                  </span>
                </ActionLink>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ActionLink({
  href,
  external,
  onNavigate,
  children,
}: {
  href: string;
  external?: boolean;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-heading transition hover:bg-surface-2"
    >
      {children}
    </a>
  );
}
