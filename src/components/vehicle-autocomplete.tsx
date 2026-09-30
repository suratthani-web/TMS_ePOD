"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { EntityAvatar } from "@/components/ui/entity-avatar"

import { Vehicle } from "@/lib/supabase/vehicles"

interface VehicleAutocompleteProps {
  value?: string
  onChange: (value: string) => void
  vehicles: Vehicle[]
  onSelect: (vehicle: Vehicle) => void
  className?: string
  placeholder?: string
  disabled?: boolean
  customerId?: string | null
}

import { useMemo } from "react"

export function VehicleAutocomplete({
  value,
  onChange,
  vehicles,
  onSelect,
  className,
  placeholder = "ค้นหาทะเบียนรถ...",
  disabled = false,
  customerId
}: VehicleAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Filter and sort based on customerId
  const processedVehicles = useMemo(() => {
    if (!customerId || customerId === 'All') {
      return vehicles
    }
    const allowed = vehicles.filter(
      (v) => v.Customer_ID === customerId || !v.Customer_ID
    )
    return [...allowed].sort((a, b) => {
      const aIsDedicated = a.Customer_ID === customerId ? 1 : 0
      const bIsDedicated = b.Customer_ID === customerId ? 1 : 0
      return bIsDedicated - aIsDedicated
    })
  }, [vehicles, customerId])

  // Filter based on query
  const filteredVehicles =
    query === ""
      ? processedVehicles
      : processedVehicles.filter((v) =>
          (v.Vehicle_Plate || "").toLowerCase().includes(query.toLowerCase())
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

  // Update query when value changes from outside (e.g. initial load)
  useEffect(() => {
     // If value exists but query is empty, set query to value to show it
     if (value && value !== query) {
         setQuery(value)
     }
     // If value is cleared, clear query
     if (!value && query) {
         setQuery("")
     }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const handleSelect = (vehicle: Vehicle) => {
    onChange(vehicle.Vehicle_Plate)
    onSelect(vehicle)
    setQuery(vehicle.Vehicle_Plate)
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value)
      onChange(e.target.value)
      setOpen(true)
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          value={open ? query : (value || "")}
          onChange={handleInputChange}
          onFocus={() => !disabled && setOpen(true)}
        //   onClick={() => !disabled && setOpen(true)}
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
          {filteredVehicles.length === 0 ? (
            <div className="p-2 text-xl text-muted-foreground font-bold text-center">
               ไม่พบข้อมูล
            </div>
          ) : (
            <div className="py-1">
              {filteredVehicles.map((vehicle, index) => (
                <button
                  key={`${vehicle.Vehicle_Plate}-${index}`}
                  onClick={() => handleSelect(vehicle)}
                  type="button"
                  className={cn(
                    "w-full text-left px-3 py-2 text-xl cursor-pointer hover:bg-muted flex items-center justify-between text-foreground",
                    value === vehicle.Vehicle_Plate && "bg-muted font-medium text-foreground"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <EntityAvatar kind="vehicle" url={vehicle.Image_Url} id={vehicle.Vehicle_Plate} name={vehicle.Vehicle_Plate} className="h-7 w-7 rounded-lg [&_svg]:text-emerald-600" />
                    <span>{vehicle.Vehicle_Plate}</span>
                    <span className="text-lg font-bold text-muted-foreground font-black">({vehicle.Vehicle_Type})</span>
                    {customerId && customerId !== 'All' && (
                      <span className={cn(
                        "text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest",
                        vehicle.Customer_ID === customerId
                          ? "bg-primary/20 text-primary border border-primary/30"
                          : "bg-muted-foreground/10 text-muted-foreground"
                      )}>
                        {vehicle.Customer_ID === customerId ? 'เฉพาะลูกค้านี้ / Dedicated' : 'ส่วนกลาง / Shared'}
                      </span>
                    )}
                  </div>
                  {value === vehicle.Vehicle_Plate && (
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

