export interface PluginCapability {
  name: string;
  risk: "low" | "medium" | "high";
  description: string;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  capabilities: PluginCapability[];
}

export function validatePluginManifest(manifest: PluginManifest): void {
  if (!manifest.id.startsWith("plugin.")) {
    throw new Error("plugin id must use the plugin. namespace");
  }
  if (manifest.capabilities.length === 0) {
    throw new Error("plugin must request at least one explicit capability");
  }
}

