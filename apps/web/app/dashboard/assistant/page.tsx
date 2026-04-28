"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AssistantResponse = { answer: string; actions: Array<{ label: string; href: string }> };

export default function AssistantPage() {
  const [question, setQuestion] = useState("What should I do next?");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);

  const askMutation = useMutation({
    mutationFn: () => apiFetch<AssistantResponse>("/api/ai/ask", { method: "POST", body: JSON.stringify({ question }) }),
    onSuccess: (response) => {
      setMessages((current) => [...current, { role: "user", text: question }, { role: "assistant", text: response.answer }]);
    }
  });

  return (
    <AppShell eyebrow="Assistant" title="Contextual AI assistant" description="Ask for next actions, summaries, or workflow guidance." role={undefined}>
      <div className="space-y-4">
        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-28 border-border bg-bg-subtle" />
          <Button onClick={() => askMutation.mutate()} disabled={askMutation.isPending}>Ask</Button>
        </Card>
        <Card className="space-y-3 border border-border bg-bg-surface p-4">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`rounded-lg p-3 text-sm ${message.role === "user" ? "bg-bg-elevated" : "bg-accent-subtle"}`}>
              <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">{message.role}</p>
              <p className="mt-1">{message.text}</p>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}