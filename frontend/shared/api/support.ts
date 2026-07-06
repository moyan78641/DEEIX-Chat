import { authedRequest } from "@/shared/api/authed-client";
import { apiRequest } from "@/shared/api/http-client";

export type TawkSettings = {
  enabled: boolean;
  propertyID: string;
  widgetID: string;
  secureModeConfigured: boolean;
  supportPageTitle: string;
  supportDescription: string;
  supportContactHint: string;
};

export type TawkVisitorProfile = {
  enabled: boolean;
  visitorID: string;
  name: string;
  email: string;
  secureHash: string;
  attributes: Record<string, string>;
};

export async function getTawkSettings(): Promise<TawkSettings> {
  return apiRequest<TawkSettings>("/api/v1/settings/tawk");
}

export async function getTawkVisitorProfile(accessToken: string): Promise<TawkVisitorProfile> {
  return authedRequest<TawkVisitorProfile>(
    "/api/v1/support/tawk/profile",
    { accessToken },
    true,
  );
}
