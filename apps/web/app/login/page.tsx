import { AppShell } from "@/components/app-shell";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <AppShell
      eyebrow="ORGOS access"
      title="Sign in to the control room"
      description="Sign in with your assigned credentials. Executives can create accounts here; employees log in with the IDs issued by their company."
    >
      <LoginForm />
    </AppShell>
  );
}