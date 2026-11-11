import type { CSSProperties } from "react";

import type { Dictionary } from "@/core/i18n/dictionaries";
import { cx } from "@/shared/lib/cx";

export type StampId = keyof Dictionary["stampNames"];

type StampStyle = {
  image: string;
};

export const stampCatalog: Record<StampId, StampStyle> = {
  firstRide: { image: "/stamp/ختم بيرويا للرحلة الأولى.png" },
  tenRides: { image: "/stamp/ختم رحلات 10 الذهبي الشفاف.png" },
  thirtyRides: { image: "/stamp/ختم جواز سفر رحلة 30 الفيروزي.png" },
  seventyFiveRides: { image: "/stamp/ختم رحلة 75 المرجاني.png" },
  newYear: { image: "/stamp/ختم رأس السنة الأحمر الشفاف.png" },
  hijriNewYear: { image: "/stamp/ختم أخضر شفاف لرأس السنة الهجرية.png" },
  ramadan: { image: "/stamp/ختم رمضان تركوازي بتصميم بيضاوي.png" },
  eid: { image: "/stamp/ختم عيد الفطر المرجاني الشفاف.png" },
  eidAdha: { image: "/stamp/ختم ذهبي لعيد الأضحى.png" },
  aleppo: { image: "/stamp/ختم برويا لمعْلم أثري سوري.png" },
  syria: { image: "/stamp/طابع جواز سفر سداسي بعلم سوري.png" },
  anniversary: { image: "/stamp/طابع_بيرويا_الفيروزي_بخلفية_شفافة.png" },
  vip: { image: "/stamp/ختم بيرويا الذهبي الاستثنائي.png" },
  companion: { image: "/stamp/ختم رفيق بيرويا الذهبي.png" },
  airport: { image: "/stamp/ختم بيرويا الفيروزي لرحلة المطار.png" },
  intercity: { image: "/stamp/ختم بيرويا للسفر بين المحافظات.png" },
  winter: { image: "/stamp/ختم جواز بيرويا الشتوي الفيروزي.png" },
  autumn: { image: "/stamp/ختم جواز سفر الخريف النحاسي.png" },
  spring: { image: "/stamp/ختم جواز سفر ربيعي باللون الأخضر.png" },
  summer: { image: "/stamp/ختم جواز سفر صيفي ذهبي سداسي.png" },
  turquoise: { image: "/stamp/ختم جواز سفر فيروزي شفاف.png" },
  birthday: { image: "/stamp/ختم عيد ميلاد وردي شفاف.png" },
  teachersDay: { image: "/stamp/ختم يوم المعلم الذهبي الشفاف.png" },
  mothersDay: { image: "/stamp/ختم_عيد_الأم_المرجاني_بخلفية_شفافة.png" },
  valentine: { image: "/stamp/طابع عيد الحب البيضاوي المرجاني.png" },
};

export function isStampId(value: string): value is StampId {
  return Object.hasOwn(stampCatalog, value);
}

type CatalogStampProps = {
  id: StampId;
  names: Dictionary["stampNames"];
  className?: string;
  style?: CSSProperties;
  texture?: boolean;
};

export function CatalogStamp({ id, names, className, style }: CatalogStampProps) {
  const { image } = stampCatalog[id];

  return (
    <img
      src={encodeURI(image)}
      alt={names[id]}
      draggable={false}
      className={cx("block h-auto max-w-full bg-transparent object-contain select-none", !className?.includes("w-") && "w-full", className)}
      style={style}
    />
  );
}
