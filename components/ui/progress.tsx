import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Barra di progresso presentazionale (nessuna interazione/focus da gestire, quindi niente
 * primitive Base UI — solo markup + ARIA). `variant` sceglie il colore del riempimento:
 * "reward" per i contesti punti/livelli (BlinkPoints), "primary" per tutto il resto.
 */
function Progress({
  value,
  max = 100,
  variant = "primary",
  shimmer = true,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  value: number
  max?: number
  variant?: "primary" | "reward"
  shimmer?: boolean
}) {
  const pct = Math.min(100, Math.max(0, (value / Math.max(max, 1)) * 100))

  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={max}
      data-slot="progress"
      className={cn(
        "h-4 w-full overflow-hidden rounded-full bg-muted ring-1 ring-foreground/10",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          shimmer && "animate-shimmer",
          variant === "reward" ? "bg-gradient-to-r from-reward to-primary" : "bg-primary"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export { Progress }
