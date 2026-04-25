"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import type { Job } from "@/lib/models";

type Referral = {
  id: string;
  applicant_name: string;
  applicant_email: string;
  relationship?: string;
  note?: string;
  status: string;
};

export default function ReferralPage() {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState<string>("");
  const [applicantName, setApplicantName] = useState("");
  const [applicantEmail, setApplicantEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [note, setNote] = useState("");

  const jobsQuery = useQuery({
    queryKey: ["recruitment-jobs", "refer"],
    queryFn: () => apiFetch<{ items: Job[] }>("/api/recruitment/jobs?limit=100"),
    select: (data) => data.items
  });

  const referralsQuery = useQuery({
    queryKey: ["my-referrals"],
    queryFn: () => apiFetch<{ items: Referral[] }>("/api/recruitment/referrals"),
    select: (data) => data.items,
    retry: false
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
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-text-primary">Refer candidates</h2>

      <Tabs defaultValue="open-jobs">
        <TabsList>
          <TabsTrigger value="open-jobs">Open jobs</TabsTrigger>
          <TabsTrigger value="my-referrals">My referrals</TabsTrigger>
        </TabsList>

        <TabsContent value="open-jobs" className="mt-3 grid gap-3 md:grid-cols-2">
          {jobsQuery.isLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : (
            (jobsQuery.data ?? []).map((job) => (
              <div key={job.id} className="rounded-md border border-border bg-bg-surface p-4">
                <p className="text-sm font-semibold text-text-primary">{job.title}</p>
                <p className="text-xs text-text-secondary">{job.department}</p>
                <Dialog open={open && jobId === job.id} onOpenChange={(next) => { setOpen(next); setJobId(job.id); }}>
                  <DialogTrigger asChild>
                    <Button className="mt-3 bg-accent hover:bg-accent-hover">Refer</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Refer for {job.title}</DialogTitle>
                      <DialogDescription>Send a referral for this role.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <Input placeholder="Applicant name" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="border-border bg-bg-subtle" />
                      <Input placeholder="Applicant email" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} className="border-border bg-bg-subtle" />
                      <Input placeholder="Relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)} className="border-border bg-bg-subtle" />
                      <Textarea placeholder="Personal note" value={note} onChange={(e) => setNote(e.target.value)} className="border-border bg-bg-subtle" />
                      <Button className="w-full bg-accent hover:bg-accent-hover" disabled={referMutation.isPending || !applicantName || !applicantEmail} onClick={() => referMutation.mutate()}>
                        Submit referral
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="my-referrals" className="mt-3 space-y-2">
          {(referralsQuery.data ?? []).map((item) => (
            <div key={item.id} className="rounded-md border border-border bg-bg-surface p-3">
              <p className="text-sm text-text-primary">{item.applicant_name} · {item.applicant_email}</p>
              <p className="text-xs text-text-secondary">Status {item.status}</p>
            </div>
          ))}
          {(referralsQuery.data ?? []).length === 0 ? <p className="text-sm text-text-secondary">No referrals yet.</p> : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}
