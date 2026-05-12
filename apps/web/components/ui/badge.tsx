import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] transition-colors focus:outline-none focus:ring-2 focus:ring-accent/25 focus:ring-offset-2 focus:ring-offset-bg-base",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent text-white",
        secondary:
          "border-transparent bg-accent-subtle text-text-primary",
        destructive:
          "border-transparent bg-danger text-white",
        outline: "border-border bg-transparent text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
