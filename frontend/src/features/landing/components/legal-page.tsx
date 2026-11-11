import type { Locale } from "@/core/i18n/config";
import { getDictionary } from "@/core/i18n/dictionaries";

import { LegalDocument, type LegalDocBody } from "./legal-document";
import { legalPath, legalRelated, type LegalDocKey } from "./legal-related";

function asBody(doc: {
  title: string;
  effective: string;
  intro: string;
  sections: { title: string; body: string }[];
  steps?: { title: string; body: string }[];
  stepsTitle?: string;
  notice?: string;
}): LegalDocBody {
  return {
    title: doc.title,
    effective: doc.effective,
    intro: doc.intro,
    sections: doc.sections,
    steps: doc.steps,
    stepsTitle: doc.stepsTitle,
    notice: doc.notice,
  };
}

export function BilingualLegalPage({
  locale,
  docKey,
}: {
  locale: Locale;
  docKey: LegalDocKey;
}) {
  const ui = getDictionary(locale);
  const en = getDictionary("en");
  const ar = getDictionary("ar");

  return (
    <LegalDocument
      locale={locale}
      backLabel={ui.legal.back}
      themeLabel={ui.a11y.theme}
      langSwitchLabel={ui.language.label}
      langSwitchTitle={ui.language.title}
      tocLabel={ui.legal.toc}
      relatedLabel={ui.legal.related}
      versions={[
        { lang: "ar", label: "العربية", doc: asBody(ar.legal[docKey]) },
        { lang: "en", label: "English", doc: asBody(en.legal[docKey]) },
      ]}
      related={legalRelated(locale, ui, docKey)}
      path={legalPath(docKey)}
    />
  );
}
