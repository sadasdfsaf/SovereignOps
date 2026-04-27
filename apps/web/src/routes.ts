export type RouteId =
  | "dashboard"
  | "tasks"
  | "docs"
  | "incidents"
  | "approvals"
  | "search"
  | "settings";

export interface RouteComponentModel {
  kind: "route-shell";
  routeId: RouteId;
  name: string;
  heading: string;
  summary: string;
  slots: readonly RouteShellSlot[];
}

export interface RouteShellSlot {
  id: string;
  label: string;
  intent: "overview" | "list" | "detail" | "action" | "empty";
}

export interface WebRoute {
  id: RouteId;
  path: `/${string}`;
  title: string;
  navLabel: string;
  component: RouteComponentModel;
  aliases?: readonly `/${string}`[];
}

export interface RouteMatch {
  route: WebRoute;
  path: string;
  canonicalPath: string;
  isAlias: boolean;
}

export const dashboardComponent: RouteComponentModel = createRouteComponent({
  routeId: "dashboard",
  name: "DashboardRoute",
  heading: "Workspace dashboard",
  summary: "Shows local workspace status, recent activity, and next actions.",
  slots: [
    { id: "status", label: "Workspace status", intent: "overview" },
    { id: "activity", label: "Recent activity", intent: "list" },
    { id: "next-actions", label: "Next actions", intent: "action" },
  ],
});

export const tasksComponent: RouteComponentModel = createRouteComponent({
  routeId: "tasks",
  name: "TasksRoute",
  heading: "Tasks",
  summary: "Organizes active work, ownership, due dates, and completion state.",
  slots: [
    { id: "filters", label: "Task filters", intent: "action" },
    { id: "task-list", label: "Task list", intent: "list" },
    { id: "task-detail", label: "Task detail", intent: "detail" },
  ],
});

export const docsComponent: RouteComponentModel = createRouteComponent({
  routeId: "docs",
  name: "DocsRoute",
  heading: "Docs",
  summary: "Keeps workspace notes, references, and decision records together.",
  slots: [
    { id: "library", label: "Document library", intent: "list" },
    { id: "reader", label: "Document reader", intent: "detail" },
    { id: "empty", label: "No document selected", intent: "empty" },
  ],
});

export const incidentsComponent: RouteComponentModel = createRouteComponent({
  routeId: "incidents",
  name: "IncidentsRoute",
  heading: "Incidents",
  summary: "Tracks operational issues, ownership, timelines, and recovery notes.",
  slots: [
    { id: "queue", label: "Incident queue", intent: "list" },
    { id: "timeline", label: "Incident timeline", intent: "detail" },
    { id: "new", label: "New incident", intent: "action" },
  ],
});

export const approvalsComponent: RouteComponentModel = createRouteComponent({
  routeId: "approvals",
  name: "ApprovalsRoute",
  heading: "Approvals",
  summary: "Surfaces requests that need a clear approve or decline decision.",
  slots: [
    { id: "pending", label: "Pending approvals", intent: "list" },
    { id: "decision", label: "Decision panel", intent: "action" },
    { id: "history", label: "Decision history", intent: "detail" },
  ],
});

export const searchComponent: RouteComponentModel = createRouteComponent({
  routeId: "search",
  name: "SearchRoute",
  heading: "Search",
  summary: "Finds tasks, docs, incidents, approvals, and workspace activity.",
  slots: [
    { id: "query", label: "Search query", intent: "action" },
    { id: "results", label: "Search results", intent: "list" },
    { id: "empty", label: "No results", intent: "empty" },
  ],
});

export const settingsComponent: RouteComponentModel = createRouteComponent({
  routeId: "settings",
  name: "SettingsRoute",
  heading: "Settings",
  summary: "Controls workspace preferences, local storage, and encryption mode.",
  slots: [
    { id: "workspace", label: "Workspace settings", intent: "overview" },
    { id: "encryption", label: "Encryption settings", intent: "detail" },
    { id: "storage", label: "Local storage", intent: "detail" },
  ],
});

export const webRoutes: readonly WebRoute[] = Object.freeze([
  {
    id: "dashboard",
    path: "/dashboard",
    title: "Dashboard",
    navLabel: "Dashboard",
    component: dashboardComponent,
    aliases: ["/"],
  },
  {
    id: "tasks",
    path: "/tasks",
    title: "Tasks",
    navLabel: "Tasks",
    component: tasksComponent,
  },
  {
    id: "docs",
    path: "/docs",
    title: "Docs",
    navLabel: "Docs",
    component: docsComponent,
  },
  {
    id: "incidents",
    path: "/incidents",
    title: "Incidents",
    navLabel: "Incidents",
    component: incidentsComponent,
  },
  {
    id: "approvals",
    path: "/approvals",
    title: "Approvals",
    navLabel: "Approvals",
    component: approvalsComponent,
  },
  {
    id: "search",
    path: "/search",
    title: "Search",
    navLabel: "Search",
    component: searchComponent,
  },
  {
    id: "settings",
    path: "/settings",
    title: "Settings",
    navLabel: "Settings",
    component: settingsComponent,
  },
]);

export const defaultRoute = webRoutes[0];

export function listRoutes(): readonly WebRoute[] {
  return webRoutes;
}

export function listNavigationRoutes(): readonly WebRoute[] {
  return webRoutes.filter((route) => route.id !== "search");
}

export function findRouteById(routeId: RouteId): WebRoute {
  const route = webRoutes.find((candidate) => candidate.id === routeId);
  if (!route) {
    throw new Error(`unknown route id: ${routeId}`);
  }
  return route;
}

export function matchRoutePath(path: string): RouteMatch | undefined {
  const normalizedPath = normalizeRoutePath(path);

  for (const route of webRoutes) {
    if (route.path === normalizedPath) {
      return {
        route,
        path: normalizedPath,
        canonicalPath: route.path,
        isAlias: false,
      };
    }

    if (route.aliases?.includes(normalizedPath as `/${string}`)) {
      return {
        route,
        path: normalizedPath,
        canonicalPath: route.path,
        isAlias: true,
      };
    }
  }

  return undefined;
}

export function resolveRoutePath(path: string): WebRoute {
  return matchRoutePath(path)?.route ?? defaultRoute;
}

export function normalizeRoutePath(path: string): string {
  const trimmed = path.trim();
  const withoutQuery = stripAfterFirst(stripAfterFirst(trimmed, "?"), "#");
  const withLeadingSlash = withoutQuery.startsWith("/")
    ? withoutQuery
    : `/${withoutQuery}`;
  const collapsed = withLeadingSlash.replace(/\/+/g, "/").toLowerCase();

  if (collapsed === "" || collapsed === "/") {
    return "/";
  }

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function createRouteComponent(
  component: Omit<RouteComponentModel, "kind">,
): RouteComponentModel {
  return Object.freeze({
    kind: "route-shell",
    ...component,
    slots: Object.freeze(component.slots.map((slot) => Object.freeze(slot))),
  });
}

function stripAfterFirst(value: string, marker: string): string {
  const markerIndex = value.indexOf(marker);
  return markerIndex === -1 ? value : value.slice(0, markerIndex);
}
