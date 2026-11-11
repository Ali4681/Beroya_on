/** ERP label when the customer account was soft-deleted (Ticket §27). */
export const DELETED_CUSTOMER_LABEL = 'حساب محذوف';

export function erpCustomerDisplayName(user: {
  full_name?: string | null;
  deleted_at?: Date | string | null;
}): string {
  if (user.deleted_at) return DELETED_CUSTOMER_LABEL;
  return user.full_name?.trim() || DELETED_CUSTOMER_LABEL;
}
