"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { EntityAvatar } from "@/components/ui/entity-avatar"

import { Driver } from "@/lib/supabase/drivers"

interface DriverAutocompleteProps {
  value?: string // Driver_ID
  onChange: (value: string) => void
  drivers: Driver[]
  onSelect?: (driver: Driver) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  customerId?: string | null
}

import { useMemo } from "react"

export function DriverAutocomplete({
  value,
  onChange,
  drivers,
  onSelect,
  className,
  placeholder = "ค้นหาคนขับ...",
  disabled = false,
  customerId
}: DriverAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Find selected driver object for display
  const selectedDriver = drivers.find(d => d.Driver_ID === value)

  // Filter and sort based on customerId
  const processedDrivers = useMemo(() => {
    if (!customerId || customerId === 'All') {
      return drivers
    }
    const allowed = drivers.filter(
      (d) => d.Customer_ID === customerId || !d.Customer_ID
    )
    return [...allowed].sort((a, b) => {
      const aIsDedicated = a.Customer_ID === customerId ? 1 : 0
      const bIsDedicated = b.Customer_ID === customerId ? 1 : 0
      return bIsDedicated - aIsDedicated
    })
  }, [drivers, customerId])

  // Filter based on query
  const filteredDrivers =
    query === ""
      ? processedDrivers
      : processedDrivers.filter((d) =>
          (d.Driver_Name?.toLowerCase() || "").includes(query.toLowerCase()) ||
          (d.Vehicle_Plate?.toLowerCase() || "").includes(query.toLowerCase())
        )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Sync query with value
  useEffect(() => {
      if (selectedDriver && !open) {
          const displayValue = `${selectedDriver.Driver_Name} (${selectedDriver.Vehicle_Plate || '-'})`
          if (query !== displayValue) {
              setQuery(displayValue)
          }
      } else if (!value && query && !open) {
          setQuery("")
      }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, selectedDriver, open])

  const handleSelect = (driver: Driver) => {
    onChange(driver.Driver_ID)
    if (onSelect) onSelect(driver)
    setQuery(`${driver.Driver_Name} (${driver.Vehicle_Plate || '-'})`)
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
      if (!open) setOpen(true)
      // Note: We don't call onChange(e.target.value) here because value is ID, input is Name.
      // We only call onChange when a valid driver is selected.
      // Or we could clear the ID if input changes? 
      // Let's clear ID if user types something new to avoid mismatch.
      if (value) {
           // If user modifies text, they might be searching for a new one.
           // But if they just fix a typo?
           // Safest is: onChange('') to clear ID, forcing selection.
           // But that might flicker.
           // Let's keep ID for now, but if they select from list, it updates.
      }
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
       <div className="relative">
        <Input
          value={query}
          onChange={handleInputChange}
          onFocus={() => !disabled && setOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          className={cn("pr-10 bg-muted border-border text-foreground font-black placeholder:text-muted-foreground placeholder:font-bold", className)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
             <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </div>
      </div>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredDrivers.length === 0 ? (
            <div className="p-2 text-xl text-muted-foreground font-bold text-center">
               ไม่พบข้อมูล
            </div>
          ) : (
            <div className="py-1">
              {filteredDrivers.map((driver, index) => (
                <button
                  key={`${driver.Driver_ID}-${index}`}
                  onClick={() => handleSelect(driver)}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-xl cursor-pointer hover:bg-muted flex items-center justify-between text-foreground",
                    value === driver.Driver_ID && "bg-muted font-medium text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <EntityAvatar kind="driver" url={driver.Image_Url} id={driver.Driver_ID} name={driver.Driver_Name} className="h-7 w-7 rounded-lg" />
                    <span>{driver.Driver_Name} <span className="text-muted-foreground ml-1">({driver.Vehicle_Plate || '-'})</span></span>
                    {customerId && customerId !== 'All' && (
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                        driver.Customer_ID === customerId
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-muted-foreground/10 text-muted-foreground"
                      )}>
                        {driver.Customer_ID === customerId ? 'เฉพาะลูกค้านี้ / Dedicated' : 'ส่วนกลาง / Shared'}
                      </span>
                    )}
                  </div>
                  {value === driver.Driver_ID && (
                    <Check className="w-4 h-4 text-emerald-500" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

