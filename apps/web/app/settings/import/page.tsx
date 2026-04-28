"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function ImportPage() {
  const [subject, setSubject] = useState("Quarterly planning sync");
  const [notes, setNotes] = useState("Discuss launch timing, owners, and follow-up tasks.");
  const [rawTranscript, setRawTranscript] = useState("Ship onboarding update. Assign beta fixes. Review launch risks.");

  const importMutation = useMutation({
    mutationFn: () => apiFetch("/api/meetings/import", {
      method: "POST",
      body: JSON.stringify({ source: "manual", subject, notes, rawTranscript, attendees: [] })
    })
  });

  return (
    <AppShell eyebrow="Import" title="Import meetings and notes" description="Capture a meeting, extract follow-ups, and load them into ORGOS." role={undefined}>
      <Card className="space-y-3 border border-border bg-bg-surface p-4">
        <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Meeting subject" className="border-border bg-bg-subtle" />
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Meeting notes" className="border-border bg-bg-subtle" />
        <Textarea value={rawTranscript} onChange={(event) => setRawTranscript(event.target.value)} placeholder="Transcript or action items" className="border-border bg-bg-subtle" />
        <Button onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>Import meeting</Button>
      </Card>
    </AppShell>
  );
}