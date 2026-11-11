type CategoryStyle = {
  image: string;
  glow: string;
};

export const categoryStyles: Record<string, CategoryStyle> = {
  daily: { image: "/cars/يومي.jpg", glow: "var(--teal)" },
  vip: { image: "/cars/VIP.jpg", glow: "var(--brand-strong)" },
  family: { image: "/cars/عائلي.jpg", glow: "var(--success)" },
  women: { image: "/cars/سيدات.jpg", glow: "var(--brand)" },
  xl: { image: "/cars/مجموعات كبيرة.jpg", glow: "var(--warning)" },
  taxi: { image: "/cars/تكسي.jpg", glow: "#f5c542" },
};

export function categoryStyle(id: string): CategoryStyle {
  return categoryStyles[id] ?? categoryStyles.daily;
}
