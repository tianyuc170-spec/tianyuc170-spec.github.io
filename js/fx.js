/* ==========================================================================
   TIANYUC DESIGN · WebGL 流体极光背景 & 高定鼠标交互引擎 (fx.js)
   ========================================================================== */

(function () {
  "use strict";

  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const canHoverFine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;

  const PALETTES = {
    light: {
      dark: 0.0,
      base: [0.941, 0.945, 0.980], // #f0f1fa
      c1: [0.024, 0.714, 0.831],   // #06b6d4
      c2: [0.647, 0.910, 0.933],   // #a5e8ee
      c3: [0.961, 0.851, 0.722],   // #f5d9b8
    },
    dark: {
      dark: 1.0,
      base: [0.035, 0.039, 0.059], // #090a0f
      c1: [0.055, 0.455, 0.565],   // #0e7490
      c2: [0.361, 0.882, 0.902],   // #5ce1e6
      c3: [0.831, 0.639, 0.451],   // #d4a373
    },
  };

  let webglState = null;

  /* ---------- 1. 原生 WebGL 流体极光着色器背景 ---------- */
  function initWebGLBackground() {
    const canvas = document.getElementById("lusionHeroCanvas");
    if (!canvas) return false;

    const gl =
      canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: false,
        powerPreference: "high-performance",
      }) || canvas.getContext("experimental-webgl");

    if (!gl) return false;

    const vertSrc = `
      attribute vec2 a_pos;
      void main() {
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

    const fragSrc = `
      precision highp float;

      uniform vec2 u_res;
      uniform float u_time;
      uniform vec2 u_mouse;
      uniform float u_scroll;
      uniform float u_dark;
      uniform vec3 u_ripple;
      uniform vec3 u_base;
      uniform vec3 u_c1;
      uniform vec3 u_c2;
      uniform vec3 u_c3;

      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        float a = hash(i);
        float b = hash(i + vec2(1.0, 0.0));
        float c = hash(i + vec2(0.0, 1.0));
        float d = hash(i + vec2(1.0, 1.0));
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      const mat2 rotM = mat2(0.80, -0.60, 0.60, 0.80);

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p = rotM * p * 2.02 + vec2(17.1, 31.7);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / max(u_res, vec2(1.0));
        float aspect = u_res.x / max(u_res.y, 1.0);
        vec2 p = uv * vec2(aspect, 1.0) * 1.6 + vec2(0.0, u_scroll * 1.2);

        vec2 diff = (uv - u_mouse) * vec2(aspect, 1.0);
        float d = length(diff);
        p += diff * 0.55 * exp(-d * d * 10.0);

        float t = u_time;
        vec2 q = vec2(
          fbm(p + vec2(0.0, 0.0) + t * 0.04),
          fbm(p + vec2(5.2, 1.3) - t * 0.03)
        );
        vec2 r = vec2(
          fbm(p + 3.5 * q + vec2(1.7, 9.2) + t * 0.06),
          fbm(p + 3.5 * q + vec2(8.3, 2.8) + t * 0.05)
        );
        float f = fbm(p + 3.0 * r);

        float k1 = mix(0.36, 0.32, u_dark);
        float k2 = mix(0.35, 0.34, u_dark);
        float k3 = mix(0.32, 0.24, u_dark);

        vec3 col = mix(u_base, u_c1, smoothstep(0.25, 0.85, f) * k1);
        col = mix(col, u_c2, smoothstep(0.35, 1.15, length(q)) * k2);
        col = mix(col, u_c3, smoothstep(0.55, 0.95, r.x) * smoothstep(0.38, 0.86, f) * k3);

        // 光标局部提亮
        float mouseGlow = exp(-d * d * 18.0);
        col += mix(u_c1, u_c2, 0.5) * mouseGlow * mix(0.10, 0.16, u_dark);

        // 丝绸地形等高线流光
        float band = abs(fract(f * 9.0) - 0.5);
        float lines = smoothstep(0.025, 0.0, band);
        col = mix(col, mix(u_c2, vec3(1.0), 0.35), lines * mix(0.06, 0.10, u_dark));

        // 点击涟漪冲击波
        float age = u_time - u_ripple.z;
        if (u_ripple.z > 0.0 && age >= 0.0 && age < 1.6) {
          float rd = distance(uv * vec2(aspect, 1.0), u_ripple.xy * vec2(aspect, 1.0));
          float radius = age * 0.6;
          float ring = smoothstep(0.022, 0.0, abs(rd - radius));
          float fade = 1.0 - age / 1.6;
          col = mix(col, mix(u_c1, u_c2, 0.45), ring * fade * fade * mix(0.34, 0.48, u_dark));
        }

        // 边缘暗角
        vec2 vc = uv - 0.5;
        float vig = 1.0 - dot(vc, vc) * mix(0.06, 0.36, u_dark);
        col *= vig;

        gl_FragColor = vec4(col, 1.0);
      }
    `;

    function compileShader(type, source) {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, source);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.warn("[TYFX WebGL] Shader compile error:", gl.getShaderInfoLog(sh));
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    }

    const vs = compileShader(gl.VERTEX_SHADER, vertSrc);
    const fs = compileShader(gl.FRAGMENT_SHADER, fragSrc);
    if (!vs || !fs) {
      if (vs) gl.deleteShader(vs);
      if (fs) gl.deleteShader(fs);
      return false;
    }

    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn("[TYFX WebGL] Program link error:", gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      return false;
    }

    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const locs = {
      res: gl.getUniformLocation(prog, "u_res"),
      time: gl.getUniformLocation(prog, "u_time"),
      mouse: gl.getUniformLocation(prog, "u_mouse"),
      scroll: gl.getUniformLocation(prog, "u_scroll"),
      dark: gl.getUniformLocation(prog, "u_dark"),
      ripple: gl.getUniformLocation(prog, "u_ripple"),
      base: gl.getUniformLocation(prog, "u_base"),
      c1: gl.getUniformLocation(prog, "u_c1"),
      c2: gl.getUniformLocation(prog, "u_c2"),
      c3: gl.getUniformLocation(prog, "u_c3"),
    };

    const resScale = isCoarsePointer ? 0.35 : 0.5;
    let cw = 1;
    let ch = 1;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr * resScale));
      ch = canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr * resScale));
      gl.viewport(0, 0, cw, ch);
    }
    resize();
    window.addEventListener("resize", resize);

    const getThemeKey = () =>
      document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";

    const initPal = PALETTES[getThemeKey()];
    const curTheme = {
      dark: initPal.dark,
      base: [...initPal.base],
      c1: [...initPal.c1],
      c2: [...initPal.c2],
      c3: [...initPal.c3],
    };
    let fromTheme = null;
    let toTheme = PALETTES[getThemeKey()];
    let themeLerpStart = -1;
    const THEME_TRANSITION_MS = 600;

    function cloneThemeState() {
      return {
        dark: curTheme.dark,
        base: [...curTheme.base],
        c1: [...curTheme.c1],
        c2: [...curTheme.c2],
        c3: [...curTheme.c3],
      };
    }

    function lerpVec3(out, a, b, t) {
      out[0] = a[0] + (b[0] - a[0]) * t;
      out[1] = a[1] + (b[1] - a[1]) * t;
      out[2] = a[2] + (b[2] - a[2]) * t;
    }

    let mx = 0.5;
    let my = 0.5;
    let tmx = 0.5;
    let tmy = 0.5;
    let curScroll = 0;
    let targetScroll = 0;
    let rippleX = 0.5;
    let rippleY = 0.5;
    let rippleTime = -10.0;

    let elapsedSec = 0;
    let lastPerf = performance.now();
    let rafId = 0;

    function drawFrame(now) {
      const dt = Math.min((now - lastPerf) / 1000, 0.08);
      lastPerf = now;
      if (!prefersReduced) {
        elapsedSec += dt;
      }

      if (fromTheme && themeLerpStart >= 0) {
        const p = Math.min((now - themeLerpStart) / THEME_TRANSITION_MS, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        curTheme.dark = fromTheme.dark + (toTheme.dark - fromTheme.dark) * eased;
        lerpVec3(curTheme.base, fromTheme.base, toTheme.base, eased);
        lerpVec3(curTheme.c1, fromTheme.c1, toTheme.c1, eased);
        lerpVec3(curTheme.c2, fromTheme.c2, toTheme.c2, eased);
        lerpVec3(curTheme.c3, fromTheme.c3, toTheme.c3, eased);
        if (p >= 1) {
          fromTheme = null;
          themeLerpStart = -1;
        }
      }

      mx += (tmx - mx) * 0.24;
      my += (tmy - my) * 0.24;

      const maxScroll = Math.max(
        document.documentElement.scrollHeight - window.innerHeight,
        1
      );
      targetScroll = Math.min(Math.max(window.scrollY / maxScroll, 0), 1);
      curScroll += (targetScroll - curScroll) * 0.08;

      gl.uniform2f(locs.res, cw, ch);
      gl.uniform1f(locs.time, elapsedSec);
      gl.uniform2f(locs.mouse, mx, my);
      gl.uniform1f(locs.scroll, curScroll);
      gl.uniform1f(locs.dark, curTheme.dark);
      gl.uniform3f(locs.ripple, rippleX, rippleY, rippleTime);
      gl.uniform3fv(locs.base, curTheme.base);
      gl.uniform3fv(locs.c1, curTheme.c1);
      gl.uniform3fv(locs.c2, curTheme.c2);
      gl.uniform3fv(locs.c3, curTheme.c3);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function loop(now) {
      if (document.hidden) {
        rafId = 0;
        return;
      }
      drawFrame(now);
      rafId = requestAnimationFrame(loop);
    }

    const observer = new MutationObserver(() => {
      const nextKey = getThemeKey();
      toTheme = PALETTES[nextKey];
      fromTheme = cloneThemeState();
      themeLerpStart = performance.now();
      if (prefersReduced) {
        curTheme.dark = toTheme.dark;
        curTheme.base = [...toTheme.base];
        curTheme.c1 = [...toTheme.c1];
        curTheme.c2 = [...toTheme.c2];
        curTheme.c3 = [...toTheme.c3];
        fromTheme = null;
        drawFrame(performance.now());
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    if (prefersReduced) {
      drawFrame(performance.now());
    } else {
      window.addEventListener(
        "pointermove",
        (e) => {
          tmx = e.clientX / Math.max(window.innerWidth, 1);
          tmy = 1.0 - e.clientY / Math.max(window.innerHeight, 1);
        },
        { passive: true }
      );

      document.addEventListener(
        "click",
        (e) => {
          rippleX = e.clientX / Math.max(window.innerWidth, 1);
          rippleY = 1.0 - e.clientY / Math.max(window.innerHeight, 1);
          rippleTime = elapsedSec;
        },
        { passive: true }
      );

      document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !rafId) {
          lastPerf = performance.now();
          rafId = requestAnimationFrame(loop);
        }
      });

      rafId = requestAnimationFrame(loop);
    }

    webglState = { gl, drawFrame };
    window.__TY_FX_WEBGL = true;
    return true;
  }

  /* ---------- 2. 跟踪鼠标特效套件（保留系统原生光标，0延迟光晕点 + 紧致外环） ---------- */
  function initMouseSuite() {
    if (!canHoverFine || prefersReduced) return;

    const gsap = window.gsap;

    // 2.1 双层跟随氛围光标（不隐藏系统指针）
    const dot = document.createElement("div");
    dot.className = "cursor-dot";
    dot.setAttribute("aria-hidden", "true");

    const ring = document.createElement("div");
    ring.className = "cursor-ring";
    ring.setAttribute("aria-hidden", "true");

    const labelEl = document.createElement("span");
    labelEl.className = "cursor-label";
    ring.appendChild(labelEl);

    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let xRing = null;
    let yRing = null;

    if (gsap) {
      gsap.set([dot, ring], { xPercent: -50, yPercent: -50, x: -100, y: -100 });
      xRing = gsap.quickTo(ring, "x", { duration: 0.1, ease: "power3.out" });
      yRing = gsap.quickTo(ring, "y", { duration: 0.1, ease: "power3.out" });
    }

    let cursorVisible = false;
    let isViewMode = false;
    let lastClientX = -100;
    let lastClientY = -100;

    function moveRingToPointer(cx, cy) {
      const rx = isViewMode ? cx + 28 : cx;
      const ry = isViewMode ? cy + 24 : cy;
      if (xRing) {
        xRing(rx);
        yRing(ry);
      } else {
        ring.style.transform = `translate3d(${rx}px, ${ry}px, 0) translate(-50%, -50%)`;
      }
    }

    window.addEventListener(
      "pointermove",
      (e) => {
        lastClientX = e.clientX;
        lastClientY = e.clientY;
        if (!cursorVisible) {
          cursorVisible = true;
          dot.style.opacity = "0.55";
          ring.style.opacity = "1";
        }
        if (gsap) {
          gsap.set(dot, { x: e.clientX, y: e.clientY });
        } else {
          dot.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0) translate(-50%, -50%)`;
        }
        moveRingToPointer(e.clientX, e.clientY);

        document.documentElement.style.setProperty("--cx", `${e.clientX}px`);
        document.documentElement.style.setProperty("--cy", `${e.clientY}px`);
      },
      { passive: true }
    );

    document.addEventListener("mouseleave", () => {
      cursorVisible = false;
      dot.style.opacity = "0";
      ring.style.opacity = "0";
    });

    document.addEventListener("mouseenter", () => {
      cursorVisible = true;
      dot.style.opacity = "0.55";
      ring.style.opacity = "1";
    });

    window.addEventListener("pointerdown", () => {
      if (gsap) gsap.to([dot, ring], { scale: 0.85, duration: 0.1, ease: "power2.out", overwrite: "auto" });
    });

    window.addEventListener("pointerup", () => {
      if (gsap) gsap.to([dot, ring], { scale: 1, duration: 0.2, ease: "expo.out", overwrite: "auto" });
    });

    // 状态委托判断
    const VIEW_SEL = ".work-card, .hero-single-logo-card";
    const OPEN_SEL = ".cap-cell";
    const HOVER_SEL = 'a, button, [role="button"], input, .cat-tab, .layout-btn';

    function setCursorMode(mode, text) {
      ring.classList.remove("is-hover", "is-view");
      if (mode === "view") {
        isViewMode = true;
        ring.classList.add("is-view");
        labelEl.textContent = text || "VIEW 查看";
      } else if (mode === "hover") {
        isViewMode = false;
        ring.classList.add("is-hover");
        labelEl.textContent = "";
      } else {
        isViewMode = false;
        labelEl.textContent = "";
      }
      if (cursorVisible) {
        moveRingToPointer(lastClientX, lastClientY);
      }
    }

    document.addEventListener(
      "pointerover",
      (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (target.closest(".cap-spec-trigger")) {
          setCursorMode("hover");
        } else if (target.closest(VIEW_SEL)) {
          setCursorMode("view", "VIEW 查看");
        } else if (target.closest(OPEN_SEL)) {
          setCursorMode("view", "OPEN");
        } else if (target.closest(HOVER_SEL)) {
          setCursorMode("hover");
        } else {
          setCursorMode("default");
        }
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerout",
      (e) => {
        const to = e.relatedTarget;
        if (!to || !(to instanceof Element)) {
          setCursorMode("default");
          return;
        }
        if (to.closest(".cap-spec-trigger")) {
          setCursorMode("hover");
        } else if (to.closest(VIEW_SEL)) {
          setCursorMode("view", "VIEW 查看");
        } else if (to.closest(OPEN_SEL)) {
          setCursorMode("view", "OPEN");
        } else if (to.closest(HOVER_SEL)) {
          setCursorMode("hover");
        } else {
          setCursorMode("default");
        }
      },
      { passive: true }
    );

    // 2.2 卡片聚光位置委托（work-card 动态渲染也能生效）
    const SPOT_SEL = ".work-card, .cap-cell, .process-step, .wechat-card";
    document.addEventListener(
      "pointermove",
      (e) => {
        const target = e.target;
        if (!(target instanceof Element)) return;
        const card = target.closest(SPOT_SEL);
        if (!card) return;
        const rect = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${(e.clientX - rect.left).toFixed(1)}px`);
        card.style.setProperty("--my", `${(e.clientY - rect.top).toFixed(1)}px`);
      },
      { passive: true }
    );

    // 2.3 磁吸按钮交互（事件委托支持所有静态与动态按钮）
    const MAGNET_SEL =
      ".lusion-pill-cta, .lusion-talk-pill, .lusion-menu-pill, .lusion-circle-pill, .lusion-dark-mini-btn";
    let activeMagnet = null;

    if (gsap) {
      document.addEventListener(
        "pointermove",
        (e) => {
          const target = e.target;
          if (!(target instanceof Element)) return;
          const btn = target.closest(MAGNET_SEL);
          if (activeMagnet && activeMagnet !== btn) {
            gsap.to(activeMagnet, {
              x: 0,
              y: 0,
              duration: 0.38,
              ease: "elastic.out(1, 0.4)",
              overwrite: "auto",
            });
            activeMagnet = null;
          }
          if (!btn) return;
          activeMagnet = btn;
          const r = btn.getBoundingClientRect();
          const dx = Math.max(-10, Math.min(10, (e.clientX - (r.left + r.width / 2)) * 0.25));
          const dy = Math.max(-10, Math.min(10, (e.clientY - (r.top + r.height / 2)) * 0.25));
          gsap.to(btn, { x: dx, y: dy, duration: 0.14, ease: "power2.out", overwrite: "auto" });
        },
        { passive: true }
      );

      document.addEventListener("pointerleave", () => {
        if (activeMagnet) {
          gsap.to(activeMagnet, { x: 0, y: 0, duration: 0.38, ease: "elastic.out(1, 0.4)", overwrite: "auto" });
          activeMagnet = null;
        }
      });
    }

    // 2.4 Hero 展台 3D 倾角 + 反射高光（作用于父级 #heroParallaxStage，避免与子卡片视差冲突）
    const stage = document.getElementById("heroParallaxStage");
    const heroCard = stage ? stage.querySelector(".hero-single-logo-card") : null;
    if (stage && gsap) {
      const rotXTo = gsap.quickTo(stage, "rotateX", { duration: 0.2, ease: "power3.out" });
      const rotYTo = gsap.quickTo(stage, "rotateY", { duration: 0.2, ease: "power3.out" });

      stage.addEventListener("pointermove", (e) => {
        const r = stage.getBoundingClientRect();
        const nx = ((e.clientX - r.left) / Math.max(r.width, 1) - 0.5) * 2;
        const ny = ((e.clientY - r.top) / Math.max(r.height, 1) - 0.5) * 2;
        rotYTo(nx * 7);
        rotXTo(-ny * 7);
        if (heroCard) {
          const cr = heroCard.getBoundingClientRect();
          heroCard.style.setProperty("--gx", `${(e.clientX - cr.left).toFixed(1)}px`);
          heroCard.style.setProperty("--gy", `${(e.clientY - cr.top).toFixed(1)}px`);
        }
      });

      stage.addEventListener("pointerleave", () => {
        rotXTo(0);
        rotYTo(0);
      });
    }
  }

  /* ---------- 3. 分字揭示工具 & 滚动动效编排 ---------- */
  function splitChars(el) {
    if (!el || prefersReduced || el.dataset.fxSplit === "1") return [];
    const text = (el.textContent || "").trim();
    if (!text) return [];
    el.setAttribute("aria-label", text);
    el.dataset.fxSplit = "1";
    el.innerHTML = [...text]
      .map((ch) => {
        const safe = ch === " " ? "&nbsp;" : ch
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
        const charCls = ch === "&" ? "char is-amp" : "char";
        return `<span class="char-mask" aria-hidden="true"><span class="${charCls}">${safe}</span></span>`;
      })
      .join("");
    return Array.from(el.querySelectorAll(".char"));
  }

  function initScroll() {
    const header = document.getElementById("header");
    const updateHeaderScroll = () => {
      if (!header) return;
      header.classList.toggle("is-scrolled", window.scrollY > 40);
    };
    updateHeaderScroll();
    window.addEventListener("scroll", updateHeaderScroll, { passive: true });

    if (prefersReduced || !window.gsap || !window.ScrollTrigger) return;
    const gsap = window.gsap;

    // 1. 区块大标题剪裁揭示
    const headings = document.querySelectorAll(
      ".section-heading, .featured-monument-title, .footer-headline"
    );
    headings.forEach((h) => {
      gsap.fromTo(
        h,
        { clipPath: "inset(0 0 100% 0)", y: 40 },
        {
          clipPath: "inset(0 0 0% 0)",
          y: 0,
          duration: 0.9,
          ease: "expo.out",
          clearProps: "clipPath,transform",
          scrollTrigger: {
            trigger: h,
            start: "top 88%",
            once: true,
          },
        }
      );
    });

    // 2. Process 交付准则进度轨道 & 节点依次点亮
    const processGrid = document.querySelector(".process-grid");
    if (processGrid) {
      const steps = Array.from(processGrid.querySelectorAll(".process-step"));
      steps.forEach((step) => {
        if (!step.querySelector(".process-node-dot")) {
          const dot = document.createElement("span");
          dot.className = "process-node-dot";
          dot.setAttribute("aria-hidden", "true");
          step.appendChild(dot);
        }
      });

      window.ScrollTrigger.create({
        trigger: processGrid,
        start: "top 80%",
        end: "bottom 55%",
        scrub: 0.6,
        onUpdate: (self) => {
          const p = self.progress;
          processGrid.style.setProperty("--p", p.toFixed(4));
          const denom = Math.max(steps.length - 1, 1);
          steps.forEach((step, idx) => {
            step.classList.toggle("is-lit", p >= idx / denom - 0.02 && p > 0.01);
          });
        },
      });
    }

    // 3. 跑马灯速度跟随 Lenis 滚动惯性倾斜
    const lenis = window.__tyLenis;
    const marqueeRows = Array.from(document.querySelectorAll(".marquee-row"));
    if (lenis && marqueeRows.length > 0) {
      const skewObj = { val: 0 };
      let resetTween = null;

      lenis.on("scroll", ({ velocity }) => {
        const clamped = Math.max(-8, Math.min(8, (velocity || 0) * 0.4));
        skewObj.val = clamped;
        marqueeRows.forEach((row) => row.style.setProperty("--skew", `${clamped.toFixed(2)}deg`));
        if (resetTween) resetTween.kill();
        resetTween = gsap.to(skewObj, {
          val: 0,
          duration: 0.4,
          ease: "power3.out",
          onUpdate: () => {
            marqueeRows.forEach((row) =>
              row.style.setProperty("--skew", `${skewObj.val.toFixed(2)}deg`)
            );
          },
        });
      });
    }
  }

  window.TYFX = {
    splitChars,
    initScroll,
  };

  document.addEventListener("DOMContentLoaded", () => {
    initWebGLBackground();
    initMouseSuite();
  });
})();
