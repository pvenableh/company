# AI action payload contracts (Phase 4)

The `ai_actions.payload` JSON column carries the parameters an executor needs to
run an approved action. These shapes are the **contract between the producer**
(the code that logs a `pending` row — the AI chat engine in Phase 4) **and the
executor** (`server/utils/ai-action-executors.ts`). They are defined here, not
discovered — there is no pre-existing producer to copy from. Both sides must
agree; if they drift the executor gets `undefined` and either no-ops or throws.

Executor contract (unchanged from Phase 3): `(ctx: { action, userId,
organizationId }) => Promise<result>`. Returning a plain object stores it as the
row's `result`; **throwing marks the action `failed` with the error message**
(the approve endpoint surfaces that). A missing executor is a clear 400.

Two cross-cutting conventions:

- **Provenance** — tag every AI-created effect so it's distinguishable: `ai_suggested: true`
  on tasks, `categories: ['ai-action']` + `sendCollection: 'ai_actions'` on emails.
- **Fail-soft vs fail-hard** — a bad *link* (e.g. a project in another org) degrades
  gracefully (drop the link, keep going); a bad *core* param (unknown collection,
  missing recipient, transport error) throws so the row lands `failed` with a
  readable reason.

Ship order (by blast radius): **`create_tasks` → `update_field` → `send_email`**.

---

## `create_tasks` — lowest risk, ship first

Maps directly onto the `tasks` collection (`shared/directus.ts` → `Task`).

```ts
interface CreateTasksPayload {
  tasks: Array<{
    title: string;                    // required
    description?: string | null;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    schedule?: 'today' | 'this_week' | 'later' | 'unscheduled';
    due_date?: string | null;         // ISO date
    category?: 'quick' | 'ticket' | 'project' | 'event' | 'channel' | 'team';
    project_id?: string | null;       // org-verified before linking
    client_id?: string | null;        // org-verified before linking
    assigned_to?: string[];           // directus_users ids
  }>;
}
```

**Executor:** for each entry `createItem('tasks', { ...fields, organization_id:
action.organization, status: 'new', ai_suggested: true })`. Before linking
`project_id`/`client_id`, load that row and confirm its org matches
`action.organization` — drop the link if not, don't fail the whole batch.

**Result:** `{ created: string[], count: number }`.

---

## `update_field` — reversible, ship second

Deliberately narrow: one field on one allow-listed row. The safety is entirely
in a hard-coded allow-list — never a free-form update.

```ts
interface UpdateFieldPayload {
  collection: string;        // must be a key in UPDATE_FIELD_ALLOWLIST
  id: string | number;
  field: string;             // must be in UPDATE_FIELD_ALLOWLIST[collection]
  value: unknown;
}

const UPDATE_FIELD_ALLOWLIST: Record<string, string[]> = {
  leads:    ['status', 'stage'],
  clients:  ['status'],
  projects: ['status'],
  tasks:    ['status', 'priority', 'schedule', 'due_date'],
};
```

**Executor steps:**
1. Reject if `collection`/`field` not in the allow-list → throw (lands `failed`).
2. Load the row; verify its org column (`organization` / `organization_id`)
   equals `action.organization`.
3. Capture the current value (`previous`).
4. `updateItem(collection, id, { [field]: value })`.

**Result:** `{ collection, id, field, previous, value }` — storing `previous`
gives a one-click manual undo and a clean audit line.

---

## `send_email` — irreversible, keep dry-run until last

Maps onto `renderOrgEmail()` + `sendBrandedEmail()` (`server/utils/email-send.ts`,
which returns `{ sent, reason? }` and no-ops gracefully when SMTP/SendGrid is not
configured).

```ts
interface SendEmailPayload {
  to?: string;                        // explicit recipient, OR…
  contactId?: string | number | null; // …resolve `to` from an org-verified contact
  subject: string;                    // required
  heading?: string;                   // shell heading; defaults to subject
  bodyHtml: string;                   // required; sanitized before send
  cta?: { label: string; url: string } | null;
  replyTo?: string | null;
}
```

**Executor:** resolve `to` (if `contactId`, load the contact, verify its org,
use its email); load the org brand ref; render, then gate the transmit on an env
flag so the executor **defaults to dry-run**:

```ts
const { html, text } = renderOrgEmail({ org, subject, heading: heading || subject, bodyHtml, cta });

if (process.env.AI_SEND_EMAIL_DRYRUN !== 'false') {
  return { sent: false, dryRun: true, to, subject };   // rendered, NOT transmitted
}

const res = await sendBrandedEmail({
  to, subject, html, text, org,
  categories: ['transactional', 'ai-action'],
  sendCollection: 'ai_actions', sendId: action.id,
});
if (!res.sent) throw new Error(res.reason || 'Email transport failed');
return { sent: true, to, subject };
```

The full approve→execute path is exercised for real (email rendered, row logged)
while `AI_SEND_EMAIL_DRYRUN` is unset/`true`; flip it to `false` in a
properly-configured env to go live. No separate stub code path to remove later.
