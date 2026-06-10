"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { createJob, getJobCreationData } from "@/app/planning/actions"
import { Driver } from "@/lib/supabase/drivers"
import { Vehicle } from "@/lib/supabase/vehicles"
import { Route } from "@/lib/supabase/routes"
import { Customer } from "@/lib/supabase/customers"
import { 
  ArrowLeft, 
  Package,
  User,
  MapPin,
  Truck,
  Calendar,
  Clock,
  Building2,
  Phone,
  FileText,
  Loader2,
  CheckCircle2,
  ChevronRight,
  Eye,
  Navigation,
  Zap,
  Target,
  ShieldCheck,
  Cpu,
  ChevronLeft,
  Sparkles,
  Search
} from "lucide-react"
import { CustomerAutocomplete } from "@/components/customer-autocomplete"
import { AiSuggestionCard } from "@/components/planning/ai-suggestion-card"
import { DriverSuggestion } from "@/lib/ai/ai-assign"
import { PremiumCard } from "@/components/ui/premium-card"
import { PremiumButton } from "@/components/ui/premium-button"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { geocodeAddress } from "@/lib/ai/geocoding"

// Types & Interfaces
interface JobForm {
  Job_ID: string
  Plan_Date: string
  Plan_Time: string
  Customer_ID: string
  Customer_Name: string
  Customer_Phone: string
  Customer_Address: string
  Route_Name: string
  Origin_Location: string
  Dest_Location: string
  Driver_ID: string
  Driver_Name: string
  Vehicle_Plate: string
  Price_Cust_Total: number | string
  Cost_Driver_Total: number | string
  Cargo_Type: string
  Notes: string
  Priority: 'Normal' | 'High' | 'Urgent'
  Weight: number | string
  Pickup_Lat?: number
  Pickup_Lon?: number
  Delivery_Lat?: number
  Delivery_Lon?: number
  Est_Distance_KM: number | string
  Show_Price_To_Driver: boolean
}

const steps = [
  { id: 0, label: 'Job Details', icon: <Package size={18} /> },
  { id: 1, label: 'Route & Customer', icon: <MapPin size={18} /> },
  { id: 2, label: 'Driver & Vehicle', icon: <Truck size={18} /> },
  { id: 3, label: 'Review', icon: <CheckCircle2 size={18} /> },
]

function StepIndicator({ steps, currentStep }: { steps: { id: number, label: string, icon: React.ReactNode }[], currentStep: number }) {
  return (
    <div className="flex items-center justify-center gap-4 mb-16">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center">
          <div className={`
            flex items-center justify-center w-12 h-12 rounded-2xl border-2 transition-all duration-500
            ${idx <= currentStep ? 'bg-primary border-primary text-white shadow-lg shadow-primary/20 scale-110' : 'bg-muted/50 border-border/10 text-muted-foreground'}
          `}>
            {step.icon}
          </div>
          {idx < steps.length - 1 && (
            <div className={`w-12 h-0.5 mx-2 rounded-full transition-colors duration-1000 ${idx < currentStep ? 'bg-primary' : 'bg-border/10'}`} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function CreateJobPage() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [loading, setLoading] = useState(false)
  
  // Real data lists
  const [lists, setLists] = useState<{
    drivers: Driver[]
    vehicles: Vehicle[]
    routes: Route[]
    customers: Customer[]
  }>({
    drivers: [],
    vehicles: [],
    routes: [],
    customers: [],
  })

  // Form State
  const [formData, setFormData] = useState<JobForm>({
    Job_ID: `JOB-${new Date().getTime().toString().slice(-6)}`,
    Plan_Date: new Date().toISOString().split('T')[0],
    Plan_Time: '08:00',
    Customer_ID: '',
    Customer_Name: '',
    Customer_Phone: '',
    Customer_Address: '',
    Route_Name: '',
    Origin_Location: '',
    Dest_Location: '',
    Driver_ID: '',
    Driver_Name: '',
    Vehicle_Plate: '',
    Price_Cust_Total: '',
    Cost_Driver_Total: '',
    Cargo_Type: '',
    Notes: '',
    Priority: 'Normal',
    Weight: '',
    Est_Distance_KM: '',
    Show_Price_To_Driver: true
  })

  useEffect(() => {
    async function loadData() {
      const data = await getJobCreationData()
      setLists({
        drivers: data.drivers,
        vehicles: data.vehicles,
        routes: data.routes,
        customers: data.customers,
      })
    }
    loadData()
  }, [])

  const updateForm = (key: keyof JobForm, value: string | number | boolean) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const handleCustomerSelect = (customer: Customer) => {
    setFormData(prev => ({
      ...prev,
      Customer_ID: customer.Customer_ID,
      Customer_Name: customer.Customer_Name,
      Customer_Phone: (customer as Record<string, unknown>).Mobile_No as string || '',
      Customer_Address: customer.Address || '',
    }))
  }

  const handleRouteSelect = (routeName: string) => {
    const route = lists.routes.find(r => r.Route_Name === routeName)
    if (route) {
      setFormData(prev => ({
        ...prev,
        Route_Name: route.Route_Name,
        Origin_Location: route.Origin || '',
        Dest_Location: route.Destination || '',
        Est_Distance_KM: route.Distance_KM || '',
        Pickup_Lat: Number(route.Origin_Lat) || undefined,        Pickup_Lon: Number(route.Origin_Lon) || undefined,
        Delivery_Lat: Number(route.Dest_Lat) || undefined,
        Delivery_Lon: Number(route.Dest_Lon) || undefined,
      }))
    }
  }

  const handleDriverChange = (driverId: string) => {
    const driver = lists.drivers.find(d => d.Driver_ID === driverId)
    if (driver) {
      setFormData(prev => ({
        ...prev,
        Driver_ID: driver.Driver_ID,
        Driver_Name: driver.Driver_Name || '',
        Vehicle_Plate: driver.Vehicle_Plate || prev.Vehicle_Plate,
      }))
    }
  }

  const handleGeocodeOrigin = async () => {
    if (!formData.Origin_Location) return
    try {
      const res = await geocodeAddress(formData.Origin_Location)
      if (res) {
        setFormData(prev => ({
          ...prev,
          Pickup_Lat: res.lat,
          Pickup_Lon: res.lng
        }))
        toast.success('Origin coordinates saved')
      } else {
        toast.error('Origin coordinates not found')
      }
    } catch {
      toast.error('Unable to find coordinates')
    }
  }

  const handleGeocodeDestination = async () => {
    if (!formData.Dest_Location) return
    try {
      const res = await geocodeAddress(formData.Dest_Location)
      if (res) {
        setFormData(prev => ({
          ...prev,
          Delivery_Lat: res.lat,
          Delivery_Lon: res.lng
        }))
        toast.success('Destination coordinates saved')
      } else {
        toast.error('Destination coordinates not found')
      }
    } catch {
      toast.error('Unable to find coordinates')
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
        const result = await createJob({
            ...formData,
            Job_Status: 'Assigned',
            Branch_ID: 'HQ' // Default branch
        } as Parameters<typeof createJob>[0])

        if (!result.success) throw new Error(result.message)

        toast.success('Job created successfully')
        router.push('/planning')
    } catch (e: unknown) {
        toast.error((e as Error).message || 'Unable to create job')
    } finally {
      setLoading(false)
    }
  }

  const nextStep = () => currentStep < steps.length - 1 && setCurrentStep(prev => prev + 1)
  const prevStep = () => currentStep > 0 && setCurrentStep(prev => prev - 1)

  return (
    <div className="space-y-12 pb-32 p-4 lg:p-10 bg-background">
      <div className="bg-card p-8 md:p-10 rounded-2xl border border-border shadow-sm relative overflow-hidden group">
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-10 relative z-10">
          <div className="space-y-6">
            <Link href="/admin/planning" className="inline-flex items-center gap-2 text-muted-foreground hover:text-primary transition-all text-sm font-semibold group/back">
                <ArrowLeft className="w-4 h-4 group-hover/back:-translate-x-1 transition-transform" /> 
                Planning
            </Link>
            <div className="flex items-center gap-6">
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20 text-primary">
                    <Zap size={40} strokeWidth={2.5} />
                </div>
                <div>
                    <h1 className="text-4xl font-black text-foreground leading-tight">Create Job</h1>
                    <p className="text-base font-semibold text-muted-foreground mt-2">Create a new transport job and assign the route, driver, and vehicle.</p>
                </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 self-end lg:self-center">
            <div className="bg-muted/50 border border-border px-5 py-3 rounded-xl flex items-center gap-3">
                <Cpu className="text-primary" size={16} />
                <span className="text-sm font-semibold text-muted-foreground">Ready</span>
            </div>
          </div>
        </div>
      </div>

      <StepIndicator steps={steps} currentStep={currentStep} />

      <AnimatePresence mode="wait">
        <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.4 }}
        >
            <PremiumCard className="bg-card border border-border shadow-sm rounded-2xl overflow-hidden max-w-5xl mx-auto">
                <div className="p-12 space-y-12">
                {/* Step 1: Job Details */}
                {currentStep === 0 && (
                    <div className="space-y-10">
                        <div className="flex items-center gap-5 border-l-4 border-primary pl-8">
                            <div className="p-4 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-inner">
                                <Package size={28} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-foreground">Job Details</h2>
                                <p className="text-base font-semibold text-muted-foreground mt-1">Enter the core transport information.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3 group">
                                <Label className="text-base font-semibold text-muted-foreground ml-4 group-focus-within:text-primary transition-colors">Job ID</Label>
                                <Input 
                                    value={formData.Job_ID}
                                    onChange={(e) => updateForm('Job_ID', e.target.value)}
                                    className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-base font-semibold text-muted-foreground ml-4">Priority</Label>
                                <Select value={formData.Priority} onValueChange={(val: JobForm['Priority']) => updateForm('Priority', val)}>
                                    <SelectTrigger className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner">
                                        <SelectValue placeholder="Select Status" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border/10 rounded-2xl">
                                        <SelectItem value="Normal" className="text-muted-foreground focus:bg-primary/20 focus:text-primary">Normal</SelectItem>
                                        <SelectItem value="High" className="text-amber-500 focus:bg-amber-500/20 focus:text-amber-500 font-bold">High</SelectItem>
                                        <SelectItem value="Urgent" className="text-rose-600 focus:bg-rose-600/20 focus:text-rose-600 font-black">Urgent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3">
                                <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                    <Calendar className="w-3 h-3" /> Planned date
                                </Label>
                                <Input 
                                    type="date"
                                    value={formData.Plan_Date}
                                    onChange={(e) => updateForm('Plan_Date', e.target.value)}
                                    className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner"
                                />
                            </div>
                            <div className="space-y-3">
                                <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                    <Clock className="w-3 h-3" /> Planned time
                                </Label>
                                <Input 
                                    type="time"
                                    value={formData.Plan_Time}
                                    onChange={(e) => updateForm('Plan_Time', e.target.value)}
                                    className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner"
                                />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <Label className="text-base font-semibold text-muted-foreground ml-4">Cargo type</Label>
                                <Input 
                                    placeholder="Dry goods, fragile, cold chain..."
                                    value={formData.Cargo_Type}
                                    onChange={(e) => updateForm('Cargo_Type', e.target.value)}
                                    className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner"
                                />
                            </div>
                            <div className="space-y-3 text-right">
                                <Label className="text-base font-semibold text-muted-foreground mr-4 text-right block">Weight (KG)</Label>
                                <Input 
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.Weight}
                                    onChange={(e) => updateForm('Weight', e.target.value)}
                                    className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-3xl font-black text-primary hover:border-border/10 focus:border-primary/50 transition-all shadow-inner text-right font-sans"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Step 2: Customer and route */}
                {currentStep === 1 && (
                    <div className="space-y-12">
                        <div className="flex items-center gap-5 border-l-4 border-emerald-500/50 pl-8">
                            <div className="p-4 bg-emerald-500/10 rounded-2xl text-emerald-400 border border-emerald-500/20 shadow-inner">
                                <User size={28} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-foreground">Customer & Route</h2>
                                <p className="text-base font-semibold text-muted-foreground mt-1">Select the customer, address, and route.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                    <Building2 className="w-3 h-3" /> Customer
                                </Label>
                                <div className="relative group/cust">
                                    <CustomerAutocomplete 
                                        value={formData.Customer_Name}
                                        onChange={(val) => updateForm('Customer_Name', val)}
                                        customers={lists.customers}
                                        onSelect={handleCustomerSelect}
                                    />
                                </div>
                            </div>
                            <div className="space-y-3">
                                <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                    <Phone className="w-3 h-3" /> Phone
                                </Label>
                                <Input 
                                    placeholder="+66 8X-XXX-XXXX"
                                    value={formData.Customer_Phone}
                                    onChange={(e) => updateForm('Customer_Phone', e.target.value)}
                                    className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner font-sans"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                <MapPin className="w-3 h-3" /> Customer address
                            </Label>
                            <Textarea 
                                placeholder="Full delivery address..."
                                value={formData.Customer_Address}
                                onChange={(e) => updateForm('Customer_Address', e.target.value)}
                                className="bg-background/50 border-border/5 rounded-2xl p-6 text-base font-medium text-foreground hover:border-border/10 focus:border-primary/50 transition-all shadow-inner min-h-[120px]"
                            />
                        </div>

                        <div className="pt-10 border-t border-border/5 space-y-10 group/master">
                            <div className="flex items-center justify-between">
                                <Label className="text-xl font-black text-emerald-500 flex items-center gap-3">
                                    <Navigation className="w-6 h-6" /> Route master
                                </Label>
                                <div className="px-4 py-1.5 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-sm font-semibold text-emerald-500">GPS ready</div>
                            </div>
                            
                            <Select value={formData.Route_Name} onValueChange={handleRouteSelect}>
                                <SelectTrigger className="h-16 bg-emerald-500/5 border-emerald-500/20 rounded-2xl px-6 text-foreground hover:bg-emerald-500/10 focus:border-emerald-500 transition-all shadow-sm">
                                    <SelectValue placeholder="Select route" />
                                </SelectTrigger>
                                <SelectContent className="bg-background border-emerald-500/30 rounded-3xl">
                                    {lists.routes.map(r => (
                                        <SelectItem key={r.Route_Name} value={r.Route_Name} className="text-muted-foreground focus:bg-emerald-500/20 focus:text-emerald-400 p-4">
                                            <div className="flex flex-col">
                                                <span className="font-black italic tracking-widest">{r.Route_Name}</span>
                                                <span className="text-base font-bold text-muted-foreground">{r.Origin} → {r.Destination}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div className="space-y-4">
                                    <Label className="text-base font-semibold text-muted-foreground ml-4">Origin</Label>
                                    <div className="flex gap-4">
                                        <Input 
                                            placeholder="Pickup location"
                                            value={formData.Origin_Location}
                                            onChange={(e) => updateForm('Origin_Location', e.target.value)}
                                            className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground shadow-inner flex-1"
                                        />
                                        <Button 
                                            type="button"
                                            onClick={handleGeocodeOrigin}
                                            className="h-16 w-16 bg-primary/10 text-primary border border-primary/20 rounded-2xl hover:bg-primary/20 transition-all flex items-center justify-center p-0"
                                        >
                                            <Search size={24} strokeWidth={2.5} />
                                        </Button>
                                    </div>
                                    {formData.Pickup_Lat && (
                                        <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-emerald-500/10 rounded-xl border border-emerald-500/20 text-sm font-semibold text-emerald-500">
                                            <Target className="w-3 h-3" /> Coordinates: {formData.Pickup_Lat}, {formData.Pickup_Lon}
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <Label className="text-base font-semibold text-muted-foreground ml-4">Destination</Label>
                                    <div className="flex gap-4">
                                        <Input 
                                            placeholder="Delivery location"
                                            value={formData.Dest_Location}
                                            onChange={(e) => updateForm('Dest_Location', e.target.value)}
                                            className="h-16 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground shadow-inner flex-1"
                                        />
                                        <Button 
                                            type="button"
                                            onClick={handleGeocodeDestination}
                                            className="h-16 w-16 bg-primary/10 text-primary border border-primary/20 rounded-2xl hover:bg-primary/20 transition-all flex items-center justify-center p-0"
                                        >
                                            <Search size={24} strokeWidth={2.5} />
                                        </Button>
                                    </div>
                                    {formData.Delivery_Lat && (
                                        <div className="inline-flex items-center gap-3 px-4 py-1.5 bg-rose-500/10 rounded-xl border border-rose-500/20 text-sm font-semibold text-rose-500 ml-auto">
                                            <Target className="w-3 h-3" /> Coordinates: {formData.Delivery_Lat}, {formData.Delivery_Lon}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {Number(formData.Est_Distance_KM) > 0 && (
                                <div className="p-8 bg-background rounded-2xl border border-border flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden group/dist">
                                    <div className="absolute top-0 right-0 w-64 h-full bg-emerald-500/5 blur-3xl pointer-events-none" />
                                    <div className="flex items-center gap-6 relative z-10">
                                        <div className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-400 shadow-lg group-hover/dist:scale-110 transition-transform">
                                            <Navigation size={28} />
                                        </div>
                                        <div>
                                            <span className="text-sm font-semibold text-muted-foreground mb-1 block">Estimated Distance</span>
                                            <h3 className="text-3xl font-black text-foreground">Route Distance</h3>
                                        </div>
                                    </div>
                                    <div className="text-right relative z-10">
                                        <span className="text-sm font-semibold text-emerald-600 block mb-2">Coordinates ready</span>
                                        <span className="text-5xl font-black text-emerald-500">{formData.Est_Distance_KM} <span className="text-2xl">KM</span></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: Driver and vehicle assignment */}
                {currentStep === 2 && (
                    <div className="space-y-12">
                        <div className="flex items-center gap-5 border-l-4 border-primary pl-8">
                            <div className="p-4 bg-primary/10 rounded-2xl text-primary border border-primary/20 shadow-inner">
                                <Truck size={28} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-foreground">Driver & Vehicle</h2>
                                <p className="text-base font-semibold text-muted-foreground mt-1">Assign the driver and vehicle for this job.</p>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="flex items-center gap-3 px-6 py-2 bg-primary/10 rounded-full border border-primary/30 w-fit mb-4">
                                <Sparkles size={14} className="text-primary animate-pulse" />
                                <span className="text-sm font-semibold text-primary">Suggested driver</span>
                            </div>
                            <AiSuggestionCard
                                jobData={{
                                    Pickup_Lat: formData.Pickup_Lat,
                                    Pickup_Lon: formData.Pickup_Lon,
                                    Plan_Date: formData.Plan_Date,
                                }}
                                onSelect={(driver: DriverSuggestion) => {
                                    setFormData(prev => ({
                                        ...prev,
                                        Driver_ID: driver.Driver_ID,
                                        Driver_Name: driver.Driver_Name,
                                        Vehicle_Plate: driver.Vehicle_Plate,
                                    }))
                                    toast.success('Driver assigned')
                                }}
                            />
                        </div>

                        <div className="relative py-10 flex flex-col items-center">
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-muted/50" />
                            <span className="relative z-10 px-8 bg-background text-sm font-semibold text-muted-foreground">Select manually</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3 group">
                                <Label className="text-base font-semibold text-muted-foreground ml-4">Driver</Label>
                                <Select value={formData.Driver_ID} onValueChange={handleDriverChange}>
                                    <SelectTrigger className="h-18 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 transition-all shadow-inner group-focus-within:border-primary/50">
                                        <SelectValue placeholder="Select driver" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border/10 rounded-3xl">
                                        {lists.drivers.map(d => (
                                            <SelectItem key={d.Driver_ID} value={d.Driver_ID} className="p-4 focus:bg-primary/20 text-muted-foreground">
                                                <div className="flex flex-col">
                                                    <span className="font-black">{d.Driver_Name}</span>
                                                    <span className="text-base font-bold text-muted-foreground">ID: {d.Driver_ID} | {d.Mobile_No}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-3 group">
                                <Label className="text-base font-semibold text-muted-foreground ml-4">Vehicle plate</Label>
                                <Select value={formData.Vehicle_Plate} onValueChange={(val) => updateForm('Vehicle_Plate', val)}>
                                    <SelectTrigger className="h-18 bg-background/50 border-border/5 rounded-2xl px-6 text-xl font-black text-foreground hover:border-border/10 transition-all shadow-inner group-focus-within:border-primary/50">
                                        <SelectValue placeholder="Select vehicle" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-background border-border/10 rounded-3xl">
                                        {lists.vehicles.map(v => (
                                            <SelectItem key={v.Vehicle_Plate} value={v.Vehicle_Plate} className="p-4 focus:bg-primary/20 text-muted-foreground">
                                                <div className="flex flex-col font-sans">
                                                    <span className="font-black italic tracking-widest">{v.Vehicle_Plate}</span>
                                                    <span className="text-base font-bold text-muted-foreground">{v.Vehicle_Type}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            <div className="space-y-3 group">
                                <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                    <FileText className="w-3 h-3 text-rose-500" /> Driver cost (THB)
                                </Label>
                                <Input 
                                    type="number"
                                    value={formData.Cost_Driver_Total}
                                    onChange={(e) => updateForm('Cost_Driver_Total', e.target.value)}
                                    className="h-18 bg-background/50 border-border/5 rounded-3xl px-8 text-3xl font-black text-rose-500 hover:border-border/10 transition-all shadow-inner italic font-sans text-right"
                                />
                            </div>
                            <div className="space-y-3 group text-right">
                                <Label className="text-base font-semibold text-muted-foreground mr-4 flex items-center gap-2 justify-end">
                                    <FileText className="w-3 h-3 text-emerald-500" /> Customer price (THB)
                                </Label>
                                <Input 
                                    type="number"
                                    value={formData.Price_Cust_Total}
                                    onChange={(e) => updateForm('Price_Cust_Total', e.target.value)}
                                    className="h-18 bg-background/50 border-border/5 rounded-3xl px-8 text-3xl font-black text-emerald-500 hover:border-border/10 transition-all shadow-inner italic font-sans text-right"
                                />
                            </div>
                        </div>
                        <div className="p-8 rounded-2xl bg-muted/50 border border-border/10 flex items-center justify-between group/toggle relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-40 h-full bg-emerald-500/[0.03] blur-3xl" />
                            <div className="flex items-center gap-6 relative z-10">
                                <div className="w-16 h-16 rounded-[1.5rem] bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20 shadow-inner group-hover/toggle:scale-110 transition-all">
                                    <Eye size={32} />
                                </div>
                                <div>
                                    <Label className="text-xl font-black text-foreground cursor-pointer" htmlFor="show-price">
                                        Show price to driver
                                    </Label>
                                    <p className="text-sm font-medium text-muted-foreground mt-1">Driver can see the job price in the mobile workflow.</p>
                                </div>
                            </div>
                            <Switch 
                                id="show-price" 
                                checked={formData.Show_Price_To_Driver} 
                                onCheckedChange={(val) => updateForm('Show_Price_To_Driver', val)} 
                                className="scale-150 data-[state=checked]:bg-emerald-500"
                            />
                        </div>

                        <div className="space-y-3 group">
                            <Label className="text-base font-semibold text-muted-foreground ml-4 flex items-center gap-2">
                                <FileText className="w-3 h-3" /> Notes
                            </Label>
                            <Textarea 
                                placeholder="Extra instructions, safety notes, or route details..."
                                value={formData.Notes}
                                onChange={(e) => updateForm('Notes', e.target.value)}
                                className="bg-background/50 border-border/5 rounded-2xl p-6 text-base font-medium text-foreground hover:border-border/10 transition-all shadow-inner min-h-[150px]"
                            />
                        </div>
                    </div>
                )}

                {/* Step 4: Confirmation */}
                {currentStep === 3 && (
                    <div className="space-y-12">
                        <div className="flex items-center gap-5 border-l-4 border-amber-500/50 pl-8">
                            <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500 border border-amber-500/20 shadow-inner">
                                <CheckCircle2 size={28} />
                            </div>
                            <div>
                                <h2 className="text-3xl font-black text-foreground">Review</h2>
                                <p className="text-base font-semibold text-muted-foreground mt-1">Check the job details before saving.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                            <PremiumCard className="p-8 bg-muted/50 border-border/10 rounded-2xl group/card relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-10"><Package size={40} /></div>
                                <span className="text-sm font-semibold text-primary mb-6 block">Job summary</span>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center border-b border-border/5 pb-4">
                                        <span className="text-sm font-semibold text-muted-foreground">Job ID</span>
                                        <span className="text-xl font-black text-foreground">{formData.Job_ID}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-border/5 pb-4">
                                        <span className="text-sm font-semibold text-muted-foreground">Schedule</span>
                                        <span className="text-xl font-black text-foreground text-right">{formData.Plan_Date} @ {formData.Plan_Time}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-muted-foreground">Cargo</span>
                                        <span className="text-xl font-black text-primary text-right">{formData.Cargo_Type || 'Not specified'} | {formData.Weight || '0'} KG</span>
                                    </div>
                                </div>
                            </PremiumCard>

                            <PremiumCard className="p-8 bg-muted/50 border-border/10 rounded-2xl group/card relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-6 opacity-10"><MapPin size={40} /></div>
                                <span className="text-sm font-semibold text-emerald-500 mb-6 block">Customer & route</span>
                                <div className="space-y-6">
                                    <div className="flex justify-between items-center border-b border-border/5 pb-4">
                                        <span className="text-sm font-semibold text-muted-foreground">Customer</span>
                                        <span className="text-xl font-black text-foreground text-right leading-none max-w-[200px]">{formData.Customer_Name || 'Not selected'}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-border/5 pb-4">
                                        <span className="text-sm font-semibold text-muted-foreground">Phone</span>
                                        <span className="text-xl font-black text-foreground font-sans">{formData.Customer_Phone || '-'}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-sm font-semibold text-muted-foreground">Route</span>
                                        <span className="text-base font-bold text-emerald-500 text-right">{formData.Origin_Location} → {formData.Dest_Location}</span>
                                    </div>
                                </div>
                            </PremiumCard>

                            <PremiumCard className="lg:col-span-2 p-10 bg-primary/5 border-primary/20 rounded-2xl group/card relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-8 opacity-10 animate-pulse"><Target size={60} /></div>
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-12">
                                    <div className="space-y-2">
                                        <span className="text-sm font-semibold text-muted-foreground block mb-4">Assignment</span>
                                        <div className="flex flex-col gap-6">
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/10 flex items-center justify-center text-primary italic font-black shadow-inner">
                                                    {formData.Driver_Name?.charAt(0) || '?'}
                                                </div>
                                                <div>
                                                    <span className="text-sm font-semibold text-muted-foreground block mb-1">Driver</span>
                                                    <span className="text-xl font-black text-foreground">{formData.Driver_Name || 'Not selected'}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-2xl bg-muted/50 border border-border/10 flex items-center justify-center text-primary shadow-inner">
                                                    <Truck size={24} />
                                                </div>
                                                <div>
                                                    <span className="text-sm font-semibold text-muted-foreground block mb-1">Vehicle</span>
                                                    <span className="text-xl font-black text-foreground font-sans">{formData.Vehicle_Plate || 'Not selected'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="bg-background p-8 rounded-2xl border border-border flex flex-col items-center justify-center min-w-[280px] shadow-sm relative">
                                        <div className="absolute inset-0 bg-primary/5 blur-3xl" />
                                        <span className="text-sm font-semibold text-muted-foreground mb-6 relative z-10">Ready to save</span>
                                        <div className="flex flex-col items-center gap-2 relative z-10">
                                            <span className="text-lg font-black text-primary mb-2">All set</span>
                                            <div className="h-1.5 w-40 bg-muted/50 rounded-full overflow-hidden border border-border/5">
                                                <motion.div 
                                                    className="h-full bg-primary shadow-[0_0_15px_rgba(255,30,133,1)]"
                                                    animate={{ x: [-160, 160] }}
                                                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </PremiumCard>
                        </div>
                    </div>
                )}
            </div>

            <div className="p-8 bg-muted/30 border-t border-border flex flex-col md:flex-row items-center justify-between gap-6">
                <PremiumButton 
                    variant="outline" 
                    onClick={prevStep} 
                    disabled={currentStep === 0} 
                    className="h-12 px-6 rounded-xl border-border bg-muted/50 hover:bg-muted/80 text-foreground font-bold gap-3 disabled:opacity-20"
                >
                    <ChevronLeft className="w-5 h-5" /> Back
                </PremiumButton>
                
                <div className="flex items-center gap-6 w-full md:w-auto">
                    {currentStep < steps.length - 1 ? (
                        <PremiumButton 
                            onClick={nextStep} 
                            className="h-14 px-8 rounded-xl bg-primary text-primary-foreground font-bold gap-4 shadow-sm hover:scale-[1.02] transition-all text-base w-full md:w-auto"
                        >
                            Continue <ChevronRight className="w-5 h-5" />
                        </PremiumButton>
                    ) : (
                        <PremiumButton 
                            onClick={handleSubmit} 
                            disabled={loading} 
                            className="h-14 px-8 rounded-xl bg-emerald-600 text-white font-bold gap-4 shadow-sm hover:scale-[1.02] transition-all w-full md:w-auto"
                        >
                            {loading ? (
                                <Loader2 className="w-7 h-7 animate-spin" />
                            ) : (
                                <Target className="w-7 h-7 animate-pulse" />
                            )}
                            Create job
                        </PremiumButton>
                    )}
                </div>
            </div>
          </PremiumCard>
        </motion.div>
      </AnimatePresence>

      <div className="py-12 border-t border-border flex flex-col items-center opacity-70">
          <div className="flex items-center gap-5 mb-3">
              <ShieldCheck size={20} className="text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">Secure job creation</span>
          </div>
          <p className="text-sm font-medium text-muted-foreground leading-relaxed text-center">
              Job changes are saved with audit logs and applied to the active planning workflow.
          </p>
      </div>
    </div>
  )
}
