import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <AppShell
      eyebrow="ORGOS access"
      title="Sign in to the control room"
      description="First choose your account type (owner, C-suite, or employee), then sign in to enter the correct RBAC workspace."
    >
      <LoginForm />
    </AppShell>
  );
}