import { ExceptionClient } from "./exception-client"
import { fetchExceptionsAction } from "./actions"

export default async function ExceptionCenterPage() {
    const initialData = await fetchExceptionsAction()
    return <ExceptionClient initialData={initialData} />
}
