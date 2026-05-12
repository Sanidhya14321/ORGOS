"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OrgItem = { id: string; name: string; domain?: string | null };
type PositionItem = { id: string; title: string; level: number };
type UserRole = "ceo" | "cfo" | "manager" | "worker";

type MePayload = {
  id: string;
  role: UserRole;
  status?: "pending" | "active" | "rejected";
  org_id?: string | null;
};

type ApiErrorResponse = { error?: { message?: string } };

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

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

  const [me, setMe] = useState<MePayload | null>(null);
  const [query, setQuery] = useState("");
  const [orgs, setOrgs] = useState<OrgItem[]>([]);
  const [orgId, setOrgId] = useState("");
  const [positions, setPositions] = useState<PositionItem[]>([]);
  const [positionId, setPositionId] = useState("");
  const [reportsTo, setReportsTo] = useState("");
  const [department, setDepartment] = useState("");
  const [skills, setSkills] = useState("");
  const [pending, setPending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
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

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const profile = await authedFetch<MePayload>("/api/me");
        if (!active) {
          return;
        }

        setMe(profile);

        // CEO/CFO onboarding is now managed inside the CEO dashboard org setup view.
        if (profile.role === "ceo" || profile.role === "cfo") {
          router.replace("/dashboard/ceo");
          return;
        }

        if (profile.org_id) {
          setOrgId(profile.org_id);
        }
      } catch (profileError) {
        if (!active) {
          return;
        }
        setError(profileError instanceof Error ? profileError.message : "Unable to load your profile");
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [router]);

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

        const list = response.items ?? [];
        setPositions(list);

        // Employee-friendly default: auto-select by role level if available.
        if (me?.role) {
          const targetLevel = me.role === "manager" ? 1 : 2;
          const suggested = list.find((position) => position.level === targetLevel);
          if (suggested?.id) {
            setPositionId(suggested.id);
          }
        }
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
  }, [me?.role, orgId]);

  async function searchOrganizations() {
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!orgId) {
      setError("Please choose an organization first.");
      return;
    }

    setPending(true);
    setError(null);
    setMessage(null);

    try {
      const payload = await authedFetch<{ user?: { role: UserRole; status?: "pending" | "active" | "rejected" } }>("/api/auth/complete-profile", {
        method: "POST",
        body: JSON.stringify({
          orgId,
          ...(positionId ? { positionId } : {}),
          ...(reportsTo.trim() ? { reportsTo: reportsTo.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(parsedSkills.length > 0 ? { skills: parsedSkills } : {})
        })
      });

      const nextRole = payload.user?.role ?? me?.role;
      const nextStatus = payload.user?.status;

      if (nextRole && nextStatus === "active") {
        setMessage("Profile linked. Redirecting to your dashboard.");
        router.push(`/dashboard/${nextRole}`);
      } else {
        setMessage("Profile submitted. Waiting for executive approval.");
        router.push("/pending");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to complete onboarding");
    } finally {
      setPending(false);
    }
  }

  if (loadingProfile) {
    return (
      <AuthPageShell
        eyebrow="ORGOS onboarding"
        title="Setting things up"
        description="Loading your workspace context..."
      >
        <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">Please wait...</div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      eyebrow="ORGOS onboarding"
      title="Join your organization"
      description="Pick your company, confirm role details, and continue. CEO organization setup now happens in the CEO dashboard."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-2xl border border-border bg-bg-elevated p-4 text-sm text-text-secondary">
          This step links your account to an organization. If you are a CEO/CFO, you can manage organization setup from your CEO dashboard.
        </div>

        <label className="block space-y-2">
          <Label>Find organization</Label>
          <div className="flex gap-2">
            <Input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by organization name"
            />
            <Button
              type="button"
              onClick={searchOrganizations}
              disabled={searching}
            >
              {searching ? "Searching..." : "Search"}
            </Button>
          </div>
        </label>

        <label className="block space-y-2">
          <Label>Organization</Label>
          <select
            className="flex h-12 w-full rounded-2xl border border-border bg-bg-subtle/75 px-4 py-3 text-sm text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/25"
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

        <label className="block space-y-2">
          <Label>Position (optional)</Label>
          <select
            className="flex h-12 w-full rounded-2xl border border-border bg-bg-subtle/75 px-4 py-3 text-sm text-text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/25"
            value={positionId}
            onChange={(event) => setPositionId(event.target.value)}
          >
            <option value="">Auto-assign by role level</option>
            {positions.map((position) => (
              <option key={position.id} value={position.id}>
                {position.title} (L{position.level})
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-2">
          <Label>Reports to (optional user ID)</Label>
          <Input
            type="text"
            value={reportsTo}
            onChange={(event) => setReportsTo(event.target.value)}
            placeholder="Manager user UUID"
          />
        </label>

        <label className="block space-y-2">
          <Label>Department</Label>
          <Input
            type="text"
            value={department}
            onChange={(event) => setDepartment(event.target.value)}
            placeholder="Operations"
          />
        </label>

        <label className="block space-y-2">
          <Label>Skills (comma separated)</Label>
          <Input
            type="text"
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="typescript, analysis, project-management"
          />
        </label>

        {error ? <p className="rounded-2xl border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</p> : null}
        {message ? <p className="rounded-2xl border border-success/20 bg-success-subtle px-4 py-3 text-sm text-success">{message}</p> : null}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Submitting..." : "Continue"}
        </Button>
      </form>
    </AuthPageShell>
  );
}
