import { QR_ROWS, QR_SIZE } from "./qr-matrix";

type Three = typeof import("three");

export const QUIET = 4;
export const QR_TOTAL = QR_SIZE + QUIET * 2;
export const PAD = QR_TOTAL * 0.03;
export const FIT = 1.06;
export const PLUM = "#4a071e";
export const CYCLE = 8.0;
const FOV = 40;

/* timeline, seconds into the cycle */
const A_SPAN = 1.0;
const A_DUR = 2.0;
const HOLD_T0 = 3.3; /* every tile landed + heat faded → pristine hold */
const D_T0 = 7.0; /* dissolve begins */
const D_SPAN = 0.4;
const D_DUR = 0.6;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeInCubic = (t: number) => t * t * t;
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const backOut = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function startScene(
  THREE: Three,
  canvas: HTMLCanvasElement,
  stage: HTMLElement,
): () => void {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0xfdf7f6, 1); /* opaque blush — matches stage bg */

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 800);
  const camZ = ((QR_TOTAL / 2) / Math.tan((FOV * Math.PI) / 360)) * FIT;

  /* ---- QR tiles: one box per dark module ---- */
  const targets: number[] = [];
  for (let y = 0; y < QR_SIZE; y++) {
    const row = QR_ROWS[y];
    for (let x = 0; x < QR_SIZE; x++) {
      if (row[x] === "1") {
        targets.push(x + QUIET + 0.5 - QR_TOTAL / 2, QR_TOTAL / 2 - (y + QUIET + 0.5));
      }
    }
  }
  const count = targets.length / 2;
  const tileGeo = new THREE.BoxGeometry(1, 1, 0.22);
  const tileMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, count);
  tiles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tiles.frustumCulled = false;

  const cPlum = new THREE.Color(0x4a071e);
  const cRed = new THREE.Color(0xff254c);
  const cWhite = new THREE.Color(0xffffff);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < count; i++) tiles.setColorAt(i, cPlum);

  /* per-tile precompute: vortex paths (spiral in from a swirling shell),
     tumble amplitudes, centre-first stagger */
  const a0 = new Float32Array(count);
  const r0 = new Float32Array(count);
  const z0 = new Float32Array(count);
  const spin = new Float32Array(count);
  const aT = new Float32Array(count);
  const rots = new Float32Array(count * 3);
  const rads = new Float32Array(count);
  const staggers = new Float32Array(count);
  const xAxis = new THREE.Vector3(1, 0, 0);
  const vDir = new THREE.Vector3();
  const qA = new THREE.Quaternion();
  const qT = new THREE.Quaternion();
  const tumbleE = new THREE.Euler();
  const qIdent = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const tx = targets[i * 2];
    const ty = targets[i * 2 + 1];
    a0[i] = rand(i + 5) * Math.PI * 2;
    r0[i] = 36 + rand(i + 17) * 30;
    z0[i] = (rand(i + 57) - 0.5) * 44;
    spin[i] = (rand(i + 89) < 0.5 ? -1 : 1) * (0.6 + rand(i + 101) * 0.8) * Math.PI * 2;
    aT[i] = Math.atan2(ty, tx);
    rads[i] = Math.sqrt(tx * tx + ty * ty);
    rots[i * 3] = (rand(i + 97) - 0.5) * 2.2;
    rots[i * 3 + 1] = (rand(i + 113) - 0.5) * 2.2;
    rots[i * 3 + 2] = (rand(i + 131) - 0.5) * 1.2;
    staggers[i] = clamp01((rads[i] / 46) * 0.7 + rand(i + 71) * 0.3);
  }
  const spA = new Float32Array(3);
  const spB = new Float32Array(3);
  const spiralAt = (i: number, p: number, out: Float32Array) => {
    const angle = a0[i] + (aT[i] - a0[i]) * p + spin[i] * (1 - p);
    const radius = r0[i] + (rads[i] - r0[i]) * p;
    out[0] = Math.cos(angle) * radius;
    out[1] = Math.sin(angle) * radius;
    out[2] = z0[i] * (1 - p);
  };

  scene.add(tiles);

  /* ---- signal-red particles: fine dust + soft bokeh ---- */
  const makeDust = (n: number, size: number, additive: boolean) => {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rand(i + 7) - 0.5) * (QR_TOTAL + 14);
      arr[i * 3 + 1] = (rand(i + 77) - 0.5) * (QR_TOTAL + 14);
      arr[i * 3 + 2] = rand(i + 777) * 34 - 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xff254c,
      size,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.renderOrder = additive ? 11 : 10;
    scene.add(pts);
    return { arr, geo, mat, n };
  };
  const dustA = makeDust(16, 1.4, false);
  const dustB = makeDust(6, 3.4, true);

  /* ---- pointer aim (camera parallax) ---- */
  let aimX = 0;
  let aimY = 0;
  let px = 0;
  let py = 0;
  const onMove = (e: PointerEvent) => {
    const rect = stage.getBoundingClientRect();
    aimX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    aimY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
  };
  const onLeave = () => {
    aimX = 0;
    aimY = 0;
  };
  stage.addEventListener("pointermove", onMove);
  stage.addEventListener("pointerleave", onLeave);

  /* ---- loop ---- */
  const dummy = new THREE.Object3D();
  let raf = 0;
  let time = 0;
  let last = performance.now();
  const start = performance.now();
  let wasSettled = false;

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    time += dt;

    const tC = ((now - start) / 1000) % CYCLE;

    /* camera: pointer parallax only — dead still when no pointer, so the
       code never drifts while someone is aiming a phone at it */
    px += (aimX - px) * Math.min(1, dt * 5);
    py += (aimY - py) * Math.min(1, dt * 5);
    camera.position.set(px * 2.6, -py * 2.0, camZ);
    camera.lookAt(0, 0, 0);

    /* tiles — frozen entirely during the pristine hold (scan window) */
    const settledNow = tC > HOLD_T0 && tC < D_T0;
    if (!settledNow || !wasSettled) {
      for (let i = 0; i < count; i++) {
        const s = staggers[i];
        const aStart = s * A_SPAN;
        const aEnd = aStart + A_DUR;
        const dStart = D_T0 + s * D_SPAN;
        let x = targets[i * 2];
        let y = targets[i * 2 + 1];
        let z = 0;
        let base = 1;
        let stretch = 0;
        let tumble = 0;
        let flash = 0;
        let core = 0;

        if (tC <= aEnd) {
          /* vortex in: slow, smooth swirl from a shell → streak → snap */
          const raw = clamp01((tC - aStart) / A_DUR);
          const p = easeInOutCubic(raw);
          spiralAt(i, p, spA);
          spiralAt(i, Math.max(p - 0.03, 0), spB);
          x = spA[0];
          y = spA[1];
          z = spA[2];
          base = backOut(raw);
          stretch = (1 - raw) * 1.6;
          tumble = 1 - raw;
          flash = smoothstep(0.45, 1, raw);
          core = smoothstep(0.8, 1, raw) * 0.8;
          vDir.set(spA[0] - spB[0], spA[1] - spB[1], spA[2] - spB[2]);
        } else if (tC >= dStart) {
          /* vortex out: the same spiral played backwards */
          const pe = easeInCubic(clamp01((tC - dStart) / D_DUR));
          const p = 1 - pe;
          spiralAt(i, p, spA);
          spiralAt(i, Math.min(p + 0.03, 1), spB);
          x = spA[0];
          y = spA[1];
          z = spA[2];
          base = 1 - pe;
          stretch = pe * 2.2;
          tumble = pe;
          flash = pe;
          core = smoothstep(0, 0.2, pe) * 0.5 * (1 - smoothstep(0.55, 1, pe));
          vDir.set(spA[0] - spB[0], spA[1] - spB[1], spA[2] - spB[2]);
        } else {
          /* landed: heat fades fast, then the QR is completely pristine —
             no effects of any kind until the next dissolve */
          const tSince = tC - aEnd;
          flash = 1 - smoothstep(0, 0.25, tSince);
          core = 0.8 * (1 - smoothstep(0, 0.15, tSince));
        }

        dummy.position.set(x, y, z);
        if (tumble > 0 && vDir.lengthSq() > 1e-8) {
          vDir.normalize();
          qA.setFromUnitVectors(xAxis, vDir);
          tumbleE.set(rots[i * 3] * tumble, rots[i * 3 + 1] * tumble, rots[i * 3 + 2] * tumble);
          qT.setFromEuler(tumbleE);
          qA.multiply(qT);
          dummy.quaternion.copy(qIdent).slerp(qA, tumble);
        } else {
          dummy.quaternion.copy(qIdent);
        }
        dummy.scale.set(
          Math.max(base * (1 + stretch), 0.0001),
          Math.max(base, 0.0001),
          Math.max(base, 0.0001),
        );
        dummy.updateMatrix();
        tiles.setMatrixAt(i, dummy.matrix);
        if (core > 0) {
          tmpColor.copy(cPlum).lerp(cRed, clamp01(flash)).lerp(cWhite, clamp01(core));
        } else if (flash > 0) {
          tmpColor.copy(cPlum).lerp(cRed, clamp01(flash));
        } else {
          tmpColor.copy(cPlum);
        }
        tiles.setColorAt(i, tmpColor);
      }
      tiles.instanceMatrix.needsUpdate = true;
      if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
      wasSettled = settledNow;
    }

    /* particles: envelope + left-to-right drift */
    const phase = tC / CYCLE;
    const envelope =
      phase < 0.12 ? phase / 0.12 : phase < 0.55 ? 1 : phase < 0.75 ? 1 - (phase - 0.55) / 0.2 : 0;
    dustA.mat.opacity = envelope * (0.7 + 0.15 * Math.sin(time * 2.4));
    dustB.mat.opacity = envelope * (0.16 + 0.06 * Math.sin(time * 1.7 + 2));
    for (let i = 0; i < dustA.n; i++) {
      dustA.arr[i * 3] += dt * 2.4;
      if (dustA.arr[i * 3] > QR_TOTAL / 2 + 8) dustA.arr[i * 3] = -QR_TOTAL / 2 - 8;
    }
    for (let i = 0; i < dustB.n; i++) {
      dustB.arr[i * 3] += dt * 1.5;
      if (dustB.arr[i * 3] > QR_TOTAL / 2 + 8) dustB.arr[i * 3] = -QR_TOTAL / 2 - 8;
    }
    dustA.geo.attributes.position.needsUpdate = true;
    dustB.geo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  };

  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const resize = () => {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  resize();

  const onLost = (e: Event) => {
    e.preventDefault();
    stop();
    stage.classList.remove("is-gl");
  };
  canvas.addEventListener("webglcontextlost", onLost);

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);

  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (!raf) {
            last = performance.now();
            loop();
          }
        } else {
          stop();
        }
      }
    },
    { rootMargin: "64px" },
  );
  intersectionObserver.observe(canvas);

  stage.classList.add("is-gl");

  return () => {
    stop();
    stage.classList.remove("is-gl");
    canvas.removeEventListener("webglcontextlost", onLost);
    stage.removeEventListener("pointermove", onMove);
    stage.removeEventListener("pointerleave", onLeave);
    intersectionObserver.disconnect();
    resizeObserver.disconnect();
    tiles.geometry.dispose();
    tiles.instanceColor?.dispose();
    tileMat.dispose();
    dustA.geo.dispose();
    dustA.mat.dispose();
    dustB.geo.dispose();
    dustB.mat.dispose();
    renderer.dispose();
  };
}

