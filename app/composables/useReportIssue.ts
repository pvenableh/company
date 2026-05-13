/**
 * useReportIssue — global hook for the support/feedback modal.
 *
 * The modal is mounted once in app.vue and any component can pop it open
 * (HelpMenu, AppHeader actions, keyboard shortcut, etc) by calling
 * `openReportModal(type)`. State lives in useState so SSR + multiple
 * callers stay in sync.
 */

import { useState } from '#app';

export type SupportType = 'bug' | 'feature' | 'question' | 'feedback';

interface ReportModalState {
	open: boolean;
	type: SupportType;
}

export function useReportIssue() {
	const state = useState<ReportModalState>('support:report-modal', () => ({
		open: false,
		type: 'bug',
	}));

	function openReportModal(type: SupportType = 'bug') {
		state.value = { open: true, type };
	}

	function closeReportModal() {
		state.value = { ...state.value, open: false };
	}

	return { state, openReportModal, closeReportModal };
}
