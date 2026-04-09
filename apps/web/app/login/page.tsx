import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <AppShell
      eyebrow="ORGOS access"
      title="Sign in to the control room"
      description="Use your ORGOS credentials to see live work streams, reports, and escalation signals as they happen."
    >
      <LoginForm />
    </AppShell>
  );
}