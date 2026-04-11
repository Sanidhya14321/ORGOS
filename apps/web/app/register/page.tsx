import { AppShell } from "@/components/app-shell";
import { RegisterForm } from "@/components/register-form";

export default function RegisterPage() {
  return (
    <AppShell
      eyebrow="ORGOS access"
      title="Create your workspace account"
      description="Set up a new worker account to explore ORGOS locally. Executive roles are still meant to be provisioned by an administrator."
    >
      <RegisterForm />
    </AppShell>
  );
}