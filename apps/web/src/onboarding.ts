export type WorkspaceId = `wsp_${string}`;

export type EncryptionMode = "local-key" | "passphrase" | "external-key";

export type OnboardingStep =
  | "select-encryption"
  | "create-workspace"
  | "open-workspace"
  | "ready";

export interface EncryptionModeOption {
  mode: EncryptionMode;
  label: string;
  secretMaterial: "none" | "passphrase" | "key-reference";
}

export interface EncryptionModeInput {
  mode: EncryptionMode;
  passphrase?: string;
  keyReference?: string;
}

export interface SelectedEncryptionMode extends EncryptionModeOption {
  ready: boolean;
  validationErrors: readonly string[];
  keyReference?: string;
}

export interface LocalWorkspaceMetadata {
  id: WorkspaceId;
  name: string;
  slug: string;
  encryption: {
    mode: EncryptionMode;
    keyReference?: string;
  };
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string;
}

export interface OnboardingState {
  step: OnboardingStep;
  selectedEncryptionMode?: SelectedEncryptionMode;
  workspace?: LocalWorkspaceMetadata;
}

export interface CreateLocalWorkspaceInput {
  name: string;
  encryption: EncryptionMode | EncryptionModeInput;
}

export interface OpenLocalWorkspaceInput {
  workspaceId: WorkspaceId;
  encryption?: EncryptionMode | EncryptionModeInput;
}

export interface LocalWorkspaceSession {
  action: "created" | "opened";
  workspace: LocalWorkspaceMetadata;
  state: OnboardingState;
}

export interface LocalWorkspaceRepository {
  save(workspace: LocalWorkspaceMetadata): LocalWorkspaceMetadata;
  load(workspaceId: WorkspaceId): LocalWorkspaceMetadata | undefined;
  list(): readonly LocalWorkspaceMetadata[];
}

export interface OnboardingRuntime {
  now?: () => Date;
  createWorkspaceId?: (name: string) => WorkspaceId;
}

export const encryptionModeOptions: readonly EncryptionModeOption[] =
  Object.freeze([
    {
      mode: "local-key",
      label: "Local key",
      secretMaterial: "none",
    },
    {
      mode: "passphrase",
      label: "Passphrase",
      secretMaterial: "passphrase",
    },
    {
      mode: "external-key",
      label: "External key",
      secretMaterial: "key-reference",
    },
  ]);

export class InMemoryLocalWorkspaceRepository
  implements LocalWorkspaceRepository
{
  readonly #workspaces = new Map<WorkspaceId, LocalWorkspaceMetadata>();

  constructor(initialWorkspaces: readonly LocalWorkspaceMetadata[] = []) {
    for (const workspace of initialWorkspaces) {
      this.save(workspace);
    }
  }

  save(workspace: LocalWorkspaceMetadata): LocalWorkspaceMetadata {
    assertWorkspaceId(workspace.id);
    const saved = cloneWorkspace(workspace);
    this.#workspaces.set(saved.id, saved);
    return cloneWorkspace(saved);
  }

  load(workspaceId: WorkspaceId): LocalWorkspaceMetadata | undefined {
    assertWorkspaceId(workspaceId);
    const workspace = this.#workspaces.get(workspaceId);
    return workspace ? cloneWorkspace(workspace) : undefined;
  }

  list(): readonly LocalWorkspaceMetadata[] {
    return [...this.#workspaces.values()]
      .map((workspace) => cloneWorkspace(workspace))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
}

export function createInMemoryWorkspaceRepository(
  initialWorkspaces: readonly LocalWorkspaceMetadata[] = [],
): LocalWorkspaceRepository {
  return new InMemoryLocalWorkspaceRepository(initialWorkspaces);
}

export function createInitialOnboardingState(): OnboardingState {
  return {
    step: "select-encryption",
  };
}

export function selectEncryptionMode(
  input: EncryptionMode | EncryptionModeInput,
): SelectedEncryptionMode {
  const normalizedInput =
    typeof input === "string" ? { mode: input } : { ...input };
  const option = encryptionModeOptions.find(
    (candidate) => candidate.mode === normalizedInput.mode,
  );

  if (!option) {
    throw new Error(`unknown encryption mode: ${normalizedInput.mode}`);
  }

  const validationErrors: string[] = [];
  const trimmedKeyReference = normalizedInput.keyReference?.trim();

  if (
    option.secretMaterial === "passphrase" &&
    (normalizedInput.passphrase ?? "").length < 12
  ) {
    validationErrors.push("passphrase must be at least 12 characters");
  }

  if (option.secretMaterial === "key-reference" && !trimmedKeyReference) {
    validationErrors.push("keyReference is required");
  }

  return {
    ...option,
    ready: validationErrors.length === 0,
    validationErrors,
    ...(trimmedKeyReference ? { keyReference: trimmedKeyReference } : {}),
  };
}

export function setOnboardingEncryptionMode(
  state: OnboardingState,
  input: EncryptionMode | EncryptionModeInput,
): OnboardingState {
  return {
    ...cloneState(state),
    step: "create-workspace",
    selectedEncryptionMode: selectEncryptionMode(input),
  };
}

export function createLocalWorkspace(
  repository: LocalWorkspaceRepository,
  input: CreateLocalWorkspaceInput,
  runtime: OnboardingRuntime = {},
): LocalWorkspaceSession {
  const selectedEncryptionMode = selectEncryptionMode(input.encryption);
  assertReadyEncryption(selectedEncryptionMode);

  const now = readNow(runtime);
  const name = normalizeWorkspaceName(input.name);
  const id = runtime.createWorkspaceId?.(name) ?? createDefaultWorkspaceId(name);

  if (repository.load(id)) {
    throw new Error(`workspace already exists: ${id}`);
  }

  const workspace: LocalWorkspaceMetadata = {
    id,
    name,
    slug: slugifyWorkspaceName(name),
    encryption: {
      mode: selectedEncryptionMode.mode,
      ...(selectedEncryptionMode.keyReference
        ? { keyReference: selectedEncryptionMode.keyReference }
        : {}),
    },
    createdAt: now,
    updatedAt: now,
  };
  const saved = repository.save(workspace);

  return {
    action: "created",
    workspace: saved,
    state: {
      step: "ready",
      selectedEncryptionMode,
      workspace: saved,
    },
  };
}

export function openLocalWorkspace(
  repository: LocalWorkspaceRepository,
  input: OpenLocalWorkspaceInput,
  runtime: OnboardingRuntime = {},
): LocalWorkspaceSession {
  const workspace = repository.load(input.workspaceId);
  if (!workspace) {
    throw new Error(`workspace not found: ${input.workspaceId}`);
  }

  const selectedEncryptionMode = input.encryption
    ? selectEncryptionMode(input.encryption)
    : selectEncryptionMode(workspace.encryption.mode);
  assertReadyEncryption(selectedEncryptionMode);

  if (selectedEncryptionMode.mode !== workspace.encryption.mode) {
    throw new Error("encryption mode does not match workspace");
  }

  const now = readNow(runtime);
  const opened = repository.save({
    ...workspace,
    updatedAt: now,
    lastOpenedAt: now,
  });

  return {
    action: "opened",
    workspace: opened,
    state: {
      step: "ready",
      selectedEncryptionMode,
      workspace: opened,
    },
  };
}

export function listLocalWorkspaces(
  repository: LocalWorkspaceRepository,
): readonly LocalWorkspaceMetadata[] {
  return repository.list();
}

function assertReadyEncryption(selection: SelectedEncryptionMode): void {
  if (!selection.ready) {
    throw new Error(
      `encryption mode is not ready: ${selection.validationErrors.join("; ")}`,
    );
  }
}

function assertWorkspaceId(workspaceId: WorkspaceId): void {
  if (!workspaceId.startsWith("wsp_")) {
    throw new Error("workspaceId must use the wsp_ prefix");
  }
}

function normalizeWorkspaceName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("workspace name is required");
  }
  return trimmed.replace(/\s+/g, " ");
}

function slugifyWorkspaceName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "workspace";
}

function createDefaultWorkspaceId(name: string): WorkspaceId {
  const slug = slugifyWorkspaceName(name).slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 10);
  return `wsp_${slug}_${suffix}`;
}

function readNow(runtime: OnboardingRuntime): string {
  return (runtime.now?.() ?? new Date()).toISOString();
}

function cloneState(state: OnboardingState): OnboardingState {
  return {
    step: state.step,
    ...(state.selectedEncryptionMode
      ? { selectedEncryptionMode: cloneSelection(state.selectedEncryptionMode) }
      : {}),
    ...(state.workspace ? { workspace: cloneWorkspace(state.workspace) } : {}),
  };
}

function cloneSelection(
  selection: SelectedEncryptionMode,
): SelectedEncryptionMode {
  return {
    mode: selection.mode,
    label: selection.label,
    secretMaterial: selection.secretMaterial,
    ready: selection.ready,
    validationErrors: [...selection.validationErrors],
    ...(selection.keyReference ? { keyReference: selection.keyReference } : {}),
  };
}

function cloneWorkspace(
  workspace: LocalWorkspaceMetadata,
): LocalWorkspaceMetadata {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    encryption: {
      mode: workspace.encryption.mode,
      ...(workspace.encryption.keyReference
        ? { keyReference: workspace.encryption.keyReference }
        : {}),
    },
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
    ...(workspace.lastOpenedAt ? { lastOpenedAt: workspace.lastOpenedAt } : {}),
  };
}
