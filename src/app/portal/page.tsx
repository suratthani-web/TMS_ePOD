import { getSession } from "@/lib/session"
import { redirect } from "next/navigation"

export default async function PortalPage() {
  const session = await getSession()
  if (session?.customerId) redirect('/portal/jobs')
  redirect('/portal/login')
}
