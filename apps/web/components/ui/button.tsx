import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-2xl border text-sm font-semibold tracking-[0.01em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-accent text-white shadow-[0_16px_32px_rgba(var(--accent-rgb),0.22)] hover:-translate-y-0.5 hover:bg-accent-hover hover:shadow-[0_22px_40px_rgba(var(--accent-rgb),0.28)]",
        destructive:
          "border-transparent bg-danger text-white shadow-[0_16px_32px_rgba(201,78,78,0.24)] hover:-translate-y-0.5 hover:brightness-105",
        outline:
          "border-border bg-bg-surface/80 text-text-primary shadow-[0_8px_24px_rgba(23,21,19,0.06)] hover:-translate-y-0.5 hover:border-border-strong hover:bg-bg-elevated",
        secondary:
          "border-transparent bg-accent-subtle text-text-primary hover:-translate-y-0.5 hover:bg-bg-elevated",
        ghost: "border-transparent bg-transparent text-text-secondary hover:bg-bg-subtle hover:text-text-primary",
        link: "border-transparent bg-transparent px-0 text-accent underline-offset-4 hover:text-accent-hover hover:underline"
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 rounded-xl px-3.5 text-xs",
        lg: "h-12 px-6 text-sm",
        icon: "h-11 w-11 rounded-2xl"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
