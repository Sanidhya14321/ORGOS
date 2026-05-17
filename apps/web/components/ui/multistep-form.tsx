"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, apiFetch } from "@/lib/api";
import { navigateAfterAuth, type AuthSessionResponse } from "@/lib/post-auth-navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ExecutiveRole = "ceo" | "cfo";

type FormData = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: ExecutiveRole;
  department: string;
  companyName: string;
  companyDomain: string;
  orgSize: string;
  primaryObjective: string;
  currentChallenge: string;
  implementationTimeline: string;
  notificationsEnabled: boolean;
  aiAssistantEnabled: boolean;
  agreeToTerms: boolean;
};

type RegisterResponse = AuthSessionResponse & {
  message?: string;
};

const steps = [
  { id: "identity", title: "Identity" },
  { id: "security", title: "Security" },
  { id: "organization", title: "Organization" },
  { id: "goals", title: "Goals" },
  { id: "preferences", title: "Preferences" },
  { id: "review", title: "Review" }
] as const;

const initialFormData: FormData = {
  fullName: "",
  email: "",
  password: "",
  confirmPassword: "",
  role: "ceo",
  department: "",
  companyName: "",
  companyDomain: "",
  orgSize: "",
  primaryObjective: "",
  currentChallenge: "",
  implementationTimeline: "",
  notificationsEnabled: true,
  aiAssistantEnabled: true,
  agreeToTerms: false
};

const fadeInUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22 } }
};

const contentVariants = {
  hidden: { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.24 } },
  exit: { opacity: 0, x: -24, transition: { duration: 0.18 } }
};

function OnboardingForm() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<FormData>(initialFormData);

  const updateFormData = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const passwordMismatch = useMemo(() => {
    if (!formData.confirmPassword) {
      return false;
    }
    return formData.password !== formData.confirmPassword;
  }, [formData.password, formData.confirmPassword]);

  const isStepValid = () => {
    switch (currentStep) {
      case 0:
        return formData.fullName.trim().length > 1 && formData.email.trim().length > 3;
      case 1:
        return formData.password.length >= 8 && !passwordMismatch;
      case 2:
        return formData.companyName.trim().length > 1 && formData.orgSize !== "";
      case 3:
        return formData.primaryObjective !== "" && formData.currentChallenge.trim().length > 5;
      case 4:
        return formData.implementationTimeline !== "" && formData.agreeToTerms;
      default:
        return true;
    }
  };

  const nextStep = () => {
    if (!isStepValid()) {
      toast.error("Please complete required fields before continuing.");
      return;
    }

    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    if (!isStepValid() || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        fullName: formData.fullName.trim(),
        email: formData.email.trim().toLowerCase(),
        password: formData.password,
        role: formData.role,
        department: formData.department.trim() || undefined
      };

      const response = await apiFetch<RegisterResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      // Persist setup preferences for org bootstrap screens.
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          "orgos_onboarding_prefill",
          JSON.stringify({
            companyName: formData.companyName.trim(),
            companyDomain: formData.companyDomain.trim(),
            orgSize: formData.orgSize,
            primaryObjective: formData.primaryObjective,
            currentChallenge: formData.currentChallenge.trim(),
            implementationTimeline: formData.implementationTimeline,
            notificationsEnabled: formData.notificationsEnabled,
            aiAssistantEnabled: formData.aiAssistantEnabled
          })
        );
      }

      toast.success(response.message || "Account created.");
      navigateAfterAuth(router, response);
    } catch (error) {
      const message =
        error instanceof ApiError ? error.message : error instanceof Error ? error.message : "Registration failed";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl py-6">
      <motion.div
        className="mb-8"
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28 }}
      >
        <div className="mb-2 flex justify-between">
          {steps.map((step, index) => (
            <motion.div key={step.id} className="flex flex-col items-center" whileHover={{ scale: 1.05 }}>
              <motion.div
                className={cn(
                  "h-4 w-4 cursor-pointer rounded-full transition-colors duration-200",
                  index < currentStep
                    ? "bg-primary"
                    : index === currentStep
                      ? "bg-primary ring-4 ring-primary/20"
                      : "bg-muted"
                )}
                onClick={() => {
                  if (index <= currentStep) {
                    setCurrentStep(index);
                  }
                }}
                whileTap={{ scale: 0.94 }}
              />
              <span
                className={cn(
                  "mt-1.5 hidden text-xs sm:block",
                  index === currentStep ? "font-medium text-primary" : "text-muted-foreground"
                )}
              >
                {step.title}
              </span>
            </motion.div>
          ))}
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: 0 }}
            animate={{ width: `${(currentStep / (steps.length - 1)) * 100}%` }}
            transition={{ duration: 0.24 }}
          />
        </div>
      </motion.div>

      <Card className="overflow-hidden rounded-3xl border shadow-md">
        <AnimatePresence mode="wait">
          <motion.div key={currentStep} initial="hidden" animate="visible" exit="exit" variants={contentVariants}>
            {currentStep === 0 && (
              <>
                <CardHeader>
                  <CardTitle>Executive identity</CardTitle>
                  <CardDescription>Set up the executive account that will manage ORGOS.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="fullName">Full name</Label>
                    <Input
                      id="fullName"
                      value={formData.fullName}
                      onChange={(e) => updateFormData("fullName", e.target.value)}
                      placeholder="Jane Miller"
                    />
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateFormData("email", e.target.value)}
                      placeholder="jane@company.com"
                    />
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label>Executive role</Label>
                    <RadioGroup
                      value={formData.role}
                      onValueChange={(value: ExecutiveRole) => updateFormData("role", value)}
                      className="grid grid-cols-2 gap-3"
                    >
                      <Label htmlFor="role-ceo" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                        <RadioGroupItem id="role-ceo" value="ceo" />
                        CEO
                      </Label>
                      <Label htmlFor="role-cfo" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                        <RadioGroupItem id="role-cfo" value="cfo" />
                        CFO
                      </Label>
                    </RadioGroup>
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="department">Department (optional)</Label>
                    <Input
                      id="department"
                      value={formData.department}
                      onChange={(e) => updateFormData("department", e.target.value)}
                      placeholder="Finance, Operations, Strategy..."
                    />
                  </motion.div>
                </CardContent>
              </>
            )}

            {currentStep === 1 && (
              <>
                <CardHeader>
                  <CardTitle>Security setup</CardTitle>
                  <CardDescription>Create credentials for secure ORGOS access.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => updateFormData("password", e.target.value)}
                      placeholder="At least 8 characters"
                    />
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => updateFormData("confirmPassword", e.target.value)}
                      placeholder="Re-enter password"
                    />
                    {passwordMismatch ? (
                      <p className="text-xs text-red-600">Passwords do not match.</p>
                    ) : null}
                  </motion.div>
                </CardContent>
              </>
            )}

            {currentStep === 2 && (
              <>
                <CardHeader>
                  <CardTitle>Organization context</CardTitle>
                  <CardDescription>Provide the business profile ORGOS will be configured around.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="companyName">Organization name</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => updateFormData("companyName", e.target.value)}
                      placeholder="Acme Holdings"
                    />
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="companyDomain">Primary domain (optional)</Label>
                    <Input
                      id="companyDomain"
                      value={formData.companyDomain}
                      onChange={(e) => updateFormData("companyDomain", e.target.value)}
                      placeholder="acme.com"
                    />
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label>Organization size</Label>
                    <Select value={formData.orgSize} onValueChange={(value) => updateFormData("orgSize", value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select team size" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1-20">1-20 employees</SelectItem>
                        <SelectItem value="21-100">21-100 employees</SelectItem>
                        <SelectItem value="101-500">101-500 employees</SelectItem>
                        <SelectItem value="500+">500+ employees</SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>
                </CardContent>
              </>
            )}

            {currentStep === 3 && (
              <>
                <CardHeader>
                  <CardTitle>Execution goals</CardTitle>
                  <CardDescription>Tell ORGOS what outcomes matter most in your first 90 days.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label>Primary objective</Label>
                    <RadioGroup
                      value={formData.primaryObjective}
                      onValueChange={(value) => updateFormData("primaryObjective", value)}
                      className="space-y-2"
                    >
                      <Label htmlFor="obj-alignment" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                        <RadioGroupItem id="obj-alignment" value="alignment" />
                        Improve cross-team alignment
                      </Label>
                      <Label htmlFor="obj-visibility" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                        <RadioGroupItem id="obj-visibility" value="visibility" />
                        Increase execution visibility
                      </Label>
                      <Label htmlFor="obj-cycle-time" className="flex cursor-pointer items-center gap-2 rounded-xl border p-3">
                        <RadioGroupItem id="obj-cycle-time" value="cycle-time" />
                        Reduce decision-to-delivery cycle time
                      </Label>
                    </RadioGroup>
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label htmlFor="currentChallenge">Current challenge</Label>
                    <Textarea
                      id="currentChallenge"
                      value={formData.currentChallenge}
                      onChange={(e) => updateFormData("currentChallenge", e.target.value)}
                      placeholder="Where is execution currently getting blocked?"
                      rows={4}
                    />
                  </motion.div>
                </CardContent>
              </>
            )}

            {currentStep === 4 && (
              <>
                <CardHeader>
                  <CardTitle>Working preferences</CardTitle>
                  <CardDescription>Choose how ORGOS should assist your team out of the box.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <motion.div variants={fadeInUp} className="space-y-2">
                    <Label>Implementation timeline</Label>
                    <Select
                      value={formData.implementationTimeline}
                      onValueChange={(value) => updateFormData("implementationTimeline", value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select timeline" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="immediate">Immediate (this week)</SelectItem>
                        <SelectItem value="month">Within 30 days</SelectItem>
                        <SelectItem value="quarter">Within this quarter</SelectItem>
                      </SelectContent>
                    </Select>
                  </motion.div>

                  <motion.div variants={fadeInUp} className="space-y-3">
                    <Label className="text-sm">Product settings</Label>
                    <label className="flex items-center gap-3 rounded-xl border p-3">
                      <Checkbox
                        checked={formData.notificationsEnabled}
                        onCheckedChange={(checked) => updateFormData("notificationsEnabled", checked === true)}
                      />
                      <span className="text-sm">Enable proactive notifications</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border p-3">
                      <Checkbox
                        checked={formData.aiAssistantEnabled}
                        onCheckedChange={(checked) => updateFormData("aiAssistantEnabled", checked === true)}
                      />
                      <span className="text-sm">Enable AI-assisted task routing suggestions</span>
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border p-3">
                      <Checkbox
                        checked={formData.agreeToTerms}
                        onCheckedChange={(checked) => updateFormData("agreeToTerms", checked === true)}
                      />
                      <span className="text-sm">I agree to the platform terms and data policy</span>
                    </label>
                  </motion.div>
                </CardContent>
              </>
            )}

            {currentStep === 5 && (
              <>
                <CardHeader>
                  <CardTitle>Review and create account</CardTitle>
                  <CardDescription>Confirm details before we create your ORGOS executive account.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-1 gap-3 rounded-2xl border p-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Name</p>
                      <p className="font-medium">{formData.fullName || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Email</p>
                      <p className="font-medium">{formData.email || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Role</p>
                      <p className="font-medium">{formData.role.toUpperCase()}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Department</p>
                      <p className="font-medium">{formData.department || "Not provided"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Organization</p>
                      <p className="font-medium">{formData.companyName || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Team Size</p>
                      <p className="font-medium">{formData.orgSize || "-"}</p>
                    </div>
                  </div>

                  <div className="rounded-2xl border p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Execution focus</p>
                    <p className="mt-1 font-medium">{formData.primaryObjective || "-"}</p>
                    <p className="mt-2 text-muted-foreground">{formData.currentChallenge || "-"}</p>
                  </div>
                </CardContent>
              </>
            )}
          </motion.div>
        </AnimatePresence>

        <CardFooter className="flex items-center justify-between border-t bg-muted/30 px-6 py-4">
          <Button variant="outline" onClick={prevStep} disabled={currentStep === 0 || isSubmitting}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Back
          </Button>

          <Button
            onClick={currentStep === steps.length - 1 ? handleSubmit : nextStep}
            disabled={!isStepValid() || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating account...
              </>
            ) : currentStep === steps.length - 1 ? (
              "Create account"
            ) : (
              <>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default OnboardingForm;
