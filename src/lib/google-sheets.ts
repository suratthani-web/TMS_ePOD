import 'server-only'
import { google } from 'googleapis'
import { join } from 'path'

// Read/write access to spreadsheets the service account is shared on.
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

/**
 * Google Sheets client authenticated with the project service account
 * (same service_account.json used by google-drive.ts). The target spreadsheet
 * must be shared with the service account email as Editor.
 */
export function getSheetsClient() {
  const KEY_FILE_PATH = join(process.cwd(), 'service_account.json')
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE_PATH,
    scopes: SCOPES,
  })
  return google.sheets({ version: 'v4', auth })
}
