import 'server-only'
import { google } from 'googleapis'
import { join } from 'path'

// Read/write access to spreadsheets the service account is shared on.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

/**
 * Google Sheets client authenticated with the project service account.
 * The target spreadsheet must be shared with the service account email as Editor.
 *
 * Credentials are read from the GOOGLE_SERVICE_ACCOUNT_JSON env var (the full
 * contents of service_account.json) when present — required on Vercel, where
 * service_account.json is gitignored and not deployed. Falls back to the local
 * file for development.
 */
export function getSheetsClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON

  const auth = raw
    ? new google.auth.GoogleAuth({ credentials: JSON.parse(raw), scopes: SCOPES })
    : new google.auth.GoogleAuth({ keyFile: join(process.cwd(), 'service_account.json'), scopes: SCOPES })

  return google.sheets({ version: 'v4', auth })
}
