import {
  RISK_LEVELS,
  schemaDefinitions,
  type IdentifierPrefix,
  type SchemaKind,
} from "./index.ts";

export const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

export type JsonSchemaType = "array" | "boolean" | "integer" | "null" | "number" | "object" | "string";

export interface JsonSchema {
  readonly $schema?: string;
  readonly $id?: string;
  readonly title?: string;
  readonly type?: JsonSchemaType;
  readonly additionalProperties?: boolean;
  readonly properties?: Record<string, JsonSchema>;
  readonly required?: readonly string[];
  readonly enum?: readonly string[];
  readonly pattern?: string;
  readonly minLength?: number;
  readonly minimum?: number;
  readonly items?: JsonSchema;
}

export interface JsonSchemaCatalogEntry {
  readonly kind: SchemaKind;
  readonly schemaFile: `${SchemaKind}.schema.json`;
  readonly id: string;
  readonly title: string;
}

export interface JsonSchemaCatalog {
  readonly version: 1;
  readonly draft: typeof JSON_SCHEMA_DRAFT;
  readonly schemas: readonly JsonSchemaCatalogEntry[];
}

const ID_BODY_PATTERN = "[A-Za-z0-9_-]{1,88}";
const TARGET_ID_PATTERN = `^(doc|prj|inc|cmt|att|apv|obj)_${ID_BODY_PATTERN}$`;
const schemaTitles: Record<SchemaKind, string> = {
  docs: "Doc",
  projects: "Project",
  incidents: "Incident",
  comments: "Comment",
  attachments: "Attachment",
  approvals: "Approval",
};

export const schemaKinds = Object.keys(schemaDefinitions) as SchemaKind[];

export const jsonSchemas = {
  docs: recordSchema(
    "docs",
    {
      projectId: idSchema("prj"),
      title: nonBlankStringSchema(),
      body: nonBlankStringSchema(),
      ownerActorId: idSchema("act"),
    },
    ["title", "ownerActorId"],
  ),
  projects: recordSchema(
    "projects",
    {
      name: nonBlankStringSchema(),
      ownerActorId: idSchema("act"),
    },
    ["name", "ownerActorId"],
  ),
  incidents: recordSchema(
    "incidents",
    {
      projectId: idSchema("prj"),
      title: nonBlankStringSchema(),
      summary: nonBlankStringSchema(),
      reportedByActorId: idSchema("act"),
    },
    ["title", "reportedByActorId"],
  ),
  comments: recordSchema(
    "comments",
    {
      targetId: targetIdSchema(),
      body: nonBlankStringSchema(),
      authorActorId: idSchema("act"),
    },
    ["targetId", "body", "authorActorId"],
  ),
  attachments: recordSchema(
    "attachments",
    {
      targetId: targetIdSchema(),
      filename: nonBlankStringSchema(),
      contentType: nonBlankStringSchema(),
      byteSize: nonNegativeIntegerSchema(),
      uploadedByActorId: idSchema("act"),
    },
    ["targetId", "filename", "contentType", "byteSize", "uploadedByActorId"],
  ),
  approvals: recordSchema(
    "approvals",
    {
      targetId: targetIdSchema(),
      summary: nonBlankStringSchema(),
      requestedByActorId: idSchema("act"),
      approverActorId: idSchema("act"),
    },
    ["targetId", "summary", "requestedByActorId"],
  ),
} as const satisfies Record<SchemaKind, JsonSchema>;

export const jsonSchemaCatalog: JsonSchemaCatalog = {
  version: 1,
  draft: JSON_SCHEMA_DRAFT,
  schemas: schemaKinds.map((kind) => ({
    kind,
    schemaFile: `${kind}.schema.json`,
    id: jsonSchemas[kind].$id ?? "",
    title: jsonSchemas[kind].title ?? kind,
  })),
};

export function getJsonSchema(kind: SchemaKind): JsonSchema {
  return jsonSchemas[kind];
}

function recordSchema(
  kind: SchemaKind,
  properties: Record<string, JsonSchema>,
  required: readonly string[],
): JsonSchema {
  return {
    $schema: JSON_SCHEMA_DRAFT,
    $id: `https://schemas.sovereignops.local/${kind}.schema.json`,
    title: `${schemaTitles[kind]} record`,
    type: "object",
    additionalProperties: false,
    required: ["id", "workspaceId", "status", "risk", "createdAt", "updatedAt", ...required],
    properties: {
      id: idSchema(schemaDefinitions[kind].idPrefix),
      workspaceId: idSchema("wsp"),
      status: enumSchema(schemaDefinitions[kind].statuses),
      risk: enumSchema(RISK_LEVELS),
      createdAt: nonBlankStringSchema(),
      updatedAt: nonBlankStringSchema(),
      ...properties,
    },
  };
}

function idSchema(prefix: IdentifierPrefix): JsonSchema {
  return {
    type: "string",
    pattern: `^${prefix}_${ID_BODY_PATTERN}$`,
  };
}

function targetIdSchema(): JsonSchema {
  return {
    type: "string",
    pattern: TARGET_ID_PATTERN,
  };
}

function enumSchema(values: readonly string[]): JsonSchema {
  return {
    type: "string",
    enum: values,
  };
}

function nonBlankStringSchema(): JsonSchema {
  return {
    type: "string",
    minLength: 1,
    pattern: "\\S",
  };
}

function nonNegativeIntegerSchema(): JsonSchema {
  return {
    type: "integer",
    minimum: 0,
  };
}
