/**
 * useMeetingPanel — open the meeting create/edit form as a stacked slide-over
 * (the `work-meeting` panel) instead of a standalone modal. Built on
 * useCreatePanel for the shared `created:work-meeting` change signal; adds an
 * edit path that stashes the appointment / video_meeting objects the calendar
 * is editing (the stack is id-only, the modal needs the objects) in a useState
 * the panel reads.
 *
 *   const { openCreate, openEdit, onChanged } = useMeetingPanel()
 *   openCreate({ selectedDate, defaultVideo, projectId, ... })   // new
 *   openEdit({ appointment, meeting, defaultVideo, selectedDate }) // edit
 *   onChanged(() => refreshCalendar())   // fires on create / save / delete
 */
export function useMeetingPanel() {
	const { openCreate, onCreated } = useCreatePanel<any, any>('work-meeting');
	const editCtx = useState<any>('work-meeting-edit-ctx', () => null);
	const { push } = useAppSlideOverStack();

	function openEdit(ctx: {
		appointment?: any;
		meeting?: any;
		defaultVideo?: boolean;
		selectedDate?: Date | null;
	}) {
		editCtx.value = ctx;
		const id = ctx?.meeting?.id || ctx?.appointment?.id || 'edit';
		return push('work-meeting', String(id), 'edit');
	}

	return { openCreate, openEdit, onChanged: onCreated };
}
