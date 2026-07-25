export function readInviteUrl(value: string): {
  capability: string | null;
  sanitizedPath: string;
} {
  const url = new URL(value);
  const fragmentText = url.hash.startsWith("#") ? url.hash.slice(1) : "";
  const fragmentParams = new URLSearchParams(fragmentText);
  const fragmentHasInvite = fragmentParams.has("invite");
  const fragmentCapability = fragmentHasInvite
    ? fragmentParams.get("invite")
    : null;
  const queryCapability = url.searchParams.get("invite");
  const capability = fragmentCapability ?? queryCapability;

  url.searchParams.delete("invite");
  if (fragmentHasInvite) {
    fragmentParams.delete("invite");
    url.hash = fragmentParams.size > 0 ? `#${fragmentParams.toString()}` : "";
  }

  return {
    capability,
    sanitizedPath: `${url.pathname}${url.search}${url.hash}`,
  };
}
