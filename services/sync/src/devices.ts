export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult<TValue = unknown> {
  ok: boolean;
  issues: ValidationIssue[];
  value?: TValue;
}

export const DEVICE_STATUSES = ["active", "suspended", "removed"] as const;

export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export interface SyncDeviceEnrollment {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  publicKeyRef: string;
  displayName: string;
  registeredAt: string;
  lastSeenAt: string;
  status: DeviceStatus;
}

export interface DeviceEnrollmentInput {
  workspaceId: string;
  deviceId: string;
  publicKeyRef: string;
  displayName: string;
  registeredAt: string;
  lastSeenAt?: string;
}

export interface ValidatedDeviceEnrollmentInput {
  workspaceId: `wsp_${string}`;
  deviceId: `dev_${string}`;
  publicKeyRef: string;
  displayName: string;
  registeredAt: string;
  lastSeenAt: string;
}

const WORKSPACE_ID_PATTERN = /^wsp_[A-Za-z0-9_-]{1,88}$/;
const DEVICE_ID_PATTERN = /^dev_[A-Za-z0-9_-]{1,88}$/;

export function validateDeviceEnrollmentInput(
  value: unknown,
): ValidationResult<ValidatedDeviceEnrollmentInput> {
  const issues: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ path: "$", message: "device enrollment input must be an object" }],
    };
  }

  requireOnlyKeys(
    value,
    ["workspaceId", "deviceId", "publicKeyRef", "displayName", "registeredAt", "lastSeenAt"],
    "$",
    issues,
  );
  requireWorkspaceId(value.workspaceId, "workspaceId", issues);
  requireDeviceId(value.deviceId, "deviceId", issues);
  requireNonEmptyString(value.publicKeyRef, "publicKeyRef", issues);
  requireNonEmptyString(value.displayName, "displayName", issues);

  const registeredAtMs = parseTimestamp(value.registeredAt, "registeredAt", issues);
  const lastSeenAt = value.lastSeenAt ?? value.registeredAt;
  const lastSeenAtMs = parseTimestamp(lastSeenAt, "lastSeenAt", issues);

  if (
    registeredAtMs !== undefined &&
    lastSeenAtMs !== undefined &&
    lastSeenAtMs < registeredAtMs
  ) {
    issues.push({ path: "lastSeenAt", message: "lastSeenAt cannot be earlier than registeredAt" });
  }

  return issues.length === 0
    ? {
        ok: true,
        issues,
        value: {
          workspaceId: value.workspaceId as `wsp_${string}`,
          deviceId: value.deviceId as `dev_${string}`,
          publicKeyRef: (value.publicKeyRef as string).trim(),
          displayName: (value.displayName as string).trim(),
          registeredAt: value.registeredAt as string,
          lastSeenAt: lastSeenAt as string,
        },
      }
    : { ok: false, issues };
}

export function registerDevice(
  devices: readonly SyncDeviceEnrollment[],
  input: unknown,
): SyncDeviceEnrollment[] {
  const validation = validateDeviceEnrollmentInput(input);
  if (!validation.ok) {
    throw new Error(formatValidationIssues("device enrollment input", validation.issues));
  }

  const enrollment = validation.value;
  if (hasDevice(devices, enrollment.workspaceId, enrollment.deviceId)) {
    throw new Error(
      `device already exists in workspace: ${enrollment.workspaceId}/${enrollment.deviceId}`,
    );
  }

  return [
    ...devices.map(cloneDeviceEnrollment),
    {
      ...enrollment,
      status: "active",
    },
  ];
}

export function updateDeviceLastSeen(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
  deviceId: string,
  lastSeenAt: string,
): SyncDeviceEnrollment[] {
  const ids = validateDeviceLocator(workspaceId, deviceId);
  const lastSeenAtMs = parseRequiredTimestamp(lastSeenAt, "lastSeenAt");
  let found = false;

  const updated = devices.map((device) => {
    if (device.workspaceId !== ids.workspaceId || device.deviceId !== ids.deviceId) {
      return cloneDeviceEnrollment(device);
    }

    found = true;
    if (device.status !== "active") {
      throw new Error("only active devices can update lastSeenAt");
    }
    if (lastSeenAtMs < parseRequiredTimestamp(device.registeredAt, "registeredAt")) {
      throw new Error("lastSeenAt cannot be earlier than registeredAt");
    }
    if (lastSeenAtMs < parseRequiredTimestamp(device.lastSeenAt, "lastSeenAt")) {
      throw new Error("lastSeenAt cannot move backward");
    }

    return {
      ...cloneDeviceEnrollment(device),
      lastSeenAt,
    };
  });

  if (!found) {
    throw new Error(`device was not found in workspace: ${ids.workspaceId}/${ids.deviceId}`);
  }

  return updated;
}

export function suspendDevice(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
  deviceId: string,
): SyncDeviceEnrollment[] {
  return setDeviceStatus(devices, workspaceId, deviceId, "suspended");
}

export function removeDevice(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
  deviceId: string,
): SyncDeviceEnrollment[] {
  return setDeviceStatus(devices, workspaceId, deviceId, "removed");
}

export function listActiveDevices(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
): SyncDeviceEnrollment[] {
  const ids = validateWorkspaceLocator(workspaceId);
  return devices
    .filter((device) => device.workspaceId === ids.workspaceId && device.status === "active")
    .map(cloneDeviceEnrollment);
}

export function findDeviceEnrollment(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
  deviceId: string,
): SyncDeviceEnrollment | undefined {
  const ids = validateDeviceLocator(workspaceId, deviceId);
  const found = devices.find(
    (device) => device.workspaceId === ids.workspaceId && device.deviceId === ids.deviceId,
  );
  return found ? cloneDeviceEnrollment(found) : undefined;
}

export class InMemoryDeviceEnrollmentRepository {
  private devices: SyncDeviceEnrollment[];

  constructor(devices: readonly SyncDeviceEnrollment[] = []) {
    this.devices = devices.map(cloneDeviceEnrollment);
  }

  list(workspaceId?: string): SyncDeviceEnrollment[] {
    if (workspaceId === undefined) {
      return this.devices.map(cloneDeviceEnrollment);
    }

    const ids = validateWorkspaceLocator(workspaceId);
    return this.devices
      .filter((device) => device.workspaceId === ids.workspaceId)
      .map(cloneDeviceEnrollment);
  }

  listActive(workspaceId: string): SyncDeviceEnrollment[] {
    return listActiveDevices(this.devices, workspaceId);
  }

  register(input: unknown): SyncDeviceEnrollment {
    this.devices = registerDevice(this.devices, input);
    return cloneDeviceEnrollment(this.devices[this.devices.length - 1]);
  }

  updateLastSeen(
    workspaceId: string,
    deviceId: string,
    lastSeenAt: string,
  ): SyncDeviceEnrollment {
    this.devices = updateDeviceLastSeen(this.devices, workspaceId, deviceId, lastSeenAt);
    return this.requireDevice(workspaceId, deviceId);
  }

  suspend(workspaceId: string, deviceId: string): SyncDeviceEnrollment {
    this.devices = suspendDevice(this.devices, workspaceId, deviceId);
    return this.requireDevice(workspaceId, deviceId);
  }

  remove(workspaceId: string, deviceId: string): SyncDeviceEnrollment {
    this.devices = removeDevice(this.devices, workspaceId, deviceId);
    return this.requireDevice(workspaceId, deviceId);
  }

  private requireDevice(workspaceId: string, deviceId: string): SyncDeviceEnrollment {
    const device = findDeviceEnrollment(this.devices, workspaceId, deviceId);
    if (!device) {
      throw new Error(`device was not found in workspace: ${workspaceId}/${deviceId}`);
    }
    return device;
  }
}

function setDeviceStatus(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
  deviceId: string,
  status: Extract<DeviceStatus, "suspended" | "removed">,
): SyncDeviceEnrollment[] {
  const ids = validateDeviceLocator(workspaceId, deviceId);
  let found = false;

  const updated = devices.map((device) => {
    if (device.workspaceId !== ids.workspaceId || device.deviceId !== ids.deviceId) {
      return cloneDeviceEnrollment(device);
    }

    found = true;
    if (status === "suspended" && device.status === "removed") {
      throw new Error("removed devices cannot be suspended");
    }

    return {
      ...cloneDeviceEnrollment(device),
      status,
    };
  });

  if (!found) {
    throw new Error(`device was not found in workspace: ${ids.workspaceId}/${ids.deviceId}`);
  }

  return updated;
}

function hasDevice(
  devices: readonly SyncDeviceEnrollment[],
  workspaceId: string,
  deviceId: string,
): boolean {
  return devices.some((device) => device.workspaceId === workspaceId && device.deviceId === deviceId);
}

function cloneDeviceEnrollment(device: SyncDeviceEnrollment): SyncDeviceEnrollment {
  return {
    workspaceId: device.workspaceId,
    deviceId: device.deviceId,
    publicKeyRef: device.publicKeyRef,
    displayName: device.displayName,
    registeredAt: device.registeredAt,
    lastSeenAt: device.lastSeenAt,
    status: device.status,
  };
}

function validateDeviceLocator(
  workspaceId: string,
  deviceId: string,
): { workspaceId: `wsp_${string}`; deviceId: `dev_${string}` } {
  const issues: ValidationIssue[] = [];
  requireWorkspaceId(workspaceId, "workspaceId", issues);
  requireDeviceId(deviceId, "deviceId", issues);
  if (issues.length > 0) {
    throw new Error(formatValidationIssues("device locator", issues));
  }

  return {
    workspaceId: workspaceId as `wsp_${string}`,
    deviceId: deviceId as `dev_${string}`,
  };
}

function validateWorkspaceLocator(workspaceId: string): { workspaceId: `wsp_${string}` } {
  const issues: ValidationIssue[] = [];
  requireWorkspaceId(workspaceId, "workspaceId", issues);
  if (issues.length > 0) {
    throw new Error(formatValidationIssues("workspace locator", issues));
  }

  return {
    workspaceId: workspaceId as `wsp_${string}`,
  };
}

function requireWorkspaceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !WORKSPACE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "workspaceId must use the wsp_ id prefix" });
  }
}

function requireDeviceId(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || !DEVICE_ID_PATTERN.test(value)) {
    issues.push({ path, message: "deviceId must use the dev_ id prefix" });
  }
}

function requireNonEmptyString(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${path} must be a non-empty string` });
  }
}

function parseTimestamp(
  value: unknown,
  path: string,
  issues: ValidationIssue[],
): number | undefined {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${path} must be a non-empty timestamp string` });
    return undefined;
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    issues.push({ path, message: `${path} must be a valid timestamp` });
    return undefined;
  }

  return timestamp;
}

function parseRequiredTimestamp(value: string, path: string): number {
  const issues: ValidationIssue[] = [];
  const timestamp = parseTimestamp(value, path, issues);
  if (timestamp === undefined) {
    throw new Error(formatValidationIssues("timestamp", issues));
  }
  return timestamp;
}

function requireOnlyKeys(
  record: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
  issues: ValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowedKeys.includes(key)) {
      issues.push({ path: path === "$" ? key : `${path}.${key}`, message: "field is not supported" });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatValidationIssues(scope: string, issues: readonly ValidationIssue[]): string {
  const details = issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ");
  return `${scope} validation failed: ${details}`;
}
