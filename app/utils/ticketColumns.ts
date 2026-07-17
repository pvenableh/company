/**
 * Ticket board columns — the canonical status lanes shared by the Tickets
 * board and any surface that opens the "New Ticket" composer (which needs the
 * column list for its status <select>). Ticket statuses are Capitalized and
 * case-sensitive, so keep these ids exact.
 */
export interface TicketBoardColumn {
	id: string;
	name: string;
	color: string;
}

export const TICKET_BOARD_COLUMNS: TicketBoardColumn[] = [
	{ id: 'Pending', name: 'Pending', color: 'cyan' },
	{ id: 'Scheduled', name: 'Scheduled', color: 'cyan2' },
	{ id: 'In Progress', name: 'In Progress', color: 'green2' },
	{ id: 'Completed', name: 'Completed', color: 'green' },
];
