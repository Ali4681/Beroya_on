"use client";

import { createPortal } from "react-dom";

import { moneyText } from "@/features/desk/amount";
import { t } from "@/features/desk/i18n/t";
import { whenText } from "@/features/desk/store-kit";
import { BrandLockup } from "@/shared/ui/brand-lockup";

export type ReceiptStore = {
  name: string;
  code: string;
  owner_name: string;
  mobile_number: string;
  address: string | null;
  branch: string;
};

export type ReceiptEntry = {
  reference: string;
  direction: "CREDIT" | "DEBIT";
  amount: string;
  balance_before: string;
  balance_after: string;
  note: string | null;
  performed_by: { full_name: string | null };
  created_at: string;
};

/**
 * A4 document printed for a store balance movement. Rendered straight into <body> and shown only
 * in print, so the dialog and the dark theme never leak into the paper.
 */
export function StoreReceiptPrint({ store, entry, kind }: { store: ReceiptStore; entry: ReceiptEntry; kind: "credit" | "adjust" }) {
  if (typeof document === "undefined") return null;
  const credit = kind === "credit";
  const added = entry.direction === "CREDIT";

  return createPortal(
    <article className="print-doc" aria-hidden="true">
      <header className="pd-head">
        <div className="pd-brand">
          <BrandLockup className="pd-logo" decorative />
          <p className="pd-tagline">{t("نظام إدارة المتاجر المعتمدة")}</p>
        </div>
        <div className="pd-title">
          <h1>{credit ? t("إيصال استلام رصيد") : t("إشعار تسوية رصيد")}</h1>
          <p className="pd-subtitle">{credit ? "Balance Payment Receipt" : "Balance Adjustment Notice"}</p>
        </div>
      </header>

      <div className="pd-band" />

      <section className="pd-meta">
        <div>
          <span>{credit ? t("رقم الإيصال") : t("رقم المرجع")}</span>
          <bdi className="pd-ref">{entry.reference}</bdi>
        </div>
        <div>
          <span>{t("التاريخ والوقت")}</span>
          <strong>{whenText(entry.created_at)}</strong>
        </div>
        <div>
          <span>{t("طريقة الدفع")}</span>
          <strong>{credit ? t("نقداً — يدوي") : t("تسوية إدارية")}</strong>
        </div>
      </section>

      <section className="pd-section">
        <h2>{t("بيانات المتجر")}</h2>
        <dl className="pd-grid">
          <div>
            <dt>{t("اسم المتجر")}</dt>
            <dd>{store.name}</dd>
          </div>
          <div>
            <dt>{t("رمز المتجر")}</dt>
            <dd><bdi>{store.code}</bdi></dd>
          </div>
          <div>
            <dt>{t("اسم المالك")}</dt>
            <dd>{store.owner_name}</dd>
          </div>
          <div>
            <dt>{t("جوال المالك")}</dt>
            <dd><bdi className="phone-ltr" dir="ltr" data-phone="">{store.mobile_number}</bdi></dd>
          </div>
          <div>
            <dt>{t("المحافظة / الفرع")}</dt>
            <dd>{store.branch}</dd>
          </div>
          <div>
            <dt>{t("عنوان المتجر")}</dt>
            <dd>{store.address || "—"}</dd>
          </div>
        </dl>
      </section>

      <section className="pd-amount">
        <span>{credit ? t("المبلغ المستلم") : added ? t("المبلغ المضاف") : t("المبلغ المخصوم")}</span>
        <strong>{moneyText(entry.amount)}</strong>
      </section>

      <section className="pd-section">
        <h2>{t("حركة الرصيد")}</h2>
        <table className="pd-table">
          <tbody>
            <tr>
              <th>{t("رصيد المتجر قبل العملية")}</th>
              <td>{moneyText(entry.balance_before)}</td>
            </tr>
            <tr>
              <th>{added ? t("المبلغ المضاف") : t("المبلغ المخصوم")}</th>
              <td>{added ? "+ " : "− "}{moneyText(entry.amount)}</td>
            </tr>
            <tr className="pd-total">
              <th>{t("رصيد المتجر بعد العملية")}</th>
              <td>{moneyText(entry.balance_after)}</td>
            </tr>
          </tbody>
        </table>
        {entry.note ? (
          <p className="pd-note">
            <span>{credit ? t("ملاحظة") : t("السبب")}:</span> {entry.note}
          </p>
        ) : null}
      </section>

      <section className="pd-signs">
        <div>
          <span className="pd-line" />
          <p>{credit ? t("المستلم عن الشركة") : t("المنفّذ")}</p>
          <strong>{entry.performed_by.full_name ?? "—"}</strong>
        </div>
        <div>
          <span className="pd-line" />
          <p>{t("صاحب المتجر")}</p>
          <strong>{store.owner_name}</strong>
        </div>
      </section>

      <footer className="pd-foot">
        <p>{t("صادر إلكترونياً من نظام Beroya On ومسجّل في السجل المالي للمتجر ولا يمكن تعديله أو حذفه.")}</p>
        <p>{t("رقم الإيصال هو المرجع الرسمي للعملية. يُرجى الاحتفاظ بهذا الإيصال.")}</p>
      </footer>
    </article>,
    document.body,
  );
}

export type PosReceipt = {
  reference: string;
  status: "COMPLETED" | "REVERSED";
  reversed_at: string | null;
  created_at: string;
  amount: string;
  fees: string;
  commission: string;
  driver_wallet_credit: string;
  driver: { full_name: string | null; mobile_masked: string | null };
  store: { code: string; name: string; address: string | null; mobile_number: string };
  operator: { full_name: string | null };
};

/** A4 driver top-up receipt printed from the store POS; the store's own balance stays off the paper. */
export function PosReceiptPrint({ receipt }: { receipt: PosReceipt }) {
  if (typeof document === "undefined") return null;
  const reversed = receipt.status === "REVERSED";
  const fees = Number(receipt.fees) > 0;
  const commission = Number(receipt.commission) > 0;

  return createPortal(
    <article className="print-doc" aria-hidden="true">
      <header className="pd-head">
        <div className="pd-brand">
          <BrandLockup className="pd-logo" decorative />
          <p className="pd-tagline">{t("شبكة المتاجر المعتمدة لشحن محافظ السائقين")}</p>
        </div>
        <div className="pd-title">
          <h1>{reversed ? t("إيصال شحن معكوس") : t("إيصال شحن محفظة سائق")}</h1>
          <p className="pd-subtitle">{reversed ? "Reversed Wallet Top-up" : "Driver Wallet Top-up Receipt"}</p>
        </div>
      </header>

      <div className="pd-band" />

      <section className="pd-meta">
        <div>
          <span>{t("رقم الإيصال")}</span>
          <bdi className="pd-ref">{receipt.reference}</bdi>
        </div>
        <div>
          <span>{t("التاريخ والوقت")}</span>
          <strong>{whenText(receipt.created_at)}</strong>
        </div>
        <div>
          <span>{t("حالة العملية")}</span>
          <strong className={reversed ? "pd-bad" : "pd-good"}>{reversed ? t("معكوسة") : t("مكتملة")}</strong>
        </div>
      </section>

      <section className="pd-duo">
        <div className="pd-section">
          <h2>{t("بيانات السائق")}</h2>
          <dl className="pd-grid pd-grid-2">
            <div>
              <dt>{t("اسم السائق")}</dt>
              <dd>{receipt.driver.full_name ?? "—"}</dd>
            </div>
            <div>
              <dt>{t("الجوال")}</dt>
              <dd><bdi className="phone-ltr" dir="ltr" data-phone="">{receipt.driver.mobile_masked ?? "—"}</bdi></dd>
            </div>
          </dl>
        </div>
        <div className="pd-section">
          <h2>{t("نقطة الشحن")}</h2>
          <dl className="pd-grid pd-grid-2">
            <div>
              <dt>{t("اسم المتجر")}</dt>
              <dd>{receipt.store.name}</dd>
            </div>
            <div>
              <dt>{t("رمز المتجر")}</dt>
              <dd><bdi>{receipt.store.code}</bdi></dd>
            </div>
            <div>
              <dt>{t("هاتف المتجر")}</dt>
              <dd><bdi className="phone-ltr" dir="ltr" data-phone="">{receipt.store.mobile_number}</bdi></dd>
            </div>
            <div>
              <dt>{t("عنوان المتجر")}</dt>
              <dd>{receipt.store.address || "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="pd-amount">
        <span>{t("أُضيف لمحفظة السائق")}</span>
        <strong>{moneyText(receipt.driver_wallet_credit)}</strong>
      </section>

      <section className="pd-section">
        <h2>{t("تفاصيل العملية")}</h2>
        <table className="pd-table">
          <tbody>
            <tr>
              <th>{t("مبلغ الشحن المدفوع")}</th>
              <td>{moneyText(receipt.amount)}</td>
            </tr>
            {fees ? (
              <tr>
                <th>{t("الرسوم")}</th>
                <td>− {moneyText(receipt.fees)}</td>
              </tr>
            ) : null}
            {commission ? (
              <tr>
                <th>{t("العمولة")}</th>
                <td>− {moneyText(receipt.commission)}</td>
              </tr>
            ) : null}
            <tr className="pd-total">
              <th>{t("الصافي المضاف للمحفظة")}</th>
              <td>{moneyText(receipt.driver_wallet_credit)}</td>
            </tr>
            {reversed ? (
              <tr>
                <th>{t("عُكست في")}</th>
                <td>{whenText(receipt.reversed_at)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {reversed ? <p className="pd-note"><span>{t("تنبيه")}:</span> {t("هذه العملية معكوسة وأُعيد المبلغ إلى رصيد المتجر، ولا يُعتدّ بها كشحن.")}</p> : null}
      </section>

      <section className="pd-signs">
        <div>
          <span className="pd-line" />
          <p>{t("المشغّل")}</p>
          <strong>{receipt.operator.full_name ?? "—"}</strong>
        </div>
        <div>
          <span className="pd-line" />
          <p>{t("السائق")}</p>
          <strong>{receipt.driver.full_name ?? "—"}</strong>
        </div>
      </section>

      <footer className="pd-foot">
        <p>{t("صادر إلكترونياً من نظام Beroya On. الرصيد يُضاف لمحفظة السائق فور إتمام العملية ويظهر في التطبيق.")}</p>
        <p>{t("رقم الإيصال هو المرجع الرسمي للعملية. يُرجى الاحتفاظ بهذا الإيصال.")}</p>
      </footer>
    </article>,
    document.body,
  );
}
