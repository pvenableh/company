# Earnest Setup Guide

A step-by-step guide to setting up your organization, building your team, managing clients, and organizing contacts for the best workflow.

---

## Table of Contents

1. [Overview](#overview)
2. [Step 1: Register Your Account](#step-1-register-your-account)
3. [Step 2: Create Your Organization](#step-2-create-your-organization)
4. [Step 3: Understand Roles & Permissions](#step-3-understand-roles--permissions)
5. [Step 4: Invite Team Members](#step-4-invite-team-members)
6. [Step 5: Set Up Teams](#step-5-set-up-teams)
7. [Step 6: Add Clients](#step-6-add-clients)
8. [Step 7: Add Contacts](#step-7-add-contacts)
9. [Step 8: Invite Clients to the Platform](#step-8-invite-clients-to-the-platform)
10. [Step 9: Organize Your Workflow](#step-9-organize-your-workflow)
11. [Step 10: Connect Social Media Accounts](#step-10-connect-social-media-accounts)
12. [How It All Connects](#how-it-all-connects)
13. [FAQ](#faq)

---

## Overview

Earnest is organized around a simple hierarchy:

```
Organization (your company)
├── Teams (groups of people within your company)
├── Clients (companies you serve)
│   └── Contacts (people at those companies)
├── Projects (work you do, optionally tied to a client or team)
├── Tickets (tasks and issues within projects)
└── Members (your team members, each with a specific role)
```

Everything in Earnest is scoped to your **organization**. When you log in, you select which organization you're working in, and all data — projects, clients, contacts, invoices — is filtered to that organization.

---

## Step 1: Register Your Account

1. Navigate to the **Register** page (`/register`).
2. Fill in your details:
   - **First Name** and **Last Name**
   - **Email** (this becomes your login)
   - **Password**
   - **Organization Name** (the name of your company or group)
3. Submit the form.

When you register with an organization name, the system automatically:
- Creates your user account
- Creates your organization
- Sets up 5 default roles (Owner, Admin, Manager, Member, Client)
- Assigns you as the **Owner** with full permissions
- Logs you in

> **Tip:** If you don't provide an organization name during registration, you can create one later from the `/organization/new` page.

---

## Step 2: Create Your Organization

If you registered without an organization, or want to create an additional one:

1. Go to **Organization > New** (`/organization/new`).
2. Enter your **Organization Name**.
3. The system creates the organization, seeds the default roles, and makes you the Owner.

### Organization Settings

Once your organization exists, visit **Organization Settings** (`/organization`) to configure:

- **Name** — your company/group name
- **Logo & Icon** — brand visuals
- **Brand Color** — used throughout the interface
- **Code** — a 3-letter short code (used in invoice numbering, etc.)
- **Category** — the type of organization
- **Plan** — your subscription tier (Free, Starter, Pro, Enterprise)

> **Tip:** You can belong to multiple organizations and switch between them at any time. Your currently selected organization is remembered across sessions.

---

## Step 3: Understand Roles & Permissions

Every organization has 5 system roles. Each role controls access to 18 features across the platform.

| Role | Who It's For | What They Can Do |
|------|-------------|-----------------|
| **Owner** | Organization creator | Full access to everything. Can manage billing, roles, and org settings. |
| **Admin** | Trusted operators | Full access to all features. Cannot delete the organization. |
| **Manager** | Team/project leads | Manage projects, clients, contacts, and team members. Limited access to org-level settings. |
| **Member** | Individual contributors | View most data. Full control over their own tasks, tickets, and comments. |
| **Client** | External client users | Limited view. Can see their projects/appointments, create tickets, and send messages. Access is scoped to their specific client record. |

### Customizing Permissions

Organization Owners and Admins can customize role permissions at **Organization > Roles** (`/organization/roles`). Each role has a permission matrix with CRUD (Create, Read, Update, Delete) flags for these feature areas:

- Dashboard, Projects, Tickets, Tasks
- Contacts, Clients, Channels, Comments
- Reactions, Messages, Invoices
- Email Campaigns, Mailing Lists, Appointments
- Org Settings, Team Management, Member Management
- AR Clients

---

## Step 4: Invite Team Members

Once your organization is set up, bring your team on board.

1. Go to **Organization** (`/organization`) and open the **Members** tab.
2. Click **Invite Member**.
3. Enter their **email address** and select a **role** (Admin, Manager, or Member).
4. Click **Send Invitation**.

### What Happens Next

- If the person already has an Earnest account, they're added to your organization and notified.
- If they're new to Earnest, they receive an email invitation to create their account.
- Their membership starts as **Pending** until they accept.
- Once accepted, their status changes to **Active** and they can access your organization's data.

### Membership States

| Status | Meaning |
|--------|---------|
| **Pending** | Invitation sent, waiting for the user to accept |
| **Active** | User has accepted and can access the organization |
| **Suspended** | Temporarily deactivated (can be reactivated) |

> **Note:** You cannot invite someone as an Owner. Ownership must be transferred.

---

## Step 5: Set Up Teams

Teams let you group members within your organization for better project management and collaboration.

### Creating a Team

1. Go to **Organization > Teams** (`/organization/teams`).
2. Click **Create Team**.
3. Fill in:
   - **Name** — e.g., "Design", "Development", "Sales"
   - **Description** — what this team is responsible for
   - **Icon** — a visual identifier
   - **Members** — select which organization members to add
4. Save the team.

If you don't add any members, you are automatically added as the team manager.

### Team Roles

Within a team, members can be either:
- **Manager** — can manage the team roster, assign projects, and oversee team work
- **Member** — a regular team participant

### How Teams Affect Visibility

- **Admins and Managers** (org-level) can see all teams
- **Members** (org-level) only see teams they belong to
- Projects can be assigned to teams, making it easy to filter and manage work by group

### Best Practices for Teams

- Create teams that mirror your actual organizational structure (e.g., departments or squads)
- Assign team managers who are responsible for that group's deliverables
- Use teams to scope projects — assign a project to a team so everyone on that team has context

---

## Step 6: Add Clients

Clients represent the companies your organization serves.

### Creating a Client

1. Go to **Clients** (`/clients`).
2. Click **Add Client**.
3. Fill in:
   - **Name** — the client company name (required)
   - **Status** — Active, Prospect, Inactive, or Churned
   - **Website** — their website URL
   - **Industry** — the client's industry
   - **Code** — a short code used in invoice numbering
   - **Logo** — upload their company logo
   - **Notes** — any general notes about the client
   - **Tags** — for categorization and filtering
   - **Billing Contacts** — name/email pairs for invoicing

### Client Statuses

| Status | Use For |
|--------|---------|
| **Active** | Current clients you're doing work for |
| **Prospect** | Potential clients in your pipeline |
| **Inactive** | Former clients you're no longer actively serving |
| **Churned** | Clients who have left |

### Client Detail View

Each client's detail page (`/clients/[id]`) shows:
- Client information and branding
- **Contacts** linked to this client
- **Projects** associated with this client
- **Tickets** created for this client
- **Invoices** billed to this client

> **Tip:** Use the client filter in the navigation to scope your entire view (projects, tickets, etc.) to a single client. You can also select "Organization" to see only internal work that isn't tied to any client.

---

## Step 7: Add Contacts

Contacts are individual people — typically people at your client companies, partners, or prospects.

### Creating a Contact

1. Go to **Contacts** (`/contacts`).
2. Click **Add Contact**.
3. Fill in their details:
   - **First Name**, **Last Name**, **Email**, **Phone**
   - **Title** — their job title
   - **Company** — their company name
   - **Category** — Client, Prospect, Architect, Developer, Hospitality, Partner, or Media
   - **Industry**, **Tags** — for filtering
   - **Website**, **LinkedIn URL**, **Instagram Handle** — social links
   - **Mailing Address** — physical address
   - **Photo** — upload their headshot

### Linking Contacts to Clients

Contacts can be associated with a specific client record:

1. Open the contact's detail page.
2. Set the **Client** field to link them to a client company.
3. You can also set a contact as a client's **Primary Contact** from the client detail page.

This is how contacts and clients relate:
- A **Client** is a company (e.g., "Acme Corp")
- A **Contact** is a person (e.g., "Jane Smith, VP of Marketing at Acme Corp")
- Multiple contacts can be linked to one client
- One contact can be marked as the client's primary contact

### Importing Contacts

For bulk additions, use the CSV import feature:

1. Go to **Contacts > Import** (`/contacts/import`).
2. Upload a CSV file.
3. Map your CSV columns to contact fields.
4. Import the contacts — they are automatically linked to your organization.

### Contact Categories

Use categories to classify your contacts:

| Category | Use For |
|----------|---------|
| **Client** | People at client companies |
| **Prospect** | Potential clients or leads |
| **Architect** | Architecture professionals |
| **Developer** | Development professionals |
| **Hospitality** | Hospitality industry contacts |
| **Partner** | Business partners |
| **Media** | Press and media contacts |

### Email Engagement

Contacts have built-in email tracking:
- **Subscription status** — opted in or out of emails
- **Bounce tracking** — hard/soft bounce detection
- **Engagement metrics** — opens, clicks, last activity timestamps
- **Mailing Lists** — contacts can belong to multiple mailing lists for targeted campaigns

---

## Step 8: Invite Clients to the Platform

You can give your clients limited access to Earnest so they can view project progress, submit tickets, and communicate with your team.

### How to Invite a Client User

1. Go to **Organization** (`/organization`) and open the **Members** tab.
2. Click **Invite Client** (or use the client invitation flow).
3. Enter the client contact's **email address**.
4. Select which **Client** record to scope them to.
5. Send the invitation.

### What Client Users Can Do

Client-role users have limited, scoped access:
- **View** projects and appointments related to their client record
- **Create** tickets (to report issues or make requests)
- **Send** messages and comments
- **Cannot** see other clients' data, internal projects, or organization settings

### How Client Scoping Works

When a client user is invited, their `OrgMembership` is linked to a specific Client record. This means:
- They only see projects assigned to their client
- They only see tickets filed under their client
- Their view is completely isolated from other clients and internal work

> **Tip:** This is a great way to provide transparency to clients without exposing your internal operations.

---

## Step 9: Organize Your Workflow

With your organization, teams, clients, and contacts set up, here's how to get the most out of your workflow.

### Recommended Setup Flow

```
1. Create your Organization
2. Configure org settings (logo, brand color, code)
3. Invite your team members with appropriate roles
4. Create teams (Design, Development, Sales, etc.)
5. Add your clients
6. Add contacts and link them to clients
7. Set primary contacts for each client
8. Create projects (assign to teams and/or clients)
9. Invite key client contacts to the platform
10. Connect social media accounts (Instagram, TikTok, LinkedIn, Facebook, Threads)
```

### Using the Client Filter

The client filter in the sidebar lets you quickly scope your view:
- **All** — see everything across all clients
- **Organization** — see only internal work (projects with no client assigned)
- **[Client Name]** — see only work related to that specific client

This filter applies across projects, tickets, and other views, making it easy to focus on one client's work at a time.

### Using the Team Filter

Similarly, you can filter by team to see only the projects and work assigned to a specific team. This is useful for:
- Team standups and check-ins
- Reviewing a team's workload
- Assigning new work to the right group

---

## Step 10: Connect Social Media Accounts

If your organization manages social media, connect your accounts to compose, schedule, and publish posts directly from Earnest.

### Supported Platforms

| Platform | Account Type | Notes |
|----------|-------------|-------|
| **Instagram** | Business/Creator accounts | Must be linked to a Facebook Page |
| **TikTok** | Creator/Business accounts | Posts go to inbox as drafts unless audit-approved |
| **LinkedIn** | Personal profiles + Company Pages | Connects your profile and any pages you manage |
| **Facebook** | Pages only | Personal profiles are not supported |
| **Threads** | Personal accounts | Linked to your Instagram identity |

### Connecting an Account

1. Go to **Social Settings** (`/social/settings`).
2. Find the platform you want to connect.
3. Click **Connect** — you'll be redirected to the platform's authorization page.
4. Grant the requested permissions and you'll be returned to Earnest.
5. Your connected account will appear with an **Active** status badge.

### Managing Accounts

From the Social Settings page you can:
- **Reconnect** an account if the token has expired (look for the amber/red status badge)
- **Disconnect** an account you no longer want to post to
- See how many accounts are connected per platform

### Composing Posts

Once accounts are connected:
1. Go to **Social Compose** (`/social/compose`).
2. Select which accounts to post to.
3. Write your caption, attach media, and choose a post type.
4. Schedule for a future date/time or save as a draft.

### Platform-Specific Options

- **TikTok** — Set privacy level and toggle comments/duets/stitch
- **LinkedIn** — Choose visibility (Public or Connections only)
- **Caption limits** — Instagram: 2,200 chars, LinkedIn: 3,000 chars, TikTok: 4,000 chars
- **Post types** — Image, video, carousel, reel, story, text (Threads/LinkedIn), article (LinkedIn)

> **Tip:** You can post to multiple platforms simultaneously. Each platform receives the post with its native formatting.

---

## How It All Connects

Here's a visual summary of how the key entities relate:

```
Organization
│
├── OrgRoles (Owner, Admin, Manager, Member, Client)
│   └── Permission Matrix (18 features x CRUD flags)
│
├── OrgMemberships (links Users to Org with a Role)
│   └── Client-scoped memberships (for client-role users)
│
├── Teams
│   ├── Team Members (with manager flag)
│   └── Projects (assigned to team)
│
├── Clients (companies you serve)
│   ├── Contacts (people at the client)
│   ├── Projects (work for the client)
│   ├── Tickets (issues/requests from the client)
│   └── Invoices (billing for the client)
│
├── Contacts (people, linked to org via M2M)
│   ├── Linked to Clients (optional)
│   ├── Mailing Lists (for email campaigns)
│   └── Email Engagement Tracking
│
├── Social Accounts (connected platforms)
│   └── Posts (scheduled and published content)
│
└── Projects
    ├── Assigned to Team (optional)
    ├── Assigned to Client (optional)
    └── Tickets → Tasks
```

### Key Relationships

| From | To | Relationship | Notes |
|------|----|-------------|-------|
| User | Organization | Many-to-Many (via OrgMembership) | A user can belong to multiple orgs |
| User | Team | Many-to-Many (via junction) | A user can be on multiple teams, with a manager flag |
| Organization | Client | One-to-Many | Clients belong to one org |
| Client | Contact | One-to-Many | Contacts can be linked to a client |
| Contact | Organization | Many-to-Many (via junction) | Contacts are shared across orgs via junction |
| Project | Team | Many-to-One | A project can be assigned to a team |
| Project | Client | Many-to-One | A project can be assigned to a client |

---

## FAQ

### Can I belong to multiple organizations?
Yes. You can be a member of multiple organizations with different roles in each. Use the organization switcher to move between them.

### Can a contact belong to multiple clients?
No, a contact is linked to one client at a time via a direct foreign key. However, contacts are linked to organizations via a many-to-many junction, so the same contact record can appear in multiple organizations.

### What's the difference between a "Member" and a "Client" role?
- **Member** is an internal team member with broad read access and the ability to work on tasks and tickets.
- **Client** is an external user scoped to a specific client record, with limited visibility into only their projects, tickets, and messages.

### Can I customize what each role can do?
Yes. Go to **Organization > Roles** (`/organization/roles`) to adjust the permission matrix for each role. You can toggle Create, Read, Update, and Delete access for each of the 18 feature areas.

### How do I transfer ownership of an organization?
Ownership transfer is a separate process — you cannot invite someone as an Owner. Contact your administrator or use the ownership transfer flow if available.

### Can clients see other clients' data?
No. Client-role users are scoped to a specific client record. They can only see projects, tickets, and messages associated with their client.

### How do billing contacts work?
Billing contacts are stored directly on the Client record as name/email pairs. These are used for invoice delivery and don't require the billing contact to have a user account.

### Can I import contacts in bulk?
Yes. Use the CSV import feature at **Contacts > Import** (`/contacts/import`). You can map CSV columns to contact fields and import them in bulk. Imported contacts are automatically linked to your current organization.
