export type SiteProfile = {
  name: string;
  shortName: string;
  description: string;
  logoURL: string;
  logoDarkURL: string;
  faviconURL: string;
  homeTitle: string;
  homeSubtitle: string;
  footerText: string;
  contactEmail: string;
  termsURL: string;
  privacyURL: string;
  agreement: {
    title: string;
    content: string;
  };
  terms: {
    title: string;
    content: string;
  };
  privacy: {
    title: string;
    content: string;
  };
};
