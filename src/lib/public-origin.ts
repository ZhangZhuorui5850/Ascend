type PublicOriginEnvironment = {
  APP_DOMAIN?: string;
};

export function getPublicRequestOrigin(
  request: Request,
  environment: PublicOriginEnvironment = { APP_DOMAIN: process.env.APP_DOMAIN },
): string {
  const configuredDomain = environment.APP_DOMAIN?.trim();
  if (configuredDomain) {
    const configuredUrl = /^https?:\/\//i.test(configuredDomain) ? configuredDomain : `https://${configuredDomain}`;
    return new URL(configuredUrl).origin;
  }

  const requestUrl = new URL(request.url);
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const host = forwardedHost || request.headers.get("host")?.trim();
  if (!host) return requestUrl.origin;

  const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : requestUrl.protocol.slice(0, -1);
  return new URL(`${protocol}://${host}`).origin;
}

function firstForwardedValue(value: string | null): string {
  return value?.split(",")[0]?.trim() || "";
}
