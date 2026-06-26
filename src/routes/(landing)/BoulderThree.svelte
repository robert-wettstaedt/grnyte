<script lang="ts">
  import { onMount } from 'svelte'
  import type { Vector3 } from 'three'

  let stageEl: HTMLDivElement
  let wrapEl: HTMLDivElement
  let showFallback = $state(true)

  const ROUTES: Array<{ theta: number; color: number }> = [
    { theta: 0.95, color: 0xe8893f }, // grade-4 orange
    { theta: 1.55, color: 0x4fc3d4 }, // grade-2 cyan
    { theta: 2.15, color: 0xe0533b }, // grade-5 red
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
    showFallback = false

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 50)
    camera.position.set(0, 0.55, 5.0)
    camera.lookAt(0, -0.05, 0)

    // ---- geometry: blocky granite ----
    const simplex = new Simplex()
    const fbm = (x: number, y: number, z: number) => {
      let f = 0
      let amp = 0.5
      let freq = 1
      for (let o = 0; o < 3; o++) {
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

    let geo: import('three').BufferGeometry = new THREE.IcosahedronGeometry(1.3, 2)
    geo = geo.toNonIndexed()
    const pos = geo.attributes.position as import('three').BufferAttribute
    const tmp = new THREE.Vector3()
    for (let i = 0; i < pos.count; i++) {
      tmp.fromBufferAttribute(pos, i)
      const d = shape(tmp)
      pos.setXYZ(i, d.x, d.y, d.z)
    }
    // per-facet grey speckle
    const colors = new Float32Array(pos.count * 3)
    const base = new THREE.Color(0x6f6e66)
    for (let i = 0; i < pos.count; i += 3) {
      const s = 0.82 + Math.random() * 0.32
      for (let k = 0; k < 3; k++) {
        colors[(i + k) * 3] = base.r * s
        colors[(i + k) * 3 + 1] = base.g * s
        colors[(i + k) * 3 + 2] = base.b * s
      }
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.computeVertexNormals()

    const boulder = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        roughness: 0.95,
        metalness: 0.02,
        flatShading: true,
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
    for (const { theta: theta0, color } of ROUTES) {
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

    group.rotation.y = -0.35
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

    let targetRX = 0
    let targetRY = 0
    const onMove = (e: PointerEvent) => {
      const r = wrap.getBoundingClientRect()
      targetRY = ((e.clientX - r.left) / r.width - 0.5) * 0.5
      targetRX = ((e.clientY - r.top) / r.height - 0.5) * 0.25
    }
    stage.addEventListener('pointermove', onMove)

    const ro = new ResizeObserver(() => {
      const W = wrap.clientWidth
      const H = wrap.clientHeight
      if (!W || !H) return
      renderer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
      if (reduced) renderer.render(scene, camera)
    })
    ro.observe(wrap)

    let raf = 0
    if (reduced) {
      renderer.render(scene, camera)
    } else {
      // Sway, don't spin: a full rotation would expose the bare (route-less) back.
      // Rock ±0.45rad around the front so the routed face always faces the viewer.
      let t = 0
      const loop = () => {
        t += 0.004
        const sway = -0.35 + Math.sin(t) * 0.45
        group.rotation.y += (sway + targetRY - group.rotation.y) * 0.06
        group.rotation.x += (targetRX * 0.6 - group.rotation.x) * 0.05
        renderer.render(scene, camera)
        raf = requestAnimationFrame(loop)
      }
      loop()
    }

    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
      stage.removeEventListener('pointermove', onMove)
      renderer.dispose()
      renderer.domElement.remove()
    }
  }

  onMount(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
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
