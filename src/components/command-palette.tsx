"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { globalSearch, SearchResult } from "@/lib/actions/command-actions"
import {
  Search,
  Package,
  User,
  Truck,
  Navigation,
  ArrowRight,
  Command,
  Plus,
  BarChart3,
  Settings,
  FileText,
  MessageSquare,
  Loader2
} from "lucide-react"

// Quick action items (no search needed)
const QUICK_ACTIONS = [
  { id: 'new-job', title: 'สร้างงานใหม่', icon: Plus, href: '/admin/jobs/create', group: 'actions' },
  { id: 'dashboard', title: 'แดชบอร์ด', icon: BarChart3, href: '/dashboard', group: 'actions' },
  { id: 'planning', title: 'จัดการงาน (Planning)', icon: Package, href: '/planning', group: 'actions' },
  { id: 'billing', title: 'วางบิลลูกค้า', icon: FileText, href: '/billing/customer', group: 'actions' },
  { id: 'driver-pay', title: 'จ่ายเงินรถ', icon: Truck, href: '/billing/driver', group: 'actions' },
  { id: 'analytics', title: 'รายงาน & วิเคราะห์', icon: BarChart3, href: '/admin/analytics', group: 'actions' },
  { id: 'feedback', title: 'ฟีดแบ็คลูกค้า', icon: MessageSquare, href: '/admin/analytics/feedback', group: 'actions' },
  { id: 'routes', title: 'จัดการเส้นทาง', icon: Navigation, href: '/routes', group: 'actions' },
  { id: 'settings', title: 'ตั้งค่าระบบ', icon: Settings, href: '/settings', group: 'actions' },
]

const TYPE_ICONS: Record<string, typeof Package> = {
  job: Package,
  customer: User,
  driver: Truck,
  route: Navigation,
}

const TYPE_LABELS: Record<string, string> = {
  job: 'งาน',
  customer: 'ลูกค้า',
  driver: 'คนขับ',
  route: 'เส้นทาง',
}

const TYPE_COLORS: Record<string, string> = {
  job: 'text-blue-400 bg-blue-500/10',
  customer: 'text-emerald-400 bg-emerald-500/10',
  driver: 'text-amber-400 bg-amber-500/10',
  route: 'text-purple-400 bg-purple-500/10',
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const [userRole, setUserRole] = useState<number | null>(null)
  const [isCustomerUser, setIsCustomerUser] = useState(false)

  // Keyboard shortcut: Ctrl+K / Cmd+K
  useEffect(() => {
    async function checkRole() {
        const { getUserRole } = await import("@/lib/permissions")
        const role = await getUserRole()
        setUserRole(role || null)
        
        const { isCustomer } = await import("@/lib/permissions")
        const customerFlag = await isCustomer()
        setIsCustomerUser(customerFlag)
    }
    checkRole()

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(prev => !prev)
      }
      if (e.key === 'Escape') setOpen(false)
    }

    const handleToggle = () => setOpen(prev => !prev)

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('toggle-command-palette', handleToggle)
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('toggle-command-palette', handleToggle)
    }
  }, [])

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus()
        setQuery("")
        setResults([])
        setSelectedIndex(0)
      }, 50)
    }
  }, [open])

  // Debounced search
  const searchTimeout = useRef<NodeJS.Timeout | null>(null)
  const handleQueryChange = useCallback((value: string) => {
    setQuery(value)
    setSelectedIndex(0)

    if (searchTimeout.current) clearTimeout(searchTimeout.current)

    if (value.length >= 2) {
      setLoading(true)
      searchTimeout.current = setTimeout(async () => {
        const data = await globalSearch(value)
        setResults(data)
        setLoading(false)
      }, 300)
    } else {
      setResults([])
      setLoading(false)
    }
  }, [])

  const filteredQuickActions = QUICK_ACTIONS.filter(action => {
    if (isCustomerUser) {
        return ['dashboard', 'monitoring', 'history', 'pod'].includes(action.id)
    }
    
    if (userRole === 4) { // Accounting
        return ['dashboard', 'billing', 'driver-pay', 'settings'].includes(action.id)
    }
    
    return true
  })

  // Get display items
  const displayItems = query.length >= 2
    ? results
    : filteredQuickActions.map(a => ({
        id: a.id,
        title: a.title,
        subtitle: '',
        type: 'action' as SearchResult['type'],
        href: a.href,
      }))

  // Navigate
  const handleSelect = (item: { href: string }) => {
    setOpen(false)
    router.push(item.href)
  }

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => Math.min(prev + 1, displayItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && displayItems[selectedIndex]) {
      handleSelect(displayItems[selectedIndex])
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Palette Container */}
          <div className="flex min-h-full items-start justify-center p-4 pt-[15%]">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: -20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: -20 }}
              className="relative w-full max-w-xl bg-card/95 backdrop-blur-xl border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700/50">
                <Search className="w-5 h-5 text-gray-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="ค้นหางาน, ลูกค้า, คนขับ... หรือเลือกเมนู"
                  className="flex-1 bg-transparent text-white placeholder:text-muted-foreground outline-none text-xl"
                />
                {loading && <Loader2 className="w-4 h-4 text-gray-400 animate-spin flex-shrink-0" />}
                <kbd className="hidden md:flex items-center gap-1 px-2 py-1 text-base font-bold text-muted-foreground bg-slate-800 rounded-lg border border-slate-700">
                  ESC
                </kbd>
              </div>

              {/* Results Content */}
              <div className="max-h-[400px] overflow-y-auto p-2">
                {query.length < 2 ? (
                  <div>
                    <p className="px-3 py-2 text-base font-bold font-black text-muted-foreground uppercase tracking-widest">
                      Quick Actions
                    </p>
                    {filteredQuickActions.map((action, i) => {
                      const Icon = action.icon
                      return (
                        <button
                          key={action.id}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                            selectedIndex === i ? 'bg-primary/20 text-foreground' : 'text-gray-300 hover:bg-muted/50'
                          }`}
                          onClick={() => handleSelect(action)}
                        >
                          <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0">
                            <Icon className="w-4 h-4 text-gray-400" />
                          </div>
                          <span className="text-xl font-medium flex-1">{action.title}</span>
                          <ArrowRight className="w-3 h-3 text-gray-600" />
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <>
                    {results.length > 0 ? (
                      <div>
                        <p className="px-3 py-2 text-base font-bold font-black text-muted-foreground uppercase tracking-widest">
                          ผลลัพธ์ ({results.length})
                        </p>
                        {results.map((result, i) => {
                          const Icon = TYPE_ICONS[result.type] || Package
                          const colorClass = TYPE_COLORS[result.type] || 'text-gray-400 bg-gray-500/10'
                          return (
                            <button
                              key={`${result.type}-${result.id}`}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                                selectedIndex === i ? 'bg-primary/20 text-foreground' : 'text-gray-300 hover:bg-muted/50'
                              }`}
                              onClick={() => handleSelect(result)}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xl font-bold truncate">{result.title}</p>
                                <p className="text-base font-bold text-muted-foreground truncate">{result.subtitle}</p>
                              </div>
                              <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${colorClass}`}>
                                {TYPE_LABELS[result.type] || result.type}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    ) : !loading && (
                      <div className="p-8 text-center">
                        <Search className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                        <p className="text-gray-400 text-xl">ไม่พบผลลัพธ์สำหรับ &quot;{query}&quot;</p>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2 border-t border-slate-700/50 flex items-center justify-between text-base font-bold text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-bold text-[10px]">↑↓</kbd> เลือก</span>
                  <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-bold text-[10px]">Enter</kbd> เปิด</span>
                  <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 bg-slate-800 rounded font-bold text-[10px]">Esc</kbd> ปิด</span>
                </div>
                <div className="flex items-center gap-1 text-primary/60">
                  <Command className="w-3 h-3" /> <span className="text-[10px] font-black">DRouteMind</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}

