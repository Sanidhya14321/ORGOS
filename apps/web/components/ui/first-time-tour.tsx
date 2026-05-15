"use client"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"

const tips = [
  {
    title: "Welcome to ORGOS",
    description: "This executive workspace connects goals, task routing, approvals, and reporting in one control surface.",
  },
  {
    title: "Approvals Queue",
    description: "Review pending members first so your org can be onboarded with correct role and reporting structure.",
  },
  {
    title: "Organization Setup",
    description: "Create your org, define levels, and assign reporting lines before scaling execution workflows.",
  },
  {
    title: "Projects and Goals",
    description: "Track live goals, progress states, and contributor load from the projects table in this dashboard.",
  },
  {
    title: "Execution Monitoring",
    description: "Use Task Board and Org Tree views to monitor assignments, unblock teams, and optimize handoffs.",
  },
]

function FirstTimeUserTour({ userId }: { userId?: string }) {
  const [currentTip, setCurrentTip] = useState(0)
  const [open, setOpen] = useState(false)
  const storageKey = userId ? `orgos_tour_seen_${userId}` : "orgos_ceo_tour_seen"

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const hasSeenTour = window.localStorage.getItem(storageKey)
    if (!hasSeenTour) {
      setOpen(true)
    }
  }, [storageKey])

  const handleNext = () => {
    if (currentTip < tips.length - 1) {
      setCurrentTip(currentTip + 1)
    }
  }

  const handleFinish = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "true")
    }
    setOpen(false)
    setCurrentTip(0)
  }

  const handlePrev = () => {
    if (currentTip > 0) {
      setCurrentTip(currentTip - 1)
    }
  }

  const isFirstTip = currentTip === 0
  const isLastTip = currentTip === tips.length - 1

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">Product Tour</Button>
      </PopoverTrigger>
      <PopoverContent className="max-w-[280px] py-3 shadow-none" side="top">
        <div className="space-y-3">
          <div className="space-y-1">
            <p className="text-[13px] font-medium">{tips[currentTip].title}</p>
            <p className="text-xs text-muted-foreground">{tips[currentTip].description}</p>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {currentTip + 1}/{tips.length}
            </span>
            <div className="flex gap-0.5">
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={handlePrev}
                disabled={isFirstTip}
                aria-label="Previous tip"
              >
                <ArrowLeft size={14} strokeWidth={2} aria-hidden="true" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={isLastTip ? handleFinish : handleNext}
                aria-label="Next tip"
              >
                <ArrowRight size={14} strokeWidth={2} aria-hidden="true" />
              </Button>
            </div>
          </div>

          {isLastTip ? (
            <Button size="sm" className="w-full" onClick={handleFinish}>
              Finish tour
            </Button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { FirstTimeUserTour }
