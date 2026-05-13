import type { Role } from "./models";

export type DashboardSection =
  | "taskBoard"
  | "goals"
  | "orgTree"
  | "powerControl"
  | "team"
  | "recruitment"
  | "forecast"
  | "analytics"
  | "orgSettings"
  | "capture"
  | "approvals";

export function isExecutiveRole(role?: Role): boolean {
  return role === "ceo" || role === "cfo";
}

export function canManageGoals(role?: Role): boolean {
  return isExecutiveRole(role);
}

export function canManageRecruitment(role?: Role): boolean {
  return role === "ceo" || role === "cfo" || role === "manager";
}

export function canAccessSection(role: Role | undefined, section: DashboardSection): boolean {
  if (!role) {
    return false;
  }

  switch (section) {
    case "taskBoard":
    case "goals":
    case "orgTree":
    case "team":
      return true;
    case "powerControl":
      return role === "ceo" || role === "cfo" || role === "manager";
    case "recruitment":
    case "forecast":
    case "analytics":
    case "capture":
      return role === "ceo" || role === "cfo" || role === "manager";
    case "orgSettings":
      return isExecutiveRole(role);
    case "approvals":
      return isExecutiveRole(role);
    default:
      return false;
  }
}
