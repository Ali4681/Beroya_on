import { z } from "zod";

const latLngSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const publicTrackSchema = z.object({
  status: z.string(),
  passenger_name: z.string().nullable().optional(),
  driver: z
    .object({
      name: z.string().nullable(),
      avatar_url: z.string().nullable(),
    })
    .nullable(),
  vehicle: z
    .object({
      plate: z.string().nullable().optional(),
      make: z.string().nullable().optional(),
      model: z.string().nullable().optional(),
      color: z.string().nullable().optional(),
    })
    .nullable(),
  driver_location: latLngSchema.nullable().optional(),
  driver_eta_sec: z.number().nullable().optional(),
  pickup: z
    .object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().nullable().optional(),
    })
    .optional(),
  destination: z
    .object({
      lat: z.number(),
      lng: z.number(),
      address: z.string().nullable().optional(),
    })
    .optional(),
});

export type PublicTrack = z.infer<typeof publicTrackSchema>;

export type TrackViewState =
  | { kind: "loading" }
  | { kind: "live"; data: PublicTrack }
  | { kind: "ended" }
  | { kind: "invalid" };
