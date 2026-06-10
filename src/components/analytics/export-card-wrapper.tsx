"use client"

import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"
import { exportToCSV } from "@/lib/utils/export"
import { ReactNode } from "react"

interface ExportCardWrapperProps {
    data: Record<string, unknown>[];
    filename: string;
    children: ReactNode;
}

export function ExportCardWrapper({ data, filename, children }: ExportCardWrapperProps) {
    const handleExport = () => {
        exportToCSV(data, filename);
    };

    return (
        <div className="relative group">
            <div className="absolute top-4 right-4 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 px-2 text-gray-700 font-black hover:text-foreground hover:bg-card border border-gray-100"
                    onClick={handleExport}
                >
                    <Download className="h-4 w-4 mr-2" />
                    <span className="text-lg font-bold">Export</span>
                </Button>
            </div>
            {children}
        </div>
    );
}

