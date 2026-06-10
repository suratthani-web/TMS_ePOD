"use client"

import { motion } from "framer-motion"
import { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface StatItem {
    label: string
    value: string | number
    icon: ReactNode
    color: "indigo" | "amber" | "blue" | "emerald" | "red" | "purple" | "cyan" | "pink"
}

interface StatsGridProps {
    stats: StatItem[]
    columns?: number
}

const colorMap: Record<string, { bg: string; text: string; border: string; shadow: string }> = {
    indigo:  { bg: "bg-primary/10",    text: "text-primary",    border: "border-primary/20", shadow: "shadow-primary/5" },
    amber:   { bg: "bg-amber-500/10",   text: "text-amber-400",   border: "border-amber-500/20", shadow: "shadow-amber-500/5" },
    blue:    { bg: "bg-blue-500/10",    text: "text-blue-400",    border: "border-blue-500/20", shadow: "shadow-blue-500/5" },
    emerald: { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20", shadow: "shadow-emerald-500/5" },
    red:     { bg: "bg-rose-500/10",    text: "text-rose-400",    border: "border-rose-500/20", shadow: "shadow-rose-500/5" },
    purple:  { bg: "bg-purple-500/10",  text: "text-purple-400",  border: "border-purple-500/20", shadow: "shadow-purple-500/5" },
    cyan:    { bg: "bg-cyan-500/10",    text: "text-cyan-400",    border: "border-cyan-500/20", shadow: "shadow-cyan-500/5" },
    pink:    { bg: "bg-pink-500/10",    text: "text-pink-400",    border: "border-pink-500/20", shadow: "shadow-pink-500/5" },
}

export function StatsGrid({ stats, columns = 4 }: StatsGridProps) {
    const gridCols = {
        2: "md:grid-cols-2",
        3: "md:grid-cols-3",
        4: "md:grid-cols-2 lg:grid-cols-4",
        5: "md:grid-cols-3 lg:grid-cols-5",
        6: "md:grid-cols-3 lg:grid-cols-6",
    }[columns] || "md:grid-cols-4"

    return (
        <div className={cn("grid grid-cols-2 gap-4 mb-8", gridCols)}>
            {stats.map((stat, idx) => {
                const colors = colorMap[stat.color] || colorMap.indigo
                return (
                    <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: idx * 0.1 }}
                        className={cn(
                            "p-6 rounded-2xl border shadow-sm relative overflow-hidden group transition-colors bg-card hover:bg-muted/30",
                            colors.border,
                            colors.shadow
                        )}
                    >
                        <div className="absolute -right-4 -bottom-4 opacity-[0.04] transition-opacity duration-300 pointer-events-none">
                            <div className="w-24 h-24">{stat.icon}</div>
                        </div>
                        
                        <div className="flex items-center justify-between mb-6">
                            <div className={cn("p-3 rounded-2xl transition-colors", colors.bg, colors.text)}>
                                <div className="w-6 h-6 flex items-center justify-center">
                                    {stat.icon}
                                </div>
                            </div>
                        </div>

                        <div className="relative z-10">
                            <p className="text-muted-foreground font-medium text-sm mb-2">{stat.label}</p>
                            <p className={cn("text-3xl font-semibold tracking-tight leading-none", colors.text)}>
                                {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                            </p>
                        </div>

                        <div className="absolute -bottom-3 -right-2 text-6xl font-semibold text-foreground/[0.03] pointer-events-none">
                            0{idx + 1}
                        </div>
                    </motion.div>
                )
            })}
        </div>
    )
}

