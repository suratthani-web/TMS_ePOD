/**
 * Race a promise against a timeout.
 *
 * iOS PWA WebViews can leave html2canvas or a server-action fetch hanging
 * without ever settling, which strands submit spinners forever (the `finally`
 * that clears the loading flag never runs). Wrapping every long await in this
 * guarantees the flow always resolves — either with the real result, or by
 * rejecting so the caller's catch/finally can recover.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
        ),
    ])
}
