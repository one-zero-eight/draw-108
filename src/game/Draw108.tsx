import { useEffect, useMemo, useRef, useState } from 'react'
import { svgPathProperties } from 'svg-path-properties'
import logoSvgRaw from '../../logo-108-anim.svg?raw'
import congratulationsSound from '../sounds/congratulations.mp3'
import failSound from '../sounds/fail.mp3'
import nyanSound from '../sounds/nyan.mp3'
import successSound from '../sounds/success.mp3'

type Point = { x: number, y: number, t: number }
type Segment = { from: Point, to: Point, width: number, color: string, dist: number }

function clamp(n: number, min: number, max: number) { return Math.max(min, Math.min(max, n)) }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t }

function playSound(audio: HTMLAudioElement) {
  audio.currentTime = 0
  audio.play().catch(e => console.error('Error playing sound:', e))
}

function hsl(h: number, s: number, l: number) { return `hsl(${h} ${s}% ${l}%)` }

// Fire animation particles
type FireParticle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  life: number
  maxLife: number
  hue: number
}

function createFireParticle(w: number, h: number): FireParticle {
  const x = Math.random() * w
  const y = h + Math.random() * 50
  const vx = (Math.random() - 0.5) * 2
  const vy = -(Math.random() * 4 + 2)
  const size = Math.random() * 20 + 10
  const life = Math.random() * 50 + 50
  const hue = Math.random() * 30 + 0 // 0-30 for orange/red
  return { x, y, vx, vy, size, life, maxLife: life, hue }
}

let fireParticles: FireParticle[] = []

function drawFire(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (fireParticles.length < 100) {
    for (let i = 0; i < 5; i++) {
      fireParticles.push(createFireParticle(w, h))
    }
  }

  ctx.globalCompositeOperation = 'lighter'
  for (let i = fireParticles.length - 1; i >= 0; i--) {
    const p = fireParticles[i]
    p.life -= 1
    if (p.life <= 0) {
      fireParticles.splice(i, 1)
      continue
    }
    p.x += p.vx
    p.y += p.vy
    const alpha = p.life / p.maxLife * 0.8
    const size = p.size * (p.life / p.maxLife)
    const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size)
    grd.addColorStop(0, `hsla(${p.hue}, 100%, 50%, ${alpha})`)
    grd.addColorStop(1, `hsla(${p.hue}, 100%, 50%, 0)`)
    ctx.fillStyle = grd
    ctx.beginPath()
    ctx.arc(p.x, p.y, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
}

// Confetti animation particles
type ConfettiParticle = {
  x: number
  y: number
  vx: number
  vy: number
  size: number
  color: string
  life: number
  maxLife: number
  rotation: number
  rotationSpeed: number
}

function createConfettiParticle(w: number, h: number): ConfettiParticle {
  const x = Math.random() * w
  const y = -Math.random() * h * 0.5 // Start above the screen
  const vx = (Math.random() - 0.5) * 8
  const vy = Math.random() * 5 + 2 // Fall down
  const size = Math.random() * 10 + 5
  const life = Math.random() * 100 + 100
  const hue = Math.random() * 360
  const color = `hsl(${hue}, 90%, 65%)`
  const rotation = Math.random() * 360
  const rotationSpeed = (Math.random() - 0.5) * 10
  return { x, y, vx, vy, size, color, life, maxLife: life, rotation, rotationSpeed }
}

let confettiParticles: ConfettiParticle[] = []

function drawConfetti(ctx: CanvasRenderingContext2D, w: number, h: number) {
  if (confettiParticles.length < 200) { // Add particles over time
    for (let i = 0; i < 5; i++) {
      confettiParticles.push(createConfettiParticle(w, h))
    }
  }

  for (let i = confettiParticles.length - 1; i >= 0; i--) {
    const p = confettiParticles[i]
    p.life -= 1
    if (p.life <= 0) {
      confettiParticles.splice(i, 1)
      continue
    }
    p.x += p.vx
    p.y += p.vy
    p.vy += 0.1 // gravity
    p.rotation += p.rotationSpeed

    const alpha = p.life / p.maxLife
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.rotation * Math.PI / 180)
    ctx.fillStyle = p.color
    ctx.globalAlpha = alpha
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
    ctx.restore()
  }
}

export default function Draw108() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [started, setStarted] = useState(false)
  const [finished, setFinished] = useState(false)
  const startedRef = useRef(false)
  const finishedRef = useRef(false)
  const hitStartRef = useRef(false)
  const hitEndRef = useRef(false)
  const segmentsRef = useRef<Segment[]>([])
  const accuracyRef = useRef(0)
  const bestRef = useRef(0)
  const newBestRef = useRef(false)
  const newBestAtRef = useRef(0)
  const triesRef = useRef(0)
  const congratsPlayedRef = useRef(false)
  const confettiStartedAtRef = useRef(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [viewport, setViewport] = useState({ w: 0, h: 0 })
  const captureCanvasCallback = useRef<((blob: Blob | null) => void) | null>(null)
  // Fixed hint points derived from the original logo path

  const sounds = useMemo(() => {
    const success = new Audio(successSound)
    success.volume = 0.5
    const fail = new Audio(failSound)
    fail.volume = 0.5
    const congratulations = new Audio(congratulationsSound)
    const nyan = new Audio(nyanSound)
    nyan.volume = 0.5
    return { success, fail, nyan, congratulations }
  }, [])

  const { pathD, vb } = useMemo(() => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(logoSvgRaw, 'image/svg+xml')
    const svg = doc.querySelector('svg')
    const path = doc.querySelector('path')
    const viewBox = (svg?.getAttribute('viewBox') || '0 0 1024 605').split(/\s+/).map(Number)
    return { pathD: path?.getAttribute('d') || '', vb: viewBox as [number, number, number, number] }
  }, [])

  const pathProps = useMemo(() => new svgPathProperties(pathD), [pathD])

  const logoEndpoints = useMemo(() => {
    const total = pathProps.getTotalLength()
    const s = pathProps.getPointAtLength(0)
    const e = pathProps.getPointAtLength(total)
    let start = { x: s.x, y: s.y }
    let end = { x: e.x, y: e.y }
    if (isFlipped) {
      const [, minY, , vbH] = vb
      const centerY = minY + vbH / 2
      start = { x: start.x, y: 2 * centerY - start.y }
      end = { x: end.x, y: 2 * centerY - end.y }
    }
    return { start, end }
  }, [pathProps, isFlipped, vb])

  const preSample = useMemo(() => {
    const total = pathProps.getTotalLength()
    const samples = Math.max(800, Math.min(3000, Math.floor(total / 2)))
    const out: { x: number, y: number }[] = []
    for (let i = 0; i <= samples; i++) {
      const p = pathProps.getPointAtLength((i / samples) * total)
      out.push({ x: p.x, y: p.y })
    }
    if (isFlipped) {
      const [, minY, , vbH] = vb
      const centerY = minY + vbH / 2
      return out.map(p => ({ x: p.x, y: 2 * centerY - p.y }))
    }
    return out
  }, [pathProps, isFlipped, vb])

  const transform = useMemo(() => {
    function compute(width: number, height: number) {
      const [minX, minY, vbW, vbH] = vb
      const margin = 0.08
      const horizontalPadPx = 24
      const availableWidth = Math.max(0, width - horizontalPadPx * 2)
      const scale = Math.min(availableWidth / vbW, height / vbH) * (1 - margin)
      const drawW = vbW * scale
      const drawH = vbH * scale
      const offsetX = (width - drawW) / 2 - minX * scale
      const offsetY = (height - drawH) / 2 - minY * scale
      return { scale, offsetX, offsetY }
    }
    return { compute }
  }, [vb])

  const overlayRect = useMemo(() => {
    const { scale, offsetX, offsetY } = transform.compute(viewport.w, viewport.h)
    const [, , vbW, vbH] = vb
    const drawW = vbW * scale
    const drawH = vbH * scale
    return { left: offsetX, top: offsetY, width: drawW, height: drawH }
  }, [transform, viewport, vb])

  const logoSvgForOverlay = useMemo(() => {
    return logoSvgRaw.replace('<svg ', '<svg style="width:100%;height:100%" ')
  }, [logoSvgRaw])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('draw108_best')
      const val = raw == null ? 0 : Number(raw)
      bestRef.current = Number.isFinite(val) ? val : 0
      const rawTries = localStorage.getItem('draw108_tries')
      const valTries = rawTries == null ? 0 : Number(rawTries)
      triesRef.current = Number.isFinite(valTries) ? valTries : 0
      congratsPlayedRef.current = !!JSON.parse(localStorage.getItem('draw108_congratsPlayed') || 'false')
      setIsFlipped(triesRef.current >= 100 && triesRef.current < 103)
    } catch {}
  }, [])

  function getShareText(score: number): string {
    const scoreStr = score.toFixed(1)
    const messages = [
      { min: 95, msg: `\nPerfection! My new record is **${scoreStr}%** in __Draw 108 by @one_zero_eight__. Can anyone beat this? 🏆` },
      { min: 90, msg: `\nI'm a master at __Draw 108 by @one_zero_eight__! Just scored **${scoreStr}%**. See if you can top that! 😎` },
      { min: 75, msg: `\nGetting good at this! My score: **${scoreStr}%** in __Draw 108 by @one_zero_eight__. ✨` },
      { min: 50, msg: `\nJust played __Draw 108 by @one_zero_eight__ and got **${scoreStr}%**. It's addictive! 👍` },
      { min: 0, msg: `\nMy attempt at __Draw 108 by @one_zero_eight__... **${scoreStr}%**. I'll get better! 🥴` },
    ]
    const found = messages.find(m => score >= m.min)
    return found ? found.msg : messages[messages.length - 1].msg
  }

  const handleShare = () => {
    if (!canvasRef.current) return

    captureCanvasCallback.current = async (blob) => {
      if (!blob) return

      const file = new File([blob], 'drawing.png', { type: 'image/png' })
      const score = accuracyRef.current
      const url = import.meta.env.VITE_GAME_URL
      const text = getShareText(score)

      const canShareFiles = navigator.canShare && navigator.canShare({ files: [file] })

      if (navigator.share && canShareFiles) {
        try {
          await navigator.share({
            title: 'My Draw 108 Score!',
            text: text,
            files: [file],
            url: url,
          })
        } catch (error) {
          console.error('Error sharing file:', error)
          // Fallback for when sharing the file fails (e.g., user cancels).
          // For simplicity, we can just log it, as the user has explicitly exited the share dialog.
        }
      } else {
        // Fallback for browsers that don't support sharing files.
        console.log('Web Share API support status:', {
          share: 'share' in navigator,
          canShare: 'canShare' in navigator,
          canShareFiles: canShareFiles ?? 'not checked',
          secureContext: window.isSecureContext,
        })
        alert('Image sharing is not supported in this browser. A link to the game will be shared instead.')
        const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`
        window.open(telegramUrl, '_blank')
      }
    }
  }

  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return
    const ctx = canvasEl.getContext('2d')!

    function setSize() {
      const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1))
      canvasEl!.width = Math.floor(window.innerWidth * dpr)
      canvasEl!.height = Math.floor(window.innerHeight * dpr)
      canvasEl!.style.width = `${window.innerWidth}px`
      canvasEl!.style.height = `${window.innerHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      setViewport({ w: window.innerWidth, h: window.innerHeight })
    }
    setSize()
    window.addEventListener('resize', setSize)

    let raf = 0
    function draw() {
      const w = canvasEl!.clientWidth
      const h = canvasEl!.clientHeight
      ctx.clearRect(0, 0, w, h)

      const now = performance.now()
      const showConfetti = confettiStartedAtRef.current > 0 && (now - confettiStartedAtRef.current < 15000)

      const { scale, offsetX, offsetY } = transform.compute(w, h)

      const is666 = finished && accuracyRef.current.toFixed(1) === '66.6'

      if (is666) {
        drawFire(ctx, w, h)
      } else {
        fireParticles = [] // Reset when not showing
        const grd = ctx.createLinearGradient(0, 0, 0, h)
        grd.addColorStop(0, '#0f0f14')
        grd.addColorStop(1, '#141820')
        ctx.fillStyle = grd
        ctx.fillRect(0, 0, w, h)
      }

      if (showConfetti) {
        drawConfetti(ctx, w, h)
      }

      // Drawing area border
      const [minX, minY, vbW, vbH] = vb
      const drawW = vbW * scale
      const drawH = vbH * scale
      ctx.save()
      ctx.lineWidth = 2
      ctx.setLineDash([16, 8])
      ctx.strokeStyle = 'rgba(128,128,128,0.4)'
      ctx.strokeRect(Math.floor(offsetX) + 0.5, Math.floor(offsetY) + 0.5, Math.floor(drawW), Math.floor(drawH))
      ctx.restore()

      if (!started) {
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.6)'
        ctx.font = '600 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
        ctx.textAlign = 'center'
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 6
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 2
        ctx.fillText('Tap or click to start drawing the 108', w / 2, h - 32)
        ctx.restore()
      }

      // Hint start/end points under drawing
      {
        const [minX, minY] = vb
        const sx = offsetX + (logoEndpoints.start.x - minX) * scale
        const sy = offsetY + (logoEndpoints.start.y - minY) * scale
        const ex = offsetX + (logoEndpoints.end.x - minX) * scale
        const ey = offsetY + (logoEndpoints.end.y - minY) * scale
        ctx.beginPath()
        ctx.arc(sx, sy, 16, 0, Math.PI * 2)
        ctx.fillStyle = '#9ca3af'
        ctx.fill()
        ctx.beginPath()
        ctx.arc(ex, ey, 18, 0, Math.PI * 2)
        ctx.lineWidth = 4
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'
        ctx.stroke()
      }

      // Draw user path
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const segs = segmentsRef.current
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i]
        ctx.beginPath()
        ctx.moveTo(s.from.x, s.from.y)
        ctx.lineTo(s.to.x, s.to.y)
        ctx.strokeStyle = s.color
        ctx.lineWidth = s.width
        ctx.stroke()
      }
      // Accuracy overlay while drawing
      if (started && !finished) {
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.font = '700 20px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
        ctx.textAlign = 'left'
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 10
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 2
        ctx.fillText(`${accuracyRef.current.toFixed(1)}%`, 16, 32)
        ctx.restore()
      }

      // Finished overlay
      if (finished) {
        const hasEndpoints = hitStartRef.current && hitEndRef.current
        const pct = hasEndpoints ? `${accuracyRef.current.toFixed(1)}%` : 'XX.X%'
        ctx.textAlign = 'center'
        const now = performance.now()
        const isNewBest = newBestRef.current
        const elapsed = now - newBestAtRef.current
        const isBlinkingTime = isNewBest && elapsed < 2000
        const blinkOn = Math.floor(now / 500) % 2 === 0
        const isCapturing = !!captureCanvasCallback.current
        ctx.save()
        ctx.font = '800 64px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
        ctx.fillStyle = hasEndpoints ? 'rgba(255,255,255,0.95)' : '#ef4444'
        if (hasEndpoints && isNewBest) {
          ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'
          ctx.shadowBlur = 40
        } else {
          ctx.shadowColor = 'rgba(0,0,0,0.85)'
          ctx.shadowBlur = 10
        }
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 3
        ctx.fillText(pct, w / 2, isCapturing ? 160 : h / 2)
        ctx.restore()
        ctx.save()
        ctx.fillStyle = 'rgba(255,255,255,0.7)'
        ctx.font = '600 18px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
        ctx.shadowColor = 'rgba(0,0,0,0.8)'
        ctx.shadowBlur = 10
        ctx.shadowOffsetX = 0
        ctx.shadowOffsetY = 2

        if (!isCapturing) {
          ctx.fillText('Tap to try again', w / 2, h / 2 + 40)
        }
        ctx.restore()
        if (!hasEndpoints) {
          ctx.save()
          ctx.fillStyle = '#ef4444'
          ctx.font = '700 20px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
          ctx.shadowColor = 'rgba(0,0,0,0.85)'
          ctx.shadowBlur = 8
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 2
          if (!isCapturing) {
            ctx.fillText('Draw a full 108', w / 2, h / 2 + 70)
          }
          ctx.restore()
        } else if (isNewBest) {
          ctx.save()
          if (isBlinkingTime) {
            ctx.globalAlpha = blinkOn ? 1 : 0
          }
          ctx.fillStyle = '#ffffff'
          ctx.font = '800 22px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
          ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'
          ctx.shadowBlur = 40
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 2
          if (!isCapturing) {
            ctx.fillText('New best score', w / 2, h / 2 + 70)
          }
          ctx.restore()
        }

        if (hasEndpoints) {
          const score = accuracyRef.current
          let message = ''
          if (score.toFixed(1) === '66.6') {
            message = '😈😈😈'
          } else if (score < 50) {
            message = 'Um... nope. 🥴'
          } else if (score < 65) {
            message = 'Not bad! 👍'
          } else if (score < 75) {
            message = 'Good! ✨'
          } else if (score < 90) {
            message = 'Great! 😎'
          } else {
            message = 'Perfect! 🏆'
          }

          if (message) {
            ctx.save()
            ctx.fillStyle = 'rgba(255,255,255,0.8)'
            ctx.font = '600 24px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
            ctx.textAlign = 'center'
            ctx.shadowColor = 'rgba(0,0,0,0.8)'
            ctx.shadowBlur = 10
            ctx.shadowOffsetX = 0
            ctx.shadowOffsetY = 2
            ctx.fillText(message, w / 2, h - 40)
            ctx.restore()
          }
        }
      }

      // Best overlay (always show)
      {
        const isCapturing = !!captureCanvasCallback.current
        if (!isCapturing) {
          ctx.save()
          ctx.fillStyle = 'rgba(255,255,255,0.9)'
          ctx.font = '700 16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell'
          ctx.textAlign = 'right'
          ctx.shadowColor = 'rgba(0,0,0,0.8)'
          ctx.shadowBlur = 6
          ctx.shadowOffsetX = 0
          ctx.shadowOffsetY = 2
          ctx.fillText(`Best ${bestRef.current.toFixed(1)}%`, w - 16, 32)
          ctx.restore()
        }
      }

      if (captureCanvasCallback.current) {
        const cb = captureCanvasCallback.current
        captureCanvasCallback.current = null
        canvasEl.toBlob(cb, 'image/png')
      }

      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', setSize) }
  }, [pathD, started, finished, transform])

  useEffect(() => {
    const canvasEl = canvasRef.current
    if (!canvasEl) return

    let lastPoint: Point | null = null
    let drawing = false
    let goodSum = 0
    let total = 0
    let strokeHasMovement = false

    function pixelRadiusToSvgUnits(pxRadius: number) {
      const w = canvasEl!.clientWidth
      const h = canvasEl!.clientHeight
      const { scale } = transform.compute(w, h)
      return pxRadius / scale
    }

    function maybeMarkEndpoints(px: number, py: number) {
      const { x, y } = canvasToSvg(px, py)
      const thresholdSvg = pixelRadiusToSvgUnits(28)
      const dsx = x - logoEndpoints.start.x
      const dsy = y - logoEndpoints.start.y
      const dex = x - logoEndpoints.end.x
      const dey = y - logoEndpoints.end.y
      if ((dsx * dsx + dsy * dsy) <= thresholdSvg * thresholdSvg) hitStartRef.current = true
      if ((dex * dex + dey * dey) <= thresholdSvg * thresholdSvg) hitEndRef.current = true
    }

    function canvasToSvg(px: number, py: number) {
      const w = canvasEl!.clientWidth
      const h = canvasEl!.clientHeight
      const { scale, offsetX, offsetY } = transform.compute(w, h)
      const [minX, minY] = vb
      const x = (px - offsetX) / scale + minX
      const y = (py - offsetY) / scale + minY
      return { x, y }
    }

    function nearestOnPathSvg(x: number, y: number) {
      // brute-force to preSample, track both distance and index
      let best = Infinity
      let bestIdx = 0
      for (let i = 0; i < preSample.length; i++) {
        const p = preSample[i]
        const dx = p.x - x
        const dy = p.y - y
        const d = dx * dx + dy * dy
        if (d < best) {
          best = d
          bestIdx = i
        }
      }
      return { dist: Math.sqrt(best), idx: bestIdx }
    }

    function distanceToColor(distSvg: number) {
      const good = 20
      const bad = 70
      const t = clamp((distSvg - good) / (bad - good), 0, 1)
      const hue = lerp(120, 0, t)
      const sat = lerp(80, 85, t)
      const light = lerp(55, 50, t)
      return hsl(hue, sat, light)
    }

    // Coverage tracking across the logo path (preSample space)
    const coverageBinCount = 200
    const coverageVisited: boolean[] = new Array(coverageBinCount).fill(false)
    let coverageVisitedCount = 0
    const samplesPerBin = Math.max(1, Math.floor(preSample.length / coverageBinCount))
    const coverageThresholdSvg = 45

    function onPointerDown(e: PointerEvent) {
      e.preventDefault()
      canvasEl!.setPointerCapture(e.pointerId)
      // Restart if finished
      if (finishedRef.current) {
        triesRef.current += 1
        setIsFlipped(triesRef.current >= 100 && triesRef.current < 103)
        try { localStorage.setItem('draw108_tries', String(triesRef.current)) } catch {}
        segmentsRef.current = []
        accuracyRef.current = 0
        goodSum = 0
        total = 0
        finishedRef.current = false
        setFinished(false)
        startedRef.current = false
        setStarted(false)
        hitStartRef.current = false
        hitEndRef.current = false
        newBestRef.current = false
        confettiStartedAtRef.current = 0
        confettiParticles = []
        for (let i = 0; i < coverageVisited.length; i++) coverageVisited[i] = false
        coverageVisitedCount = 0
        return
      }
      if (!startedRef.current) {
        startedRef.current = true
        setStarted(true)
        hitStartRef.current = false
        hitEndRef.current = false
      }
      drawing = true
      const rect = canvasEl!.getBoundingClientRect()
      const p: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() }
      lastPoint = p
      strokeHasMovement = false
      maybeMarkEndpoints(p.x, p.y)
    }
    function onPointerMove(e: PointerEvent) {
      e.preventDefault()
      if (!drawing || !lastPoint) return
      const rect = canvasEl!.getBoundingClientRect()
      const now = performance.now()
      const curr: Point = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: now }
      const dt = Math.max(1, curr.t - lastPoint.t)
      const dx = curr.x - lastPoint.x
      const dy = curr.y - lastPoint.y
      const distPx = Math.hypot(dx, dy)
      if (distPx > 0.5) strokeHasMovement = true
      const dwell = dt / (distPx + 0.5)
      const width = clamp(lerp(4, 18, clamp(dwell * 0.25, 0, 1)), 3, 26)

      const svgP = canvasToSvg(curr.x, curr.y)
      const { dist: dSvg, idx: nearestIdx } = nearestOnPathSvg(svgP.x, svgP.y)
      const color = distanceToColor(dSvg)

      total += 1
      const good = 70
      const score = clamp(1 - dSvg / good, 0, 1)
      goodSum += score

      // mark coverage if near enough
      if (dSvg <= coverageThresholdSvg) {
        const bin = Math.min(coverageBinCount - 1, Math.floor(nearestIdx / samplesPerBin))
        if (!coverageVisited[bin]) {
          coverageVisited[bin] = true
          coverageVisitedCount += 1
        }
      }

      const closeness = total > 0 ? goodSum / total : 0
      const coverageRatio = coverageVisitedCount / coverageBinCount
      const coverageWeight = 0.35
      const blended = (1 - coverageWeight) * closeness + coverageWeight * coverageRatio
      accuracyRef.current = clamp(blended, 0, 1) * 100

      const newSeg = { from: lastPoint!, to: curr, width, color, dist: dSvg }
      segmentsRef.current.push(newSeg)
      lastPoint = curr
      maybeMarkEndpoints(curr.x, curr.y)
    }
    function onPointerUp() {
      drawing = false
      lastPoint = null
      if (startedRef.current && strokeHasMovement) {
        finishedRef.current = true
        setFinished(true)
        const hasEndpoints = hitStartRef.current && hitEndRef.current
        if (hasEndpoints) {
          const score = accuracyRef.current
          const isNewBest = score > bestRef.current

          if (score > 70 && !congratsPlayedRef.current) {
            congratsPlayedRef.current = true
            try { localStorage.setItem('draw108_congratsPlayed', 'true') } catch {}
            playSound(sounds.congratulations)
            sounds.congratulations.onended = () => {
              playSound(sounds.nyan)
            }
            confettiStartedAtRef.current = performance.now()
          } else if (isNewBest) {
            playSound(sounds.success)
          }

          if (isNewBest) {
            bestRef.current = score
            try { localStorage.setItem('draw108_best', String(score)) } catch {}
            newBestRef.current = true
            newBestAtRef.current = performance.now()
          }
        } else {
          playSound(sounds.fail)
        }
      }
    }
    function onPointerCancel() {
      drawing = false
      lastPoint = null
    }

    canvasEl.addEventListener('pointerdown', onPointerDown, { passive: false })
    canvasEl.addEventListener('pointermove', onPointerMove, { passive: false })
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    return () => {
      canvasEl.removeEventListener('pointerdown', onPointerDown)
      canvasEl.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
    }
  }, [preSample, transform, vb])

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', transform: isFlipped ? 'scaleY(-1)' : 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100vw', height: '100vh', touchAction: 'none', cursor: 'crosshair' }} />
      {!started && (
        <div
          style={{
            position: 'absolute',
            left: overlayRect.left,
            top: overlayRect.top,
            width: overlayRect.width,
            height: overlayRect.height,
            opacity: 0.08,
            filter: 'invert(1) brightness(2)',
            pointerEvents: 'none'
          }}
          dangerouslySetInnerHTML={{ __html: logoSvgForOverlay }}
        />
      )}
      {finished && (
        <button
          onClick={handleShare}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, 110px)',
            padding: '12px 24px',
            fontSize: '18px',
            fontWeight: 600,
            cursor: 'pointer',
            backgroundColor: '#0088cc',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 10,
            textTransform: 'uppercase',
          }}
        >
          Share
        </button>
      )}
    </div>
  )
}


