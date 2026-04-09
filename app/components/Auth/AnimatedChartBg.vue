<script setup>
/**
 * AnimatedChartBg — Client-only canvas component for auth pages.
 * Renders smooth scrolling chart lines behind the login card.
 */
const canvas = ref(null)

// Deterministic hash — returns 0 to 1 for any integer
const hash = (n) => {
	const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
	return x - Math.floor(x)
}

onMounted(() => {
	if (!canvas.value) return
	const ctx = canvas.value.getContext('2d')
	if (!ctx) return

	let animFrame
	let scrollPixels = 0
	let lastTime = 0
	let opacity = 0
	const startTime = Date.now()

	const pixelsPerPoint = 50
	const scrollSpeed = 0.25

	// Picton Blue palette
	// Back lines use hash-based micro-variation
	// Front line uses slow sine waves for broad sweeping rises and falls
	const lines = [
		{ color: 'rgba(0, 120, 161, 0.05)', fill: 'rgba(0, 120, 161, 0.015)', amp: 0.012, base: 0.58, seed: 4000, mode: 'hash' },
		{ color: 'rgba(0, 172, 231, 0.05)', fill: 'rgba(0, 172, 231, 0.015)', amp: 0.010, base: 0.63, seed: 3000, mode: 'hash' },
		{ color: 'rgba(133, 208, 255, 0.06)', fill: 'rgba(133, 208, 255, 0.02)', amp: 0.012, base: 0.70, seed: 2000, mode: 'hash' },
		{ color: 'rgba(0, 147, 198, 0.08)', fill: 'rgba(0, 147, 198, 0.03)', amp: 0.010, base: 0.76, seed: 1000, mode: 'hash' },
		{ color: 'rgba(0, 191, 255, 0.12)', fill: 'rgba(0, 191, 255, 0.045)', amp: 0.25, base: 0.85, seed: 0, mode: 'sweep' },
	]

	const resize = () => {
		const dpr = window.devicePixelRatio || 1
		canvas.value.width = window.innerWidth * dpr
		canvas.value.height = window.innerHeight * dpr
		canvas.value.style.width = '100%'
		canvas.value.style.height = '100%'
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
	}

	const draw = (now) => {
		const w = window.innerWidth
		const h = window.innerHeight
		const elapsed = (Date.now() - startTime) / 1000
		const ampScale = w < 640 ? 0.4 : w < 1024 ? 0.65 : 1

		// Smooth delta time
		const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0.016
		lastTime = now

		// Scroll all lines right-to-left
		scrollPixels += scrollSpeed * 30 * dt

		// Fade in over 2 seconds
		opacity = Math.min(elapsed / 2, 1)

		ctx.clearRect(0, 0, w, h)
		ctx.globalAlpha = opacity

		const scrollInPoints = scrollPixels / pixelsPerPoint
		const frac = scrollInPoints % 1
		const firstIndex = Math.floor(scrollInPoints)
		const numVisible = Math.ceil(w / pixelsPerPoint) + 4

		// Dashed vertical grid lines — scroll with data
		ctx.setLineDash([3, 5])
		ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)'
		ctx.lineWidth = 1
		for (let i = -1; i < numVisible; i++) {
			const x = w + (frac * pixelsPerPoint) - (i * pixelsPerPoint)
			ctx.beginPath()
			ctx.moveTo(x, 0)
			ctx.lineTo(x, h)
			ctx.stroke()
		}
		ctx.setLineDash([])

		for (const cfg of lines) {
			// Generate points
			const pts = []
			for (let i = -2; i < numVisible; i++) {
				const dataIdx = firstIndex + i
				const x = w + (frac * pixelsPerPoint) - (i * pixelsPerPoint)

				let yNorm
				if (cfg.mode === 'sweep') {
					// Broad sweeping curve — slow sine wave that rises from the base up
					// over many data points, crossing above the back lines, then falling back
					const phase = dataIdx * 0.04
					const rise = Math.sin(phase) * cfg.amp + Math.sin(phase * 0.37 + 1.7) * cfg.amp * 0.3
					// Tiny micro-variation so it's not perfectly smooth
					const micro = (hash(dataIdx + cfg.seed) - 0.5) * 0.008 * ampScale
					yNorm = cfg.base - rise + micro
				} else {
					// Hash-based subtle micro-variation for back lines
					const v1 = (hash(dataIdx + cfg.seed) - 0.5) * 2 * cfg.amp * ampScale
					const v2 = (hash(dataIdx * 3 + 7 + cfg.seed) - 0.5) * 2 * cfg.amp * ampScale * 0.3
					yNorm = cfg.base + v1 + v2
				}

				pts.push({ x, y: yNorm * h })
			}

			pts.sort((a, b) => a.x - b.x)
			if (pts.length < 2) continue

			// Smooth Catmull-Rom curve
			ctx.beginPath()
			ctx.moveTo(pts[0].x, pts[0].y)
			for (let i = 0; i < pts.length - 1; i++) {
				const p0 = pts[Math.max(i - 1, 0)]
				const p1 = pts[i]
				const p2 = pts[i + 1]
				const p3 = pts[Math.min(i + 2, pts.length - 1)]
				ctx.bezierCurveTo(
					p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
					p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
					p2.x, p2.y
				)
			}

			ctx.strokeStyle = cfg.color
			ctx.lineWidth = 1.5
			ctx.lineJoin = 'round'
			ctx.stroke()

			// Fill below
			ctx.lineTo(pts[pts.length - 1].x, h)
			ctx.lineTo(pts[0].x, h)
			ctx.closePath()
			ctx.fillStyle = cfg.fill
			ctx.fill()
		}

		ctx.globalAlpha = 1
		animFrame = requestAnimationFrame(draw)
	}

	resize()
	window.addEventListener('resize', resize)
	animFrame = requestAnimationFrame(draw)

	onUnmounted(() => {
		cancelAnimationFrame(animFrame)
		window.removeEventListener('resize', resize)
	})
})
</script>

<template>
	<canvas ref="canvas" class="absolute inset-0 w-full h-full pointer-events-none" />
</template>
