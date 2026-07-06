"use client";

import { useTheme } from "@/shared/components/theme-provider";
import { useSiteProfile } from "@/shared/site/site-profile-context";

type AppLogoProps = {
  alt?: string;
  width: number;
  height: number;
  priority?: boolean;
  className?: string;
};

export function AppLogo({
  alt,
  width,
  height,
  priority,
  className,
}: AppLogoProps) {
  const { resolvedTheme } = useTheme();
  const { profile } = useSiteProfile();
  const src = resolvedTheme === "dark" ? profile.logoDarkURL || profile.logoURL : profile.logoURL;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- site logo may be configured as an arbitrary external URL.
    <img
      src={src}
      alt={alt ?? profile.name}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      className={className}
    />
  );
}
