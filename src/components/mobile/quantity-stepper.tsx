"use client"

interface QuantityStepperProps {
    value: string;
    onChange: (value: string) => void;
    label?: string;
    min?: number;
    max?: number;
}

export function QuantityStepper({ 
    value, 
    onChange, 
    label = "ระบุจำนวนจริง (ชิ้น)",
}: QuantityStepperProps) {

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value
        // Allow empty string or digits only
        if (val === "" || /^\d+$/.test(val)) {
            onChange(val)
        }
    }

    return (
        <div className="bg-card p-4 rounded-xl border border-border space-y-3 shadow-sm">
            <p className="text-xs font-semibold text-muted-foreground ml-1">
                {label}
            </p>
            
            <div className="relative">
                <input
                    type="number"
                    inputMode="numeric"
                    value={value}
                    onChange={handleInputChange}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                        }
                    }}
                    placeholder="แตะเพื่อระบุจำนวนชิ้น"
                    style={{ color: '#ef4444' }}
                    className="w-full h-16 bg-background border-2 border-primary rounded-lg text-3xl font-black text-center !text-red-500 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none shadow-inner"
                />
                <div className="absolute right-4 top-1/2 -translate-y-1/2 text-primary/60 font-semibold text-xs pointer-events-none">
                    ชิ้น
                </div>
            </div>
            
            <p className="text-center text-red-500 text-[10px] font-bold mt-1">
                * โปรดตรวจสอบจำนวนก่อนกดยืนยัน ป้องกันการสแกนบาร์โค้ดผิดช่อง
            </p>
        </div>
    )
}

