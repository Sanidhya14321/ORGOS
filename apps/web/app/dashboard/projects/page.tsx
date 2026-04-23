import ContributorsTable from "@/components/ui/ruixen-contributors-table"
import { FirstTimeUserTour } from "@/components/ui/first-time-tour"

export default function ProjectsDashboardPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projects & Goals</h1>
            <p className="text-sm text-muted-foreground">Manage your organization&apos;s goals and projects</p>
          </div>
          <FirstTimeUserTour />
        </div>
      </div>
      <ContributorsTable />
    </div>
  )
}
