"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Job } from "@/lib/models";

export default function PublicJobApplyPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = typeof params?.jobId === "string" ? params.jobId : "";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [coverLetter, setCoverLetter] = useState("");
  const [resumePath, setResumePath] = useState("");

  const jobQuery = useQuery({
    queryKey: ["public-job", jobId],
    queryFn: () => apiFetch<Job>(`/api/recruitment/jobs/${jobId}`),
    enabled: Boolean(jobId)
  });

  const applyMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/recruitment/jobs/${jobId}/apply`, {
        method: "POST",
        body: JSON.stringify({
          fullName,
          email,
          phone: phone || undefined,
          linkedinUrl: linkedinUrl || undefined,
          portfolioUrl: portfolioUrl || undefined,
          coverLetter: coverLetter || undefined,
          resumePath: resumePath || undefined
        })
      })
  });

  if (applyMutation.isSuccess) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[600px] items-center justify-center bg-bg-base p-6">
        <div className="rounded-xl border border-border bg-bg-surface p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-text-primary">Your application has been received.</p>
          <p className="mt-1 text-sm text-text-secondary">We will be in touch.</p>
        </div>
      </main>
    );
  }

  if (!jobId) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[600px] items-center justify-center bg-bg-base p-6">
        <div className="rounded-xl border border-border bg-bg-surface p-6 text-center shadow-sm">
          <p className="text-lg font-semibold text-text-primary">Job not found.</p>
          <p className="mt-1 text-sm text-text-secondary">The application link is missing a job id.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[600px] space-y-6 bg-bg-base p-6">
      <section className="rounded-xl border border-border bg-bg-surface p-6">
        <h1 className="text-xl font-semibold text-text-primary">{jobQuery.data?.title ?? "Job application"}</h1>
        <p className="mt-1 text-sm text-text-secondary">{jobQuery.data?.description ?? "Submit your profile"}</p>
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-bg-surface p-6">
        <Input placeholder="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} className="border-border bg-bg-subtle" />
        <Input placeholder="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="border-border bg-bg-subtle" />
        <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="border-border bg-bg-subtle" />
        <Input placeholder="LinkedIn URL" value={linkedinUrl} onChange={(e) => setLinkedinUrl(e.target.value)} className="border-border bg-bg-subtle" />
        <Input placeholder="Portfolio URL" value={portfolioUrl} onChange={(e) => setPortfolioUrl(e.target.value)} className="border-border bg-bg-subtle" />
        <Textarea placeholder="Cover letter" value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} className="border-border bg-bg-subtle" />

        <div className="rounded-xl border border-dashed border-border p-6 text-sm text-text-secondary">
          <p>Resume upload path</p>
          <Input placeholder="storage/path/resume.pdf" value={resumePath} onChange={(e) => setResumePath(e.target.value)} className="mt-2 border-border bg-bg-subtle" />
        </div>

        <Button className="w-full h-10 px-4 rounded-xl bg-accent hover:bg-accent-hover transition-all duration-200" disabled={applyMutation.isPending || !fullName || !email} onClick={() => applyMutation.mutate()}>
          {applyMutation.isPending ? "Submitting..." : "Submit application"}
        </Button>
      </section>
    </main>
  );
}
