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

