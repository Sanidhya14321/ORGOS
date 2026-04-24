import { AppShell } from "@/components/app-shell";
import OnboardingForm from "@/components/ui/multistep-form";

export default function RegisterPage() {
  return (
    <AppShell
      eyebrow="ORGOS access"
      title="Create an executive account"
      description="Owners, CEOs, and CFOs can register here. Everyone else receives credentials from the company admin."
    >
      <OnboardingForm />
    </AppShell>
  );
}