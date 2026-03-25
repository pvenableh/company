# Task 6 — Twilio Sub-Accounts Per Organization

## Context
Currently all Twilio calls and SMS use a single master Twilio account. Phone numbers are stored
in `phone_settings.twilio_phone_number`. There is no per-org isolation.

The target: each organization gets a Twilio sub-account provisioned automatically when they
activate the Communications add-on. Sub-accounts isolate usage and billing per org.

### Important: admin Directus client
The server-side admin client is `getTypedDirectus()` from `server/utils/directus.ts`.
It is auto-imported by Nuxt. There is no `getAdminDirectus()` function.

### Business model note
Communications (Twilio phone/video/SMS) is a **$49/mo add-on** per the business model,
due to per-minute pass-through costs. The add-on billing is handled in Task 8, but this
task should check for the add-on before provisioning sub-accounts.

### Current state (verified)
- `phone_settings` collection **exists** in Directus with fields: `line_name`, `line_identifier`,
  `twilio_phone_number`, `company_name`, `greeting_text`, etc.
- `phone_settings` does **NOT** have an `organization` field — must be added via MCP.
- `server/api/phone/` directory does **NOT exist**. Phone API routes may not be built yet.
  Search the project for existing Twilio usage before assuming a directory structure.
- The `organizations` collection does NOT yet have `twilio_subaccount_sid/token/status` fields.

## Step 1 — Add fields via Directus MCP

### 1a. Add `organization` field to `phone_settings`

The `phone_settings` collection is missing an org FK. Add it first:
```json
{ "field": "organization", "type": "uuid", "meta": { "interface": "select-dropdown-m2o", "special": ["m2o"], "note": "Owning organization" }, "schema": { "is_nullable": true } }
```
Then create the M2O relation from `phone_settings.organization` → `organizations`.

### 1b. Add sub-account fields to `organizations`

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
  const directus = getTypedDirectus()
  
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

## Step 5 — Update existing phone routes (if they exist)

Search the project for all existing Twilio calls:
```bash
grep -r "twilio" --include='*.ts' server/
```

Note: `server/api/phone/` does NOT currently exist. If phone API routes are found elsewhere,
read each one. For routes that make outbound calls or send SMS, replace the direct Twilio
client initialization with `twilioSubaccount(orgId, orgName)`.

If no phone routes exist yet, create the initial routes as described in Step 3 above. The org
context should be available from the user's session and their active organization.

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
