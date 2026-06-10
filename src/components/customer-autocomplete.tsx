"use client"

import { useState, useRef, useEffect } from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import { Customer } from "@/lib/supabase/customers"

type CustomerOption = Pick<Customer, "Customer_ID" | "Customer_Name"> & Partial<Customer>

interface CustomerAutocompleteProps {
  value: string
  onChange: (value: string) => void
  customers: CustomerOption[]
  onSelect: (customer: Customer) => void
  className?: string
}

export function CustomerAutocomplete({
  value,
  onChange,
  customers,
  onSelect,
  className,
}: CustomerAutocompleteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const wrapperRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter customers based on query or show all if empty
  const filteredCustomers =
    query === ""
      ? customers
      : customers.filter((customer) =>
          customer.Customer_Name.toLowerCase().includes(query.toLowerCase())
        )

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  // Sync internal query with external value when value changes externally
  useEffect(() => {
    if (value && value !== query) {
        // Only update if not currently typing? 
        // Actually, if value is set by parent (e.g. edit mode), we want to show it.
        // But if user is typing, we don't want to overwrite.
        // Simplified: allow parent to control, but query is for filtering.
    }
  }, [value])

  const handleSelect = (customer: CustomerOption) => {
    onChange(customer.Customer_Name)
    onSelect(customer as Customer)
    setQuery(customer.Customer_Name)
    setOpen(false)
  }

  const handleInputFocus = () => {
    setOpen(true)
    // If input matches value, maybe clear query filtering to show all?
    // Or just show matches.
    if (!query && value) {
        setQuery(value)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value
    setQuery(newVal)
    onChange(newVal) // Allow free text
    setOpen(true)
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Input
          ref={inputRef}
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder="พิมพ์เพื่อค้นหาลูกค้า..."
          className="pr-10 bg-muted border-border text-foreground font-black placeholder:text-muted-foreground placeholder:font-bold"
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
             {/* Icon or toggle */}
             <ChevronsUpDown className="w-4 h-4 opacity-50" />
        </div>
      </div>

      {open && (
        <div className="absolute z-[100] w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredCustomers.length === 0 ? (
            <div className="p-2 text-xl text-muted-foreground font-bold text-center">
               ไม่พบลูกค้าที่ตรงกัน (ใช้ชื่อนี้เป็นลูกค้าใหม่)
            </div>
          ) : (
            <ul className="py-1">
              {filteredCustomers.map((customer, index) => (
                <li
                  key={`${customer.Customer_Name}-${index}`}
                  className={cn(
                    "px-3 py-2 text-xl text-foreground cursor-pointer hover:bg-muted flex items-center justify-between",
                    value === customer.Customer_Name && "bg-muted font-medium text-foreground"
                  )}
                  onClick={() => handleSelect(customer)}
                >
                  <span>{customer.Customer_Name}</span>
                  {value === customer.Customer_Name && (
                    <Check className="w-4 h-4 text-emerald-500" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

