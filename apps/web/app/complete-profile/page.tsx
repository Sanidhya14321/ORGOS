"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { getAccessTokenFromBrowser } from "@/lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type OrgItem = { id: string; name: string; domain?: string | null };
type PositionItem = { id: string; title: string; level: number };

type ApiErrorResponse = { error?: { message?: string } };

async function authedFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getAccessTokenFromBrowser();
  if (!token) {
    throw new Error("Please sign in before completing profile");
  }

  const headers = new Headers(options.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.get("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
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
    setPending(true);
    setError(null);
    setMessage(null);

    try {
      await authedFetch<{ status: string }>("/api/auth/complete-profile", {
        method: "POST",
        body: JSON.stringify({
          orgId,
          positionId,
          ...(reportsTo.trim() ? { reportsTo: reportsTo.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(parsedSkills.length > 0 ? { skills: parsedSkills } : {})
        })
      });

      setMessage("Profile submitted. Waiting for executive approval.");
      router.push("/pending");
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
      description="Pick your organization, role, and reporting line to request activation."
    >
      <form onSubmit={onSubmit} className="space-y-4">
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
