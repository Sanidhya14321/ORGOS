"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthPageShell } from "@/components/auth/auth-page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";

type ActivationResponse = {
  user?: {
    role: "ceo" | "cfo" | "manager" | "worker";
  };
};

export default function ActivateSeatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = useMemo(() => searchParams?.get("token") ?? "", [searchParams]);

  const [token, setToken] = useState(inviteToken);
  const [inviteCode, setInviteCode] = useState("");
  const [email, setEmail] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [skills, setSkills] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const payload = await apiFetch<ActivationResponse>("/api/auth/activate-seat", {
        method: "POST",
        body: JSON.stringify({
          ...(token.trim() ? { inviteToken: token.trim() } : {}),
          ...(inviteCode.trim() ? { inviteCode: inviteCode.trim() } : {}),
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(temporaryPassword.trim() ? { temporaryPassword: temporaryPassword.trim() } : {}),
          fullName: fullName.trim(),
          password,
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(skills.trim()
            ? {
                skills: skills
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean)
              }
            : {})
        })
      });

      const role = payload.user?.role ?? "worker";
      router.replace(`/dashboard/${role}`);
    } catch (activationError) {
      setError(activationError instanceof Error ? activationError.message : "Unable to activate your seat");
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="ORGOS activation"
      title="Activate your company seat"
      description="Use the invite link or the temporary access details shared by your company owner to activate your account."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <Label>Invite token</Label>
            <Input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="Paste invite token or use the link you received"
            />
          </label>

          <label className="block space-y-2">
            <Label>Invite code</Label>
            <Input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
              placeholder="Optional if you already have a link"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <Label>Work email</Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Only needed when activating via temporary password"
            />
          </label>

          <label className="block space-y-2">
            <Label>Temporary password</Label>
            <Input
              type="password"
              value={temporaryPassword}
              onChange={(event) => setTemporaryPassword(event.target.value)}
              placeholder="Optional fallback if you were not sent an invite link"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block space-y-2">
            <Label>Your full name</Label>
            <Input
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              required
            />
          </label>

          <label className="block space-y-2">
            <Label>Department</Label>
            <Input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>

        <label className="block space-y-2">
          <Label>Skills</Label>
          <Input
            value={skills}
            onChange={(event) => setSkills(event.target.value)}
            placeholder="Comma separated, optional"
          />
        </label>

        <label className="block space-y-2">
          <Label>Set your password</Label>
          <Input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>

        {error ? (
          <div className="rounded-2xl border border-danger/20 bg-danger-subtle px-4 py-3 text-sm text-danger">{error}</div>
        ) : null}

        <Button type="submit" disabled={pending}>
          {pending ? "Activating..." : "Activate seat"}
        </Button>
      </form>
    </AuthPageShell>
  );
}
