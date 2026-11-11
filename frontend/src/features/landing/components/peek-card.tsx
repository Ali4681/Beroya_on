import type { IconNode } from "lucide";
import type { ReactNode } from "react";

import { delay } from "@/shared/lib/css-vars";
import { cx } from "@/shared/lib/cx";
import { Icon } from "@/shared/ui/icon";

type PeekCardProps = {
  tag: string;
  icon: IconNode;
  title: string;
  body: string;
  phone: ReactNode;
  className: string;
  tagClass: string;
  revealDelay?: number;
  children?: ReactNode;
};

// A tall card whose phone mockup peeks out of the bottom edge.
export function PeekCard({ tag, icon, title, body, phone, className, tagClass, revealDelay = 0, children }: PeekCardProps) {
  return (
    <article
      data-reveal
      style={delay(revealDelay)}
      className={cx("group relative flex flex-col overflow-hidden rounded-[32px] border border-line px-7 pt-8 sm:px-10 sm:pt-10", className)}
    >
      <span className={cx("inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-[13px] font-semibold", tagClass)}>
        <Icon node={icon} size={15} />
        {tag}
      </span>
      <h3 className="mt-5 text-[1.75rem] leading-tight font-semibold text-balance text-heading sm:text-[2rem]">{title}</h3>
      <p className="mt-3 max-w-md text-base leading-8 text-muted">{body}</p>
      {children}
      <div className="relative mt-10 flex justify-center transition duration-700 ease-out-soft [--phone-zoom:0.82] group-hover:-translate-y-3 sm:[--phone-zoom:0.9]">
        {phone}
      </div>
    </article>
  );
}
