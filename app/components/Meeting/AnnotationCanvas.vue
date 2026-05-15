<script setup lang="ts">
interface StrokePoint { x: number; y: number; t: number; }
interface StrokeSegment {
	id: string;
	authorId: string;
	color: string;
	size: number;
	eraser?: boolean;
	points: StrokePoint[];
	complete: boolean;
}

interface AnnotationBus {
	sendStroke: (segment: StrokeSegment) => void;
	sendClear: () => void;
	onStroke: (cb: (segment: StrokeSegment) => void) => () => void;
	onClear: (cb: () => void) => () => void;
}

const props = withDefaults(
	defineProps<{
		bus: AnnotationBus;
		authorId: string;
		/** Where the toolbar floats. Use "bottom" when overlaying the Daily iframe,
		 *  whose own bottom bar is ~80px tall — the toolbar lifts above it. */
		toolbarPosition?: 'top' | 'bottom';
	}>(),
	{ toolbarPosition: 'top' },
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
const ERASER_SIZE_MULT = 6;
// 60ms throttle keeps each broadcast small (well under Daily's ~4KB limit) while
// still feeling smooth at typical drawing speeds (~16 broadcasts/s).
const BROADCAST_INTERVAL_MS = 60;
// Hard cap on points per broadcast as a safety net for very fast drawing.
const MAX_POINTS_PER_SEGMENT = 30;
// How long a remote cursor lingers after the last point before fading out.
const CURSOR_LIFETIME_MS = 1500;

const annotateMode = ref(false);
const selectedColor = ref(COLORS[0]!.value);
const selectedSize = ref(SIZES[1]!.value);
const eraser = ref(false);

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

const flushBroadcast = (complete: boolean) => {
	if (!currentStrokeId) return;
	const stroke = liveStrokes.get(currentStrokeId);
	if (!stroke) return;
	if (pendingPoints.length === 0 && !complete) return;
	const seg: StrokeSegment = {
		id: currentStrokeId,
		authorId: props.authorId,
		color: stroke.color,
		size: stroke.size,
		eraser: stroke.eraser,
		points: pendingPoints,
		complete,
	};
	props.bus.sendStroke(seg);
	pendingPoints = [];
	lastBroadcastAt = Date.now();
};

const onPointerDown = (ev: PointerEvent) => {
	if (!annotateMode.value) return;
	ev.preventDefault();
	isDrawing = true;
	currentStrokeId = newStrokeId();
	const p = ptFromEvent(ev);
	const stroke: StrokeSegment = {
		id: currentStrokeId,
		authorId: props.authorId,
		color: selectedColor.value,
		size: eraser.value ? selectedSize.value * ERASER_SIZE_MULT : selectedSize.value,
		eraser: eraser.value,
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
	stroke.points.push(p);
	pendingPoints.push(p);
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

	const existing = liveStrokes.get(seg.id) || settledStrokes.get(seg.id);
	if (existing) {
		existing.points.push(...seg.points);
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

	if (!seg.complete && seg.points.length > 0) {
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

// ─── Toolbar actions ────────────────────────────────────────────────────────
const onClear = () => {
	liveStrokes.clear();
	settledStrokes.clear();
	redraw();
	props.bus.sendClear();
};

// Exposed for parent: clear local view without broadcasting (e.g. on figma frame change).
const clearAll = () => {
	liveStrokes.clear();
	settledStrokes.clear();
	redraw();
};
defineExpose({ clearAll });

// If the user disables annotate mode mid-stroke, finish the stroke so we don't
// orphan an incomplete segment on remotes.
watch(annotateMode, (on) => {
	if (!on && isDrawing) endStroke();
});

// ─── Lifecycle ──────────────────────────────────────────────────────────────
let resizeObserver: ResizeObserver | null = null;
let unsubStroke: (() => void) | null = null;
let unsubClear: (() => void) | null = null;

onMounted(() => {
	setupCanvas();
	if (containerRef.value && typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(() => setupCanvas());
		resizeObserver.observe(containerRef.value);
	}
	unsubStroke = props.bus.onStroke(handleRemoteStroke);
	unsubClear = props.bus.onClear(handleRemoteClear);
});

onBeforeUnmount(() => {
	resizeObserver?.disconnect();
	if (cursorRaf != null) cancelAnimationFrame(cursorRaf);
	unsubStroke?.();
	unsubClear?.();
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
					:title="annotateMode ? 'Annotation on — click to pass clicks back to Figma' : 'Enable annotation (blocks Figma clicks while on)'"
					@click="annotateMode = !annotateMode"
				>
					<UIcon name="i-heroicons-pencil-square" class="w-3 h-3" />
					{{ annotateMode ? 'Drawing' : 'Annotate' }}
				</button>

				<template v-if="annotateMode">
					<div class="w-px h-5 bg-border" />
					<!-- Color swatches -->
					<button
						v-for="c in COLORS"
						:key="c.value"
						:title="c.name"
						:class="[
							'w-5 h-5 rounded-full border-2 transition-transform',
							selectedColor === c.value && !eraser
								? 'border-foreground scale-110'
								: 'border-transparent hover:scale-105',
						]"
						:style="{ background: c.value }"
						@click="selectedColor = c.value; eraser = false"
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
					<!-- Eraser -->
					<button
						:class="[
							'inline-flex items-center justify-center w-7 h-7 rounded transition-colors',
							eraser
								? 'bg-foreground/10 text-foreground'
								: 'text-muted-foreground hover:bg-muted/40',
						]"
						title="Eraser"
						@click="eraser = !eraser"
					>
						<UIcon name="i-heroicons-backspace" class="w-3.5 h-3.5" />
					</button>
					<!-- Clear -->
					<button
						class="inline-flex items-center gap-1 h-7 px-2.5 rounded text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
						title="Clear all annotations (broadcasts to everyone)"
						@click="onClear"
					>
						<UIcon name="i-heroicons-trash" class="w-3 h-3" />
						Clear
					</button>
				</template>
			</div>
		</div>
	</div>
</template>
