"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { useState } from "react"

type Contributor = {
  name: string
  email: string
  avatar: string
  role: string
}

type Project = {
  id: string
  title: string
  repo: string
  status: "Active" | "Inactive" | "In Progress"
  team: string
  tech: string
  createdAt: string
  contributors: Contributor[]
}

const data: Project[] = [
  {
    id: "1",
    title: "Strategic Roadmap",
    repo: "https://github.com/orgos/strategy",
    status: "Active",
    team: "Strategy Guild",
    tech: "Planning",
    createdAt: "2024-06-01",
    contributors: [
      {
        name: "Sarah Chen",
        email: "sarah@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sarah",
        role: "Strategy Lead",
      },
      {
        name: "Marcus Johnson",
        email: "marcus@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=marcus",
        role: "Analyst",
      },
    ],
  },
  {
    id: "2",
    title: "Technology Stack",
    repo: "https://github.com/orgos/tech-stack",
    status: "In Progress",
    team: "Engineering",
    tech: "TypeScript",
    createdAt: "2024-05-22",
    contributors: [
      {
        name: "Alex Kumar",
        email: "alex@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alex",
        role: "Tech Lead",
      },
      {
        name: "Jamie Lee",
        email: "jamie@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=jamie",
        role: "DevOps",
      },
      {
        name: "Pat Wilson",
        email: "pat@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=pat",
        role: "Backend Engineer",
      },
    ],
  },
  {
    id: "3",
    title: "Market Research",
    repo: "https://github.com/orgos/research",
    status: "Active",
    team: "Growth",
    tech: "Analytics",
    createdAt: "2024-06-05",
    contributors: [
      {
        name: "Taylor Brown",
        email: "taylor@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=taylor",
        role: "Research Lead",
      },
    ],
  },
  {
    id: "4",
    title: "Brand Guidelines",
    repo: "https://github.com/orgos/branding",
    status: "Active",
    team: "Design",
    tech: "Design System",
    createdAt: "2024-04-19",
    contributors: [
      {
        name: "Casey Martinez",
        email: "casey@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=casey",
        role: "Brand Designer",
      },
      {
        name: "Jordan Davis",
        email: "jordan@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=jordan",
        role: "Creative Director",
      },
    ],
  },
  {
    id: "5",
    title: "KPI Dashboard",
    repo: "https://github.com/orgos/metrics",
    status: "Active",
    team: "Analytics",
    tech: "Data Science",
    createdAt: "2024-03-30",
    contributors: [
      {
        name: "Riley Chen",
        email: "riley@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=riley",
        role: "Data Engineer",
      },
    ],
  },
  {
    id: "6",
    title: "Communication Hub",
    repo: "https://github.com/orgos/comms",
    status: "Active",
    team: "Infrastructure",
    tech: "Real-time",
    createdAt: "2024-06-03",
    contributors: [
      {
        name: "Morgan White",
        email: "morgan@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=morgan",
        role: "Platform Engineer",
      },
      {
        name: "Sam Green",
        email: "sam@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=sam",
        role: "Infrastructure Lead",
      },
    ],
  },
  {
    id: "7",
    title: "Customization Engine",
    repo: "https://github.com/orgos/customization",
    status: "Active",
    team: "Product",
    tech: "React",
    createdAt: "2024-05-10",
    contributors: [
      {
        name: "Alex Turner",
        email: "alex.t@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=alex-t",
        role: "Product Engineer",
      },
    ],
  },
  {
    id: "8",
    title: "Admin Dashboard",
    repo: "https://github.com/orgos/admin",
    status: "Active",
    team: "Platform",
    tech: "Next.js",
    createdAt: "2024-05-28",
    contributors: [
      {
        name: "Casey Rodriguez",
        email: "casey.r@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=casey-r",
        role: "Full Stack",
      },
    ],
  },
  {
    id: "9",
    title: "Integration Layer",
    repo: "https://github.com/orgos/integrations",
    status: "Active",
    team: "Platform",
    tech: "Node.js",
    createdAt: "2024-01-18",
    contributors: [
      {
        name: "Devon Anderson",
        email: "devon@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=devon",
        role: "API Developer",
      },
      {
        name: "Morgan Phillips",
        email: "morgan.p@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=morgan-p",
        role: "Architect",
      },
    ],
  },
  {
    id: "10",
    title: "Documentation",
    repo: "https://github.com/orgos/docs",
    status: "Active",
    team: "Developer Experience",
    tech: "Markdown",
    createdAt: "2024-06-02",
    contributors: [
      {
        name: "Reese Thompson",
        email: "reese@orgos.com",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=reese",
        role: "Technical Writer",
      },
    ],
  },
]

const allColumns = [
  "Project",
  "Repository",
  "Team",
  "Tech",
  "Created At",
  "Contributors",
  "Status",
] as const

function ContributorsTable() {
  const [visibleColumns, setVisibleColumns] = useState<string[]>([...allColumns])
  const [statusFilter, setStatusFilter] = useState("")
  const [techFilter, setTechFilter] = useState("")

  const filteredData = data.filter((project) => {
    return (
      (!statusFilter || project.status === statusFilter) &&
      (!techFilter || project.tech.toLowerCase().includes(techFilter.toLowerCase()))
    )
  })

  const toggleColumn = (col: string) => {
    setVisibleColumns((prev) =>
      prev.includes(col)
        ? prev.filter((c) => c !== col)
        : [...prev, col]
    )
  }

  return (
    <div className="container my-10 space-y-4 p-4 border border-border rounded-lg bg-background shadow-sm overflow-x-auto">
      <div className="flex flex-wrap gap-4 items-center justify-between mb-6">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Filter by technology..."
            value={techFilter}
            onChange={(e) => setTechFilter(e.target.value)}
            className="w-48"
          />
          <Input
            placeholder="Filter by status..."
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48">
            {allColumns.map((col) => (
              <DropdownMenuCheckboxItem
                key={col}
                checked={visibleColumns.includes(col)}
                onCheckedChange={() => toggleColumn(col)}
              >
                {col}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Table className="w-full">
        <TableHeader>
          <TableRow>
            {visibleColumns.includes("Project") && <TableHead className="w-[180px]">Project</TableHead>}
            {visibleColumns.includes("Repository") && <TableHead className="w-[220px]">Repository</TableHead>}
            {visibleColumns.includes("Team") && <TableHead className="w-[150px]">Team</TableHead>}
            {visibleColumns.includes("Tech") && <TableHead className="w-[150px]">Tech</TableHead>}
            {visibleColumns.includes("Created At") && <TableHead className="w-[120px]">Created At</TableHead>}
            {visibleColumns.includes("Contributors") && <TableHead className="w-[150px]">Contributors</TableHead>}
            {visibleColumns.includes("Status") && <TableHead className="w-[100px]">Status</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.length ? (
            filteredData.map((project) => (
              <TableRow key={project.id}>
                {visibleColumns.includes("Project") && (
                  <TableCell className="font-medium whitespace-nowrap">{project.title}</TableCell>
                )}
                {visibleColumns.includes("Repository") && (
                  <TableCell className="whitespace-nowrap">
                    <a
                      href={project.repo}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline"
                    >
                      {project.repo.replace("https://", "")}
                    </a>
                  </TableCell>
                )}
                {visibleColumns.includes("Team") && <TableCell className="whitespace-nowrap">{project.team}</TableCell>}
                {visibleColumns.includes("Tech") && <TableCell className="whitespace-nowrap">{project.tech}</TableCell>}
                {visibleColumns.includes("Created At") && <TableCell className="whitespace-nowrap">{project.createdAt}</TableCell>}
                {visibleColumns.includes("Contributors") && (
                  <TableCell className="min-w-[120px]">
                    <div className="flex -space-x-2">
                      <TooltipProvider>
                        {project.contributors.map((contributor, idx) => (
                          <Tooltip key={idx}>
                            <TooltipTrigger asChild>
                              <Avatar className="h-8 w-8 ring-2 ring-white hover:z-10">
                                <AvatarImage src={contributor.avatar} alt={contributor.name} />
                                <AvatarFallback>{contributor.name[0]}</AvatarFallback>
                              </Avatar>
                            </TooltipTrigger>
                            <TooltipContent className="text-sm">
                              <p className="font-semibold">{contributor.name}</p>
                              <p className="text-xs text-muted-foreground">{contributor.email}</p>
                              <p className="text-xs italic">{contributor.role}</p>
                            </TooltipContent>
                          </Tooltip>
                        ))}
                      </TooltipProvider>
                    </div>
                  </TableCell>
                )}
                {visibleColumns.includes("Status") && (
                  <TableCell className="whitespace-nowrap">
                    <Badge
                      className={cn(
                        "whitespace-nowrap",
                        project.status === "Active" && "bg-green-500 text-white",
                        project.status === "Inactive" && "bg-gray-400 text-white",
                        project.status === "In Progress" && "bg-yellow-500 text-white",
                      )}
                    >
                      {project.status}
                    </Badge>
                  </TableCell>
                )}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="text-center py-6">
                No results found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default ContributorsTable
