"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

type Org = { id: string; name: string };
type Position = { id: string; title: string; level: number };

export function RegisterWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ceo" | "cfo">("ceo");

  const [orgQuery, setOrgQuery] = useState("");
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [createOrgName, setCreateOrgName] = useState("");
  const [orgLoading, setOrgLoading] = useState(false);

  const [positions, setPositions] = useState<Position[]>([]);
  const [positionId, setPositionId] = useState<string>("");

  const stepText = useMemo(() => `Step ${step} of 3`, [step]);

  async function handleRegisterBase() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password, role })
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Registration failed");
      }

      setStep(2);
      await searchOrgs(orgQuery);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  async function searchOrgs(query: string) {
    setOrgLoading(true);
    try {
      const data = await apiFetch<{ items: Org[] }>(`/api/orgs/search?q=${encodeURIComponent(query || "")}`);
      setOrgs(data.items ?? []);
    } catch {
      setOrgs([]);
    } finally {
      setOrgLoading(false);
    }
  }

  async function handleOrgContinue() {
    setLoading(true);
    setError(null);
    try {
      let orgId = selectedOrgId;
      if (role === "ceo" && !orgId && createOrgName.trim()) {
        const created = await apiFetch<{ org: { id: string } }>("/api/orgs/create", {
          method: "POST",
          body: JSON.stringify({ name: createOrgName.trim(), domain: email.split("@")[1] ?? "" })
        });
        orgId = created.org.id;
      }

      if (!orgId) {
        throw new Error("Choose an organization or create one");
      }

      setSelectedOrgId(orgId);
      const positionResponse = await apiFetch<{ items: Position[] }>(`/api/orgs/${orgId}/positions`);
      setPositions(positionResponse.items ?? []);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to continue");
    } finally {
      setLoading(false);
    }
  }

  async function completeProfile() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/complete-profile", {
        method: "POST",
        body: JSON.stringify({ orgId: selectedOrgId, positionId: positionId || undefined })
      });
      router.push("/pending");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete profile");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">{stepText}</p>

      <AnimatePresence mode="wait">
        {step === 1 ? (
          <motion.div key="step1" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full name</Label>
              <Input id="fullName" value={fullName} onChange={(e) => setFullName(e.target.value)} className="border-border bg-bg-subtle" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-border bg-bg-subtle" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="border-border bg-bg-subtle" />
            </div>
            <div className="space-y-2">
              <Label>Executive role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "ceo" | "cfo")}>
                <SelectTrigger className="border-border bg-bg-subtle">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ceo">CEO</SelectItem>
                  <SelectItem value="cfo">CFO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-accent hover:bg-accent-hover" disabled={loading || !fullName || !email || password.length < 8} onClick={handleRegisterBase}>
              {loading ? "Creating account..." : "Continue"}
            </Button>
          </motion.div>
        ) : null}

        {step === 2 ? (
          <motion.div key="step2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgSearch">Search organization</Label>
              <Input
                id="orgSearch"
                value={orgQuery}
                onChange={(e) => {
                  const next = e.target.value;
                  setOrgQuery(next);
                  void searchOrgs(next);
                }}
                className="border-border bg-bg-subtle"
                placeholder="Type org name"
              />
            </div>

            {orgLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <div className="space-y-2">
                {orgs.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    onClick={() => setSelectedOrgId(org.id)}
                    className={`focus-ring w-full rounded-md border px-3 py-2 text-left text-sm ${selectedOrgId === org.id ? "border-accent bg-accent-subtle text-accent" : "border-border bg-bg-subtle text-text-secondary"}`}
                  >
                    {org.name}
                  </button>
                ))}
              </div>
            )}

            {role === "ceo" ? (
              <div className="space-y-2">
                <Label htmlFor="newOrg">Or create organization</Label>
                <Input id="newOrg" value={createOrgName} onChange={(e) => setCreateOrgName(e.target.value)} className="border-border bg-bg-subtle" />
              </div>
            ) : null}

            <Button className="w-full bg-accent hover:bg-accent-hover" disabled={loading} onClick={handleOrgContinue}>
              {loading ? "Saving organization..." : "Continue"}
            </Button>
          </motion.div>
        ) : null}

        {step === 3 ? (
          <motion.div key="step3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
            <div className="space-y-2">
              <Label>Choose position</Label>
              <Select value={positionId} onValueChange={setPositionId}>
                <SelectTrigger className="border-border bg-bg-subtle">
                  <SelectValue placeholder="Select a position" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((pos) => (
                    <SelectItem key={pos.id} value={pos.id}>{pos.title} · L{pos.level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full bg-accent hover:bg-accent-hover" disabled={loading} onClick={completeProfile}>
              {loading ? "Finishing setup..." : "Finish setup"}
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
