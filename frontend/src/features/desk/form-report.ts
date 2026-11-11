const GO_FAILURE = Symbol("go.failure");

export type GoFailure = { readonly [GO_FAILURE]: string; readonly fields: Record<string, string> };

export function isGoFailure(value: unknown): value is GoFailure {
  return !!value && typeof value === "object" && GO_FAILURE in value;
}

export function goFailureMessage(value: GoFailure) {
  return value[GO_FAILURE];
}

export function goFailureFields(value: GoFailure) {
  return value.fields;
}

export function goFailure(message: string, fields: Record<string, string> = {}) {
  noteFormFailure(fields, message);
  return { [GO_FAILURE]: message, fields };
}

export type FormReport = {
  fields: Record<string, string>;
  message: string;
  failed: boolean;
  succeeded: boolean;
};

const stack: FormReport[] = [];

export function beginFormReport() {
  const report: FormReport = { fields: {}, message: "", failed: false, succeeded: false };
  stack.push(report);
  return report;
}

export function endFormReport() {
  stack.pop();
}

export function noteFormFailure(fields: Record<string, string>, message: string) {
  const current = stack.at(-1);
  if (!current) return;
  current.failed = true;
  if (message) current.message = message;
  Object.assign(current.fields, fields);
}

export function noteFormSuccess() {
  const current = stack.at(-1);
  if (current) current.succeeded = true;
}
