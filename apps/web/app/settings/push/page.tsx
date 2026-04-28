"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function PushPage() {
  const [endpoint, setEndpoint] = useState("");
  const [p256dh, setP256dh] = useState("");
  const [auth, setAuth] = useState("");

  const subscribeMutation = useMutation({
    mutationFn: () => apiFetch("/api/push/subscribe", { method: "POST", body: JSON.stringify({ endpoint, p256dh, auth, metadata: {} }) })
  });

  return (
    <AppShell eyebrow="Push" title="Push notifications" description="Register a browser subscription for mobile-style delivery." role={undefined}>
      <Card className="space-y-3 border border-border bg-bg-surface p-4">
        <Button
          variant="outline"
          className="border-border"
          onClick={async () => {
            const permission = await Notification.requestPermission();
            if (permission === "granted") {
              setEndpoint("browser-permission-granted");
            }
          }}
        >
          Request browser permission
        </Button>
        <Input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="Push endpoint" className="border-border bg-bg-subtle" />
        <Input value={p256dh} onChange={(event) => setP256dh(event.target.value)} placeholder="p256dh key" className="border-border bg-bg-subtle" />
        <Input value={auth} onChange={(event) => setAuth(event.target.value)} placeholder="auth key" className="border-border bg-bg-subtle" />
        <Button onClick={() => subscribeMutation.mutate()} disabled={subscribeMutation.isPending}>Save subscription</Button>
      </Card>
    </AppShell>
  );
}