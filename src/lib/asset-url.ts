const PRIVATE_ASSET_CACHE_EPOCH = "2";

/** Bypass private-asset HTTP cache entries created before responses became no-store. */
export function assetFileUrl(assetId: number | string): string {
  return `/api/assets/${assetId}/file?v=${PRIVATE_ASSET_CACHE_EPOCH}`;
}
