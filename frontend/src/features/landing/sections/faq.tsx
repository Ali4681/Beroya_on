import { Headset, Mail } from "lucide";

import { Icon } from "@/shared/ui/icon";

import { FaqAccordion } from "../client/faq-accordion";
import { SupportContactActions } from "../client/support-contact-actions";
import { buttonClass } from "../components/button-link";
import { Section } from "../components/section";
import { SectionHeading } from "../components/section-heading";
import type { SectionProps } from "../types";

function faqJsonLd(items: { q: string; a: string }[]) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };

  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function ContactCard({ dict, support }: SectionProps) {
  const { faq, common, footer } = dict;
  const email = support.email.trim();

  return (
    <div data-reveal className="mt-10 rounded-[26px] border border-line bg-canvas p-6 sm:p-7">
      <span className="grid size-12 place-items-center rounded-2xl bg-brand text-ink">
        <Icon node={Headset} size={22} />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-heading">{faq.contactTitle}</h3>
      <p className="mt-1.5 text-[15px] leading-7 text-muted">{faq.contactBody}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <SupportContactActions
          support={support}
          label={footer.columns.support}
          tone="faq"
          labels={{
            title: footer.columns.chooseTitle,
            call: footer.columns.call,
            whatsapp: footer.columns.whatsapp,
            soon: common.soon,
          }}
        />
        {email ? (
          <a href={`mailto:${email}`} className={buttonClass("inverse", "md")}>
            <Icon node={Mail} size={17} />
            {email}
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function Faq(props: SectionProps) {
  const { faq } = props.dict;

  return (
    <Section id="faq">
      <div className="shell grid gap-12 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start lg:gap-16">
        <div className="lg:sticky lg:top-32">
          <SectionHeading eyebrow={faq.eyebrow} title={faq.title} description={faq.description} />
          <ContactCard {...props} />
        </div>
        <div data-reveal>
          <FaqAccordion items={faq.items} />
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqJsonLd(faq.items) }} />
    </Section>
  );
}
