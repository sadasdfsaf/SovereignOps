export interface SyncBundleDescriptor {
  workspaceId: string;
  bundleId: string;
  encryptedBytes: number;
  cursor: string;
}

export function isOpaqueBundle(bundle: SyncBundleDescriptor): boolean {
  return bundle.encryptedBytes > 0 && bundle.bundleId.startsWith("bundle_");
}

export * from "./bundles.ts";
export * from "./cursors.ts";
