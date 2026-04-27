import {
  AuditExportError,
  createAuditExportPackage,
} from "../../../packages/audit-export/src/index.ts";
import type {
  AuditExportOptions,
  AuditExportPackage,
} from "../../../packages/audit-export/src/index.ts";
import type {
  ApiResponse,
  ApiRoute,
  ApiRouter,
} from "./router.ts";
import { jsonError, jsonResponse } from "./router.ts";

export interface AuditExportRoutesOptions {
  basePath?: string;
}

export interface AuditExportContentResponse {
  kind: "audit-export.content";
  format: "jsonl" | "csv";
  mediaType: string;
  content: string;
  fingerprint: string;
  exportId: string;
  createdAt: string;
  manifest: AuditExportPackage["manifest"];
}

export type AuditExportRouteResponse =
  | AuditExportContentResponse
  | AuditExportPackage;

type AuditExportFormat = "jsonl" | "csv" | "package";

interface ParsedAuditExportRequest {
  events: readonly unknown[];
  options: AuditExportOptions;
}

export function createAuditExportRoutes(
  options: AuditExportRoutesOptions = {},
): readonly ApiRoute[] {
  const basePath = normalizeBasePath(options.basePath ?? "/v1");

  return [
    createExportRoute("jsonl", joinPath(basePath, "/audit/export/jsonl")),
    createExportRoute("csv", joinPath(basePath, "/audit/export/csv")),
    createExportRoute("package", joinPath(basePath, "/audit/export/package")),
  ];
}

export function mountAuditExportRoutes(
  router: ApiRouter,
  options: AuditExportRoutesOptions = {},
): ApiRouter {
  for (const route of createAuditExportRoutes(options)) {
    router.register(route);
  }

  return router;
}

function createExportRoute(format: AuditExportFormat, path: string): ApiRoute {
  return {
    method: "POST",
    path,
    description: `Exports audit events as ${format}.`,
    handler: ({ request }) => {
      const body = parseAuditExportRequest(request.body);
      if (!body.ok) {
        return body.error;
      }

      try {
        return jsonResponse(200, buildExportResponse(format, body.value));
      } catch (error) {
        return caughtAuditExportError(error);
      }
    },
  };
}

function buildExportResponse(
  format: AuditExportFormat,
  request: ParsedAuditExportRequest,
): AuditExportRouteResponse {
  const exportPackage = createAuditExportPackage(request.events, request.options);
  if (format === "package") {
    return exportPackage;
  }

  const descriptor = exportPackage.manifest[format];
  return {
    kind: "audit-export.content",
    format,
    mediaType: descriptor.mediaType,
    content: exportPackage[format],
    fingerprint: descriptor.fingerprint,
    exportId: exportPackage.manifest.exportId,
    createdAt: exportPackage.manifest.createdAt,
    manifest: exportPackage.manifest,
  };
}

function parseAuditExportRequest(
  body: unknown,
): { ok: true; value: ParsedAuditExportRequest } | { ok: false; error: ApiResponse } {
  if (!isRecord(body)) {
    return {
      ok: false,
      error: validationError("Request body must be an object.", { path: "body" }),
    };
  }

  if (!Array.isArray(body.events)) {
    return {
      ok: false,
      error: validationError("Audit export requires an events array.", { path: "body.events" }),
    };
  }

  if (body.filters !== undefined && !isRecord(body.filters)) {
    return {
      ok: false,
      error: validationError("Audit export filters must be an object.", { path: "body.filters" }),
    };
  }

  if (body.createdAt !== undefined && typeof body.createdAt !== "string") {
    return {
      ok: false,
      error: validationError("Audit export createdAt must be a string.", { path: "body.createdAt" }),
    };
  }

  if (body.exportId !== undefined && typeof body.exportId !== "string") {
    return {
      ok: false,
      error: validationError("Audit export exportId must be a string.", { path: "body.exportId" }),
    };
  }

  return {
    ok: true,
    value: {
      events: [...body.events],
      options: {
        createdAt: body.createdAt,
        exportId: body.exportId,
        filters: body.filters,
      },
    },
  };
}

function caughtAuditExportError(error: unknown): ApiResponse {
  if (error instanceof AuditExportError) {
    return jsonError(400, error.code, error.message, error.details);
  }

  return jsonError(500, "AUDIT_EXPORT_FAILED", "Audit export failed.");
}

function validationError(
  message: string,
  details: Readonly<Record<string, unknown>>,
): ApiResponse {
  return jsonError(400, "validation_failed", message, details);
}

function normalizeBasePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0 || trimmed === "/") {
    return "";
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const collapsed = withSlash.replace(/\/+/g, "/");

  return collapsed.endsWith("/") ? collapsed.slice(0, -1) : collapsed;
}

function joinPath(basePath: string, suffix: string): string {
  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `${basePath}${normalizedSuffix}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
