import { publicEnv } from "@/core/config/public-env";

type ExternalLink = string | null;

type SiteLinks = {
  appStore: ExternalLink;
  googlePlay: ExternalLink;
  driverSignup: ExternalLink;
  supportEmail: ExternalLink;
  supportPhone: ExternalLink;
  instagram: ExternalLink;
  facebook: ExternalLink;
  privacy: ExternalLink;
  terms: ExternalLink;
  accountDeletion: ExternalLink;
  guidelines: ExternalLink;
};

export const site = {
  name: publicEnv.appName,
  url: publicEnv.siteUrl,
  links: {
    appStore: null,
    googlePlay: null,
    driverSignup: null,
    supportEmail: null,
    supportPhone: null,
    instagram: null,
    facebook: null,
    privacy: "/privacy",
    terms: "/terms",
    accountDeletion: "/account-deletion",
    guidelines: "/guidelines",
  } satisfies SiteLinks as SiteLinks,
};

export type LegalLinkKey = "privacy" | "terms" | "accountDeletion" | "guidelines";
