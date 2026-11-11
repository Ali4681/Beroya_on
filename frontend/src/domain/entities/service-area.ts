export type ServiceAreaStatus = "active" | "coming_soon";

export type LocalizedText = Readonly<{ ar: string; en: string }>;

export type ServiceArea = {
  id: string;
  name: LocalizedText;
  status: ServiceAreaStatus;
  coordinates: { lat: number; lng: number };
};
