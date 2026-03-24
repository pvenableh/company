# Task 6 — Twilio Sub-Accounts Per Organization

## Context
Currently all Twilio calls and SMS use a single master Twilio account. Phone numbers are stored
in `phone_settings.twilio_phone_number`. There is no per-org isolation.

The target: each organization gets a Twilio sub-account provisioned automatically when they
activate the Communications add-on. Sub-accounts isolate usage and billing per org.

## Step 1 — Add fields to organizations via Directus MCP

Use the Directus MCP connection to add the three new fields to the `organizations` collection
directly. Do this before writing any code so types are correct.

POST to Directus `/fields/organizations` for each field:

```json
{ "field": "twilio_subaccount_sid", "type": "string", "meta": { "note": "Twilio sub-account SID for this org" }, "schema": { "is_nullable": true } }
```
```json
{ "field": "twilio_subaccount_token", "type": "string", "meta": { "note": "Twilio sub-account auth token — treat as secret" }, "schema": { "is_nullable": true } }
```
```json
{ "field": "twilio_subaccount_status", "type": "string", "meta": { "note": "active | suspended", "options": { "choices": [{"text":"Active","value":"active"},{"text":"Suspended","value":"suspended"}] } }, "schema": { "is_nullable": true } }
```

After adding the fields, regenerate TypeScript types:
```bash
pnpm generate:types
```

This updates `types/directus.ts` so `Organization` includes the new fields before you write
any code that references them.

## Step 2 — Create server/utils/twilioMaster.ts

Read all existing files in `server/` that import or use Twilio before writing this.
Match the exact import and initialization pattern used elsewhere.

```typescript
// Master Twilio account client — used to provision sub-accounts and phone numbers.
// Individual org calls should use twilioSubaccount() instead.

import Twilio from 'twilio'

let _masterClient: Twilio.Twilio | null = null

function getMasterClient(): Twilio.Twilio {
  if (_masterClient) return _masterClient
  const config = useRuntimeConfig()
  _masterClient = Twilio(config.twilioAccountSid, config.twilioAuthToken)
  return _masterClient
}

/**
 * Get or create a Twilio sub-account for an organization.
 * Idempotent — if the org already has a sub-account, returns the existing one.
 */
export async function getOrCreateSubAccount(orgId: string, orgName: string): Promise<{
  accountSid: string
  authToken: string
}> {
  const directus = getAdminDirectus()
  
  // Check if org already has a sub-account
  const org = await directus.request(
    readItem('organizations', orgId, {
      fields: ['twilio_subaccount_sid', 'twilio_subaccount_token', 'name'],
    })
  ) as any

  if (org.twilio_subaccount_sid && org.twilio_subaccount_token) {
    return {
      accountSid: org.twilio_subaccount_sid,
      authToken: org.twilio_subaccount_token,
    }
  }

  // Create a new sub-account
  const master = getMasterClient()
  const subAccount = await master.api.accounts.create({
    friendlyName: `Earnest — ${orgName}`,
  })

  // Persist to org
  await directus.request(
    updateItem('organizations', orgId, {
      twilio_subaccount_sid: subAccount.sid,
      twilio_subaccount_token: subAccount.authToken,
      twilio_subaccount_status: 'active',
    })
  )

  return {
    accountSid: subAccount.sid,
    authToken: subAccount.authToken,
  }
}

/**
 * Get a Twilio client scoped to an org's sub-account.
 */
export async function twilioSubaccount(orgId: string, orgName: string): Promise<Twilio.Twilio> {
  const { accountSid, authToken } = await getOrCreateSubAccount(orgId, orgName)
  return Twilio(accountSid, authToken)
}

/**
 * Search available phone numbers in an area code for an org.
 */
export async function searchPhoneNumbers(orgId: string, orgName: string, areaCode: string) {
  const client = await twilioSubaccount(orgId, orgName)
  return client.availablePhoneNumbers('US')
    .local
    .list({ areaCode, limit: 10 })
}

/**
 * Purchase a phone number for an org and configure webhooks to point back to Earnest.
 */
export async function purchasePhoneNumber(
  orgId: string,
  orgName: string,
  phoneNumber: string,
  lineId: string // phone_settings record ID for webhook routing
): Promise<string> {
  const config = useRuntimeConfig()
  const client = await twilioSubaccount(orgId, orgName)
  const baseUrl = config.public.siteUrl || 'https://earnest.guru'

  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber,
    voiceUrl: `${baseUrl}/api/phone/voice/${lineId}`,
    voiceMethod: 'POST',
    smsUrl: `${baseUrl}/api/phone/sms/${lineId}`,
    smsMethod: 'POST',
    statusCallback: `${baseUrl}/api/phone/status`,
    statusCallbackMethod: 'POST',
  })

  return purchased.sid
}
```

## Step 3 — Create new API routes

### GET /api/phone/numbers/search

Accepts query params: `orgId`, `areaCode`
Returns: array of available numbers from Twilio

### POST /api/phone/numbers/purchase  

Accepts body: `{ orgId, phoneNumber, lineName }`
1. Calls `purchasePhoneNumber()` from twilioMaster.ts
2. Creates a `phone_settings` record with the new number
3. Returns the created phone_settings record

### How to find the line for webhook routing

The webhook URLs include the `lineId` (phone_settings record ID). When Twilio hits
`/api/phone/voice/:lineId`, look up that phone_settings record to get the call routes and
greeting. This is the existing pattern — just make sure it still works with sub-accounts.

## Step 4 — Number porting (future/manual for now)

Do NOT implement automated number porting in this task. It requires a Letter of Authorization
from the customer and a 2–4 week carrier process. Instead, add a placeholder UI:

In the phone settings page, add a "Port a number" section with:
- A note explaining the porting process and timeline
- A link or button: "Contact support to port your number"
- This links to `mailto:support@earnest.guru?subject=Number Port Request`

## Step 5 — Update existing phone routes

Find all existing Twilio calls in `server/api/phone/` or similar. Read each one.

For routes that make outbound calls or send SMS, replace the direct Twilio client initialization
with `twilioSubaccount(orgId, orgName)`. The org context should be available from the user's
session and their active organization.

## Environment variables to add

```
TWILIO_ACCOUNT_SID=     # Master account SID
TWILIO_AUTH_TOKEN=      # Master account auth token
```

Note: Individual org sub-account credentials are stored in `organizations.twilio_subaccount_sid`
and `organizations.twilio_subaccount_token` — not in environment variables.

## Do NOT change
- Existing TwiML response handlers (voice menu, SMS replies)
- `phone_settings` collection schema (other than adding `organization` field if missing)
- Call logging to `call_logs` collection

## After making changes
Run `pnpm typecheck`. Test sub-account creation by triggering `getOrCreateSubAccount()` for a
test org and verifying the SID appears in the organizations record.
