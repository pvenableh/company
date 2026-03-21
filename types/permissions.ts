// ── Feature Keys ──────────────────────────────────────────────────────────────
// Every gatable area of the app. Used as keys in the permission matrix.
export type FeatureKey =
  | 'dashboard'
  | 'projects'
  | 'tickets'
  | 'tasks'
  | 'contacts'
  | 'people'
  | 'clients'
  | 'channels'
  | 'comments'
  | 'reactions'
  | 'messages'
  | 'invoices'
  | 'email_campaigns'
  | 'mailing_lists'
  | 'appointments'
  | 'org_settings'
  | 'team_management'
  | 'member_management'
  | 'ar_clients'
  | 'expenses';

// ── Feature Permission ────────────────────────────────────────────────────────
// Each feature can be toggled on/off and have CRUD flags.
export interface FeaturePermission {
  access: boolean;
  create?: boolean;
  read?: boolean;
  update?: boolean;
  delete?: boolean;
}

// ── Permission Matrix ─────────────────────────────────────────────────────────
// The full permission map stored as JSON in `org_roles.permissions`.
export type PermissionMatrix = Record<FeatureKey, FeaturePermission>;

// ── CRUD Action ───────────────────────────────────────────────────────────────
export type CrudAction = 'create' | 'read' | 'update' | 'delete';

// ── Role Slug ─────────────────────────────────────────────────────────────────
export type RoleSlug = 'owner' | 'admin' | 'manager' | 'member' | 'client';

// ── All feature keys (useful for iteration) ──────────────────────────────────
export const FEATURE_KEYS: FeatureKey[] = [
  'dashboard',
  'projects',
  'tickets',
  'tasks',
  'contacts',
  'people',
  'clients',
  'channels',
  'comments',
  'reactions',
  'messages',
  'invoices',
  'email_campaigns',
  'mailing_lists',
  'appointments',
  'org_settings',
  'team_management',
  'member_management',
  'ar_clients',
  'expenses',
];

// ── Human-readable labels for features ───────────────────────────────────────
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  tickets: 'Tickets',
  tasks: 'Tasks',
  contacts: 'Contacts',
  people: 'People',
  clients: 'Clients',
  channels: 'Channels',
  comments: 'Comments',
  reactions: 'Reactions',
  messages: 'Messages',
  invoices: 'Invoices',
  email_campaigns: 'Email Campaigns',
  mailing_lists: 'Mailing Lists',
  appointments: 'Appointments',
  org_settings: 'Organization Settings',
  team_management: 'Team Management',
  member_management: 'Member Management',
  ar_clients: 'AR Clients',
  expenses: 'Expenses',
};

// ── Helper: full CRUD access ─────────────────────────────────────────────────
const full = (access = true): FeaturePermission => ({
  access,
  create: access,
  read: access,
  update: access,
  delete: access,
});

const readOnly = (access = true): FeaturePermission => ({
  access,
  create: false,
  read: access,
  update: false,
  delete: false,
});

const noAccess = (): FeaturePermission => ({
  access: false,
  create: false,
  read: false,
  update: false,
  delete: false,
});

const custom = (perms: Partial<FeaturePermission> & { access: boolean }): FeaturePermission => ({
  create: false,
  read: false,
  update: false,
  delete: false,
  ...perms,
});

// ══════════════════════════════════════════════════════════════════════════════
// DEFAULT ROLE PERMISSIONS
// These are assigned when an org_role is created via seed-roles.
// Admins can later customise them per-org via the roles settings page.
// ══════════════════════════════════════════════════════════════════════════════

// ── Owner ─────────────────────────────────────────────────────────────────────
// Org creator. Full access to everything including destructive org operations.
const OWNER_PERMISSIONS: PermissionMatrix = {
  dashboard: full(),
  projects: full(),
  tickets: full(),
  tasks: full(),
  contacts: full(),
  people: full(),
  clients: full(),
  channels: full(),
  comments: full(),
  reactions: full(),
  messages: full(),
  invoices: full(),
  email_campaigns: full(),
  mailing_lists: full(),
  appointments: full(),
  org_settings: full(),
  team_management: full(),
  member_management: full(),
  ar_clients: full(),
  expenses: full(),
};

// ── Admin ─────────────────────────────────────────────────────────────────────
// Full org access except cannot delete the org itself.
const ADMIN_PERMISSIONS: PermissionMatrix = {
  dashboard: full(),
  projects: full(),
  tickets: full(),
  tasks: full(),
  contacts: full(),
  people: full(),
  clients: full(),
  channels: full(),
  comments: full(),
  reactions: full(),
  messages: full(),
  invoices: full(),
  email_campaigns: full(),
  mailing_lists: full(),
  appointments: full(),
  org_settings: custom({ access: true, read: true, update: true }),
  team_management: full(),
  member_management: full(),
  ar_clients: full(),
  expenses: full(),
};

// ── Manager ───────────────────────────────────────────────────────────────────
// Manages projects, clients, and teams. Limited org settings.
const MANAGER_PERMISSIONS: PermissionMatrix = {
  dashboard: full(),
  projects: full(),
  tickets: full(),
  tasks: full(),
  contacts: full(),
  people: full(),
  clients: full(),
  channels: full(),
  comments: full(),
  reactions: full(),
  messages: full(),
  invoices: custom({ access: true, create: true, read: true, update: true }),
  email_campaigns: full(),
  mailing_lists: full(),
  appointments: full(),
  org_settings: readOnly(),
  team_management: custom({ access: true, read: true, update: true }),
  member_management: readOnly(),
  ar_clients: custom({ access: true, create: true, read: true, update: true }),
  expenses: custom({ access: true, create: true, read: true, update: true }),
};

// ── Member ────────────────────────────────────────────────────────────────────
// Works on assigned items. Read most, CRUD tasks/tickets/comments.
const MEMBER_PERMISSIONS: PermissionMatrix = {
  dashboard: custom({ access: true, read: true }),
  projects: custom({ access: true, read: true, update: true }),
  tickets: custom({ access: true, create: true, read: true, update: true }),
  tasks: custom({ access: true, create: true, read: true, update: true, delete: true }),
  contacts: custom({ access: true, create: true, read: true, update: true }),
  people: custom({ access: true, create: true, read: true, update: true }),
  clients: custom({ access: true, read: true }),
  channels: custom({ access: true, create: true, read: true, update: true }),
  comments: custom({ access: true, create: true, read: true, update: true, delete: true }),
  reactions: custom({ access: true, create: true, read: true, delete: true }),
  messages: custom({ access: true, create: true, read: true, update: true }),
  invoices: readOnly(),
  email_campaigns: noAccess(),
  mailing_lists: noAccess(),
  appointments: custom({ access: true, create: true, read: true, update: true }),
  org_settings: noAccess(),
  team_management: noAccess(),
  member_management: noAccess(),
  ar_clients: noAccess(),
  expenses: custom({ access: true, create: true, read: true, update: true }),
};

// ── Client ────────────────────────────────────────────────────────────────────
// External user. Read-only on most, can create tickets + comments + messages.
const CLIENT_PERMISSIONS: PermissionMatrix = {
  dashboard: custom({ access: true, read: true }),
  projects: readOnly(),
  tickets: custom({ access: true, create: true, read: true, update: true }),
  tasks: readOnly(),
  contacts: noAccess(),
  people: noAccess(),
  clients: noAccess(),
  channels: readOnly(),
  comments: custom({ access: true, create: true, read: true, update: true, delete: true }),
  reactions: custom({ access: true, create: true, read: true, delete: true }),
  messages: custom({ access: true, create: true, read: true, update: true }),
  invoices: readOnly(),
  email_campaigns: noAccess(),
  mailing_lists: noAccess(),
  appointments: readOnly(),
  org_settings: noAccess(),
  team_management: noAccess(),
  member_management: noAccess(),
  ar_clients: noAccess(),
  expenses: noAccess(),
};

// ── Exported map ──────────────────────────────────────────────────────────────
export const DEFAULT_ROLE_PERMISSIONS: Record<RoleSlug, PermissionMatrix> = {
  owner: OWNER_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  manager: MANAGER_PERMISSIONS,
  member: MEMBER_PERMISSIONS,
  client: CLIENT_PERMISSIONS,
};

// ── Role metadata ─────────────────────────────────────────────────────────────
export const ROLE_METADATA: Record<RoleSlug, { label: string; description: string; color: string }> = {
  owner: {
    label: 'Owner',
    description: 'Organization creator with full access. Cannot be removed.',
    color: '#8B5CF6',
  },
  admin: {
    label: 'Admin',
    description: 'Full organization access except destructive org-level actions.',
    color: '#EF4444',
  },
  manager: {
    label: 'Manager',
    description: 'Manages projects, clients, and teams with limited org settings.',
    color: '#F59E0B',
  },
  member: {
    label: 'Member',
    description: 'Works on assigned items with read access to most features.',
    color: '#3B82F6',
  },
  client: {
    label: 'Client',
    description: 'External user with read access to assigned projects and tickets.',
    color: '#10B981',
  },
};
