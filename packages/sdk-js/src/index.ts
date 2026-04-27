export interface WorkspaceClientOptions {
  workspaceId: string;
  endpoint?: string;
}

export class WorkspaceClient {
  readonly workspaceId: string;
  readonly endpoint: string;

  constructor(options: WorkspaceClientOptions) {
    if (!options.workspaceId.startsWith("wsp_")) {
      throw new Error("workspaceId must use the wsp_ prefix");
    }
    this.workspaceId = options.workspaceId;
    this.endpoint = options.endpoint ?? "local://workspace";
  }

  describe(): string {
    return `${this.workspaceId} via ${this.endpoint}`;
  }
}

export * from "./client.ts";
export * from "./ingestEvidenceClient.ts";
export * from "./ingestEvidenceFixtureFetch.ts";
export * from "./ingestClient.ts";
export * from "./ingestFixtureFetch.ts";
export * from "./localEventApiClient.ts";
export * from "./localIngestEvidence.ts";
export * from "./localEvents.ts";
export * from "./localIngest.ts";
export * from "./localLifecycle.ts";
export * from "./localMcp.ts";
export * from "./localMcpProtocol.ts";
export * from "./localWorkspaceSession.ts";
export * from "./mcpApprovalEvidenceClient.ts";
export * from "./mcpApprovalEvidenceRecordClient.ts";
export * from "./pluginReviewArtifactClient.ts";
export * from "./pluginReviewArtifactRecordClient.ts";
export * from "./storage.ts";
export * from "./workspace.ts";
