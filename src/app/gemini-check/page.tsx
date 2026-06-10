"use client"
import { useState } from 'react'

export default function GeminiCheck() {
    const [status, setStatus] = useState<{ msg: string; type: 'info' | 'err' | 'ok' }[]>([])
    const [loading, setLoading] = useState(false)

    const runTest = async () => {
        setLoading(true)
        setStatus([])
        const addLog = (msg: string, type: 'info'|'err'|'ok' = 'info') => {
            setStatus(prev => [...prev, { msg, type }])
        }

        try {
            addLog('Testing /api/chat connectivity...', 'info')
            const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY
            addLog(`API Key found in client: ${apiKey ? apiKey.substring(0, 8) + '...' : 'MISSING'}`, apiKey ? 'ok' : 'err')

            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: 'Hello' })
            })

            const data = await res.json()
            if (res.ok) {
                addLog('API Response OK', 'ok')
                addLog(`Result: ${JSON.stringify(data).substring(0, 100)}...`, 'info')
            } else {
                addLog(`API Response Error: ${res.status} ${res.statusText}`, 'err')
                addLog(`Details: ${JSON.stringify(data)}`, 'err')
            }
        } catch (e: unknown) {
            addLog(`Test failed: ${e instanceof Error ? e.message : String(e)}`, 'err')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-4">Gemini Diagnostic</h1>
            <button 
                onClick={runTest}
                disabled={loading}
                className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
                {loading ? 'Running...' : 'Run Diagnostics'}
            </button>
            <div className="mt-4 bg-card text-muted-foreground p-4 rounded font-mono text-xl space-y-1">
                {status.map((s, i) => (
                    <div key={i} className={s.type === 'err' ? 'text-red-400' : s.type === 'ok' ? 'text-green-400' : ''}>
                        {s.type === 'err' ? '✖ ' : s.type === 'ok' ? '✔ ' : '• '}{s.msg}
                    </div>
                ))}
            </div>
        </div>
    )
}

