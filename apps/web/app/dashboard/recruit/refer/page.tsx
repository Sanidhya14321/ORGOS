"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { canAccessSection } from "@/lib/access";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { Job, Role } from "@/lib/models";

type Referral = {
  id: string;
  applicant_name: string;
  applicant_email: string;
  relationship?: string;
  note?: string;
  status: string;
};

type MeResponse = {
  role: Role;
};

export default function ReferralPage() {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string>("");
  const [applicantName, setApplicantName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [note, setNote] = useState("");
  const meQuery = useQuery({
    queryKey: ["me", "referrals-page"],
    queryFn: () => apiFetch<MeResponse>("/api/me")
  });
  const canViewRecruitment = canAccessSection(meQuery.data?.role, "recruitment");

  const jobsQuery = useQuery({
    queryKey: ["recruitment-jobs", "refer"],
    queryFn: () => apiFetch<{ items: Job[] }>("/api/recruitment/jobs?limit=100"),
    select: (data) => data.items,
    enabled: canViewRecruitment
  });

  const referralsQuery = useQuery({
    queryKey: ["my-referrals"],
    queryFn: () => apiFetch<{ items: Referral[] }>("/api/recruitment/referrals"),
    select: (data) => data.items,
    retry: false,
    enabled: canViewRecruitment
  });

  const referMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/recruitment/jobs/${jobId}/referrals`, {
        method: "POST",
        body: JSON.stringify({ applicantName, applicantEmail, relationship, note })
      }),
    onSuccess: () => {
      setOpen(false);
      setApplicantName("");
      setApplicantEmail("");
      setRelationship("");
      setNote("");
    }
  });

  return (
    <div className="space-y-8 p-8">
      {!canViewRecruitment ? (
        <div className="rounded-xl border border-border bg-bg-surface p-4 text-sm text-text-secondary">
          Candidate referrals are available to CEO, CFO, and manager roles.
        </div>
      ) : null}
      <h2 className="text-xl font-bold tracking-tight text-text-primary">Refer candidates</h2>

      <Tabs defaultValue="open-jobs">
        <TabsList className="gap-4 p-1 rounded-xl">
          <TabsTrigger value="open-jobs" className="px-4 py-2 h-10 rounded-xl text-sm">Open jobs</TabsTrigger>
          <TabsTrigger value="my-referrals" className="px-4 py-2 h-10 rounded-xl text-sm">My referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="open-jobs" className="mt-6 grid gap-6 md:grid-cols-2">
          {jobsQuery.isLoading ? (
            <>
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-36 w-full" />
            </>
          ) : (
            (jobsQuery.data ?? []).map((job) => (
              <div key={job.id} className="rounded-xl border border-border bg-bg-surface p-6 shadow-sm">
                <p className="text-lg font-bold tracking-tight text-text-primary">{job.title}</p>
                <p className="mt-2 text-xs font-medium uppercase tracking-widest text-text-secondary">{job.department}</p>
                <Dialog open={open && jobId === job.id} onOpenChange={(next) => { setOpen(next); setJobId(job.id); }}>
                  <DialogTrigger asChild>
                    <Button className="mt-4 h-10 px-4 rounded-xl bg-accent hover:bg-accent-hover hover:scale-[1.02] transition-all duration-200">Refer</Button>
                  </DialogTrigger>
                  <DialogContent className="backdrop-blur-md bg-white/90 shadow-2xl rounded-2xl p-6">
                    <DialogHeader>
                      <DialogTitle className="text-lg font-bold tracking-tight">Refer for {job.title}</DialogTitle>
                      <DialogDescription className="text-sm text-text-secondary">Send a referral for this role.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <Input placeholder="Applicant name" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="border border-border bg-bg-subtle py-2 px-4 rounded-lg" />
                      <Input placeholder="Applicant email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} className="border border-border bg-bg-subtle py-2 px-4 rounded-lg" />
                      <Input placeholder="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} className="border border-border bg-bg-subtle py-2 px-4 rounded-lg" />
                      <Textarea placeholder="Personal note" value={note} onChange={(e) => setNote(e.target.value)} className="border border-border bg-bg-subtle py-2 px-4 rounded-lg" />
                      <Button className="w-full h-10 px-4 rounded-xl bg-accent hover:bg-accent-hover hover:scale-[1.02] transition-all duration-200" disabled={referMutation.isPending || !applicantName || !applicantEmail} onClick={() => referMutation.mutate()}>
                        Submit referral
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="my-referrals" className="mt-6 space-y-4">
          {(referralsQuery.data ?? []).map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-bg-surface p-4 shadow-sm">
              <p className="text-sm text-text-primary font-medium">{item.applicant_name} · {item.applicant_email}</p>
              <p className="mt-1 text-xs font-medium text-text-secondary">Status {item.status}</p>
            </div>
          ))}
          {(referralsQuery.data ?? []).length === 0 ? <p className="text-sm text-text-secondary">No referrals yet.</p> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
