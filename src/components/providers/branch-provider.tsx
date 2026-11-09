"use client"

import React, { createContext, useContext, useState, useEffect, useCallback, Suspense, useTransition, useRef } from "react"
import { getAllBranches, Branch } from "@/lib/supabase/branches"
import { getCurrentUserRole } from "@/lib/supabase/routes"
import Cookies from "js-cookie"
import { useRouter, usePathname } from "next/navigation"

interface BranchContextType {
  selectedBranch: string
  setSelectedBranch: (branchId: string) => void
  branches: Branch[]
  isAdmin: boolean
  isLoading: boolean
  isPending: boolean
}

const BranchContext = createContext<BranchContextType>({
  selectedBranch: "All",
  setSelectedBranch: () => {},
  branches: [],
  isAdmin: false,
  isLoading: true,
  isPending: false
})

/**
 * Surgical Component to isolate useSearchParams suspension.
 * This prevents the entire provider tree from unmounting during hydration.
 */
function BranchParamSync({ 
    onParamFound,
    branches 
}: { 
    onParamFound: (branch: string) => void,
    branches: Branch[]
}) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search)
      const branchParam = params.get('branch')
      if (branchParam && (branchParam === 'All' || branches.some(b => b.Branch_ID === branchParam))) {
          onParamFound(branchParam)
      }
    }
  }, [branches, onParamFound])

  return null
}

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [selectedBranch, setSelectedBranchState] = useState<string>("All")
  const [branches, setBranches] = useState<Branch[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pathname = usePathname()
  const prevPathnameRef = useRef<string | null>(null)

  const initialized = useRef(false)

  const init = useCallback(async () => {
    try {
        const [fetchedBranches, roleId] = await Promise.all([
            getAllBranches(),
            getCurrentUserRole()
        ]) as [Branch[], number]
        
        setBranches(fetchedBranches || [])
        const isSuper = roleId === 1
        setIsAdmin(isSuper)

        // For non-SuperAdmin, fix their selected branch to their assigned branch
        if (!isSuper && fetchedBranches && fetchedBranches.length > 0) {
            setSelectedBranchState(fetchedBranches[0].Branch_ID)
        } else {
            // Only sync from cookie if not already set by URL param
            const savedBranch = Cookies.get("selectedBranch")
            if (savedBranch && (savedBranch === 'All' || fetchedBranches.some((b: Branch) => b.Branch_ID === savedBranch))) {
                setSelectedBranchState(prev => prev === 'All' ? savedBranch : prev)
            }
        }
    } catch (error) {
        console.warn("BranchProvider initialization partial failure or timeout:", error)
        setBranches([])
    } finally {
        setIsLoading(false)
    }
  }, []) // Stable reference - no dependency on branches.length

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      init()
    }
  }, [init])

  useEffect(() => {
    const prevPathname = prevPathnameRef.current
    prevPathnameRef.current = pathname

    if (pathname === "/login") {
      setBranches([])
      setIsAdmin(false)
      setSelectedBranchState("All")
      setIsLoading(true)
      initialized.current = false // Reset so init runs again after login
    } else if (prevPathname === "/login" && pathname !== "/login") {
      initialized.current = false
      init()
    }
  }, [pathname, init])

  const setSelectedBranch = useCallback((branchId: string) => {
    setSelectedBranchState(branchId)
    Cookies.set("selectedBranch", branchId, { expires: 365 })
    
    // Use transition for non-blocking navigation/refresh
    startTransition(() => {
        const url = new URL(window.location.href)
        url.searchParams.set('branch', branchId)
        router.push(url.pathname + url.search)
        router.refresh()
    })
  }, [router])

  return (
    <BranchContext.Provider value={{ selectedBranch, setSelectedBranch, branches, isAdmin, isLoading, isPending }}>
      {/* Isolate SearchParams suspension here */}
      <Suspense fallback={null}>
        <BranchParamSync 
            branches={branches} 
            onParamFound={setSelectedBranchState} 
        />
      </Suspense>
      {children}
    </BranchContext.Provider>
  )
}

export const useBranch = () => useContext(BranchContext)
