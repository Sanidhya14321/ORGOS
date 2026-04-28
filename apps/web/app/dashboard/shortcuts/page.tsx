"use client";

import { AppShell } from "@/components/app-shell";
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
      <Card className="space-y-3 border border-border bg-bg-surface p-4">
        {shortcuts.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm">
            <span className="font-medium">{key}</span>
            <span className="text-text-secondary">{label}</span>
          </div>
        ))}
        <div className="pt-2">
          <Button onClick={() => window.dispatchEvent(new Event("orgos:open-command-palette"))}>Open command palette</Button>
        </div>
      </Card>
    </AppShell>
  );
}