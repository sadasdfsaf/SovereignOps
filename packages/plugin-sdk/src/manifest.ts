export type JsonPrimitive = string | number | boolean | null;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export const PLUGIN_PERMISSION_ALLOWLIST = [
  "read_object",
  "write_object",
  "propose_agent_action",
  "manage_plugin",
  "sync_bundle",
] as const;

export type PluginPermission = (typeof PLUGIN_PERMISSION_ALLOWLIST)[number];

export interface PluginCapability {
  id: string;
  permission: PluginPermission;
  description: string;
}

export interface PluginTool {
  id: string;
  name: string;
  description: string;
  capability?: string;
  inputSchema?: JsonObject;
}

export interface PluginResource {
  id: string;
  name: string;
  description: string;
  uri: string;
  capability?: string;
}

export interface PluginPromptArgument {
  id: string;
  description: string;
  required?: boolean;
}

export interface PluginPrompt {
  id: string;
  name: string;
  description: string;
  capability?: string;
  arguments?: readonly PluginPromptArgument[];
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entrypoint: string;
  permissions?: readonly PluginPermission[];
  capabilities?: readonly PluginCapability[];
  tools?: readonly PluginTool[];
  resources?: readonly PluginResource[];
  prompts?: readonly PluginPrompt[];
  minimumHostVersion: string;
}

export interface NormalizedPluginCapability {
  id: string;
  permission: PluginPermission;
  description: string;
}

export interface NormalizedPluginTool {
  id: string;
  name: string;
  description: string;
  capability?: string;
  inputSchema?: JsonObject;
}

export interface NormalizedPluginResource {
  id: string;
  name: string;
  description: string;
  uri: string;
  capability?: string;
}

export interface NormalizedPluginPromptArgument {
  id: string;
  description: string;
  required: boolean;
}

export interface NormalizedPluginPrompt {
  id: string;
  name: string;
  description: string;
  capability?: string;
  arguments: readonly NormalizedPluginPromptArgument[];
}

export interface NormalizedPluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  entrypoint: string;
  permissions: readonly PluginPermission[];
  capabilities: readonly NormalizedPluginCapability[];
  tools: readonly NormalizedPluginTool[];
  resources: readonly NormalizedPluginResource[];
  prompts: readonly NormalizedPluginPrompt[];
  minimumHostVersion: string;
}

export interface ManifestValidationIssue {
  path: string;
  message: string;
}

export interface ManifestValidationSuccess {
  ok: true;
  issues: readonly [];
  value: NormalizedPluginManifest;
}

export interface ManifestValidationFailure {
  ok: false;
  issues: readonly ManifestValidationIssue[];
}

export type ManifestValidationResult = ManifestValidationSuccess | ManifestValidationFailure;

export interface PluginCapabilityChange {
  id: string;
  before: NormalizedPluginCapability;
  after: NormalizedPluginCapability;
  fields: readonly (keyof Omit<NormalizedPluginCapability, "id">)[];
}

export interface PluginCapabilityDiff {
  added: readonly NormalizedPluginCapability[];
  removed: readonly NormalizedPluginCapability[];
  changed: readonly PluginCapabilityChange[];
}

const PLUGIN_ID_PATTERN = /^plugin\.[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const COMPONENT_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const SEMVERISH_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const MANIFEST_FIELDS = new Set([
  "id",
  "name",
  "version",
  "description",
  "entrypoint",
  "permissions",
  "capabilities",
  "tools",
  "resources",
  "prompts",
  "minimumHostVersion",
]);

const CAPABILITY_FIELDS = new Set(["id", "permission", "description"]);
const TOOL_FIELDS = new Set(["id", "name", "description", "capability", "inputSchema"]);
const RESOURCE_FIELDS = new Set(["id", "name", "description", "uri", "capability"]);
const PROMPT_FIELDS = new Set(["id", "name", "description", "capability", "arguments"]);
const PROMPT_ARGUMENT_FIELDS = new Set(["id", "description", "required"]);

export class PluginManifestValidationError extends TypeError {
  readonly issues: readonly ManifestValidationIssue[];

  constructor(issues: readonly ManifestValidationIssue[]) {
    super(`Invalid plugin manifest: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "PluginManifestValidationError";
    this.issues = issues;
  }
}

export function validatePluginManifest(value: unknown): ManifestValidationResult {
  const issues: ManifestValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "must be an object" }],
    };
  }

  rejectUnknownFields(value, MANIFEST_FIELDS, "$", issues);
  validateRequiredString(value, "id", "$.id", issues, isPluginId, "must use plugin.<slug> format");
  validateRequiredString(value, "name", "$.name", issues);
  validateRequiredString(value, "description", "$.description", issues);
  validateRequiredString(value, "entrypoint", "$.entrypoint", issues, isSafeEntrypoint, "must be a relative file path");
  validateRequiredString(
    value,
    "version",
    "$.version",
    issues,
    isSemanticVersion,
    "must use semantic version format",
  );
  validateRequiredString(
    value,
    "minimumHostVersion",
    "$.minimumHostVersion",
    issues,
    isSemanticVersion,
    "must use semantic version format",
  );

  validatePermissions(value.permissions, "$.permissions", issues);
  const capabilityIds = validateCapabilities(value.capabilities, issues);
  validateTools(value.tools, capabilityIds, issues);
  validateResources(value.resources, capabilityIds, issues);
  validatePrompts(value.prompts, capabilityIds, issues);

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    issues: [],
    value: normalizeManifestUnchecked(value as unknown as PluginManifest),
  };
}

export function assertPluginManifest(value: unknown): NormalizedPluginManifest {
  const result = validatePluginManifest(value);
  if (!result.ok) {
    throw new PluginManifestValidationError(result.issues);
  }

  return result.value;
}

export function normalizePluginManifest(manifest: PluginManifest): NormalizedPluginManifest {
  return assertPluginManifest(manifest);
}

export function diffPluginManifestCapabilities(
  beforeManifest: PluginManifest,
  afterManifest: PluginManifest,
): PluginCapabilityDiff {
  const before = normalizePluginManifest(beforeManifest).capabilities;
  const after = normalizePluginManifest(afterManifest).capabilities;
  const beforeById = mapCapabilitiesById(before);
  const afterById = mapCapabilitiesById(after);

  const added = after.filter((capability) => !beforeById.has(capability.id));
  const removed = before.filter((capability) => !afterById.has(capability.id));
  const changed = after.flatMap((afterCapability) => {
    const beforeCapability = beforeById.get(afterCapability.id);
    if (!beforeCapability) {
      return [];
    }

    const fields = changedCapabilityFields(beforeCapability, afterCapability);
    if (fields.length === 0) {
      return [];
    }

    return [{
      id: afterCapability.id,
      before: beforeCapability,
      after: afterCapability,
      fields,
    }];
  });

  return { added, removed, changed };
}

export function isPluginId(value: unknown): value is string {
  return typeof value === "string" && PLUGIN_ID_PATTERN.test(value.trim());
}

export function isManifestComponentId(value: unknown): value is string {
  return typeof value === "string" && COMPONENT_ID_PATTERN.test(value.trim());
}

export function isSemanticVersion(value: unknown): value is string {
  return typeof value === "string" && SEMVERISH_PATTERN.test(value.trim());
}

export function isPluginPermission(value: unknown): value is PluginPermission {
  return (
    typeof value === "string" &&
    (PLUGIN_PERMISSION_ALLOWLIST as readonly string[]).includes(value.trim())
  );
}

function validatePermissions(
  value: unknown,
  path: string,
  issues: ManifestValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }

  const seen = new Set<string>();
  value.forEach((permission, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isNonEmptyString(permission)) {
      issues.push({ path: itemPath, message: "must be a non-empty string" });
      return;
    }

    const normalizedPermission = permission.trim();
    if (!isPluginPermission(normalizedPermission)) {
      issues.push({ path: itemPath, message: "must be an allowed permission" });
      return;
    }

    if (seen.has(normalizedPermission)) {
      issues.push({ path: itemPath, message: `duplicates permission ${normalizedPermission}` });
    }
    seen.add(normalizedPermission);
  });
}

function validateCapabilities(
  value: unknown,
  issues: ManifestValidationIssue[],
): Set<string> {
  const capabilityIds = new Set<string>();
  if (value === undefined) {
    return capabilityIds;
  }

  if (!Array.isArray(value)) {
    issues.push({ path: "$.capabilities", message: "must be an array" });
    return capabilityIds;
  }

  value.forEach((capability, index) => {
    const path = `$.capabilities[${index}]`;
    if (!isRecord(capability)) {
      issues.push({ path, message: "must be an object" });
      return;
    }

    rejectUnknownFields(capability, CAPABILITY_FIELDS, path, issues);
    const id = validateRequiredString(
      capability,
      "id",
      `${path}.id`,
      issues,
      isManifestComponentId,
      "must use a stable component id",
    );
    validateRequiredString(capability, "description", `${path}.description`, issues);
    validateRequiredString(
      capability,
      "permission",
      `${path}.permission`,
      issues,
      isPluginPermission,
      "must be an allowed permission",
    );

    if (!id) {
      return;
    }
    if (capabilityIds.has(id)) {
      issues.push({ path: `${path}.id`, message: `duplicates capability id ${id}` });
    }
    capabilityIds.add(id);
  });

  return capabilityIds;
}

function validateTools(
  value: unknown,
  capabilityIds: ReadonlySet<string>,
  issues: ManifestValidationIssue[],
): void {
  validateManifestItems(value, "$.tools", TOOL_FIELDS, issues, (tool, path) => {
    validateRequiredString(tool, "id", `${path}.id`, issues, isManifestComponentId, "must use a stable component id");
    validateRequiredString(tool, "name", `${path}.name`, issues);
    validateRequiredString(tool, "description", `${path}.description`, issues);
    validateCapabilityReference(tool.capability, `${path}.capability`, capabilityIds, issues);

    if (Object.hasOwn(tool, "inputSchema") && !isJsonObject(tool.inputSchema)) {
      issues.push({ path: `${path}.inputSchema`, message: "must be a JSON object" });
    }
  });
}

function validateResources(
  value: unknown,
  capabilityIds: ReadonlySet<string>,
  issues: ManifestValidationIssue[],
): void {
  validateManifestItems(value, "$.resources", RESOURCE_FIELDS, issues, (resource, path) => {
    validateRequiredString(resource, "id", `${path}.id`, issues, isManifestComponentId, "must use a stable component id");
    validateRequiredString(resource, "name", `${path}.name`, issues);
    validateRequiredString(resource, "description", `${path}.description`, issues);
    validateRequiredString(resource, "uri", `${path}.uri`, issues);
    validateCapabilityReference(resource.capability, `${path}.capability`, capabilityIds, issues);
  });
}

function validatePrompts(
  value: unknown,
  capabilityIds: ReadonlySet<string>,
  issues: ManifestValidationIssue[],
): void {
  validateManifestItems(value, "$.prompts", PROMPT_FIELDS, issues, (prompt, path) => {
    validateRequiredString(prompt, "id", `${path}.id`, issues, isManifestComponentId, "must use a stable component id");
    validateRequiredString(prompt, "name", `${path}.name`, issues);
    validateRequiredString(prompt, "description", `${path}.description`, issues);
    validateCapabilityReference(prompt.capability, `${path}.capability`, capabilityIds, issues);
    validatePromptArguments(prompt.arguments, `${path}.arguments`, issues);
  });
}

function validateManifestItems(
  value: unknown,
  path: string,
  allowedFields: ReadonlySet<string>,
  issues: ManifestValidationIssue[],
  validateItem: (item: Record<string, unknown>, path: string) => void,
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }

  const seen = new Set<string>();
  value.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(item)) {
      issues.push({ path: itemPath, message: "must be an object" });
      return;
    }

    rejectUnknownFields(item, allowedFields, itemPath, issues);
    validateItem(item, itemPath);

    if (!isNonEmptyString(item.id) || !isManifestComponentId(item.id)) {
      return;
    }

    const id = item.id.trim();
    if (seen.has(id)) {
      issues.push({ path: `${itemPath}.id`, message: `duplicates id ${id}` });
    }
    seen.add(id);
  });
}

function validatePromptArguments(
  value: unknown,
  path: string,
  issues: ManifestValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!Array.isArray(value)) {
    issues.push({ path, message: "must be an array" });
    return;
  }

  const seen = new Set<string>();
  value.forEach((argument, index) => {
    const argumentPath = `${path}[${index}]`;
    if (!isRecord(argument)) {
      issues.push({ path: argumentPath, message: "must be an object" });
      return;
    }

    rejectUnknownFields(argument, PROMPT_ARGUMENT_FIELDS, argumentPath, issues);
    const id = validateRequiredString(
      argument,
      "id",
      `${argumentPath}.id`,
      issues,
      isManifestComponentId,
      "must use a stable component id",
    );
    validateRequiredString(argument, "description", `${argumentPath}.description`, issues);
    if (Object.hasOwn(argument, "required") && typeof argument.required !== "boolean") {
      issues.push({ path: `${argumentPath}.required`, message: "must be a boolean" });
    }

    if (!id) {
      return;
    }
    if (seen.has(id)) {
      issues.push({ path: `${argumentPath}.id`, message: `duplicates argument id ${id}` });
    }
    seen.add(id);
  });
}

function validateCapabilityReference(
  value: unknown,
  path: string,
  capabilityIds: ReadonlySet<string>,
  issues: ManifestValidationIssue[],
): void {
  if (value === undefined) {
    return;
  }

  if (!isNonEmptyString(value)) {
    issues.push({ path, message: "must be a non-empty string" });
    return;
  }

  const capabilityId = value.trim();
  if (!isManifestComponentId(capabilityId)) {
    issues.push({ path, message: "must use a stable component id" });
    return;
  }

  if (!capabilityIds.has(capabilityId)) {
    issues.push({ path, message: `references unknown capability ${capabilityId}` });
  }
}

function validateRequiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  issues: ManifestValidationIssue[],
  predicate?: (value: unknown) => boolean,
  predicateMessage?: string,
): string | undefined {
  if (!Object.hasOwn(record, key)) {
    issues.push({ path, message: "is required" });
    return undefined;
  }

  const value = record[key];
  if (!isNonEmptyString(value)) {
    issues.push({ path, message: "must be a non-empty string" });
    return undefined;
  }

  const normalizedValue = value.trim();
  if (predicate && !predicate(normalizedValue)) {
    issues.push({ path, message: predicateMessage ?? "is invalid" });
    return undefined;
  }

  return normalizedValue;
}

function rejectUnknownFields(
  record: Record<string, unknown>,
  allowedFields: ReadonlySet<string>,
  path: string,
  issues: ManifestValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedFields.has(key)) {
      issues.push({ path: `${path}.${key}`, message: "is not allowed" });
    }
  }
}

function normalizeManifestUnchecked(manifest: PluginManifest): NormalizedPluginManifest {
  const capabilities = normalizeCapabilities(manifest.capabilities ?? []);
  const permissions = sortUniquePermissions([
    ...(manifest.permissions ?? []).map((permission) => permission.trim() as PluginPermission),
    ...capabilities.map((capability) => capability.permission),
  ]);

  return {
    id: manifest.id.trim(),
    name: manifest.name.trim(),
    version: manifest.version.trim(),
    description: manifest.description.trim(),
    entrypoint: normalizeEntrypoint(manifest.entrypoint),
    permissions,
    capabilities,
    tools: normalizeTools(manifest.tools ?? []),
    resources: normalizeResources(manifest.resources ?? []),
    prompts: normalizePrompts(manifest.prompts ?? []),
    minimumHostVersion: manifest.minimumHostVersion.trim(),
  };
}

function normalizeCapabilities(
  capabilities: readonly PluginCapability[],
): readonly NormalizedPluginCapability[] {
  return capabilities
    .map((capability) => ({
      id: capability.id.trim(),
      permission: capability.permission.trim() as PluginPermission,
      description: capability.description.trim(),
    }))
    .sort(compareById);
}

function normalizeTools(tools: readonly PluginTool[]): readonly NormalizedPluginTool[] {
  return tools
    .map((tool) => optionalFields({
      id: tool.id.trim(),
      name: tool.name.trim(),
      description: tool.description.trim(),
      capability: tool.capability?.trim(),
      inputSchema: tool.inputSchema ? sortJsonValue(tool.inputSchema) as JsonObject : undefined,
    }))
    .sort(compareById);
}

function normalizeResources(
  resources: readonly PluginResource[],
): readonly NormalizedPluginResource[] {
  return resources
    .map((resource) => optionalFields({
      id: resource.id.trim(),
      name: resource.name.trim(),
      description: resource.description.trim(),
      uri: resource.uri.trim(),
      capability: resource.capability?.trim(),
    }))
    .sort(compareById);
}

function normalizePrompts(prompts: readonly PluginPrompt[]): readonly NormalizedPluginPrompt[] {
  return prompts
    .map((prompt) => optionalFields({
      id: prompt.id.trim(),
      name: prompt.name.trim(),
      description: prompt.description.trim(),
      capability: prompt.capability?.trim(),
      arguments: normalizePromptArguments(prompt.arguments ?? []),
    }))
    .sort(compareById);
}

function normalizePromptArguments(
  args: readonly PluginPromptArgument[],
): readonly NormalizedPluginPromptArgument[] {
  return args
    .map((arg) => ({
      id: arg.id.trim(),
      description: arg.description.trim(),
      required: arg.required ?? false,
    }))
    .sort(compareById);
}

function sortUniquePermissions(values: readonly PluginPermission[]): readonly PluginPermission[] {
  return [...new Set(values)].sort();
}

function normalizeEntrypoint(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".")
    .join("/");
}

function isSafeEntrypoint(value: unknown): value is string {
  if (!isNonEmptyString(value)) {
    return false;
  }

  const normalized = value.trim().replace(/\\/g, "/");
  if (
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized)
  ) {
    return false;
  }

  const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  return segments.length > 0 && !segments.includes("..");
}

function mapCapabilitiesById(
  capabilities: readonly NormalizedPluginCapability[],
): Map<string, NormalizedPluginCapability> {
  return new Map(capabilities.map((capability) => [capability.id, capability]));
}

function changedCapabilityFields(
  before: NormalizedPluginCapability,
  after: NormalizedPluginCapability,
): readonly (keyof Omit<NormalizedPluginCapability, "id">)[] {
  const fields: (keyof Omit<NormalizedPluginCapability, "id">)[] = [];
  if (before.permission !== after.permission) {
    fields.push("permission");
  }
  if (before.description !== after.description) {
    fields.push("description");
  }

  return fields;
}

function compareById<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id);
}

function optionalFields<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as T;
}

function sortJsonValue(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => sortJsonValue(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJsonValue(value[key] as JsonValue)]),
    );
  }

  return value;
}

function isJsonObject(value: unknown): value is JsonObject {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return typeof value !== "number" || Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isJsonObject(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
