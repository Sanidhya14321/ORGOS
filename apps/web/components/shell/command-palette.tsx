"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Target, CheckSquare, UserRound, BriefcaseBusiness, Sparkles } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { canAccessSection, canManageGoals } from "@/lib/access";
import type { Goal, Task, User, Applicant } from "@/lib/models";

type ActionItem = {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function CommandPalette({
  goals,
  tasks,
  people,
  applicants,
  role
}: {
  goals: Goal[];
  tasks: Task[];
  people: User[];
  applicants: Applicant[];
  role?: User["role"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const openCommandPalette = () => setOpen(true);
    document.addEventListener("keydown", down);
    window.addEventListener("orgos:open-command-palette", openCommandPalette);
    return () => {
      document.removeEventListener("keydown", down);
      window.removeEventListener("orgos:open-command-palette", openCommandPalette);
    };
  }, []);

  const actions: ActionItem[] = useMemo(
    () => [
      ...(canManageGoals(role)
        ? [{ id: "create-goal", label: "Create Goal", description: "Open goals dashboard", href: "/dashboard/goals", icon: Sparkles }]
        : []),
      ...(canAccessSection(role, "taskBoard")
        ? [{ id: "create-task", label: "Create Task", description: "Open task board", href: "/dashboard/task-board", icon: CheckSquare }]
        : []),
      ...(canAccessSection(role, "team")
        ? [{ id: "open-collaboration", label: "Open Collaboration Hub", description: "Manage team threads and seat access", href: "/dashboard/team", icon: UserRound }]
        : []),
      ...(canAccessSection(role, "recruitment")
        ? [{ id: "open-recruitment", label: "Open Recruitment", description: "Review positions and applicants", href: "/dashboard/recruit", icon: BriefcaseBusiness }]
        : [])
    ],
    [role]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-2xl p-0" aria-label="Command palette">
        <Command>
          <CommandInput placeholder="Search goals, tasks, people, applicants, or actions" aria-label="Search commands" />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>

            <CommandGroup heading="Actions">
              {actions.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.label} ${item.description}`}
                  onSelect={() => {
                    setOpen(false);
                    router.push(item.href);
                  }}
                >
                  <item.icon className="mr-2 h-4 w-4" />
                  <div>
                    <p>{item.label}</p>
                    <p className="text-xs text-text-muted">{item.description}</p>
                  </div>
                  <CommandShortcut>↵</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Goals">
              {goals.slice(0, 8).map((goal) => (
                <CommandItem key={goal.id} value={`${goal.title} goal`} onSelect={() => {
                  setOpen(false);
                  router.push(`/dashboard/goals?expand=${goal.id}`);
                }}>
                  <Target className="mr-2 h-4 w-4" />
                  <span>{goal.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Tasks">
              {tasks.slice(0, 8).map((task) => (
                <CommandItem key={task.id} value={`${task.title} task`} onSelect={() => {
                  setOpen(false);
                  router.push(`/dashboard/task-board?taskId=${task.id}`);
                }}>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  <span>{task.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="People">
              {people.slice(0, 8).map((person) => (
                <CommandItem key={person.id} value={`${person.full_name} ${person.role}`} onSelect={() => {
                  setOpen(false);
                  router.push("/dashboard/org-tree");
                }}>
                  <UserRound className="mr-2 h-4 w-4" />
                  <span>{person.full_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>

            <CommandGroup heading="Applicants">
              {applicants.slice(0, 8).map((applicant) => (
                <CommandItem key={applicant.id} value={`${applicant.full_name} ${applicant.email}`} onSelect={() => {
                  setOpen(false);
                  router.push(`/dashboard/recruit?applicant=${applicant.id}`);
                }}>
                  <BriefcaseBusiness className="mr-2 h-4 w-4" />
                  <span>{applicant.full_name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
