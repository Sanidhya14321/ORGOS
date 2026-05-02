"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ApiError, apiFetch } from "@/lib/api";
import { connectSocket, disconnectSocket, useSocket } from "@/lib/socket";
import { useOrgosStore } from "@/store";
import type { Goal, PendingMember, Report, Task, User } from "@/lib/models";
import * as XLSX from "xlsx";

type DashboardSummary = {
  tasks: number;
  goals: number;
  reports: number;
  pendingMembers: number;
};

type FeedItem = {
  id: string;
  title: string;
  description: string;
  tone: "positive" | "warning" | "neutral";
};

type OrgItem = { id: string; name: string; domain?: string | null };
type Industry = "tech" | "legal" | "healthcare" | "construction" | "finance" | "retail" | "manufacturing" | "education" | "nonprofit" | "hospitality";
type CompanySize = "startup" | "mid" | "enterprise";
type PositionItem = { id: string; title: string; level: number; confirmed?: boolean };
type PositionCreateResponse = PositionItem & {
  credentials?: {
    email: string;
    password: string;
    role: "ceo" | "cfo" | "manager" | "worker";
  } | null;
};
type AccountItem = {
  id: string;
  email: string;
  full_name: string;
  role: "ceo" | "cfo" | "manager" | "worker";
  status?: "pending" | "active" | "rejected";
  department?: string | null;
  position_title?: string | null;
  position_level?: number | null;
  password: null;
  password_note: string;
};

type OrgAccountResponse = {
  page: number;
  limit: number;
  total: number;
  items: AccountItem[];
};

type CeoView = "approvals" | "org-setup" | "accounts";
type TreeMember = {
  id: string;
  full_name: string;
  email?: string;
  role: "ceo" | "cfo" | "manager" | "worker";
  status?: "pending" | "active" | "rejected";
  department?: string | null;
  position_id?: string | null;
  reports_to?: string | null;
};

type OrgTreeResponse = {
  orgId: string;
  nodes: TreeMember[];
  positions: PositionItem[];
};

type EmployeeImportRow = {
  fullName: string;
  email: string;
  role: "ceo" | "cfo" | "manager" | "worker";
  department?: string;
  positionTitle?: string;
  positionLevel?: number;
  reportsToEmail?: string;
  password?: string;
};

type MemberDraft = {
  role: "ceo" | "cfo" | "manager" | "worker";
  position_id: string | null;
  reports_to: string | null;
  department: string;
};

function toneClass(tone: FeedItem["tone"]): string {
  switch (tone) {
    case "positive":
      return "bg-[#e6f5f1] text-[#166c60]";
    case "warning":
      return "bg-[#fff0e6] text-[#9f4f20]";
    default:
      return "bg-[#f1f5f9] text-[#475569]";
  }
}

function cellText(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }

  return "";
}

function firstCell(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = cellText(row[key]);
    if (value) {
      return value;
    }
  }

  return "";
}

function normalizeImportRow(row: Record<string, unknown>): EmployeeImportRow | null {
  const fullName = firstCell(row, ["fullName", "full_name", "Full Name", "name", "Name"]);
  const email = firstCell(row, ["email", "Email", "Login Email", "loginEmail"]);
  if (!fullName || !email) {
    return null;
  }

  const role = firstCell(row, ["role", "Role"]).toLowerCase();
  const parsedRole = role === "ceo" || role === "cfo" || role === "manager" || role === "worker" ? role : "worker";
  const levelValue = firstCell(row, ["positionLevel", "position_level", "level", "Level"]);
  const parsedLevel = Number(levelValue);
  const numericLevel = Number.isInteger(parsedLevel) && parsedLevel >= 0 ? parsedLevel : undefined;

  return {
    fullName,
    email,
    role: parsedRole,
    department: firstCell(row, ["department", "Department"]) || undefined,
    positionTitle: firstCell(row, ["positionTitle", "position_title", "Position Title", "title", "Title"]) || undefined,
    positionLevel: numericLevel,
    reportsToEmail: firstCell(row, ["reportsToEmail", "reports_to_email", "Reports To Email", "managerEmail", "manager_email"]) || undefined,
    password: firstCell(row, ["password", "Password"]) || undefined
  };
}

function defaultPositionTitle(role: EmployeeImportRow["role"]): string {
  switch (role) {
    case "ceo":
      return "CEO";
    case "cfo":
      return "CFO";
    case "manager":
      return "Manager";
    default:
      return "Individual Contributor";
  }
}

export function CeoApprovalDashboard() {
  const router = useRouter();
  const socket = useSocket();
  const setUser = useOrgosStore((state) => state.setUser);
  const setTasks = useOrgosStore((state) => state.setTasks);
  const setGoals = useOrgosStore((state) => state.setGoals);
  const wsConnected = useOrgosStore((state) => state.wsConnected);

  const [view, setView] = useState<CeoView>("approvals");
  const [me, setMe] = useState<User | null>(null);
  const [orgId, setOrgId] = useState("");
  const [positions, setPositions] = useState<PositionItem[]>([]);

  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({ tasks: 0, goals: 0, reports: 0, pendingMembers: 0 });
  const [recentReports, setRecentReports] = useState<Report[]>([]);
  const [recentGoals, setRecentGoals] = useState<Goal[]>([]);
  const [activity, setActivity] = useState<FeedItem[]>([]);
  const [members, setMembers] = useState<TreeMember[]>([]);
  const [memberDrafts, setMemberDrafts] = useState<Record<string, MemberDraft>>({});

  const [orgName, setOrgName] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [orgIndustry, setOrgIndustry] = useState<Industry>("tech");
  const [orgCompanySize, setOrgCompanySize] = useState<CompanySize>("startup");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const [newPositionTitle, setNewPositionTitle] = useState("");
  const [newPositionLevel, setNewPositionLevel] = useState<number>(1);
  const [creatingPosition, setCreatingPosition] = useState(false);

  const [importRows, setImportRows] = useState<EmployeeImportRow[]>([]);
  const [importFileName, setImportFileName] = useState<string | null>(null);
  const [importingEmployees, setImportingEmployees] = useState(false);
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [resetPasswordByUserId, setResetPasswordByUserId] = useState<Record<string, string>>({});
  const [memberPage, setMemberPage] = useState(1);

  const MEMBERS_PAGE_SIZE = 5;

  const sortedMembers = useMemo(
    () => members.slice().sort((a, b) => a.role.localeCompare(b.role) || a.full_name.localeCompare(b.full_name)),
    [members]
  );

  const pagedMembers = useMemo(() => {
    const start = (memberPage - 1) * MEMBERS_PAGE_SIZE;
    const end = start + MEMBERS_PAGE_SIZE;
    return sortedMembers.slice(start, end);
  }, [memberPage, sortedMembers]);

  const memberPageCount = useMemo(() => Math.max(1, Math.ceil(sortedMembers.length / MEMBERS_PAGE_SIZE)), [sortedMembers.length]);

  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    connectSocket();
    return () => disconnectSocket();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoading(true);
      try {
        const user = await apiFetch<User>("/api/me");
        if (user.status === "pending") {
          if (!cancelled) {
            setUser(user);
            setActivity([
              {
                id: "pending-onboarding",
                title: "Approval pending",
                description: "Your account is awaiting executive approval. Redirecting to onboarding status.",
                tone: "warning"
              }
            ]);
            router.replace("/pending");
          }
          return;
        }

        if (cancelled) {
          return;
        }

        setUser(user);
        setMe(user);
        setOrgId(user.org_id ?? "");

        if (!user.org_id) {
          setSummary({ tasks: 0, goals: 0, reports: 0, pendingMembers: 0 });
          setPendingMembers([]);
          setRecentReports([]);
          setRecentGoals([]);
          setActivity([
            {
              id: "org-setup-required",
              title: "Create your organization",
              description: "Use Org setup to create the company and define position levels before inviting members.",
              tone: "warning"
            }
          ]);
          setView("org-setup");
          return;
        }

        const [taskResponse, goalResponse, pendingResponse, treeResponse] = await Promise.all([
          apiFetch<{ items: Task[] }>("/api/tasks?limit=20"),
          apiFetch<{ items: Goal[] }>("/api/goals?limit=12"),
          apiFetch<{ items: PendingMember[] }>("/api/orgs/pending-members"),
          user.org_id ? apiFetch<OrgTreeResponse>(`/api/orgs/${user.org_id}/tree`) : Promise.resolve({ orgId: "", nodes: [], positions: [] })
        ]);

        const firstTask = taskResponse.items[0];
        const reportResponse = firstTask
          ? await apiFetch<{ items: Report[] }>(`/api/reports/${firstTask.id}`)
          : { items: [] as Report[] };

        if (cancelled) {
          return;
        }

        setTasks(taskResponse.items);
        setGoals(goalResponse.items);
        setPendingMembers(pendingResponse.items);
        setMembers(treeResponse.nodes);
        setPositions((treeResponse.positions ?? []).slice().sort((a, b) => (a.level - b.level) || a.title.localeCompare(b.title)));
        setMemberDrafts(
          Object.fromEntries(
            treeResponse.nodes.map((member) => [
              member.id,
              {
                role: member.role,
                position_id: member.position_id ?? null,
                reports_to: member.reports_to ?? null,
                department: member.department ?? ""
              }
            ])
          )
        );
        setRecentReports(reportResponse.items);
        setRecentGoals(goalResponse.items.slice(0, 4));
        setSummary({
          tasks: taskResponse.items.length,
          goals: goalResponse.items.length,
          reports: reportResponse.items.length,
          pendingMembers: pendingResponse.items.length
        });
        setActivity([
          {
            id: "bootstrap",
            title: "CEO dashboard loaded",
            description: `${pendingResponse.items.length} onboarding requests ready for review.`,
            tone: pendingResponse.items.length > 0 ? "warning" : "positive"
          }
        ]);
      } catch (error) {
        if (!cancelled) {
          setActivity([
            {
              id: "bootstrap-error",
              title: "Dashboard bootstrap failed",
              description: error instanceof Error ? error.message : "Unable to load CEO dashboard",
              tone: "warning"
            }
          ]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router, setGoals, setTasks, setUser]);

  useEffect(() => {
    const onPendingMember = (payload: { memberId?: string; email?: string }) => {
      setActivity((items) => [
        {
          id: `member-${payload.memberId ?? Date.now()}`,
          title: "New member pending approval",
          description: payload.email ? `${payload.email} is waiting for review.` : "A member is waiting for CEO approval.",
          tone: "warning"
        },
        ...items
      ]);
    };

    const onTaskAssigned = (payload: { taskId: string }) => {
      setActivity((items) => [
        {
          id: `task-${payload.taskId}`,
          title: "Task assigned",
          description: `Task ${payload.taskId} entered execution flow.`,
          tone: "neutral"
        },
        ...items
      ]);
    };

    const onReportSubmitted = (payload: { taskId: string; reportId?: string }) => {
      setActivity((items) => [
        {
          id: `report-${payload.reportId ?? payload.taskId}`,
          title: "Report submitted",
          description: `Task ${payload.taskId} has a new report waiting for review.`,
          tone: "positive"
        },
        ...items
      ]);
    };

    socket.on("org:member_pending", onPendingMember);
    socket.on("task:assigned", onTaskAssigned);
    socket.on("task:report_submitted", onReportSubmitted);

    return () => {
      socket.off("org:member_pending", onPendingMember);
      socket.off("task:assigned", onTaskAssigned);
      socket.off("task:report_submitted", onReportSubmitted);
    };
  }, [socket]);

  useEffect(() => {
    if (!orgId || view !== "accounts") {
      return;
    }

    let cancelled = false;

    async function loadAccounts() {
      setAccountsLoading(true);
      try {
        const response = await apiFetch<OrgAccountResponse>(`/api/orgs/${orgId}/accounts?page=${accountsPage}&limit=10`);
        if (!cancelled) {
          setAccounts(response.items ?? []);
          setAccountsTotal(response.total ?? 0);
        }
      } catch (error) {
        if (!cancelled) {
          setActivity((items) => [
            {
              id: `accounts-load-error-${Date.now()}`,
              title: "Failed to load accounts",
              description: error instanceof Error ? error.message : "Unable to load organization accounts",
              tone: "warning"
            },
            ...items
          ]);
        }
      } finally {
        if (!cancelled) {
          setAccountsLoading(false);
        }
      }
    }

    void loadAccounts();

    return () => {
      cancelled = true;
    };
  }, [accountsPage, orgId, view]);

  useEffect(() => {
    if (memberPage > memberPageCount) {
      setMemberPage(memberPageCount);
    }
  }, [memberPage, memberPageCount]);

  async function resetAccountPassword(userId: string) {
    try {
      setActionId(userId);
      const response = await apiFetch<{ id: string; email: string; password: string }>(`/api/orgs/accounts/${userId}/reset-password`, {
        method: "POST"
      });

      setResetPasswordByUserId((current) => ({
        ...current,
        [userId]: response.password
      }));

      setActivity((items) => [
        {
          id: `password-reset-${userId}`,
          title: "Temporary password generated",
          description: `${response.email} -> ${response.password}`,
          tone: "neutral"
        },
        ...items
      ]);
    } catch (error) {
      setActivity((items) => [
        {
          id: `password-reset-error-${userId}`,
          title: "Password reset failed",
          description: error instanceof Error ? error.message : "Unable to reset account password",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setActionId(null);
    }
  }

  async function createOrganization() {
    if (!orgName.trim()) {
      setActivity((items) => [
        {
          id: `org-create-validation-${Date.now()}`,
          title: "Organization name required",
          description: "Please enter an organization name before creating.",
          tone: "warning"
        },
        ...items
      ]);
      return;
    }

    setCreatingOrg(true);

    try {
      const payload = await apiFetch<{ org: OrgItem; user?: User | null }>("/api/orgs/create", {
        method: "POST",
        body: JSON.stringify({
          name: orgName.trim(),
          ...(orgDomain.trim() ? { domain: orgDomain.trim() } : {}),
          industry: orgIndustry,
          companySize: orgCompanySize,
          makeCreatorCeo: true
        })
      });

      setOrgId(payload.org.id);
      setOrgName(payload.org.name);
      setMe((prev) => prev ? { ...prev, org_id: payload.org.id } : prev);
      setActivity((items) => [
        {
          id: `org-created-${payload.org.id}`,
          title: "Organization created",
          description: `${payload.org.name} is ready. Now add position levels before onboarding members.`,
          tone: "positive"
        },
        ...items
      ]);
      setView("org-setup");
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try {
          const lookup = await apiFetch<{ items: OrgItem[] }>(`/api/orgs/search?q=${encodeURIComponent(orgName.trim())}`);
          const matched = lookup.items.find((item) => item.name.toLowerCase() === orgName.trim().toLowerCase()) ?? lookup.items[0];

          if (matched) {
            setOrgId(matched.id);
            setOrgName(matched.name);
            setActivity((items) => [
              {
                id: `org-existing-${matched.id}`,
                title: "Organization already exists",
                description: `Using ${matched.name}. Continue by configuring positions and approving members.`,
                tone: "neutral"
              },
              ...items
            ]);
            setView("org-setup");
            return;
          }
        } catch {
          // Fall through to generic error path below.
        }
      }

      setActivity((items) => [
        {
          id: `org-create-error-${Date.now()}`,
          title: "Failed to create organization",
          description: error instanceof Error ? error.message : "Unable to create organization",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setCreatingOrg(false);
    }
  }

  async function createPosition() {
    if (!orgId) {
      setActivity((items) => [
        {
          id: `position-validation-org-${Date.now()}`,
          title: "Create organization first",
          description: "You need an organization before adding positions.",
          tone: "warning"
        },
        ...items
      ]);
      return;
    }

    if (!newPositionTitle.trim()) {
      setActivity((items) => [
        {
          id: `position-validation-title-${Date.now()}`,
          title: "Position title required",
          description: "Enter a title before adding a position.",
          tone: "warning"
        },
        ...items
      ]);
      return;
    }

    setCreatingPosition(true);

    try {
      const created = await apiFetch<PositionCreateResponse>(`/api/orgs/${orgId}/positions`, {
        method: "POST",
        body: JSON.stringify({ title: newPositionTitle.trim(), level: newPositionLevel, createLogin: true })
      });

      setPositions((prev) => {
        const merged = [...prev, created];
        return merged.sort((a, b) => (a.level - b.level) || a.title.localeCompare(b.title));
      });
      setNewPositionTitle("");
      setActivity((items) => [
        {
          id: `position-created-${created.id}`,
          title: "Position added",
          description: `${created.title} (L${created.level}) is available for onboarding assignment.`,
          tone: "positive"
        },
        ...items
      ]);

      if (created.credentials) {
        const credential = created.credentials;
        setActivity((items) => [
          {
            id: `position-credential-${created.id}`,
            title: "Position credentials provisioned",
            description: `${credential.email} / ${credential.password}`,
            tone: "neutral"
          },
          ...items
        ]);
      }
    } catch (error) {
      setActivity((items) => [
        {
          id: `position-create-error-${Date.now()}`,
          title: "Failed to add position",
          description: error instanceof Error ? error.message : "Unable to create position",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setCreatingPosition(false);
    }
  }

  async function saveMemberStructure(memberId: string) {
    const draft = memberDrafts[memberId];
    if (!draft) {
      return;
    }

    try {
      setActionId(memberId);
      const payload: Record<string, unknown> = {
        role: draft.role,
        positionId: draft.position_id,
        reportsTo: draft.reports_to,
        department: draft.department.trim().length > 0 ? draft.department.trim() : null
      };

      const updated = await apiFetch<TreeMember>(`/api/orgs/members/${memberId}/structure`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });

      setMembers((current) => current.map((member) => (member.id === memberId ? updated : member)));
      setActivity((items) => [
        {
          id: `member-updated-${memberId}`,
          title: "Member updated",
          description: `${updated.full_name} now maps to role ${updated.role.toUpperCase()}.`,
          tone: "positive"
        },
        ...items
      ]);
    } catch (error) {
      setActivity((items) => [
        {
          id: `member-update-error-${memberId}`,
          title: "Member update failed",
          description: error instanceof Error ? error.message : "Unable to update member",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setActionId(null);
    }
  }

  async function importEmployeesFromFile(file: File): Promise<EmployeeImportRow[]> {
    const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
    const MAX_ROWS = 200;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error("File too large. Upload a file under 4MB.");
    }

    setImportFileName(file.name);
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
    if (rawRows.length > MAX_ROWS) {
      throw new Error(`Too many rows (${rawRows.length}). Max allowed per import is ${MAX_ROWS}.`);
    }

    const rows = rawRows.map(normalizeImportRow).filter((row): row is EmployeeImportRow => row !== null);
    if (rows.length === 0) {
      throw new Error("No valid employee rows found in file.");
    }

    setImportRows(rows);
    return rows;
  }

  async function submitEmployeeImport() {
    if (!orgId) {
      return;
    }

    if (importRows.length === 0) {
      setActivity((items) => [
        {
          id: `import-empty-${Date.now()}`,
          title: "No employee rows detected",
          description: "Upload a spreadsheet with at least one valid row before importing.",
          tone: "warning"
        },
        ...items
      ]);
      return;
    }

    setImportingEmployees(true);
    try {
      const response = await apiFetch<{ imported: number; credentials: Array<{ fullName: string; email: string; password: string; role: string; position: string }> }>(`/api/orgs/${orgId}/employees/import`, {
        method: "POST",
        body: JSON.stringify({ employees: importRows })
      });

      setImportRows([]);
      setImportFileName(null);
      setActivity((items) => [
        {
          id: `import-success-${Date.now()}`,
          title: "Employees imported",
          description: `${response.imported} credentials created from your spreadsheet.`,
          tone: "positive"
        },
        ...items
      ]);

      if (response.credentials.length > 0) {
        const previewCredentials = response.credentials.slice(0, 8);
        const hiddenCount = Math.max(0, response.credentials.length - previewCredentials.length);
        setActivity((items) => [
          {
            id: `import-credentials-${Date.now()}`,
            title: "Credentials generated",
            description: `${previewCredentials.map((item) => `${item.fullName}: ${item.email} / ${item.password}`).join(" | ")}${hiddenCount > 0 ? ` | +${hiddenCount} more` : ""}`,
            tone: "neutral"
          },
          ...items
        ]);
      }

      if (orgId) {
        const refreshed = await apiFetch<OrgTreeResponse>(`/api/orgs/${orgId}/tree`);
        setMembers(refreshed.nodes);
        setPositions((refreshed.positions ?? []).slice().sort((a, b) => (a.level - b.level) || a.title.localeCompare(b.title)));
        setMemberDrafts(
          Object.fromEntries(
            refreshed.nodes.map((member) => [
              member.id,
              {
                role: member.role,
                position_id: member.position_id ?? null,
                reports_to: member.reports_to ?? null,
                department: member.department ?? ""
              }
            ])
          )
        );
      }
    } catch (error) {
      setActivity((items) => [
        {
          id: `import-error-${Date.now()}`,
          title: "Employee import failed",
          description: error instanceof Error ? error.message : "Unable to import employees",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setImportingEmployees(false);
    }
  }

  async function decideMember(memberId: string, decision: "approve" | "reject") {
    try {
      setActionId(memberId);
      if (decision === "approve") {
        await apiFetch(`/api/orgs/members/${memberId}/approve`, { method: "POST" });
      } else {
        const reason = window.prompt("Reason for rejection (minimum 3 characters):", "Insufficient fit") ?? "";
        if (reason.trim().length < 3) {
          throw new Error("Rejection reason must be at least 3 characters.");
        }
        await apiFetch(`/api/orgs/members/${memberId}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason })
        });
      }

      setPendingMembers((items) => items.filter((member) => member.id !== memberId));
      setSummary((current) => ({ ...current, pendingMembers: Math.max(0, current.pendingMembers - 1) }));
      setActivity((items) => [
        {
          id: `member-${decision}-${memberId}`,
          title: decision === "approve" ? "Member approved" : "Member rejected",
          description: `Decision recorded for ${memberId}.`,
          tone: decision === "approve" ? "positive" : "warning"
        },
        ...items
      ]);
    } catch (error) {
      setActivity((items) => [
        {
          id: `member-error-${memberId}`,
          title: "Approval action failed",
          description: error instanceof Error ? error.message : "Unable to process member decision",
          tone: "warning"
        },
        ...items
      ]);
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-6 px-0 py-3 sm:px-2 lg:px-4">
      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)]/90 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-[var(--muted)]">CEO dashboard</p>
            <h1 className="mt-3 break-words font-serif text-3xl leading-tight text-[var(--ink)] sm:text-4xl lg:text-6xl">Control center</h1>
            <p className="mt-4 max-w-2xl break-words text-base leading-7 text-[var(--muted)]">
              Switch between approvals and organization setup to onboard people without using the profile completion page.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("approvals")}
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${view === "approvals" ? "bg-[#f59e0b] text-[#0f1115]" : "border border-[var(--border)] bg-[#0f1115] text-[var(--ink)]"}`}
              >
                Approvals
              </button>
              <button
                type="button"
                onClick={() => setView("org-setup")}
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${view === "org-setup" ? "bg-[#f59e0b] text-[#0f1115]" : "border border-[var(--border)] bg-[#0f1115] text-[var(--ink)]"}`}
              >
                Org setup
              </button>
              <button
                type="button"
                onClick={() => setView("accounts")}
                className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${view === "accounts" ? "bg-[#f59e0b] text-[#0f1115]" : "border border-[var(--border)] bg-[#0f1115] text-[var(--ink)]"}`}
              >
                Accounts
              </button>
            </div>
          </div>
          <div className={`inline-flex items-center gap-2 self-start rounded-full px-4 py-2 text-sm font-semibold ${wsConnected ? "bg-[#102017] text-[#86efac]" : "bg-[#25170f] text-[#fdba74]"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${wsConnected ? "bg-[#22c55e]" : "bg-[#f59e0b]"}`} />
            {wsConnected ? "Realtime connected" : "Connecting realtime"}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pending members", value: summary.pendingMembers },
            { label: "Goals", value: summary.goals },
            { label: "Tasks", value: summary.tasks },
            { label: "Reports", value: summary.reports }
          ].map((stat) => (
            <article key={stat.label} className="rounded-3xl border border-[var(--border)] bg-[#0f1115] p-4">
              <p className="text-sm font-medium text-[var(--muted)]">{stat.label}</p>
              <p className="mt-2 text-3xl font-semibold text-[var(--ink)]">{stat.value}</p>
            </article>
          ))}
        </div>
      </section>

      {view === "org-setup" ? (
        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">Organization setup</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Create your org once, then maintain position levels here for smooth employee onboarding.</p>

            {!orgId ? (
              <div className="mt-6 space-y-3 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Create organization</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    className="w-full rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                    type="text"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="ORGOS Velocity Labs"
                  />
                  <input
                    className="w-full rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                    type="text"
                    value={orgDomain}
                    onChange={(event) => setOrgDomain(event.target.value)}
                    placeholder="velocity-labs.orgos.ai"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1 text-sm text-[var(--muted)]">
                    <span className="block">Industry</span>
                    <select
                      className="w-full rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                      value={orgIndustry}
                      onChange={(event) => setOrgIndustry(event.target.value as Industry)}
                    >
                      <option value="tech">Tech</option>
                      <option value="legal">Legal</option>
                      <option value="healthcare">Healthcare</option>
                      <option value="construction">Construction</option>
                      <option value="finance">Finance</option>
                      <option value="retail">Retail</option>
                      <option value="manufacturing">Manufacturing</option>
                      <option value="education">Education</option>
                      <option value="nonprofit">Nonprofit</option>
                      <option value="hospitality">Hospitality</option>
                    </select>
                  </label>
                  <label className="space-y-1 text-sm text-[var(--muted)]">
                    <span className="block">Company size</span>
                    <select
                      className="w-full rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                      value={orgCompanySize}
                      onChange={(event) => setOrgCompanySize(event.target.value as CompanySize)}
                    >
                      <option value="startup">Startup (1-50)</option>
                      <option value="mid">Mid (51-500)</option>
                      <option value="enterprise">Enterprise (500+)</option>
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={createOrganization}
                  disabled={creatingOrg}
                  className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0f1115] transition hover:brightness-95 disabled:opacity-60"
                >
                  {creatingOrg ? "Creating organization..." : "Create organization"}
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--muted)]">
                  Organization linked. You can now create and tune position levels used during employee onboarding.
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Create positions</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[1.5fr_1fr_auto]">
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                      type="text"
                      value={newPositionTitle}
                      onChange={(event) => setNewPositionTitle(event.target.value)}
                      placeholder="Position title"
                    />
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[#0f1115] px-4 py-3 text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                      type="number"
                      min={0}
                      value={newPositionLevel}
                      onChange={(event) => setNewPositionLevel(Math.max(0, Number(event.target.value) || 0))}
                      placeholder="Level"
                    />
                    <button
                      type="button"
                      onClick={createPosition}
                      disabled={creatingPosition}
                      className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0f1115] disabled:opacity-60"
                    >
                      {creatingPosition ? "Adding..." : "Add"}
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Current position levels</p>
                  {positions.length > 0 ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {positions.map((position) => (
                        <li key={position.id} className="rounded-2xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]">
                          {position.title} (L{position.level}) {position.confirmed ? "- confirmed" : "- draft"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--muted)]">No positions yet. Add your level map above.</p>
                  )}
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Bulk employee import</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                    Upload an Excel or CSV sheet with columns like fullName, email, role, department, positionTitle, positionLevel, reportsToEmail, and password.
                  </p>
                  <div className="mt-3 grid gap-2">
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--ink)] outline-none transition file:mr-4 file:rounded-full file:border-0 file:bg-[var(--surface)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--ink)] hover:file:bg-[var(--surface-2)] focus:border-[var(--accent)]"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={async (event) => {
                        const file = event.target.files?.[0];
                        if (!file) {
                          return;
                        }

                        try {
                          const parsedRows = await importEmployeesFromFile(file);
                          setActivity((items) => [
                            {
                              id: `import-preview-${Date.now()}`,
                              title: "Spreadsheet parsed",
                              description: `Loaded ${file.name} with ${parsedRows.length} rows ready for import.`,
                              tone: "neutral"
                            },
                            ...items
                          ]);
                        } catch (error) {
                          setActivity((items) => [
                            {
                              id: `import-parse-error-${Date.now()}`,
                              title: "Spreadsheet parse failed",
                              description: error instanceof Error ? error.message : "Unable to read spreadsheet",
                              tone: "warning"
                            },
                            ...items
                          ]);
                        }
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={submitEmployeeImport}
                        disabled={importingEmployees || importRows.length === 0}
                        className="rounded-2xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[#0f1115] transition hover:brightness-95 disabled:opacity-60"
                      >
                        {importingEmployees ? "Importing..." : "Import employees"}
                      </button>
                      <span className="text-sm text-[var(--muted)]">
                        {importFileName ? `${importRows.length} parsed rows from ${importFileName}` : "No spreadsheet loaded yet"}
                      </span>
                    </div>
                    {importRows.length > 0 ? (
                      <ul className="mt-1 grid gap-2">
                        {importRows.slice(0, 5).map((row) => (
                          <li key={`${row.email}-${row.fullName}`} className="rounded-2xl bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)]">
                            {row.fullName} · {row.email} · {row.role.toUpperCase()} · {row.positionTitle ?? defaultPositionTitle(row.role)}
                          </li>
                        ))}
                        {importRows.length > 5 ? <li className="text-sm text-[var(--muted)]">+ {importRows.length - 5} more rows</li> : null}
                      </ul>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Member directory</p>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">Edit roles, positions, and reporting lines from one list. Drag-and-drop in the tree updates reporting lines too.</p>
                  <div className="mt-4 space-y-3">
                    {sortedMembers.length > 0 ? pagedMembers.map((member) => {
                      const draft = memberDrafts[member.id] ?? {
                        role: member.role,
                        position_id: member.position_id ?? null,
                        reports_to: member.reports_to ?? null,
                        department: member.department ?? ""
                      };

                      return (
                        <article key={member.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="min-w-0">
                              <p className="font-semibold text-[var(--ink)]">{member.full_name}</p>
                              <p className="break-all text-xs text-[var(--muted)]">{member.email}</p>
                              <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[#8b8f97]">{member.status ?? "active"}</p>
                            </div>
                            <div className="grid gap-2 md:grid-cols-2 xl:w-[680px] xl:grid-cols-4">
                              <select
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                                value={draft.role}
                                onChange={(event) => setMemberDrafts((current) => ({
                                  ...current,
                                  [member.id]: { ...draft, role: event.target.value as MemberDraft["role"] }
                                }))}
                              >
                                <option value="ceo">CEO</option>
                                <option value="cfo">CFO</option>
                                <option value="manager">Manager</option>
                                <option value="worker">Worker</option>
                              </select>
                              <select
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                                value={draft.position_id ?? ""}
                                onChange={(event) => setMemberDrafts((current) => ({
                                  ...current,
                                  [member.id]: { ...draft, position_id: event.target.value || null }
                                }))}
                              >
                                <option value="">Auto position</option>
                                {positions.map((position) => (
                                  <option key={position.id} value={position.id}>
                                    {position.title} (L{position.level})
                                  </option>
                                ))}
                              </select>
                              <input
                                className="rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)] outline-none transition focus:border-[var(--accent)]"
                                type="text"
                                value={draft.department}
                                onChange={(event) => setMemberDrafts((current) => ({
                                  ...current,
                                  [member.id]: { ...draft, department: event.target.value }
                                }))}
                                placeholder="Department"
                              />
                              <button
                                type="button"
                                onClick={() => void saveMemberStructure(member.id)}
                                disabled={actionId === member.id}
                                className="rounded-2xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[#0f1115] disabled:opacity-60"
                              >
                                {actionId === member.id ? "Saving..." : "Save"}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    }) : (
                      <p className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-4 py-5 text-sm text-[var(--muted)]">No members loaded yet.</p>
                    )}
                    {sortedMembers.length > 0 ? (
                      <div className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--muted)]">
                        <span>
                          Showing {(memberPage - 1) * MEMBERS_PAGE_SIZE + 1}-{Math.min(memberPage * MEMBERS_PAGE_SIZE, sortedMembers.length)} of {sortedMembers.length}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setMemberPage((current) => Math.max(1, current - 1))}
                            disabled={memberPage <= 1}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                          >
                            Prev
                          </button>
                          <span className="text-xs font-semibold uppercase tracking-[0.12em]">Page {memberPage} / {memberPageCount}</span>
                          <button
                            type="button"
                            onClick={() => setMemberPage((current) => Math.min(memberPageCount, current + 1))}
                            disabled={memberPage >= memberPageCount}
                            className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </div>

          <aside className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">People onboarding</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Members join through the onboarding flow, then appear in Approvals for your decision. Once approved, manage structure in Org Tree.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setView("approvals")}
                className="inline-flex items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface)]"
              >
                Open approvals
              </button>
              <Link
                href="/dashboard/org-tree"
                className="inline-flex items-center rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] transition hover:bg-[var(--surface)]"
              >
                Open org tree
              </Link>
            </div>
            <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-[var(--ink)]">
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Tip</p>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Employee level can be auto-assigned during profile completion from your level map (L1 manager, L2 worker).
              </p>
            </div>
          </aside>
        </section>
      ) : view === "accounts" ? (
        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ink)]">Organization accounts</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Executive view of C-suite, managers, and workers. Existing passwords are never retrievable; generate temporary passwords when needed.</p>
              </div>
              {accountsLoading ? <span className="text-sm text-[var(--muted)]">Loading...</span> : null}
            </div>

            <div className="mt-5 overflow-x-auto rounded-2xl border border-[var(--border)]">
              <table className="min-w-full divide-y divide-[var(--border)] text-sm">
                <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2">User</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Department</th>
                    <th className="px-3 py-2">Position</th>
                    <th className="px-3 py-2">Password</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)] bg-[var(--surface)] text-[var(--ink)]">
                  {accounts.map((account) => (
                    <tr key={account.id}>
                      <td className="px-3 py-2">
                        <p className="font-semibold">{account.full_name}</p>
                        <p className="text-xs text-[var(--muted)]">{account.email}</p>
                      </td>
                      <td className="px-3 py-2 text-xs uppercase tracking-[0.12em]">{account.role}</td>
                      <td className="px-3 py-2">{account.department || "Unassigned"}</td>
                      <td className="px-3 py-2">{account.position_title ? `${account.position_title} (L${account.position_level ?? "-"})` : "-"}</td>
                      <td className="px-3 py-2 text-xs text-[var(--muted)]">
                        {resetPasswordByUserId[account.id] ?? "Hidden"}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => void resetAccountPassword(account.id)}
                          disabled={actionId === account.id}
                          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[#0f1115] disabled:opacity-60"
                        >
                          {actionId === account.id ? "Resetting..." : "Reset temp password"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
              <span>Showing {accounts.length} of {accountsTotal} accounts</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAccountsPage((current) => Math.max(1, current - 1))}
                  disabled={accountsPage <= 1}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                >
                  Prev
                </button>
                <span className="text-xs font-semibold uppercase tracking-[0.12em]">Page {accountsPage}</span>
                <button
                  type="button"
                  onClick={() => setAccountsPage((current) => current + 1)}
                  disabled={accountsPage * 10 >= accountsTotal}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--ink)] disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">Credential policy</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              Existing passwords are not readable by design. Use temporary password resets for access recovery and share credentials through secure channels only.
            </p>
            <div className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--muted)]">Best practice</p>
              <p className="mt-2 text-sm text-[var(--ink)]">
                Ask each member to rotate the temporary password after first login.
              </p>
            </div>
          </aside>
        </section>
      ) : (
        <section className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <div className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-[var(--ink)]">Pending approvals</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Review onboarding requests and assign access by organization needs.</p>
              </div>
              {loading ? <span className="text-sm text-[var(--muted)]">Syncing...</span> : null}
            </div>

            <div className="mt-6 space-y-3">
              {pendingMembers.map((member) => (
                <article key={member.id} className="min-w-0 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold text-[var(--ink)]">{member.full_name}</p>
                      <p className="break-all text-sm text-[var(--muted)]">{member.email}</p>
                      <p className="mt-1 break-all text-xs uppercase tracking-[0.08em] text-[#8b8f97] sm:tracking-[0.2em]">
                        {member.position_id ? `Position ${member.position_id}` : "No position selected"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => decideMember(member.id, "approve")}
                        disabled={actionId === member.id}
                        className="rounded-2xl bg-[#2a9d8f] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#238477] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => decideMember(member.id, "reject")}
                        disabled={actionId === member.id}
                        className="rounded-2xl bg-[#ff6b35] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#e35b28] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </article>
              ))}

              {pendingMembers.length === 0 ? (
                <p className="rounded-3xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] px-4 py-6 text-sm text-[var(--muted)]">
                  No pending approvals at the moment.
                </p>
              ) : null}
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Recent goals</p>
                <div className="mt-3 space-y-3">
                  {recentGoals.map((goal) => (
                    <article key={goal.id} className="rounded-2xl bg-[var(--surface)] p-3 shadow-sm">
                      <p className="font-semibold text-[var(--ink)]">{goal.title}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{goal.priority} · {goal.status}</p>
                    </article>
                  ))}
                  {recentGoals.length === 0 ? <p className="text-sm text-[var(--muted)]">No goals loaded.</p> : null}
                </div>
              </div>

              <div className="rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Recent reports</p>
                <div className="mt-3 space-y-3">
                  {recentReports.map((report) => (
                    <article key={report.id} className="rounded-2xl bg-[var(--surface)] p-3 shadow-sm">
                      <p className="font-semibold text-[var(--ink)]">{report.status}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">Confidence {report.confidence.toFixed(2)}</p>
                    </article>
                  ))}
                  {recentReports.length === 0 ? <p className="text-sm text-[var(--muted)]">No reports loaded.</p> : null}
                </div>
              </div>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.3)]">
            <h2 className="text-2xl font-semibold text-[var(--ink)]">Approval activity</h2>
            <div className="mt-5 space-y-3">
              {activity.map((item) => (
                <article key={item.id} className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full ${toneClass(item.tone)}`} />
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--ink)]">{item.title}</p>
                      <p className="mt-1 break-words text-sm leading-6 text-[var(--muted)]">{item.description}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="mt-6 rounded-3xl border border-[var(--border)] bg-[var(--surface-2)] p-5 text-[var(--ink)]">
              <p className="text-sm uppercase tracking-[0.25em] text-[var(--muted)]">Executive note</p>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                Keep Approvals for people decisions and use Org setup for position and organization controls.
              </p>
            </div>
          </aside>
        </section>
      )}
    </div>
  );
}
