/** True when the template asks for the recipient name. */
export function hasNamePlaceholder(template: string) {
  return /\{name\}|\{الاسم\}|\{اسم\}/i.test(template);
}

/** Replace `{name}` / `{الاسم}` / `{اسم}` with the display name. */
export function fillName(template: string, name: string) {
  return template.replace(/\{name\}|\{الاسم\}|\{اسم\}/gi, name);
}

/**
 * Personalize birthday (or any) copy for one recipient.
 * If neither title nor body contains a name token, the name is prefixed onto the body.
 */
export function personalizeCopy(title: string, body: string, fullName: string | null | undefined) {
  const name = fullName?.trim() || 'عزيزي';
  const tagged = hasNamePlaceholder(title) || hasNamePlaceholder(body);
  if (tagged) {
    return {
      title: fillName(title, name).slice(0, 80),
      body: fillName(body, name).slice(0, 280),
    };
  }
  return {
    title: title.slice(0, 80),
    body: `${name}، ${body}`.slice(0, 280),
  };
}
