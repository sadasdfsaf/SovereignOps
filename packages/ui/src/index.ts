export interface BadgeModel {
  label: string;
  tone: "neutral" | "success" | "warning" | "danger";
}

export function riskBadge(risk: "low" | "medium" | "high"): BadgeModel {
  if (risk === "low") {
    return { label: "Low risk", tone: "success" };
  }
  if (risk === "medium") {
    return { label: "Needs review", tone: "warning" };
  }
  return { label: "Approval required", tone: "danger" };
}

