"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type OrgItem = { id: string; name: string; domain?: string | null };
type PositionItem = { id: string; title: string; level: number };
type UserRole = "ceo" | "cfo" | "manager" | "worker";
type OnboardingMode = "owner" | "employee";

type MePayload = {
  id: string;
  role: UserRole;
  status?: "pending" | "active" | "rejected";
  org_id?: string | null;
};

type ApiErrorResponse = { error?: { message?: string } };

async function authedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.get("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: "include"
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(body?.error?.message ?? `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return (await response.json()) as T;
}

export default function CompleteProfilePage() {
  const router = useRouter();

  const [mode, setMode] = useState<OnboardingMode>("employee");
  const [me, setMe] = useState<MePayload | null>(null);

  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [orgId, setOrgId] = useState("");
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [positionId, setPositionId] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgDomain, setOrgDomain] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  const [newPositionTitle, setNewPositionTitle] = useState("");
  const [newPositionLevel, setNewPositionLevel] = useState<0 | 1 | 2>(1);
  const [creatingPosition, setCreatingPosition] = useState(false);

  const [reportsTo, setReportsTo] = useState("");
  const [department, setDepartment] = useState("");
  const [skills, setSkills] = useState("");
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const parsedSkills = useMemo(
    () =>
      skills
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    [skills]
  );

  const canChooseOwner = !me || me.role === "ceo" || me.role === "cfo";
  const canChooseEmployee = !me || me.role === "manager" || me.role === "worker";

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const profile = await authedFetch<MePayload>("/api/me");
        if (!active) {
          return;
        }

        setMe(profile);
        setMode(profile.role === "ceo" || profile.role === "cfo" ? "owner" : "employee");

        if (profile.org_id) {
          setOrgId(profile.org_id);
        }
      } catch {
        // Keep UX interactive even if profile prefetch fails.
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!orgId) {
      setPositions([]);
      setPositionId("");
      return;
    }

    let active = true;

    (async () => {
      try {
        const response = await authedFetch<{ items: PositionItem[] }>(`/api/orgs/${orgId}/positions`);
        if (!active) {
          return;
        }
        setPositions(response.items ?? []);
      } catch (positionError) {
        if (!active) {
          return;
        }
        setError(positionError instanceof Error ? positionError.message : "Unable to load positions");
      }
    })();

    return () => {
      active = false;
    };
  }, [orgId]);

  async function searchOrganizations() {
    if (mode !== "employee") {
      return;
    }

    if (!query.trim()) {
      setOrgs([]);
      return;
    }

    setSearching(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/orgs/search?q=${encodeURIComponent(query.trim())}`);
      const body = (await response.json().catch(() => null)) as { items?: OrgItem[] } | ApiErrorResponse | null;

      if (!response.ok) {
        throw new Error((body as ApiErrorResponse | null)?.error?.message ?? "Unable to search organizations");
      }

      setOrgs((body as { items?: OrgItem[] } | null)?.items ?? []);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : "Unable to search organizations");
    } finally {
      setSearching(false);
    }
  }

  async function createOrganization() {
    if (mode !== "owner") {
      return;
    }

    if (!orgName.trim()) {
      setError("Organization name is required.");
      return;
    }

    setCreatingOrg(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await authedFetch<{ org: OrgItem }>("/api/orgs/create", {
        method: "POST",
        body: JSON.stringify({
          name: orgName.trim(),
          ...(orgDomain.trim() ? { domain: orgDomain.trim() } : {}),
          makeCreatorCeo: true
        })
      });

      setOrgId(payload.org.id);
      setQuery(payload.org.name);
      setOrgs([payload.org]);
      setMessage("Organization created. Add positions, then submit your profile.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create organization");
    } finally {
      setCreatingOrg(false);
    }
  }

  async function createPosition() {
    if (!orgId) {
      setError("Create or select an organization before adding positions.");
      return;
    }

    if (!newPositionTitle.trim()) {
      setError("Position title is required.");
      return;
    }

    setCreatingPosition(true);
    setError(null);
    setMessage(null);

    try {
      const created = await authedFetch<PositionItem>(`/api/orgs/${orgId}/positions`, {
        method: "POST",
        body: JSON.stringify({
          title: newPositionTitle.trim(),
          level: newPositionLevel
        })
      });

      setPositions((prev) => {
        const merged = [...prev, created];
        return merged.sort((a, b) => (a.level - b.level) || a.title.localeCompare(b.title));
      });
      setNewPositionTitle("");
      setMessage("Position added.");
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create position");
    } finally {
      setCreatingPosition(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await authedFetch<{ user?: { role: UserRole; status?: "pending" | "active" | "rejected" } }>("/api/auth/complete-profile", {
        method: "POST",
        body: JSON.stringify({
          orgId,
          positionId,
          ...(reportsTo.trim() ? { reportsTo: reportsTo.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(parsedSkills.length > 0 ? { skills: parsedSkills } : {})
        })
      });

      const nextRole = payload.user?.role ?? me?.role;
      const nextStatus = payload.user?.status;

      if (nextRole && nextStatus === "active") {
        setMessage("Profile completed. Redirecting to your dashboard.");
        router.push(`/dashboard/${nextRole}`);
      } else {
        setMessage("Profile submitted. Waiting for executive approval.");
        router.push("/pending");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to complete profile");
    } finally {
      setPending(false);
    }
  }

  return (
    <AppShell
      eyebrow="ORGOS onboarding"
      title="Complete your profile"
      description="Choose your onboarding path: create your company as an owner or join an existing company as an employee."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-2xl border border-[#e2ddd2] bg-[#f9f7f2] p-4 text-sm text-[#4b5563]">
          {me?.org_id
            ? "You already have an organization linked. Confirm role details and submit to continue."
            : "You are on this page because your account is not fully linked to an organization yet."}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">I am joining as</legend>
          <div className={`grid gap-2 ${canChooseOwner && canChooseEmployee ? "sm:grid-cols-2" : "sm:grid-cols-1"}`}>
            {canChooseOwner ? (
              <button
                type="button"
                onClick={() => setMode("owner")}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${mode === "owner" ? "border-[#121826] bg-[#121826] text-white" : "border-[#ddd6c8] bg-white text-[#121826]"}`}
              >
                CEO / Company owner
              </button>
            ) : null}
            {canChooseEmployee ? (
              <button
                type="button"
                onClick={() => setMode("employee")}
                className={`rounded-2xl border px-3 py-2 text-sm font-semibold transition ${mode === "employee" ? "border-[#121826] bg-[#121826] text-white" : "border-[#ddd6c8] bg-white text-[#121826]"}`}
              >
                Employee
              </button>
            ) : null}
          </div>
        </fieldset>

        {mode === "owner" ? (
          <div className="space-y-3 rounded-2xl border border-[#ddd6c8] bg-[#fcfbf8] p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Create organization</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <input
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
                type="text"
                value={orgName}
                onChange={(event) => setOrgName(event.target.value)}
                placeholder="Organization name"
              />
              <input
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
                type="text"
                value={orgDomain}
                onChange={(event) => setOrgDomain(event.target.value)}
                placeholder="company.com (optional)"
              />
            </div>
            <button
              type="button"
              onClick={createOrganization}
              disabled={creatingOrg}
              className="inline-flex items-center justify-center rounded-2xl bg-[#121826] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1c2538] disabled:opacity-60"
            >
              {creatingOrg ? "Creating organization..." : "Create organization"}
            </button>
          </div>
        ) : null}

        {mode === "employee" ? (
        <label className="block space-y-2">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Find organization</span>
          <div className="flex gap-2">
            <input
              className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by organization name"
            />
            <button
              type="button"
              onClick={searchOrganizations}
              disabled={searching}
              className="rounded-2xl bg-[#121826] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
        </label>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Organization</span>
          <select
            className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            required
          >
            <option value="">Select organization</option>
            {orgs.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </label>

        {mode === "owner" ? (
          <div className="space-y-3 rounded-2xl border border-[#ddd6c8] bg-[#fcfbf8] p-4">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Create positions</p>
            <div className="grid gap-2 sm:grid-cols-[1.5fr_1fr_auto]">
              <input
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
                type="text"
                value={newPositionTitle}
                onChange={(event) => setNewPositionTitle(event.target.value)}
                placeholder="Position title"
              />
              <select
                className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
                value={String(newPositionLevel)}
                onChange={(event) => setNewPositionLevel(Number(event.target.value) as 0 | 1 | 2)}
              >
                <option value="0">Level 0</option>
                <option value="1">Level 1</option>
                <option value="2">Level 2</option>
              </select>
              <button
                type="button"
                onClick={createPosition}
                disabled={creatingPosition || !orgId}
                className="rounded-2xl bg-[#121826] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {creatingPosition ? "Adding..." : "Add"}
              </button>
            </div>

            {positions.length > 0 ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {positions.map((position) => (
                  <li key={position.id} className="rounded-xl border border-[#e6e0d5] bg-white px-3 py-2 text-sm text-[#2f3545]">
                    {position.title} (L{position.level})
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-[#6b7280]">No positions available yet. Add one above.</p>
            )}
          </div>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Position</span>
          <select
            className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
            required
          >
            <option value="">Select position</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title}
              </option>
            ))}
          </select>
        </label>

        {mode === "employee" ? (
          <label className="block space-y-2">
            <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Reports to (optional user ID)</span>
            <input
              className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
              type="text"
              value={reportsTo}
              onChange={(event) => setReportsTo(event.target.value)}
              placeholder="Manager user UUID"
            />
          </label>
        ) : null}

        <label className="block space-y-2">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Department</span>
          <input
            className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
            type="text"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="Operations"
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-semibold uppercase tracking-[0.22em] text-[#6b7280]">Skills (comma separated)</span>
          <input
            className="w-full rounded-2xl border border-[#ddd6c8] bg-white px-4 py-3 text-[#121826] outline-none transition focus:border-[#ff6b35]"
            type="text"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="typescript, analysis, project-management"
          />
        </label>

        {error ? <p className="rounded-2xl bg-[#fff0e6] px-4 py-3 text-sm text-[#9f4f20]">{error}</p> : null}
        {message ? <p className="rounded-2xl bg-[#ebfff3] px-4 py-3 text-sm text-[#0f7b45]">{message}</p> : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-[#121826] px-4 py-3 font-semibold text-white transition hover:bg-[#1c2538] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Submitting..." : "Submit profile"}
        </button>
      </form>
    </AppShell>
  );
}
