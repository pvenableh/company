<script setup lang="ts">
interface StrokePoint { x: number; y: number; t: number; }
type StrokeKind = 'freehand' | 'arrow' | 'rect' | 'text';
interface StrokeSegment {
	id: string;
	authorId: string;
	color: string;
	size: number;
	eraser?: boolean;
	/** Defaults to 'freehand' when absent (back-compat with older senders). */
	kind?: StrokeKind;
	/** Text content when kind === 'text'. */
	text?: string;
	points: StrokePoint[];
	complete: boolean;
}

interface AnnotationBus {
	sendStroke: (segment: StrokeSegment) => void;
	sendClear: () => void;
	sendClearMine: (authorId: string) => void;
	sendUndo: (strokeId: string) => void;
	/** Broadcast a request for the current annotation state (late-joiner sync). */
	sendSyncRequest: () => void;
	/** Reply to a sync request, targeted at the requester's session id. */
	sendSyncResponse: (targetId: string, segments: StrokeSegment[]) => void;
	onStroke: (cb: (segment: StrokeSegment) => void) => () => void;
	onClear: (cb: () => void) => () => void;
	onClearMine: (cb: (authorId: string) => void) => () => void;
	onUndo: (cb: (strokeId: string) => void) => () => void;
	onSyncRequest: (cb: (requesterId: string) => void) => () => void;
	onSyncResponse: (cb: (segments: StrokeSegment[]) => void) => () => void;
}

const props = withDefaults(
	defineProps<{
		bus: AnnotationBus;
		authorId: string;
		/** Where the toolbar floats. Use "bottom" when overlaying the Daily iframe,
		 *  whose own bottom bar is ~80px tall — the toolbar lifts above it. */
		toolbarPosition?: 'top' | 'bottom';
		/** Only the primary peer (the host) answers late-joiner sync requests, so
		 *  a new joiner doesn't get N duplicate replies from every participant. */
		isPrimary?: boolean;
	}>(),
	{ toolbarPosition: 'top', isPrimary: false },
);

const COLORS = [
	{ name: 'Red', value: '#ef4444' },
	{ name: 'Blue', value: '#3b82f6' },
	{ name: 'Green', value: '#22c55e' },
	{ name: 'Black', value: '#111827' },
	{ name: 'Yellow', value: '#eab308' },
];
const SIZES = [
	{ label: 'S', value: 2 },
	{ label: 'M', value: 4 },
	{ label: 'L', value: 8 },
];
type ToolId = 'pen' | 'arrow' | 'rect' | 'text' | 'eraser';
const TOOLS: { id: ToolId; icon: string; label: string }[] = [
	{ id: 'pen', icon: 'i-heroicons-pencil', label: 'Pen' },
	{ id: 'arrow', icon: 'i-heroicons-arrow-up-right', label: 'Arrow' },
	{ id: 'rect', icon: 'i-heroicons-stop', label: 'Rectangle' },
	{ id: 'eraser', icon: 'i-heroicons-backspace', label: 'Eraser' },
];
const ERASER_SIZE_MULT = 6;
// 60ms throttle keeps each broadcast small (well under Daily's ~4KB limit) while
// still feeling smooth at typical drawing speeds (~16 broadcasts/s).
const BROADCAST_INTERVAL_MS = 60;
// Hard cap on points per broadcast as a safety net for very fast drawing.
const MAX_POINTS_PER_SEGMENT = 30;
// How long a remote cursor lingers after the last point before fading out.
const CURSOR_LIFETIME_MS = 1500;
// Sync responses are chunked so a busy whiteboard's full stroke set never blows
// past Daily's ~4KB app-message cap.
const SYNC_CHUNK_SIZE = 12;

const annotateMode = ref(false);
const selectedColor = ref(COLORS[0]!.value);
const selectedSize = ref(SIZES[1]!.value);
const selectedTool = ref<ToolId>('pen');
const isEraser = computed(() => selectedTool.value === 'eraser');
const isShapeTool = (t: ToolId) => t === 'arrow' || t === 'rect';

const containerRef = ref<HTMLDivElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let ctx: CanvasRenderingContext2D | null = null;

// Stroke storage. Map preserves insertion order so re-renders are deterministic.
const liveStrokes = new Map<string, StrokeSegment>();
const settledStrokes = new Map<string, StrokeSegment>();

interface RemoteCursor { x: number; y: number; color: string; lastSeenAt: number; }
const remoteCursors = new Map<string, RemoteCursor>();

let cssWidth = 0;
let cssHeight = 0;
let dpr = 1;

const newStrokeId = () =>
	`${props.authorId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

const setupCanvas = () => {
	const cv = canvasRef.value;
	const cont = containerRef.value;
	if (!cv || !cont) return;
	dpr = window.devicePixelRatio || 1;
	cssWidth = cont.clientWidth;
	cssHeight = cont.clientHeight;
	if (!cssWidth || !cssHeight) return;
	cv.width = Math.floor(cssWidth * dpr);
	cv.height = Math.floor(cssHeight * dpr);
	cv.style.width = `${cssWidth}px`;
	cv.style.height = `${cssHeight}px`;
	ctx = cv.getContext('2d');
	if (ctx) {
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
	}
	redraw();
};

const drawFreehand = (seg: StrokeSegment) => {
	if (!ctx) return;
	const pts = seg.points;
	const first = pts[0]!;
	const fx = first.x * cssWidth;
	const fy = first.y * cssHeight;
	if (pts.length === 1) {
		ctx.beginPath();
		ctx.arc(fx, fy, seg.size / 2, 0, Math.PI * 2);
		ctx.fill();
	} else {
		ctx.beginPath();
		ctx.moveTo(fx, fy);
		for (let i = 1; i < pts.length; i++) {
			const p = pts[i]!;
			ctx.lineTo(p.x * cssWidth, p.y * cssHeight);
		}
		ctx.stroke();
	}
};

const drawArrow = (seg: StrokeSegment) => {
	if (!ctx || seg.points.length < 1) return;
	const a = seg.points[0]!;
	const b = seg.points[seg.points.length - 1]!;
	const ax = a.x * cssWidth, ay = a.y * cssHeight;
	const bx = b.x * cssWidth, by = b.y * cssHeight;
	ctx.beginPath();
	ctx.moveTo(ax, ay);
	ctx.lineTo(bx, by);
	ctx.stroke();
	// Arrowhead
	const angle = Math.atan2(by - ay, bx - ax);
	const head = Math.max(10, seg.size * 3);
	ctx.beginPath();
	ctx.moveTo(bx, by);
	ctx.lineTo(bx - head * Math.cos(angle - Math.PI / 6), by - head * Math.sin(angle - Math.PI / 6));
	ctx.moveTo(bx, by);
	ctx.lineTo(bx - head * Math.cos(angle + Math.PI / 6), by - head * Math.sin(angle + Math.PI / 6));
	ctx.stroke();
};

const drawRect = (seg: StrokeSegment) => {
	if (!ctx || seg.points.length < 1) return;
	const a = seg.points[0]!;
	const b = seg.points[seg.points.length - 1]!;
	const ax = a.x * cssWidth, ay = a.y * cssHeight;
	const bx = b.x * cssWidth, by = b.y * cssHeight;
	ctx.strokeRect(ax, ay, bx - ax, by - ay);
};

const drawText = (seg: StrokeSegment) => {
	if (!ctx || !seg.text || !seg.points.length) return;
	const p = seg.points[0]!;
	const fontPx = Math.max(14, seg.size * 5);
	ctx.font = `600 ${fontPx}px ui-sans-serif, system-ui, sans-serif`;
	ctx.textBaseline = 'top';
	ctx.fillText(seg.text, p.x * cssWidth, p.y * cssHeight);
};

const drawSegment = (seg: StrokeSegment) => {
	if (!ctx || !seg.points.length) return;
	ctx.save();
	ctx.lineWidth = seg.size;
	if (seg.eraser) {
		ctx.globalCompositeOperation = 'destination-out';
		ctx.strokeStyle = 'rgba(0,0,0,1)';
		ctx.fillStyle = 'rgba(0,0,0,1)';
	} else {
		ctx.globalCompositeOperation = 'source-over';
		ctx.strokeStyle = seg.color;
		ctx.fillStyle = seg.color;
	}
	switch (seg.kind) {
		case 'arrow': drawArrow(seg); break;
		case 'rect': drawRect(seg); break;
		case 'text': drawText(seg); break;
		default: drawFreehand(seg);
	}
	ctx.restore();
};

const drawCursors = () => {
	if (!ctx) return;
	const now = Date.now();
	const stale: string[] = [];
	for (const [id, c] of remoteCursors) {
		const age = now - c.lastSeenAt;
		if (age > CURSOR_LIFETIME_MS) { stale.push(id); continue; }
		const alpha = 1 - age / CURSOR_LIFETIME_MS;
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.globalCompositeOperation = 'source-over';
		ctx.fillStyle = c.color;
		ctx.beginPath();
		ctx.arc(c.x * cssWidth, c.y * cssHeight, 5, 0, Math.PI * 2);
		ctx.fill();
		// Outer ring for visibility on dark/light backgrounds
		ctx.globalAlpha = alpha * 0.5;
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = '#ffffff';
		ctx.stroke();
		ctx.restore();
	}
	for (const id of stale) remoteCursors.delete(id);
};

const redraw = () => {
	if (!ctx) return;
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
	ctx.restore();
	for (const seg of settledStrokes.values()) drawSegment(seg);
	for (const seg of liveStrokes.values()) drawSegment(seg);
	drawCursors();
};

// Cursor fade animation runs only while there are active remote cursors.
let cursorRaf: number | null = null;
const ensureCursorLoop = () => {
	if (cursorRaf != null) return;
	const tick = () => {
		redraw();
		if (remoteCursors.size > 0) cursorRaf = requestAnimationFrame(tick);
		else cursorRaf = null;
	};
	cursorRaf = requestAnimationFrame(tick);
};

// ─── Local drawing ──────────────────────────────────────────────────────────
let isDrawing = false;
let currentStrokeId: string | null = null;
let pendingPoints: StrokePoint[] = [];
let lastBroadcastAt = 0;

const ptFromEvent = (ev: PointerEvent): StrokePoint => {
	const cv = canvasRef.value!;
	const rect = cv.getBoundingClientRect();
	return {
		x: rect.width ? (ev.clientX - rect.left) / rect.width : 0,
		y: rect.height ? (ev.clientY - rect.top) / rect.height : 0,
		t: Date.now(),
	};
};

const currentStrokeKind = (): StrokeKind => {
	if (isEraser.value) return 'freehand';
	if (selectedTool.value === 'arrow') return 'arrow';
	if (selectedTool.value === 'rect') return 'rect';
	return 'freehand';
};

const flushBroadcast = (complete: boolean) => {
	if (!currentStrokeId) return;
	const stroke = liveStrokes.get(currentStrokeId);
	if (!stroke) return;
	const shape = stroke.kind === 'arrow' || stroke.kind === 'rect';
	// Freehand sends only the new tail (remotes append). Shapes have just two
	// points (start + current end) so we resend both each time (remotes replace).
	const points = shape ? stroke.points : pendingPoints;
	if (!shape && pendingPoints.length === 0 && !complete) return;
	const seg: StrokeSegment = {
		id: currentStrokeId,
		authorId: props.authorId,
		color: stroke.color,
		size: stroke.size,
		eraser: stroke.eraser,
		kind: stroke.kind,
		points: [...points],
		complete,
	};
	props.bus.sendStroke(seg);
	pendingPoints = [];
	lastBroadcastAt = Date.now();
};

// Text isn't a drag gesture — placed on a single click via a prompt.
const placeText = (p: StrokePoint) => {
	const text = (typeof window !== 'undefined' ? window.prompt('Annotation text') : '')?.trim();
	if (!text) return;
	const id = newStrokeId();
	const seg: StrokeSegment = {
		id,
		authorId: props.authorId,
		color: selectedColor.value,
		size: selectedSize.value,
		kind: 'text',
		text,
		points: [p],
		complete: true,
	};
	settledStrokes.set(id, seg);
	redraw();
	props.bus.sendStroke(seg);
};

const onPointerDown = (ev: PointerEvent) => {
	if (!annotateMode.value) return;
	ev.preventDefault();
	const p = ptFromEvent(ev);

	if (selectedTool.value === 'text') {
		placeText(p);
		return;
	}

	isDrawing = true;
	currentStrokeId = newStrokeId();
	const stroke: StrokeSegment = {
		id: currentStrokeId,
		authorId: props.authorId,
		color: selectedColor.value,
		size: isEraser.value ? selectedSize.value * ERASER_SIZE_MULT : selectedSize.value,
		eraser: isEraser.value,
		kind: currentStrokeKind(),
		points: [p],
		complete: false,
	};
	liveStrokes.set(currentStrokeId, stroke);
	pendingPoints = [p];
	lastBroadcastAt = Date.now();
	props.bus.sendStroke({ ...stroke, points: [p] });
	redraw();
	try { canvasRef.value?.setPointerCapture?.(ev.pointerId); } catch {}
};

const onPointerMove = (ev: PointerEvent) => {
	if (!isDrawing || !currentStrokeId) return;
	const p = ptFromEvent(ev);
	const stroke = liveStrokes.get(currentStrokeId);
	if (!stroke) return;
	if (stroke.kind === 'arrow' || stroke.kind === 'rect') {
		// Shapes are anchored at the first point; the second point tracks the
		// cursor (replace rather than append).
		if (stroke.points.length < 2) stroke.points.push(p);
		else stroke.points[1] = p;
	} else {
		stroke.points.push(p);
		pendingPoints.push(p);
	}
	redraw();
	const now = Date.now();
	if (now - lastBroadcastAt >= BROADCAST_INTERVAL_MS || pendingPoints.length >= MAX_POINTS_PER_SEGMENT) {
		flushBroadcast(false);
	}
};

const endStroke = (ev?: PointerEvent) => {
	if (!isDrawing || !currentStrokeId) return;
	flushBroadcast(true);
	const stroke = liveStrokes.get(currentStrokeId);
	if (stroke) {
		stroke.complete = true;
		settledStrokes.set(currentStrokeId, stroke);
		liveStrokes.delete(currentStrokeId);
	}
	isDrawing = false;
	currentStrokeId = null;
	pendingPoints = [];
	if (ev) {
		try { canvasRef.value?.releasePointerCapture?.(ev.pointerId); } catch {}
	}
	redraw();
};

const onPointerUp = (ev: PointerEvent) => endStroke(ev);
const onPointerCancel = (ev: PointerEvent) => endStroke(ev);

// ─── Remote stroke handling ─────────────────────────────────────────────────
const handleRemoteStroke = (seg: StrokeSegment) => {
	if (!seg || !seg.id) return;
	// Daily's '*' broadcast skips the sender, but be defensive.
	if (seg.authorId === props.authorId) return;

	const isShape = seg.kind === 'arrow' || seg.kind === 'rect';
	const existing = liveStrokes.get(seg.id) || settledStrokes.get(seg.id);
	if (existing) {
		if (isShape) existing.points = [...seg.points]; // shapes replace
		else existing.points.push(...seg.points);        // freehand appends
		if (seg.complete) {
			existing.complete = true;
			if (liveStrokes.has(seg.id)) {
				settledStrokes.set(seg.id, existing);
				liveStrokes.delete(seg.id);
			}
		}
	} else {
		const stroke: StrokeSegment = { ...seg, points: [...seg.points] };
		if (seg.complete) settledStrokes.set(seg.id, stroke);
		else liveStrokes.set(seg.id, stroke);
	}

	if (!seg.complete && seg.points.length > 0 && seg.kind !== 'text') {
		const last = seg.points[seg.points.length - 1]!;
		remoteCursors.set(seg.authorId, {
			x: last.x,
			y: last.y,
			color: seg.color,
			lastSeenAt: Date.now(),
		});
		ensureCursorLoop();
	}

	redraw();
};

const handleRemoteClear = () => {
	liveStrokes.clear();
	settledStrokes.clear();
	redraw();
};

const handleRemoteClearMine = (authorId: string) => {
	if (!authorId) return;
	for (const [id, seg] of settledStrokes) if (seg.authorId === authorId) settledStrokes.delete(id);
	for (const [id, seg] of liveStrokes) if (seg.authorId === authorId) liveStrokes.delete(id);
	redraw();
};

const handleRemoteUndo = (strokeId: string) => {
	if (!strokeId) return;
	settledStrokes.delete(strokeId);
	liveStrokes.delete(strokeId);
	redraw();
};

// ─── Late-joiner sync ─────────────────────────────────────────────────────────
const exportStrokes = (): StrokeSegment[] => [...settledStrokes.values()];

const importStrokes = (segs: StrokeSegment[]) => {
	if (!Array.isArray(segs)) return;
	for (const seg of segs) {
		if (!seg?.id || settledStrokes.has(seg.id)) continue;
		settledStrokes.set(seg.id, { ...seg, points: [...(seg.points || [])], complete: true });
	}
	redraw();
};

const handleSyncRequest = (requesterId: string) => {
	// Only the primary peer (host) answers, to avoid a flood of duplicate
	// replies. Chunk the response so we never exceed Daily's app-message cap.
	if (!props.isPrimary || !requesterId) return;
	const all = exportStrokes();
	for (let i = 0; i < all.length; i += SYNC_CHUNK_SIZE) {
		props.bus.sendSyncResponse(requesterId, all.slice(i, i + SYNC_CHUNK_SIZE));
	}
};

// ─── Toolbar actions ────────────────────────────────────────────────────────
const onClearAll = () => {
	liveStrokes.clear();
	settledStrokes.clear();
	redraw();
	props.bus.sendClear();
};

const onClearMine = () => {
	for (const [id, seg] of settledStrokes) if (seg.authorId === props.authorId) settledStrokes.delete(id);
	for (const [id, seg] of liveStrokes) if (seg.authorId === props.authorId) liveStrokes.delete(id);
	redraw();
	props.bus.sendClearMine(props.authorId);
};

const onUndo = () => {
	// Pop my most-recently-settled stroke (Map preserves insertion order).
	let lastId: string | null = null;
	for (const [id, seg] of settledStrokes) if (seg.authorId === props.authorId) lastId = id;
	if (!lastId) return;
	settledStrokes.delete(lastId);
	redraw();
	props.bus.sendUndo(lastId);
};

// Exposed for parent: clear local view without broadcasting (e.g. on frame change).
const clearAll = () => {
	liveStrokes.clear();
	settledStrokes.clear();
	redraw();
};
// Exposed for the snapshot compositor on the meeting page.
const getCanvasEl = () => canvasRef.value;
defineExpose({ clearAll, getCanvasEl });

// If the user disables annotate mode mid-stroke, finish the stroke so we don't
// orphan an incomplete segment on remotes.
watch(annotateMode, (on) => {
	if (!on && isDrawing) endStroke();
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null;
const unsubs: Array<() => void> = [];

onMounted(() => {
	setupCanvas();
	if (containerRef.value && typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(() => setupCanvas());
		resizeObserver.observe(containerRef.value);
	}
	unsubs.push(props.bus.onStroke(handleRemoteStroke));
	unsubs.push(props.bus.onClear(handleRemoteClear));
	unsubs.push(props.bus.onClearMine(handleRemoteClearMine));
	unsubs.push(props.bus.onUndo(handleRemoteUndo));
	unsubs.push(props.bus.onSyncRequest(handleSyncRequest));
	unsubs.push(props.bus.onSyncResponse(importStrokes));
});

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
	if (cursorRaf != null) cancelAnimationFrame(cursorRaf);
	for (const u of unsubs) u();
	if (isDrawing) flushBroadcast(true);
});
</script>

<template>
	<div ref="containerRef" class="absolute inset-0 pointer-events-none">
		<canvas
			ref="canvasRef"
			:class="[
				'absolute inset-0',
				annotateMode ? 'pointer-events-auto cursor-crosshair' : '',
			]"
			@pointerdown="onPointerDown"
			@pointermove="onPointerMove"
			@pointerup="onPointerUp"
			@pointercancel="onPointerCancel"
		/>

		<!-- Toolbar — top-center by default, bottom-center when sitting above the
		     Daily prebuilt bottom controls. Always pointer-events-auto so the
		     buttons stay clickable even while drawing is off. -->
		<div
			:class="[
				'absolute left-1/2 -translate-x-1/2 pointer-events-auto z-10',
				toolbarPosition === 'bottom' ? 'bottom-24' : 'top-3',
			]"
		>
			<div class="flex items-center gap-1.5 bg-background/95 backdrop-blur-sm border border-border rounded-full shadow-lg px-2 py-1.5">
				<button
					:class="[
						'inline-flex items-center gap-1 h-7 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors',
						annotateMode
							? 'bg-success text-white hover:bg-success/90'
							: 'bg-muted/40 text-muted-foreground hover:bg-muted/60',
					]"
					:title="annotateMode ? 'Annotation on — click to pass clicks back to the screen share / video' : 'Enable annotation (blocks clicks on the screen share / video while on)'"
					@click="annotateMode = !annotateMode"
				>
					<EIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
					{{ annotateMode ? 'Drawing' : 'Annotate' }}
				</button>

				<template v-if="annotateMode">
					<div class="w-px h-5 bg-border" />
					<!-- Tools -->
					<button
						v-for="t in TOOLS"
						:key="t.id"
						:class="[
							'inline-flex items-center justify-center w-7 h-7 rounded transition-colors',
							selectedTool === t.id
								? 'bg-foreground/10 text-foreground'
								: 'text-muted-foreground hover:bg-muted/40',
						]"
						:title="t.label"
						@click="selectedTool = t.id"
					>
						<EIcon :name="t.icon" class="w-3.5 h-3.5" />
					</button>
					<!-- Text tool (labelled glyph rather than an icon) -->
					<button
						:class="[
							'inline-flex items-center justify-center w-7 h-7 rounded text-[13px] font-bold transition-colors',
							selectedTool === 'text'
								? 'bg-foreground/10 text-foreground'
								: 'text-muted-foreground hover:bg-muted/40',
						]"
						title="Text"
						@click="selectedTool = 'text'"
					>
						T
					</button>

					<div class="w-px h-5 bg-border" />
					<!-- Color swatches -->
					<button
						v-for="c in COLORS"
						:key="c.value"
						:title="c.name"
						:class="[
							'w-5 h-5 rounded-full border-2 transition-transform',
							selectedColor === c.value
								? 'border-foreground scale-110'
								: 'border-transparent hover:scale-105',
						]"
						:style="{ background: c.value }"
						@click="selectedColor = c.value"
					/>

					<div class="w-px h-5 bg-border" />
					<!-- Brush sizes -->
					<button
						v-for="s in SIZES"
						:key="s.value"
						:class="[
							'w-6 h-6 inline-flex items-center justify-center rounded text-[10px] font-bold transition-colors',
							selectedSize === s.value
								? 'bg-foreground/10 text-foreground'
								: 'text-muted-foreground hover:bg-muted/40',
						]"
						:title="`Brush size ${s.label}`"
						@click="selectedSize = s.value"
					>
						{{ s.label }}
					</button>

					<div class="w-px h-5 bg-border" />
					<!-- Undo my last stroke -->
					<button
						class="inline-flex items-center justify-center w-7 h-7 rounded text-muted-foreground hover:bg-muted/40 transition-colors"
						title="Undo my last mark"
						@click="onUndo"
					>
						<EIcon name="i-heroicons-arrow-uturn-left" class="w-3.5 h-3.5" />
					</button>
					<!-- Clear mine -->
					<button
						class="inline-flex items-center gap-1 h-7 px-2 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-muted/40 transition-colors"
						title="Clear only my marks"
						@click="onClearMine"
					>
						Mine
					</button>
					<!-- Clear all -->
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
						title="Clear everyone's marks (broadcasts to all)"
						@click="onClearAll"
					>
						<EIcon name="i-heroicons-trash" class="w-3 h-3" />
						All
					</button>
				</template>
			</div>
		</div>
	</div>
</template>
