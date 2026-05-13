import type { LayoutKey, WalkthroughTour } from '~/composables/useWalkthrough';

export const walkthroughTours: WalkthroughTour[] = [
  // ── Classic layout ─────────────────────────────────────────────────────
  {
    id: 'tickets-intro',
    title: 'Tickets Board',
    description: 'Learn how to manage and track work with the Kanban board',
    route: '/tickets',
    icon: 'i-heroicons-queue-list',
    layouts: ['classic'],
    steps: [
      {
        target: '.tickets-board__board',
        title: 'The Ticket Board',
        description: 'Your tickets are organized into columns by status — Pending, Scheduled, In Progress, and Completed. Drag and drop tickets between columns to update their status instantly.',
        placement: 'top',
      },
      {
        target: '.tickets-board__filters',
        title: 'Filter Your View',
        description: 'Toggle "My Tickets" to see only tickets assigned to you, or filter by due date and project. The spinner shows when filters are updating.',
        placement: 'bottom',
      },
      {
        target: '.ticket-card:first-child',
        title: 'Ticket Cards',
        description: 'Each card shows priority, client, assigned team members, and due date. Hover to reveal the archive and info buttons. Click a card to expand it and see full details.',
        placement: 'right',
      },
    ],
  },
  {
    id: 'projects-intro',
    title: 'Projects',
    description: 'Overview of project management and navigation',
    route: '/projects',
    icon: 'i-heroicons-folder',
    layouts: ['classic'],
    steps: [
      {
        target: 'main',
        title: 'Your Projects',
        description: 'All your projects are listed here, organized by status. Each project tracks its timeline, tasks, tickets, billing, and team assignments.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'project-detail',
    title: 'Project Details',
    description: 'Navigate the project detail tabs and features',
    route: '/projects/',
    icon: 'i-heroicons-document-text',
    layouts: ['classic'],
    steps: [
      {
        target: '.grid.grid-cols-2',
        title: 'Project Stats',
        description: 'Quick overview showing open tickets, task progress, events count, billing totals, and timeline status. Pending approvals are highlighted in amber.',
        placement: 'bottom',
      },
      {
        target: '[data-slot="tabs-list"]',
        title: 'Project Tabs',
        description: 'Switch between Overview (timeline events), Conversations, Tasks (Kanban board), Tickets, Activity log, Time tracking, Documents, and Billing.',
        placement: 'bottom',
      },
      {
        target: '[data-slot="tabs-content"]',
        title: 'Overview & Events',
        description: 'The Overview tab shows your project timeline with events and milestones. Events can require client approval — look for amber "Needs Approval" badges. Click an event to approve it or generate a shareable approval link.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'tasks-intro',
    title: 'Task Management',
    description: 'How to use the task Kanban board',
    route: '/tasks',
    icon: 'i-heroicons-clipboard-document-check',
    layouts: ['classic'],
    steps: [
      {
        target: '.task-board',
        title: 'Task Board',
        description: 'Tasks are organized in three columns: To Do, In Progress, and Done. Drag tasks between columns to update their status. Click the checkbox to quickly mark a task complete.',
        placement: 'top',
      },
      {
        target: '.task-board input',
        title: 'Quick Add',
        description: 'Type a task title and press Enter to quickly add tasks to any column. New tasks are automatically linked to the current project.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'contact-detail',
    title: 'Contact Details',
    description: 'Partner connections, sourced-leads attribution, and Ask Earnest',
    route: '/contacts/',
    icon: 'i-heroicons-user-circle',
    layouts: ['classic'],
    steps: [
      {
        target: '[data-tour-id="ask-earnest"]',
        title: 'Ask Earnest about this contact',
        description: 'Opens the contextual chat pane. Earnest loads this person\'s full profile — pipeline, sourced attribution, client connections, email engagement — before answering, so responses cite real data instead of guessing.',
        placement: 'bottom',
      },
      {
        target: '[data-tour-id="leads-sourced"]',
        title: 'Leads Sourced',
        description: 'Shows every lead tied to this person rolled up into won / open / lost buckets with dollar totals. "Clients Won" lists the actual clients they sourced (with multi-deal counts). Partners always see this card; regular contacts see it once they\'ve won their first deal.',
        placement: 'left',
      },
      {
        target: '[data-tour-id="client-connections"]',
        title: 'Client Connections',
        description: 'Non-employment links between this person and your clients — referral partners, vendors, board members, consultants, investors. Track who introduced who and why. Only appears for partners or contacts that already have a connection.',
        placement: 'left',
      },
    ],
  },
  {
    id: 'navigation-intro',
    title: 'Navigation & Filters',
    description: 'Understand the header controls and global filters',
    route: '/',
    icon: 'i-heroicons-adjustments-horizontal',
    layouts: ['classic'],
    steps: [
      {
        target: '.glass',
        title: 'Header Controls',
        description: 'The header contains your client selector, team filter, and account controls. The client selector filters all data across the app — tickets, projects, invoices — to show only that client\'s work.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'teams-overview',
    title: 'Team workspace',
    description: 'Teammates, goals, and team-scoped tickets',
    route: '/teams/',
    icon: 'i-heroicons-user-group',
    layouts: ['classic'],
    steps: [
      {
        target: 'h1',
        title: 'Team workspace',
        description: 'Teams group the agency into pods — Creative, Delivery, etc. Each team has its own members, goals, and ticket rollup so leads can see at a glance what their pod is shipping.',
        placement: 'bottom',
      },
      {
        target: 'main',
        title: 'Members, goals, and work',
        description: 'Goals track quarter-scale objectives with progress. Assigned tickets and projects roll up here so the team lead can spot bottlenecks without jumping between views.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'marketing-overview',
    title: 'Marketing Intelligence',
    description: 'Campaigns, mailing lists, and AI-driven plans',
    route: '/marketing',
    icon: 'i-heroicons-megaphone',
    layouts: ['classic'],
    steps: [
      {
        target: 'h1',
        title: 'Marketing Intelligence',
        description: 'This is where Earnest helps you plan and run outreach. It pulls context from your clients, leads, and past wins so campaigns are grounded in your real pipeline — not generic advice.',
        placement: 'bottom',
      },
      {
        target: 'main',
        title: 'Scope and generate',
        description: 'Scope the workspace (entire org, or a single client) and generate a campaign or dashboard. Earnest uses your mailing lists, CRM segments, and past engagement data to draft goals, tactics, and reporting.',
        placement: 'top',
      },
    ],
  },

  // ── Apps layout ────────────────────────────────────────────────────────
  // One "shell intro" tour that runs anywhere in the apps shell, plus one
  // per app surface so /apps/work, /apps/clients, etc. each get a guided
  // walk-through of their floor strip + chrome.
  {
    id: 'apps-shell-intro',
    title: 'Apps Layout',
    description: 'How the AppRail, chrome bar, and floor strips fit together',
    route: '/apps',
    icon: 'i-heroicons-squares-2x2',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-rail',
        title: 'The AppRail',
        description: 'Five top-level apps — Clients, Work, Money, Marketing, Organization — plus Account, all reachable in one tap. Switching apps swaps the whole workspace; nothing else needs to move.',
        placement: 'right',
      },
      {
        target: '.apps-shell__chrome',
        title: 'Chrome bar',
        description: 'The same controls follow you everywhere: client filter on the left, brand in the middle, and search + AI + notifications on the right. Filtering by client narrows every app at once.',
        placement: 'bottom',
      },
      {
        target: '.apps-shell__chrome-right',
        title: 'Move the rail',
        description: 'Use the position picker (the small grid icon up here) to dock the AppRail left, right, top, bottom, or as a floating pill. Mobile always forces it to the bottom.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'apps-work-intro',
    title: 'Work app',
    description: 'Gantt, projects, tasks, tickets, meetings, calendar — one workspace',
    route: '/apps/work',
    icon: 'i-heroicons-briefcase',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-header',
        title: 'Work',
        description: 'Everything you produce lives here. The header changes its action button depending on which floor you\'re on — for example, "New Project" only appears on the Projects floor.',
        placement: 'bottom',
      },
      {
        target: '.app-floor-strip',
        title: 'Floor strip',
        description: 'Switch between Gantt, Projects, Tasks, Tickets, Meetings, and Calendar without leaving the page. Each floor is a different lens on the same body of work, so context (client filter, search, etc.) carries across.',
        placement: 'bottom',
      },
      {
        target: '.app-floor-strip',
        title: 'Quick-look slide-overs',
        description: 'On Projects + Meetings, clicking a row opens a one-deep slide-over with status, due date, and a link to the full page. The floor stays put behind it so you can scan and dismiss without losing your spot.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'apps-clients-intro',
    title: 'Clients app',
    description: 'Clients, contacts, and partners on one floor',
    route: '/apps/clients',
    icon: 'i-heroicons-building-office-2',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-header',
        title: 'Clients',
        description: 'The relationship core of your org. By Client lists active accounts; All Contacts is the rolodex; Partners shows referral and vendor connections.',
        placement: 'bottom',
      },
      {
        target: '.app-floor-strip',
        title: 'Three views, one page',
        description: 'The view segments swap between Client, Contact, and Partner perspectives without a route change. The active-state pill and URL `?view=` query both reflect where you are.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'apps-client-detail',
    title: 'Client workspace',
    description: 'Activity feed + nouns rolled up under one client',
    route: '/apps/clients/',
    icon: 'i-heroicons-building-office',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-header',
        title: 'Client workspace',
        description: 'Every noun tied to this client lives here — projects, tickets, contracts, contacts, money. The Activity tab is the chronological view across all of them.',
        placement: 'bottom',
      },
      {
        target: '[data-slot="tabs-list"], .app-floor-strip',
        title: 'Tabs + Activity feed',
        description: 'Activity leads the tab strip — it fans out across invoices, tickets, projects, events, meetings, and completed tasks. Use the chip filters at the top of the feed to narrow by source.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'apps-money-intro',
    title: 'Money app',
    description: 'Cash flow, invoices, payments, expenses, time — together',
    route: '/apps/money',
    icon: 'i-heroicons-banknotes',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-header',
        title: 'Money',
        description: 'Your finance workspace. Cash Flow is the strategic view; the other floors are operational — recording payments, sending invoices, logging expenses, tracking time.',
        placement: 'bottom',
      },
      {
        target: '.app-floor-strip',
        title: 'Five financial lenses',
        description: 'Switch between Cash Flow, Invoices, Payments, Expenses, and Time. The client filter at the top of the chrome bar narrows every floor to that one customer.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'apps-marketing-intro',
    title: 'Marketing app',
    description: 'Pulse, campaigns, email, social, audience',
    route: '/apps/marketing',
    icon: 'i-heroicons-megaphone',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-header',
        title: 'Marketing',
        description: 'Plan and run outreach grounded in your real pipeline. Pulse is the dashboard; Campaigns drive everything else; Email + Social are the execution channels; Audience is your list management.',
        placement: 'bottom',
      },
      {
        target: '.app-floor-strip',
        title: 'Floor strip',
        description: 'Each floor is a different surface of the same engine. Campaign rows open a one-deep slide-over for quick status / dates edits without leaving the list.',
        placement: 'bottom',
      },
    ],
  },
  {
    id: 'apps-organization-intro',
    title: 'Organization app',
    description: 'Overview, members, billing, integrations, settings',
    route: '/apps/organization',
    icon: 'i-heroicons-building-library',
    layouts: ['apps'],
    steps: [
      {
        target: '.app-header',
        title: 'Organization',
        description: 'Workspace-level controls. Overview shows the org at a glance; Members manages teammates; Billing handles plan + add-ons; Integrations + Settings cover everything else.',
        placement: 'bottom',
      },
      {
        target: '.app-floor-strip',
        title: 'Floor strip',
        description: 'Switch between the five organization floors. Member-role users see a reduced view; admins see the full set.',
        placement: 'bottom',
      },
    ],
  },

  // ── Client portal ──────────────────────────────────────────────────────
  // Clients see a far smaller surface than staff — keep the tours short and
  // focused on what the portal actually does (read project status, approve
  // events, pay invoices, message us).
  {
    id: 'portal-welcome',
    title: 'Welcome to your portal',
    description: 'A guided tour of what you can do here',
    route: '/portal',
    icon: 'i-heroicons-home',
    layouts: ['portal'],
    steps: [
      {
        target: '.portal-shell__chrome',
        title: 'Your portal chrome',
        description: 'The brand switcher (if you work with multiple agencies), notifications, your account menu, and this help button all live up here. The chrome stays put as you move between sections.',
        placement: 'bottom',
      },
      {
        target: '.portal-rail',
        title: 'Navigation rail',
        description: 'Jump between Dashboard, Projects, Tasks, Tickets, Invoices, Proposals, Contracts, Social, Marketing, and Messages. The rail can be docked left, right, top, bottom, or as a floating pill — use the position picker in the chrome to move it.',
        placement: 'right',
      },
      {
        target: '.portal-shell__page',
        title: 'Dashboard',
        description: 'This is the room you land in — a snapshot of active projects, anything that needs your sign-off, and recent activity. Everything else in the portal is one click away on the rail.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'portal-projects',
    title: 'Projects',
    description: 'Track what we\'re building for you',
    route: '/portal/projects',
    icon: 'i-heroicons-folder',
    layouts: ['portal'],
    steps: [
      {
        target: 'main',
        title: 'Your projects',
        description: 'Every active project we\'re running for you appears here with its current status, timeline, and any milestones waiting on your input. Click a project to see its events, tasks, and conversations.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'portal-invoices',
    title: 'Invoices',
    description: 'See, download, and pay your invoices',
    route: '/portal/invoices',
    icon: 'i-heroicons-document-currency-dollar',
    layouts: ['portal'],
    steps: [
      {
        target: 'main',
        title: 'Invoices',
        description: 'Every invoice we\'ve sent you — paid, open, or overdue — is right here. Click any open invoice to view a PDF, see what\'s included, or pay it online by card or ACH.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'portal-proposals',
    title: 'Proposals & Contracts',
    description: 'Review and sign documents we send you',
    route: '/portal/proposals',
    icon: 'i-heroicons-document-text',
    layouts: ['portal'],
    steps: [
      {
        target: 'main',
        title: 'Documents to review',
        description: 'Proposals are scoped pieces of work waiting on your approval; contracts are signed agreements. Click any document to read the full version, leave a comment, or sign electronically.',
        placement: 'top',
      },
    ],
  },
  {
    id: 'portal-messages',
    title: 'Messages',
    description: 'Talk to your team without leaving the portal',
    route: '/portal/messages',
    icon: 'i-heroicons-chat-bubble-left-right',
    layouts: ['portal'],
    steps: [
      {
        target: 'main',
        title: 'Messages',
        description: 'Send your team a note, attach a file, or pick up where the last conversation left off. Replies show up here and we get notified in real time — no email tag.',
        placement: 'top',
      },
    ],
  },
];

/**
 * Get tours available for the current route + layout shell.
 *
 * `layout` defaults to "classic" for back-compat with old callers, but
 * passing an explicit value lets the HelpMenu narrow to apps / portal tours.
 */
export function getToursForRoute(
  path: string,
  layout: 'classic' | 'apps' | 'portal' = 'classic',
): WalkthroughTour[] {
  return walkthroughTours.filter((tour) => {
    // Layout gate — tours that don't list a layout are universal.
    if (tour.layouts && !tour.layouts.includes(layout)) return false;
    if (tour.route === path) return true;
    // Match dynamic routes (e.g., /projects/ matches /projects/[id])
    if (tour.route.endsWith('/') && path.startsWith(tour.route)) return true;
    return false;
  });
}

/**
 * Get a specific tour by ID.
 */
export function getTourById(id: string): WalkthroughTour | undefined {
  return walkthroughTours.find((t) => t.id === id);
}
