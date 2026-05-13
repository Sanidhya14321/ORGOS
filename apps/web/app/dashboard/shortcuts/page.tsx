"use client";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const shortcuts = [
  ["Cmd/Ctrl + K", "Open command palette"],
  ["?", "Open shortcut guide"],
  ["G then T", "Go to tasks"],
  ["G then I", "Go to inbox"],
  ["G then A", "Go to analytics"],
  ["G then F", "Go to forecast"]
];

export default function ShortcutsPage() {
  return (
    <AppShell eyebrow="Shortcuts" title="Keyboard shortcuts" description="A small map for power users and repetitive workflows." role={undefined}>
      <div className="min-w-0 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4 p-5">
          <Badge variant="outline" className="border-border bg-bg-elevated text-text-secondary">
            Operator memory
          </Badge>
          <p className="text-sm leading-7 text-text-secondary">
            Keep the highest-frequency navigation and palette shortcuts close by so repeated operating moves become muscle memory.
          </p>
          <Button onClick={() => window.dispatchEvent(new Event("orgos:open-command-palette"))}>Open command palette</Button>
        </Card>

        <Card className="space-y-3 p-4">
          {shortcuts.map(([key, label]) => (
            <div key={key} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-bg-elevated px-4 py-3 text-sm">
              <span className="font-medium text-text-primary">{key}</span>
              <span className="text-text-secondary">{label}</span>
            </div>
          ))}
        </Card>
      </div>
    </AppShell>
  );
}