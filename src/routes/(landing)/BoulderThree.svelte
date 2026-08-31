<script lang="ts">
  import { onMount } from 'svelte'
  import { MediaQuery } from 'svelte/reactivity'
  import type { Vector3 } from 'three'

  let stageEl: HTMLDivElement
  let wrapEl: HTMLDivElement
  let showFallback = $state(true)

  const still = new MediaQuery('(prefers-reduced-motion: reduce)')

  const ROUTES: Array<{ color: number; theta: number }> = [
    { color: 0xe8893f, theta: 1.25 }, // grade-4 orange
    { color: 0x4fc3d4, theta: 1.75 }, // grade-2 cyan
    { color: 0xe0533b, theta: 2.25 }, // grade-5 red
  ]

  function boot(
    THREE: typeof import('three'),
    Simplex: typeof import('three/examples/jsm/math/SimplexNoise.js').SimplexNoise,
    wrap: HTMLDivElement,
    stage: HTMLDivElement,
    reduced: boolean,
  ): (() => void) | undefined {
    const w = wrap.clientWidth
    const h = wrap.clientHeight
    if (!w || !h) return undefined

    let renderer: import('three').WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    } catch {
      return undefined
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(w, h)
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;'
    wrap.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50)
    camera.position.set(0, 0.55, 5.0)
    camera.lookAt(0, -0.05, 0)

    const simplex = new Simplex()
    const fbm = (x: number, y: number, z: number) => {
      let f = 0
      let amp = 0.5
      let freq = 1
      // Five octaves, not three. The first three shape the silhouette; the last two land far
      // below the old vertex spacing and only became visible once the mesh was subdivided.
      for (let o = 0; o < 5; o++) {
        f += amp * simplex.noise3d(x * freq, y * freq, z * freq)
        amp *= 0.5
        freq *= 2.1
      }
      return f
    }
    // Planar shear cuts give flat granite faces; flatten the base where it sits.
    const cut = (out: Vector3, n: Vector3, d: number) => {
      const dist = out.dot(n)
      if (dist > d) out.addScaledVector(n, d - dist)
    }
    const cutA = new THREE.Vector3(0.6, 0.5, 0.6).normalize()
    const cutB = new THREE.Vector3(-0.7, 0.1, 0.45).normalize()
    const shape = (dir: Vector3): Vector3 => {
      const r = 1.3 * (1 + 0.22 * fbm(dir.x * 1.4, dir.y * 1.4, dir.z * 1.4))
      const out = dir.clone().normalize().multiplyScalar(r)
      cut(out, cutA, 1.18)
      cut(out, cutB, 1.05)
      if (out.y < -1.0) out.y = -1.0
      return out
    }

    // Detail 4 (5,120 triangles), not 2 (320). Flat shading is right for granite, which is
    // crystalline, but at 320 facets it reads as polygon art. The cost is a one-off generate
    // plus 75 raycasts for the route lines; nothing per frame.
    let geo: import('three').BufferGeometry = new THREE.IcosahedronGeometry(1.3, 4)
    geo = geo.toNonIndexed()
    const pos = geo.attributes.position as import('three').BufferAttribute
    const tmp = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i)
      const d = shape(tmp)
      pos.setXYZ(i, d.x, d.y, d.z)
    }
    // Normals first: the colour of a facet depends on which way it faces.
    geo.computeVertexNormals()
    const nrm = geo.attributes.normal as import('three').BufferAttribute

    // Per-facet shading, three terms multiplied. Speckle alone (the old version) reads as noise
    // on a smooth solid; what makes a surface look like rock is that crevices are darker than
    // ridges and downward faces are darker than upward ones.
    const colors = new Float32Array(pos.count * 3)
    const base = new THREE.Color(0x6f6e66)
    const a = new THREE.Vector3()
    for (let i = 0; i < pos.count; i += 3) {
      // sky occlusion: an upward facet catches the hemisphere, a downward one does not
      const sky = 0.74 + 0.26 * (nrm.getY(i) * 0.5 + 0.5)
      // cavity: mean radius of the facet against the base radius, so hollows darken
      let rSum = 0
      for (let k = 0; k < 3; k++) {
        a.fromBufferAttribute(pos, i + k)
        rSum += a.length()
      }
      const cavity = Math.min(1.1, Math.max(0.82, 0.72 + (rSum / 3 / 1.3) * 0.3))
      const speckle = 0.9 + Math.random() * 0.2
      const s = sky * cavity * speckle
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = base.r * s
        colors[(i + k) * 3 + 1] = base.g * s
        colors[(i + k) * 3 + 2] = base.b * s
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const boulder = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        flatShading: true,
        metalness: 0.02,
        roughness: 0.95,
        vertexColors: true,
      }),
    )
    const group = new THREE.Group()
    group.add(boulder)

    // ---- routes pinned to the real surface (front face) ----
    const ray = new THREE.Raycaster()
    const surfacePoint = (dir: Vector3): Vector3 => {
      ray.set(dir.clone().multiplyScalar(5), dir.clone().negate().normalize())
      const hit = ray.intersectObject(boulder, false)[0]
      if (hit) return hit.point.clone().multiplyScalar(1.012)
      return shape(dir).multiplyScalar(1.012)
    }
    for (const { color, theta: theta0 } of ROUTES) {
      const pts: Vector3[] = []
      for (let i = 0; i <= 24; i++) {
        const t = i / 24
        const phi = 2.25 - 1.55 * t
        const theta = theta0 + Math.sin(t * 2.8) * 0.26
        const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
        pts.push(surfacePoint(dir))
      }
      const mat = new THREE.MeshBasicMaterial({ color })
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 56, 0.022, 7, false)
      group.add(new THREE.Mesh(tube, mat))
      // hold markers along the line + top anchor
      for (let i = 4; i < pts.length; i += 7) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 10), mat)
        dot.position.copy(pts[i])
        group.add(dot)
      }
      const anchor = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 12), mat)
      anchor.position.copy(pts[pts.length - 1])
      group.add(anchor)
    }

    group.rotation.y = -0.05
    group.position.y = 0.1
    scene.add(group)

    // ---- lighting: warm sun + cool sky, neutral ----
    scene.add(new THREE.AmbientLight(0x5a5e66, 0.55))
    scene.add(new THREE.HemisphereLight(0xbcd3ff, 0x2a2620, 0.9))
    const key = new THREE.DirectionalLight(0xffe9c8, 2.6)
    key.position.set(3, 4.5, 3)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x9fb8d8, 1.1)
    rim.position.set(-3.5, 1.5, -2.5)
    scene.add(rim)
    const fill = new THREE.DirectionalLight(0xd8d2c4, 0.85)
    fill.position.set(-0.5, 0.6, 4)
    scene.add(fill)

    let targetRX = 0
    let targetRY = 0
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect()
      targetRY = ((e.clientX - r.left) / r.width - 0.5) * 0.5
      targetRX = ((e.clientY - r.top) / r.height - 0.5) * 0.25
    }
    // Without this the tilt sticks after the pointer leaves and the sway keeps rocking around an
    // offset centre for the rest of the visit.
    const onLeave = () => {
      targetRX = 0
      targetRY = 0
    }
    stage.addEventListener('pointermove', onMove)
    stage.addEventListener('pointerleave', onLeave)

    const ro = new ResizeObserver(() => {
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      if (!W || !H) return
      renderer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
      // Repaint on resize whenever the loop is not running: reduced motion, or paused off screen.
      if (!raf) renderer.render(scene, camera)
    })
    ro.observe(wrap)

    let raf = 0
    let io: IntersectionObserver | undefined
    if (!reduced) {
      // Sway, don't spin: a full rotation would expose the bare (route-less) back.
      // ±0.22rad around a -0.05 base, not ±0.45 around -0.35: the old swing reached -0.8, far
      // enough that the leftmost route rotated past the silhouette for part of every cycle.
      // Everything below is driven by elapsed time, not by frame count: the old per-frame
      // increments rocked the boulder at double speed on a 120Hz display.
      let t = 0
      let prev = 0
      // Per-frame lerp factor `f` tuned at 60Hz, held constant across refresh rates.
      const damp = (f: number, dt: number) => 1 - Math.pow(1 - f, dt * 60)
      const loop = (now = 0) => {
        const dt = prev > 0 ? Math.min((now - prev) / 1000, 0.1) : 1 / 60
        prev = now
        t += dt * 0.24 // ~26s per full sway
        const sway = -0.05 + Math.sin(t) * 0.22
        group.rotation.y += (sway + targetRY - group.rotation.y) * damp(0.06, dt)
        group.rotation.x += (targetRX * 0.6 - group.rotation.x) * damp(0.05, dt)
        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }

      // The hero scrolls away in the first screenful of a long page. Left running, this redraws a
      // WebGL scene nobody can see for the rest of the visit, 120 times a second on a ProMotion
      // phone. Run only while the canvas is actually on screen.
      io = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting) {
          // prev = 0 so the paused gap is not handed to the loop as one enormous delta.
          if (!raf) {
            prev = 0
            loop()
          }
        } else if (raf) {
          cancelAnimationFrame(raf)
          raf = 0
        }
      })
      io.observe(wrap)
    }

    // One synchronous frame so the fallback is swapped for something already painted; the loop
    // takes over from the first IntersectionObserver callback.
    renderer.render(scene, camera)
    showFallback = false

    return () => {
      if (raf) cancelAnimationFrame(raf)
      io?.disconnect()
      ro.disconnect()
      stage.removeEventListener('pointermove', onMove)
      stage.removeEventListener('pointerleave', onLeave)
      // `renderer.dispose()` frees the context, not the buffers uploaded through it. Without this
      // every SPA round trip back to `/` leaks a boulder's worth of GPU memory.
      scene.traverse((obj) => {
        const mesh = obj as import('three').Mesh
        mesh.geometry?.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
      renderer.domElement.remove()
    }
  }

  onMount(() => {
    // Snapshot on purpose: the scene is built once, and reduced motion decides how it is built.
    const reduced = still.current
    let cancelled = false
    let dispose: (() => void) | undefined

    Promise.all([import('three'), import('three/examples/jsm/math/SimplexNoise.js')])
      .then(([THREE, { SimplexNoise }]) => {
        if (cancelled) return
        let tries = 0
        const tryBoot = () => {
          if (cancelled) return
          try {
            dispose = boot(THREE, SimplexNoise, wrapEl, stageEl, reduced)
          } catch (e) {
            console.error('[grnyte] three init failed:', e)
            return
          }
          if (!dispose && tries++ < 40) setTimeout(tryBoot, 150)
        }
        tryBoot()
      })
      .catch(() => {})

    return () => {
      cancelled = true
      dispose?.()
    }
  })
</script>

<div bind:this={stageEl} class="absolute inset-0">
  <!-- Contact shadow. Painted in CSS behind the transparent canvas rather than as a second mesh
       and a texture upload: nothing about it needs to move with the sway. -->
  <div
    class="pointer-events-none absolute inset-x-[24%] bottom-[13%] h-[7%] rounded-[50%] blur-[10px]"
    style="background: radial-gradient(ellipse at center, oklch(0 0 0 / 0.6) 0%, transparent 72%)"
  ></div>
  <div bind:this={wrapEl} class="absolute inset-0"></div>
  {#if showFallback}
    <svg viewBox="0 0 520 420" class="absolute inset-0 h-full w-full" aria-hidden="true">
      <path
        d="M84 360 C 60 280 100 200 170 150 C 240 100 330 90 400 140 C 460 185 470 280 440 340 C 420 378 380 380 320 384 C 240 390 110 392 84 360 Z"
        fill="oklch(0.32 0.012 60)"
      />
    </svg>
  {/if}
</div>
