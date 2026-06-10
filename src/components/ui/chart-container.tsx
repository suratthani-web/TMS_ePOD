"use client"

import React, { useRef, useState, useEffect, type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface ChartContainerProps {
  children: ReactNode
  className?: string
  height?: number
}

type ChartElementProps = {
  width?: number
  height?: number
}

/**
 * A drop-in replacement for ResponsiveContainer.
 * Measures the container width via ResizeObserver and passes
 * explicit numeric width and height to the Recharts chart child.
 * This eliminates the "width(-1) and height(-1)" warnings entirely.
 */
export function ChartContainer({ children, className, height = 350 }: ChartContainerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Measure immediately if possible
    const rect = el.getBoundingClientRect()
    if (rect.width > 0) {
      setWidth(Math.floor(rect.width))
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.floor(entry.contentRect.width)
        if (w > 0) setWidth(w)
      }
    })

    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      ref={ref}
      className={cn("w-full", className)}
      style={{ height, minWidth: 0 }}
    >
      {width > 0
        ? React.Children.map(children, (child) => {
            if (React.isValidElement(child) && typeof child.type !== "string") {
              return React.cloneElement(child as React.ReactElement<ChartElementProps>, { width, height })
            }
            return child
          })
        : null}
    </div>
  )
}
