"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronsUpDown, Search, MapPin } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface Route {
  Route_Name: string
  Origin: string
  Destination: string
  [key: string]: unknown
}

interface RouteAutocompleteProps {
  value?: string
  onChange?: (value: string) => void
  routes: Route[]
  onSelect: (route: Route) => void
  className?: string
  placeholder?: string
}

export function RouteAutocomplete({
  value,
  onChange,
  routes = [],
  onSelect,
  className,
  placeholder = "ค้นหาเส้นทาง..."
}: RouteAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter routes based on query
  const filteredRoutes =
    query === ""
      ? routes
      : routes.filter((route) => {
          const searchLower = query.toLowerCase()
          return (
            route.Route_Name.toLowerCase().includes(searchLower) ||
            (route.Origin && route.Origin.toLowerCase().includes(searchLower)) ||
            (route.Destination && route.Destination.toLowerCase().includes(searchLower))
          )
        })

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSelect = (route: Route) => {
    if (onChange) onChange(route.Route_Name)
    onSelect(route)
    setQuery("")
    setOpen(false)
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={open ? query : (value || "")}
          onChange={(e) => {
            setQuery(e.target.value)
            if (!open) setOpen(true)
            if (onChange && !open) onChange(e.target.value) // Allow free typing if needed, mostly for search
          }}
          onFocus={() => {
            setOpen(true)
            // When focusing, if there's a value, keep it as query or clear it? 
            // Usually for autocomplete, users might want to search new things.
            // Let's keep it empty or pre-fill? 
            // Strategy: If value exists, maybe don't clear, but here we want search behavior.
            // Let's start with empty query on focus to show all options, 
            // UNLESS user generates input.
          }}
          onClick={() => setOpen(true)}
          placeholder={placeholder}
          className="pl-9 bg-muted border-border text-foreground w-full"
        />
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-auto">
          {filteredRoutes.length === 0 ? (
            <div className="p-2 text-xl text-muted-foreground text-center">
              ไม่พบข้อมูลเส้นทาง
            </div>
          ) : (
            <div className="py-1">
              {filteredRoutes.map((route, index) => (
                <button
                  key={index}
                  onClick={() => handleSelect(route)}
                  className="w-full text-left px-3 py-2 text-xl hover:bg-muted flex flex-col gap-1 transition-colors"
                >
                  <span className="font-medium text-foreground">{route.Route_Name}</span>
                  <div className="flex items-center gap-1 text-lg font-bold text-muted-foreground">
                    <MapPin size={10} />
                    <span>{route.Origin || "?"}</span>
                    <span>→</span>
                    <MapPin size={10} />
                    <span>{route.Destination || "?"}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

