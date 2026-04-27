export interface RouteSummary {
  path: string;
  title: string;
}

export const bootstrapRoutes: RouteSummary[] = [
  { path: "/", title: "Workspace" },
  { path: "/audit", title: "Audit" },
  { path: "/plugins", title: "Plugins" },
  { path: "/sync", title: "Sync" },
];

export { InMemoryLocalStore, createInMemoryLocalStore } from "./localStore.ts";
export * from "./approvals.ts";
export * from "./automationSettings.ts";
export * from "./auditTimeline.ts";
export * from "./documents.ts";
export * from "./onboarding.ts";
export * from "./routes.ts";
export * from "./tasks.ts";
export type {
  BrowserLocalStore,
  LocalStoreCollection,
  LocalStoreEntry,
  LocalStoreJson,
  LocalStoreKey,
  LocalStoreListQuery,
  LocalStorePut,
  WorkspaceId,
} from "./localStore.ts";
