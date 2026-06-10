"use client"

import * as React from "react"
import { motion, HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

interface PremiumButtonProps extends HTMLMotionProps<"button"> {
  children: React.ReactNode
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger"
  size?: "sm" | "md" | "lg" | "xl" | "icon"
  loading?: boolean
  isLoading?: boolean
}

export function PremiumButton({ 
  children, 
  variant = "primary", 
  size = "md", 
  loading = false,
  className,
  disabled,
  ...props 
}: PremiumButtonProps) {
  // Filter out custom props that shouldn't reach the DOM
  const { isLoading: _isLoading, ...domProps } = props;
  
  const variants = {
    primary: "bg-primary text-primary-foreground shadow-sm hover:brightness-105",
    secondary: "bg-secondary text-secondary-foreground border border-border shadow-sm hover:bg-secondary/90",
    outline: "bg-transparent border-2 border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5",
    ghost: "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
    danger: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-105",
  }

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-6 py-3.5 text-base",
    xl: "px-8 py-4 text-lg",
    icon: "h-16 w-16 p-0",
  }

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      disabled={disabled || loading}
      className={cn(
        "rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 relative overflow-hidden group",
        "antialiased [backface-visibility:hidden] [transform-style:preserve-3d]", // Force hardware acceleration for sharpness
        variants[variant],
        sizes[size],
        (disabled || loading) && "opacity-50 cursor-not-allowed grayscale",
        className
      )}
      {...domProps}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      <span className="relative z-10 flex items-center gap-2">
        {children}
      </span>
    </motion.button>
  )
}

