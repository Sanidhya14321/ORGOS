"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type AssistantResponse = { answer: string; actions: Array<{ label: string; href: string }> };

export default function AssistantPage() {
  const [question, setQuestion] = useState("What should I do next?");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; text: string }>>([]);
  const prompts = [
    "What should I do next?",
    "Summarize the riskiest work items this week.",
    "Which tasks need escalation right now?"
  ];

  const askMutation = useMutation({
    mutationFn: () => apiFetch<AssistantResponse>("/api/ai/ask", { method: "POST", body: JSON.stringify({ question }) }),
    onSuccess: (response) => {
      setMessages((current) => [...current, { role: "user", text: question }, { role: "assistant", text: response.answer }]);
    }
  });

  return (
    <AppShell eyebrow="Assistant" title="Contextual AI assistant" description="Ask for next actions, summaries, or workflow guidance." role={undefined}>
      <div className="min-w-0 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-5 p-5">
          <div className="space-y-3">
            <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
              Prompt composer
            </Badge>
            <p className="text-sm leading-7 text-text-secondary">
              Use the assistant for summaries, prioritization guidance, or quick navigation help grounded in the ORGOS
              workflow model.
            </p>
          </div>

          <Textarea value={question} onChange={(event) => setQuestion(event.target.value)} className="min-h-36" />

          <div className="flex flex-wrap gap-2">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => setQuestion(prompt)}
                className="rounded-full border border-border bg-bg-elevated px-3 py-2 text-xs font-semibold text-text-secondary transition hover:bg-bg-surface hover:text-text-primary"
              >
                {prompt}
              </button>
            ))}
          </div>

          <Button onClick={() => askMutation.mutate()} disabled={askMutation.isPending}>
            {askMutation.isPending ? "Thinking..." : "Ask assistant"}
          </Button>
        </Card>

        <Card className="space-y-4 p-5">
          <div className="space-y-1">
            <p className="dashboard-label">Conversation</p>
            <p className="text-sm text-text-secondary">Responses accumulate here as lightweight workflow guidance.</p>
          </div>
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-bg-elevated p-8 text-sm leading-7 text-text-secondary">
              Ask the assistant a question to start a contextual conversation.
            </div>
          ) : null}
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`rounded-[22px] p-4 text-sm ${message.role === "user" ? "bg-bg-elevated text-text-primary" : "bg-accent-subtle text-text-primary"}`}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-text-secondary">{message.role}</p>
              <p className="mt-2 leading-7">{message.text}</p>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}