/**
 * TIANYUC DESIGN · 交互动效与作品集渲染引擎
 * 包含：机械数字预加载 -> 微光粒子环境场 -> 纯正单LOGO首屏 -> 第2页精炼六大板块 & 交付标准弹窗 ->
 * 独立作品卡纯正上浮放大（无倾斜） -> 字符波浪翻滚 -> GSAP Flip -> 三合一详情灯箱
 */
(function () {
  "use strict";

  const STORAGE_THEME_KEY = "tianyuc_theme_v2";

  const state = {
    data: null,
    activeCategory: "all",
    searchQuery: "",
    layoutMode: "masonry", // 'masonry' | 'uniform'
    lightboxWorkId: null,
    lightboxWorkObj: null,
    lightboxPlaylist: [], // [{ work, full, thumb, caption }]
    lightboxIndex: 0,
    lightboxMode: "frame", // 'frame' | 'long-scroll'
    lightboxZoomed: false,
    lenis: null,
  };

  let galleryTriggers = [];

  /* ---------- 工具函数 ---------- */
  function $(selector, scope = document) {
    return scope.querySelector(selector);
  }

  function $$(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildCharRollTitle(text) {
    const chars = Array.from(String(text || ""));
    return chars
      .map((ch, idx) => {
        const safe = ch === " " ? "&nbsp;" : escapeHtml(ch);
        return `<span class="char-col" style="--char-i:${idx};"><span>${safe}</span><span>${safe}</span></span>`;
      })
      .join("");
  }

  function showToast(message) {
    const host = $("#toastContainer");
    if (!host) return;
    const item = document.createElement("div");
    item.className = "toast-item";
    item.textContent = message;
    host.appendChild(item);
    setTimeout(() => {
      item.style.opacity = "0";
      item.style.transform = "translateY(8px)";
      item.style.transition = "all 0.25s ease";
      setTimeout(() => item.remove(), 260);
    }, 2600);
  }

  async function copyToClipboard(text, notice) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(notice || `已复制：${text}`);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      showToast(notice || `已复制：${text}`);
    }
  }

  /* ---------- 1. 冰银流体光晕与轨道几何工作室启幕预加载 (#preloader) ---------- */
  function runPreloader(onComplete) {
    const preloader = $("#preloader");
    const inner = $("#preloaderInner");
    const orbit = $(".preloader-orbit-svg", preloader);
    const counterEl = $("#preloaderCounter");
    const barFill = $("#preloaderBarFill");
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let fired = false;
    const fireOnce = () => {
      if (!fired) {
        fired = true;
        onComplete?.();
      }
    };

    if (!preloader || prefersReduced || !window.gsap) {
      preloader?.classList.add("is-done");
      fireOnce();
      return;
    }

    const gsap = window.gsap;
    const obj = { val: 0 };

    if (orbit) {
      gsap.fromTo(
        orbit,
        { scale: 0.92, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: "expo.out" }
      );
    }

    const tl = gsap.timeline({
      onComplete: () => {
        preloader.classList.add("is-done");
        fireOnce();
      },
    });

    tl.to(obj, {
      val: 100,
      duration: 0.82,
      ease: "power2.inOut",
      onUpdate: () => {
        const v = Math.round(obj.val);
        if (counterEl) counterEl.textContent = `${String(v).padStart(2, "0")}%`;
        if (barFill) barFill.style.width = `${v}%`;
      },
    })
      .to(
        [inner, orbit].filter(Boolean),
        {
          scale: 1.06,
          opacity: 0,
          duration: 0.28,
          ease: "power2.in",
        },
        "+=0.05"
      )
      .to(
        preloader,
        {
          clipPath: "inset(0% 0% 100% 0%)",
          opacity: 0,
          duration: 0.52,
          ease: "expo.inOut",
          onStart: fireOnce,
        },
        "-=0.08"
      );
  }

  /* ---------- 初始化加载数据 ---------- */
  async function loadPortfolioData() {
    let remoteData = null;
    try {
      const resp = await fetch(`data/works.json?t=${Date.now()}`, { cache: "no-store" });
      if (resp.ok) {
        remoteData = await resp.json();
      }
    } catch (err) {
      console.error("Failed to load works.json", err);
    }

    state.data = remoteData;

    if (!state.data) {
      showToast("未能读取 works.json，请通过本地服务或 HTTP 服务器访问。");
      $("#preloader")?.classList.add("is-done");
      return;
    }

    applySiteConfig();
    if (window.gsap && window.Flip && window.ScrollTrigger) {
      window.gsap.registerPlugin(window.Flip, window.ScrollTrigger);
    }

    renderAll();
    initGlobalAmbientCanvas();
    initScrollChoreography();
    window.TYFX?.initScroll?.();
    setupGalleryScrollAnimations(true);

    runPreloader(() => {
      playHeroEntrance();
    });
  }

  /* ---------- 应用站点品牌与微信信息 ---------- */
  function applySiteConfig() {
    const cfg = state.data.siteConfig || {};
    const wechat = cfg.wechat || "z2728588294";

    if ($("#headerBrandName")) $("#headerBrandName").textContent = cfg.brandName || "TIANYUC DESIGN";
    if ($("#headerBrandSub")) $("#headerBrandSub").textContent = `${cfg.designerName || "陈天宇"} · 商业视觉设计`;
    const titleEl = $("#heroTitleText");
    if (titleEl) {
      const rawTitle = cfg.heroTitle || "商业视觉全案\n平面设计 & 3D 渲染";
      const lines = String(rawTitle).split(/\n+/).map((s) => s.trim()).filter(Boolean);
      titleEl.innerHTML = lines
        .map((line, idx) => {
          const cls = idx === 0 ? "hero-title-line" : "hero-title-line is-sub";
          const html = escapeHtml(line).replace(/&amp;/g, '<span class="hero-amp">&amp;</span>');
          return `<span class="${cls}">${html}</span>`;
        })
        .join("");
      delete titleEl.dataset.fxSplit;
    }
    if ($("#heroSubtitleText")) $("#heroSubtitleText").textContent = cfg.heroSubtitle || "";
    if ($("#heroAvailability")) $("#heroAvailability").textContent = cfg.availability || "";

    $$(".js-wechat-text").forEach((el) => {
      el.textContent = wechat;
    });

    const totalCount = (state.data.works || []).length;
    if ($("#heroTotalWorksCount")) {
      $("#heroTotalWorksCount").textContent = `(${String(totalCount).padStart(2, "0")})`;
    }
  }

  /* ---------- 主题切换（冰银浅调 ⇄ 深空暗调） ---------- */
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME_KEY) || "light";
    applyTheme(saved, false);

    const btn = $("#themeToggleBtn");
    if (btn) {
      btn.addEventListener("click", (e) => {
        const current = document.documentElement.getAttribute("data-theme") || "light";
        const next = current === "light" ? "dark" : "light";
        if (document.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          const x = e.clientX || window.innerWidth - 150;
          const y = e.clientY || 36;
          const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
          const vt = document.startViewTransition(() => applyTheme(next, true));
          vt.ready
            .then(() => {
              document.documentElement.animate(
                {
                  clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`],
                },
                { duration: 520, easing: "cubic-bezier(0.16, 1, 0.3, 1)", pseudoElement: "::view-transition-new(root)" }
              );
            })
            .catch(() => {});
        } else {
          applyTheme(next, true);
        }
      });
    }
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);
    const label = $("#themeToggleLabel");
    if (label) {
      label.textContent = theme === "light" ? "深空暗调" : "冰银白昼";
    }
    if (persist) {
      localStorage.setItem(STORAGE_THEME_KEY, theme);
    }
  }

  /* ---------- 2. 浮动圆角下拉菜单 ---------- */
  function initFloatingMenu() {
    const menuBtn = $("#header-right-menu-btn");
    const menuCard = $("#header-menu");
    if (!menuBtn || !menuCard) return;

    function toggleMenu(forceState) {
      const next = typeof forceState === "boolean" ? forceState : !menuCard.classList.contains("is-open");
      menuCard.classList.toggle("is-open", next);
      menuBtn.classList.toggle("is-open", next);
      menuBtn.setAttribute("aria-expanded", String(next));
      menuCard.setAttribute("aria-hidden", String(!next));
    }

    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    $$("a.menu-roll-link", menuCard).forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        toggleMenu(false);
        if (href && href.startsWith("#")) {
          e.preventDefault();
          const target = $(href);
          if (target) {
            if (state.lenis) {
              state.lenis.scrollTo(target, { offset: -20 });
            } else {
              target.scrollIntoView({ behavior: "smooth" });
            }
          }
        }
      });
    });

    document.addEventListener("click", (e) => {
      if (menuCard.classList.contains("is-open") && !menuCard.contains(e.target) && !menuBtn.contains(e.target)) {
        toggleMenu(false);
      }
    });
  }

  /* ---------- 3. 全页微光粒子环境 Canvas（已移除粗蓝线条，保持精致通透光感） ---------- */
  function initGlobalAmbientCanvas() {
    if (window.__TY_FX_WEBGL) return;
    const canvas = $("#lusionHeroCanvas");
    if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0,
      h = 0;
    let mx = 0.5,
      my = 0.5,
      tmx = 0.5,
      tmy = 0.5;

    const particles = Array.from({ length: 48 }, (_, i) => ({
      x: Math.random(),
      y: Math.random(),
      r: 1.2 + (i % 4) * 0.75,
      vx: (Math.random() - 0.5) * 0.00032,
      vy: (Math.random() - 0.5) * 0.00032,
      depth: 0.4 + Math.random() * 0.9,
    }));

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
      h = canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
    }
    resize();
    window.addEventListener("resize", resize);

    window.addEventListener("mousemove", (e) => {
      tmx = e.clientX / Math.max(window.innerWidth, 1);
      tmy = e.clientY / Math.max(window.innerHeight, 1);
    });

    function frame() {
      mx += (tmx - mx) * 0.05;
      my += (tmy - my) * 0.05;

      const scrollShift = (window.scrollY || 0) * 0.0014;
      ctx.clearRect(0, 0, w, h);
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";

      // 柔和微光场随滚动和鼠标呼吸移动（无粗线条）
      const gx1 = w * (0.62 + Math.sin(scrollShift) * 0.14 + (mx - 0.5) * 0.14);
      const gy1 = h * (0.4 + Math.cos(scrollShift * 0.8) * 0.12 + (my - 0.5) * 0.14);
      const grad1 = ctx.createRadialGradient(gx1, gy1, 10, gx1, gy1, Math.max(w, h) * 0.52);
      grad1.addColorStop(0, isDark ? "rgba(92, 225, 230, 0.12)" : "rgba(6, 182, 212, 0.1)");
      grad1.addColorStop(0.6, isDark ? "rgba(59, 130, 246, 0.05)" : "rgba(129, 140, 248, 0.05)");
      grad1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad1;
      ctx.fillRect(0, 0, w, h);

      const gx2 = w * (0.22 - Math.sin(scrollShift * 0.7) * 0.1);
      const gy2 = h * (0.76 + Math.sin(scrollShift) * 0.1);
      const grad2 = ctx.createRadialGradient(gx2, gy2, 10, gx2, gy2, Math.max(w, h) * 0.44);
      grad2.addColorStop(0, isDark ? "rgba(129, 140, 248, 0.09)" : "rgba(56, 189, 248, 0.08)");
      grad2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad2;
      ctx.fillRect(0, 0, w, h);

      // 景深悬浮微粒
      const scrollParallaxY = ((window.scrollY || 0) * 0.0003) % 1;
      for (const p of particles) {
        p.x = (p.x + p.vx + 1) % 1;
        p.y = (p.y + p.vy + 1) % 1;
        const px = p.x * w + (mx - 0.5) * 28 * p.depth;
        const py = ((p.y - scrollParallaxY * p.depth + 2) % 1) * h + (my - 0.5) * 22 * p.depth;
        ctx.beginPath();
        ctx.arc(px, py, p.r, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? "rgba(240, 241, 250, 0.24)" : "rgba(43, 46, 58, 0.14)";
        ctx.fill();
      }

      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ---------- 渲染导航、第2页板块矩阵与画廊 ---------- */
  function getCategoryCount(catId) {
    const works = state.data?.works || [];
    if (catId === "all") return works.length;
    return works.filter((w) => w.category === catId).length;
  }

  function renderHeroChips() {
    const host = $("#heroCategoryChips");
    if (!host || !state.data) return;
    // 纯净展现 01~06 板块，移除框选处多余统计数字
    host.innerHTML = state.data.categories
      .map(
        (cat) => `
          <button type="button" class="hero-cat-chip" data-jump-cat="${escapeHtml(cat.id)}">
            <span class="chip-num">${escapeHtml(cat.num)}</span>
            <span>${escapeHtml(cat.name)}</span>
          </button>
        `
      )
      .join("");

    $$("[data-jump-cat]", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const catId = btn.dataset.jumpCat;
        selectCategory(catId);
        const galleryEl = $("#home-featured");
        if (galleryEl) {
          if (state.lenis) state.lenis.scrollTo(galleryEl, { offset: -20 });
          else galleryEl.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  function renderCategoryTabs() {
    const host = $("#categoryTabs");
    if (!host || !state.data) return;
    const total = getCategoryCount("all");

    const tabsHtml = [
      `<button type="button" class="cat-tab ${state.activeCategory === "all" ? "is-active" : ""}" data-cat="all" role="tab" aria-selected="${state.activeCategory === "all"}">
        <span>全部作品</span>
        <span class="tab-count">${String(total).padStart(2, "0")}</span>
      </button>`,
      ...state.data.categories.map((cat) => {
        const count = getCategoryCount(cat.id);
        const isActive = state.activeCategory === cat.id;
        return `
          <button type="button" class="cat-tab ${isActive ? "is-active" : ""} ${count === 0 ? "is-reserved" : ""}" data-cat="${escapeHtml(cat.id)}" role="tab" aria-selected="${isActive}">
            <span>${escapeHtml(cat.num)} ${escapeHtml(cat.name)}</span>
            <span class="tab-count">${count > 0 ? String(count).padStart(2, "0") : "标准"}</span>
          </button>
        `;
      }),
    ];

    host.innerHTML = tabsHtml.join("");

    $$(".cat-tab", host).forEach((btn) => {
      btn.addEventListener("click", () => selectCategory(btn.dataset.cat));
    });
  }

  function updateSectionHeader() {
    const enEl = $("#activeCategoryEn");
    const headEl = $("#activeCategoryHeading");
    const descEl = $("#activeCategoryDesc");
    const specBtn = $("#openActiveCraftSpecBtn");
    if (!enEl || !headEl || !descEl || !state.data) return;

    if (state.activeCategory === "all") {
      enEl.textContent = "SELECTED ARCHIVE · ALL 06 DISCIPLINES";
      headEl.textContent = "全部商业视觉作品集";
      descEl.textContent =
        "全部作品独立单卡陈列，保留原生构图比例；鼠标悬停平滑上浮放大，点击开启全屏高清细节检视。";
      if (specBtn) specBtn.style.display = "none";
    } else {
      const cat = state.data.categories.find((c) => c.id === state.activeCategory);
      if (cat) {
        enEl.textContent = `${cat.num} // ${cat.en}`;
        headEl.textContent = cat.name;
        descEl.textContent = cat.desc;
        if (specBtn) {
          specBtn.style.display = "inline-flex";
          specBtn.dataset.specCat = cat.id;
        }
      }
    }
  }

  function getFilteredWorks() {
    const works = state.data?.works || [];
    const q = state.searchQuery.trim().toLowerCase();

    return works.filter((w) => {
      const matchCat = state.activeCategory === "all" || w.category === state.activeCategory;
      if (!matchCat) return false;
      if (!q) return true;
      const haystack = [w.title, w.subtitle, w.client, w.specs, w.description, ...(w.tags || [])]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  function getCategoryNameById(catId) {
    const cat = (state.data?.categories || []).find((c) => c.id === catId);
    return cat ? `${cat.num} · ${cat.name}` : catId;
  }

  function sortWorksByOrientation(works) {
    // 竖版 (<0.92) -> 方图 (0.92~1.12) -> 横版 (>1.12)
    const getGroup = (ar) => (ar < 0.92 ? 0 : ar <= 1.12 ? 1 : 2);
    return works
      .map((w, idx) => ({ w, idx, ar: Number(w.aspectRatio) || 1 }))
      .sort((a, b) => {
        const ga = getGroup(a.ar);
        const gb = getGroup(b.ar);
        if (ga !== gb) return ga - gb;
        if (ga === 0) return a.ar - b.ar || a.idx - b.idx;
        return b.ar - a.ar || a.idx - b.idx;
      })
      .map((item) => item.w);
  }

  function buildBalancedColumns(works) {
    const cols = [[], []];
    const heights = [0, 0];
    for (const work of works) {
      const ar = Math.max(0.4, Number(work.aspectRatio) || 1);
      const estHeight = 1 / ar + 0.34;
      const targetCol = heights[0] <= heights[1] ? 0 : 1;
      cols[targetCol].push(work);
      heights[targetCol] += estHeight;
    }
    return cols;
  }

  function renderGallery(useFlip = false) {
    const host = $("#galleryDynamicHost");
    if (!host || !state.data) return;

    const existingCards = $$(".work-card", host);
    let flipState = null;
    if (useFlip && window.Flip && existingCards.length > 0) {
      flipState = window.Flip.getState(existingCards);
    }

    const filtered = getFilteredWorks();

    if (filtered.length === 0) {
      const cat = state.data.categories.find((c) => c.id === state.activeCategory);
      if (cat && !state.searchQuery.trim()) {
        host.innerHTML = renderReservedCategoryShowcase(cat);
        bindReservedActions(host, cat);
      } else {
        host.innerHTML = `
          <div class="reserved-showcase" style="grid-template-columns:1fr;text-align:center;">
            <div>
              <span class="reserved-badge">NO MATCHING WORKS</span>
              <h3 class="reserved-title">未找到匹配的作品</h3>
              <p class="reserved-desc" style="margin-inline:auto;max-width:48ch;">
                当前筛选或搜索关键词下暂无结果，可清空搜索词浏览全集。
              </p>
              <button type="button" class="btn-primary-lg" id="clearFilterBtn" style="margin:0 auto;">查看全部作品</button>
            </div>
          </div>
        `;
        $("#clearFilterBtn", host)?.addEventListener("click", () => {
          state.searchQuery = "";
          if ($("#workSearchInput")) $("#workSearchInput").value = "";
          selectCategory("all");
        });
      }
      return;
    }

    let gridHtml = "";
    if (state.layoutMode === "uniform") {
      gridHtml = `
        <div class="works-grid is-uniform" id="worksGrid">
          ${filtered.map((work) => renderWorkCard(work)).join("")}
        </div>
      `;
    } else {
      const sorted = sortWorksByOrientation(filtered);
      const [leftCol, rightCol] = buildBalancedColumns(sorted);
      gridHtml = `
        <div class="works-masonry" id="worksGrid">
          <div class="works-col">${leftCol.map((work) => renderWorkCard(work)).join("")}</div>
          <div class="works-col">${rightCol.map((work) => renderWorkCard(work)).join("")}</div>
        </div>
      `;
    }

    host.innerHTML = gridHtml;
    bindWorkCardInteractions(host);

    if (flipState && window.Flip) {
      const nextCards = $$(".work-card", host);
      if (nextCards.length > 0) {
        window.Flip.from(flipState, {
          targets: nextCards,
          duration: 0.58,
          ease: "expo.out",
          stagger: 0.03,
          absolute: false,
          onEnter: (els) => window.gsap?.fromTo(els, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }),
          onComplete: () => setupGalleryScrollAnimations(false),
        });
      }
    } else {
      setupGalleryScrollAnimations(true);
    }
  }

  /* 全部作品均以独立单卡拆分展示（无2栏通栏大卡，无内嵌缩略条） */
  function renderWorkCard(work) {
    const aspect = work.aspectRatio ? work.aspectRatio : 1;

    return `
      <article class="work-card" data-flip-id="${escapeHtml(work.id)}" data-work-id="${escapeHtml(work.id)}" tabindex="0" role="button" aria-label="检视作品：${escapeHtml(work.title)}">
        <div class="work-card-media" style="aspect-ratio:${aspect};">
          <img src="${escapeHtml(work.coverThumb)}" alt="${escapeHtml(work.title)}" loading="lazy" decoding="async" />
          <div class="work-card-badges">
            <span class="badge-glass">${escapeHtml(getCategoryNameById(work.category))}</span>
            ${work.featured ? `<span class="badge-gold">FEATURED</span>` : ""}
          </div>
        </div>

        <div class="work-card-body">
          <div class="work-card-meta">
            <span>${escapeHtml((work.tags || []).slice(0, 3).join(" • ") || work.client || "COMMERCIAL")}</span>
            <span>${escapeHtml(work.year || "2026")}</span>
          </div>
          <h3 class="work-card-title char-roll-title">${buildCharRollTitle(work.title)}</h3>
          <p class="work-card-sub">${escapeHtml(work.specs || work.subtitle || "")}</p>
          <div class="work-card-footer">
            <div class="work-tags">
              ${(work.tags || [])
                .slice(0, 3)
                .map((t) => `<span class="work-tag">${escapeHtml(t)}</span>`)
                .join("")}
            </div>
            <div class="work-palette-dots" aria-hidden="true">
              ${(work.palette || [])
                .slice(0, 4)
                .map((hex) => `<span class="palette-dot" style="background:${escapeHtml(hex)};"></span>`)
                .join("")}
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderReservedCategoryShowcase(cat) {
    const deliverables = (cat.craftStandards || cat.deliverables || [])
      .map(
        (d) => `
      <div class="deliverable-item">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>${escapeHtml(d)}</span>
      </div>`
      )
      .join("");

    return `
      <div class="reserved-showcase">
        <div>
          <span class="reserved-badge">${escapeHtml(cat.num)} // SERVICE STANDARD · 服务标准与交付规范</span>
          <h3 class="reserved-title">${escapeHtml(cat.name)}</h3>
          <p class="reserved-desc">${escapeHtml(cat.desc)}</p>

          <div class="deliverables-grid">${deliverables}</div>

          <div style="display:flex;flex-wrap:wrap;gap:12px;">
            <button type="button" class="btn-primary-lg js-copy-wechat">
              <span>咨询「${escapeHtml(cat.name)}」 · 微信 <strong class="js-wechat-text">${escapeHtml(state.data?.siteConfig?.wechat || "z2728588294")}</strong></span>
            </button>
            <button type="button" class="btn-secondary-lg" id="reservedOpenSpecBtn">查看详细印前与施工规范</button>
          </div>
        </div>

        <div class="reserved-blueprint-box">
          <div class="blueprint-wireframe">
            <span class="mono-label" style="color:var(--spline-primary);">DELIVERY FORMATS // ${escapeHtml(cat.formats || cat.en)}</span>
            <p style="font-size:1.05rem;font-weight:500;max-width:26ch;">
              已为该业务备妥标准刀版、矢量与工艺交付规范，欢迎添加微信索取同行业精选落地方案
            </p>
            <span class="mono-label">DIRECT WECHAT // ${escapeHtml(state.data?.siteConfig?.wechat || "z2728588294")}</span>
          </div>
        </div>
      </div>
    `;
  }

  function bindReservedActions(host, cat) {
    $("#reservedOpenSpecBtn", host)?.addEventListener("click", () => {
      openCraftSpecModal(cat.id);
    });

    $$(".js-copy-wechat", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const wc = state.data?.siteConfig?.wechat || "z2728588294";
        copyToClipboard(wc, `已复制微信号 ${wc}，请打开微信添加咨询`);
      });
    });
  }

  function renderCapabilitiesMatrix() {
    const host = $("#capabilitiesMatrix");
    if (!host || !state.data) return;

    host.innerHTML = state.data.categories
      .map((cat) => {
        const count = getCategoryCount(cat.id);
        const ctaLabel = cat.ctaText || (count > 0 ? "查看精选作品 →" : "查看服务标准 →");
        return `
          <article class="cap-cell" data-cap-cat="${escapeHtml(cat.id)}" data-has-works="${count > 0 ? "1" : "0"}" tabindex="0" role="button">
            <div>
              <div class="cap-cell-top">
                <span class="cap-num">${escapeHtml(cat.num)}</span>
                <button type="button" class="cap-spec-trigger" data-spec-cat="${escapeHtml(cat.id)}" title="查看详细服务标准与印前规范">交付规范</button>
              </div>
              <h3 class="cap-title" style="margin-top:16px;">${escapeHtml(cat.name)}</h3>
              <div class="cap-en">${escapeHtml(cat.en)}</div>
              <p class="cap-desc">${escapeHtml(cat.desc)}</p>
            </div>
            <div>
              <ul class="cap-deliverables">
                ${(cat.deliverables || []).map((d) => `<li>${escapeHtml(d)}</li>`).join("")}
              </ul>
              <div class="cap-action-hint">
                <span>${escapeHtml(ctaLabel)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");

    // 点击卡片右上角「交付规范」按钮，直接弹窗展示专业印前/施工标准
    $$(".cap-spec-trigger", host).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        openCraftSpecModal(btn.dataset.specCat);
      });
    });

    // 点击卡片主体：有作品跳至对应作品画廊，无作品(05/06)直接弹出服务标准弹窗
    $$(".cap-cell", host).forEach((cell) => {
      const trigger = () => {
        const catId = cell.dataset.capCat;
        const hasWorks = cell.dataset.hasWorks === "1";
        if (!hasWorks) {
          openCraftSpecModal(catId);
          return;
        }
        selectCategory(catId);
        const galleryEl = $("#home-featured");
        if (galleryEl) {
          if (state.lenis) state.lenis.scrollTo(galleryEl, { offset: -20 });
          else galleryEl.scrollIntoView({ behavior: "smooth" });
        }
      };
      cell.addEventListener("click", trigger);
      cell.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          trigger();
        }
      });
    });
  }

  /* ---------- 服务标准 / 交付规范弹窗 (#craftSpecModal) ---------- */
  function openCraftSpecModal(catId) {
    const cat = (state.data?.categories || []).find((c) => c.id === catId);
    const modal = $("#craftSpecModal");
    if (!cat || !modal) return;

    $("#craftModalNum").textContent = `${cat.num} // SERVICE STANDARD & DELIVERABLES`;
    $("#craftModalTitle").textContent = `${cat.name} · 服务标准与交付规范`;
    $("#craftModalEn").textContent = cat.en || "";
    $("#craftModalDesc").textContent = cat.desc || "";
    $("#craftModalFormats").textContent = cat.formats || "AI · CDR · PSD · PDF";

    $("#craftModalTags").innerHTML = (cat.deliverables || [])
      .map((t) => `<span class="work-tag">${escapeHtml(t)}</span>`)
      .join("");

    const specs = cat.craftStandards || cat.deliverables || [];
    $("#craftModalList").innerHTML = specs
      .map(
        (line) => `
      <li>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span>${escapeHtml(line)}</span>
      </li>`
      )
      .join("");

    const count = getCategoryCount(cat.id);
    const jumpBtn = $("#craftModalJumpWorksBtn");
    if (jumpBtn) {
      if (count > 0) {
        jumpBtn.style.display = "inline-flex";
        jumpBtn.textContent = `查看该板块 ${count} 件精选作品 →`;
        jumpBtn.onclick = () => {
          closeCraftSpecModal();
          selectCategory(cat.id);
          const galleryEl = $("#home-featured");
          if (galleryEl) {
            if (state.lenis) state.lenis.scrollTo(galleryEl, { offset: -20 });
            else galleryEl.scrollIntoView({ behavior: "smooth" });
          }
        };
      } else {
        jumpBtn.style.display = "none";
      }
    }

    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    state.lenis?.stop();
  }

  function closeCraftSpecModal() {
    const modal = $("#craftSpecModal");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    state.lenis?.start();
  }

  function selectCategory(catId) {
    state.activeCategory = catId;
    renderCategoryTabs();
    updateSectionHeader();
    renderGallery(true);
  }

  function renderAll() {
    renderHeroChips();
    renderCategoryTabs();
    updateSectionHeader();
    renderGallery(false);
    renderCapabilitiesMatrix();
  }

  /* ---------- 卡片悬停：纯正垂直上浮 + 内部缩放（严格去除倾斜） ---------- */
  function bindWorkCardInteractions(scope) {
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    $$(".work-card", scope).forEach((card) => {
      const open = () => openLightbox(card.dataset.workId);
      card.addEventListener("click", open);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });

      if (canHover && !prefersReduced && window.gsap) {
        const mediaImg = $(".work-card-media > img", card);

        card.addEventListener("mouseenter", () => {
          window.gsap.to(card, {
            y: -12,
            scale: 1.024,
            duration: 0.48,
            ease: "expo.out",
            overwrite: "auto",
          });
          if (mediaImg) {
            window.gsap.to(mediaImg, {
              scale: 1.08,
              duration: 0.6,
              ease: "expo.out",
              overwrite: "auto",
            });
          }
        });

        card.addEventListener("mouseleave", () => {
          window.gsap.to(card, {
            y: 0,
            scale: 1,
            duration: 0.52,
            ease: "expo.out",
            overwrite: "auto",
          });
          if (mediaImg) {
            window.gsap.to(mediaImg, {
              scale: 1,
              duration: 0.6,
              ease: "expo.out",
              overwrite: "auto",
            });
          }
        });
      }
    });
  }

  /* ---------- 三合一高定灯箱 ---------- */
  function buildLightboxPlaylist(primaryWork, customWorkIds = null) {
    const allWorks = state.data?.works || [];
    let worksList = [];

    if (Array.isArray(customWorkIds) && customWorkIds.length > 0) {
      worksList = customWorkIds.map((id) => allWorks.find((w) => w.id === id)).filter(Boolean);
    } else if (primaryWork.gallery && primaryWork.gallery.length > 1) {
      worksList = [primaryWork];
    } else if (state.activeCategory !== "all" || state.searchQuery.trim()) {
      worksList = getFilteredWorks();
    } else {
      const sameCat = allWorks.filter((w) => w.category === primaryWork.category);
      worksList = sameCat.length > 1 ? sameCat : allWorks;
    }

    if (!worksList.some((w) => w.id === primaryWork.id)) {
      worksList = [primaryWork, ...worksList];
    }

    const entries = [];
    let initialIndex = 0;
    let foundInitial = false;
    worksList.forEach((w) => {
      const g =
        w.gallery && w.gallery.length
          ? w.gallery
          : [{ full: w.coverFull, thumb: w.coverThumb, caption: w.title }];
      g.forEach((item, idx) => {
        if (!foundInitial && w.id === primaryWork.id && idx === 0) {
          initialIndex = entries.length;
          foundInitial = true;
        }
        entries.push({
          work: w,
          full: item.full || w.coverFull,
          thumb: item.thumb || w.coverThumb,
          caption: item.caption || w.title,
        });
      });
    });

    return { entries, initialIndex };
  }

  function updateLightboxSidebar(work) {
    if (!work) return;
    state.lightboxWorkObj = work;
    state.lightboxWorkId = work.id;

    $("#lightboxTopTitle").textContent = work.title;
    $("#lightboxCatBadge").textContent = getCategoryNameById(work.category);
    $("#lightboxTitle").textContent = work.title;
    $("#lightboxSubtitle").textContent = work.subtitle || "";
    $("#lightboxDesc").textContent = work.description || "";
    $("#lightboxClient").textContent = work.client || "商业委托";
    $("#lightboxYear").textContent = work.year || "2026";
    $("#lightboxSpecs").textContent = work.specs || "高定商业设计交付";

    $("#lightboxPalette").innerHTML = (work.palette || [])
      .map(
        (hex) => `
        <button type="button" class="swatch-chip" data-copy-hex="${escapeHtml(hex)}" title="点击复制色值 ${escapeHtml(hex)}">
          <span class="swatch-color-box" style="background:${escapeHtml(hex)};"></span>
          <span>${escapeHtml(hex)}</span>
        </button>`
      )
      .join("");

    $$("[data-copy-hex]", $("#lightboxPalette")).forEach((btn) => {
      btn.addEventListener("click", () => copyToClipboard(btn.dataset.copyHex, `已复制色值 ${btn.dataset.copyHex}`));
    });

    $("#lightboxTags").innerHTML = (work.tags || [])
      .map((t) => `<span class="work-tag">${escapeHtml(t)}</span>`)
      .join("");
  }

  function openLightbox(workId, customWorkIds = null) {
    const work = (state.data?.works || []).find((w) => w.id === workId);
    if (!work) return;
    openLightboxWithWorkObject(work, customWorkIds);
  }

  function openLightboxWithWorkObject(work, customWorkIds = null) {
    const { entries, initialIndex } = buildLightboxPlaylist(work, customWorkIds);
    state.lightboxPlaylist = entries;
    state.lightboxIndex = initialIndex;
    state.lightboxZoomed = false;
    state.lightboxMode = work.layout === "long-scroll" ? "long-scroll" : "frame";

    const modal = $("#caseLightbox");
    if (!modal) return;

    updateLightboxSidebar(work);
    renderLightboxStage();
    modal.classList.add("is-open");
    document.body.style.overflow = "hidden";
    state.lenis?.stop();
  }

  function renderLightboxStage() {
    const work = state.lightboxWorkObj;
    if (!work) return;
    const playlist =
      state.lightboxPlaylist && state.lightboxPlaylist.length
        ? state.lightboxPlaylist
        : (work.gallery && work.gallery.length
            ? work.gallery
            : [{ full: work.coverFull, thumb: work.coverThumb, caption: work.title }]
          ).map((item) => ({
            work,
            full: item.full || work.coverFull,
            thumb: item.thumb || work.coverThumb,
            caption: item.caption || work.title,
          }));

    const canvas = $("#lightboxCanvas");
    const filmstrip = $("#lightboxFilmstrip");
    const counter = $("#lightboxCounter");
    const captionEl = $("#lightboxImageCaption");
    const modeLabel = $("#lightboxModeLabel");
    const zoomBtn = $("#lightboxZoomBtn");

    if (modeLabel) {
      modeLabel.textContent = state.lightboxMode === "long-scroll" ? "切回画框模式" : "切换长图模式";
    }

    if (state.lightboxMode === "long-scroll") {
      canvas.classList.add("is-long-scroll");
      canvas.innerHTML = `
        <div class="long-scroll-stack">
          ${playlist
            .map((item) => `<img src="${escapeHtml(item.full || item.thumb)}" alt="${escapeHtml(item.caption || work.title)}" />`)
            .join("")}
        </div>
      `;
      filmstrip.style.display = "none";
      if (zoomBtn) zoomBtn.style.display = "none";
      if (counter) counter.textContent = `LONG SCROLL · ${playlist.length} 屏`;
      if (captionEl) captionEl.textContent = "沉浸式长图无缝浏览";
      return;
    }

    canvas.classList.remove("is-long-scroll");
    if (zoomBtn) {
      zoomBtn.style.display = "inline-flex";
      zoomBtn.querySelector("span").textContent = state.lightboxZoomed ? "还原比例 (1x)" : "放大细节 (1.55x)";
    }

    const activeItem = playlist[state.lightboxIndex] || playlist[0];
    if (activeItem?.work && activeItem.work.id !== state.lightboxWorkId) {
      updateLightboxSidebar(activeItem.work);
    }

    if (counter) {
      counter.textContent = `${String(state.lightboxIndex + 1).padStart(2, "0")} / ${String(playlist.length).padStart(2, "0")}`;
    }
    if (captionEl) {
      captionEl.textContent = activeItem.caption || state.lightboxWorkObj?.title || "";
    }

    canvas.innerHTML = `<img src="${escapeHtml(activeItem.full || activeItem.thumb)}" alt="${escapeHtml(activeItem.caption || state.lightboxWorkObj?.title || "")}" class="lightbox-main-img ${state.lightboxZoomed ? "is-zoomed" : ""}" id="lightboxMainImg" />`;
    $("#lightboxMainImg", canvas)?.addEventListener("click", () => {
      state.lightboxZoomed = !state.lightboxZoomed;
      renderLightboxStage();
    });

    if (playlist.length > 1) {
      filmstrip.style.display = "flex";
      filmstrip.innerHTML = playlist
        .map(
          (item, idx) => `
          <button type="button" class="filmstrip-item ${idx === state.lightboxIndex ? "is-active" : ""}" data-film-idx="${idx}" aria-label="查看第 ${idx + 1} 项：${escapeHtml(item.caption || "")}">
            <img src="${escapeHtml(item.thumb || item.full)}" alt="${escapeHtml(item.caption || "")}" />
          </button>`
        )
        .join("");

      $$(".filmstrip-item", filmstrip).forEach((btn) => {
        btn.addEventListener("click", () => {
          state.lightboxIndex = Number(btn.dataset.filmIdx);
          state.lightboxZoomed = false;
          renderLightboxStage();
        });
      });
    } else {
      filmstrip.style.display = "none";
    }
  }

  function closeLightbox() {
    const modal = $("#caseLightbox");
    if (!modal) return;
    modal.classList.remove("is-open");
    document.body.style.overflow = "";
    state.lightboxWorkId = null;
    state.lenis?.start();
  }

  function bindGlobalUiEvents() {
    $$(".hero-single-logo-card").forEach((el) => {
      const open = () => openLightbox(el.dataset.workId);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    });

    $$(".js-copy-wechat").forEach((btn) => {
      btn.addEventListener("click", () => {
        const wc = state.data?.siteConfig?.wechat || "z2728588294";
        copyToClipboard(wc, `已复制微信号 ${wc}，请打开微信添加设计师`);
      });
    });

    $("#workSearchInput")?.addEventListener("input", (e) => {
      state.searchQuery = e.target.value || "";
      renderGallery(false);
    });

    $$(".layout-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        $$(".layout-btn").forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        state.layoutMode = btn.dataset.layout;
        renderGallery(true);
      });
    });

    $("#openActiveCraftSpecBtn")?.addEventListener("click", () => {
      if (state.activeCategory && state.activeCategory !== "all") {
        openCraftSpecModal(state.activeCategory);
      }
    });

    $("#craftModalCloseBtn")?.addEventListener("click", closeCraftSpecModal);
    $("#craftSpecModal")?.addEventListener("click", (e) => {
      if (e.target.id === "craftSpecModal") closeCraftSpecModal();
    });

    $("#lightboxCloseBtn")?.addEventListener("click", closeLightbox);
    $("#lightboxZoomBtn")?.addEventListener("click", () => {
      state.lightboxZoomed = !state.lightboxZoomed;
      renderLightboxStage();
    });
    $("#lightboxModeToggleBtn")?.addEventListener("click", () => {
      state.lightboxMode = state.lightboxMode === "frame" ? "long-scroll" : "frame";
      state.lightboxZoomed = false;
      renderLightboxStage();
    });

    $("#backToTopLink")?.addEventListener("click", (e) => {
      e.preventDefault();
      if (state.lenis) state.lenis.scrollTo(0);
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if ($("#craftSpecModal")?.classList.contains("is-open")) {
          closeCraftSpecModal();
          return;
        }
        if ($("#caseLightbox")?.classList.contains("is-open")) {
          closeLightbox();
          return;
        }
      }
      if ($("#caseLightbox")?.classList.contains("is-open")) {
        const playlistLen = state.lightboxPlaylist?.length || 0;
        if (e.key === "ArrowRight" && playlistLen > 1) {
          state.lightboxIndex = (state.lightboxIndex + 1) % playlistLen;
          state.lightboxZoomed = false;
          renderLightboxStage();
        }
        if (e.key === "ArrowLeft" && playlistLen > 1) {
          state.lightboxIndex = (state.lightboxIndex - 1 + playlistLen) % playlistLen;
          state.lightboxZoomed = false;
          renderLightboxStage();
        }
      }
    });
  }

  /* ---------- 首屏入场 + ScrollTrigger 滚动编排 ---------- */
  function playHeroEntrance() {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !window.gsap) return;
    const gsap = window.gsap;

    const heroTitleEl = $("#heroTitleText");
    let heroChars = [];
    if (heroTitleEl && window.TYFX?.splitChars) {
      const lineEls = $$(".hero-title-line", heroTitleEl);
      if (lineEls.length > 0) {
        heroChars = lineEls.flatMap((lineEl) => window.TYFX.splitChars(lineEl));
      } else {
        heroChars = window.TYFX.splitChars(heroTitleEl);
      }
    }
    if (heroChars.length > 0) {
      gsap.from(heroChars, {
        yPercent: 110,
        rotate: 6,
        opacity: 0,
        duration: 0.9,
        stagger: 0.045,
        ease: "expo.out",
        clearProps: "transform,opacity",
      });
    } else if (heroTitleEl) {
      gsap.from(heroTitleEl, {
        y: 24,
        opacity: 0,
        duration: 0.7,
        ease: "expo.out",
        clearProps: "transform,opacity",
      });
    }

    gsap.from(".hero-title-en", {
      y: 16,
      opacity: 0,
      duration: 0.65,
      ease: "expo.out",
      clearProps: "transform,opacity",
    });

    gsap.from(".hero-eyebrow, .hero-subtitle, .hero-cta-row", {
      y: 22,
      opacity: 0,
      duration: 0.65,
      stagger: 0.045,
      ease: "expo.out",
      clearProps: "transform,opacity",
    });

    gsap.from(".hero-cat-chip", {
      y: 14,
      opacity: 0,
      duration: 0.5,
      stagger: 0.03,
      delay: 0.08,
      ease: "expo.out",
      clearProps: "transform,opacity",
    });

    gsap.from(".hero-single-logo-card", {
      y: 28,
      scale: 0.95,
      opacity: 0,
      duration: 0.78,
      ease: "expo.out",
      clearProps: "transform,opacity",
    });
  }

  function setupGalleryScrollAnimations(withEntrance = true) {
    galleryTriggers.forEach((st) => st.kill());
    galleryTriggers = [];

    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !window.gsap || !window.ScrollTrigger) return;

    const cards = $$("#galleryDynamicHost .work-card");
    cards.forEach((card, idx) => {
      if (withEntrance) {
        const revealAnim = window.gsap.fromTo(
          card,
          { opacity: 0, y: 56, clipPath: "inset(8% 0% 0% 0% round 20px)" },
          {
            opacity: 1,
            y: 0,
            clipPath: "inset(0% 0% 0% 0% round 20px)",
            duration: 0.85,
            delay: (idx % 2) * 0.08,
            ease: "expo.out",
            clearProps: "clipPath,transform",
            scrollTrigger: {
              trigger: card,
              start: "top 92%",
              toggleActions: "play none none reverse",
            },
          }
        );
        if (revealAnim.scrollTrigger) galleryTriggers.push(revealAnim.scrollTrigger);
      }

      const img = $(".work-card-media > img", card);
      if (img) {
        const scrubAnim = window.gsap.fromTo(
          img,
          { yPercent: -5 },
          {
            yPercent: 5,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.5,
            },
          }
        );
        if (scrubAnim.scrollTrigger) galleryTriggers.push(scrubAnim.scrollTrigger);
      }
    });

    window.ScrollTrigger.refresh();
  }

  function initScrollChoreography() {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gsap = window.gsap;
    const ScrollTrigger = window.ScrollTrigger;

    if (!prefersReduced && window.Lenis) {
      state.lenis = new window.Lenis({
        duration: 1.15,
        easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
      });
      window.__tyLenis = state.lenis;

      const progressFill = $("#scrollProgressFill");
      state.lenis.on("scroll", ({ progress }) => {
        if (progressFill) progressFill.style.width = `${(progress * 100).toFixed(2)}%`;
        ScrollTrigger?.update();
      });

      if (gsap) {
        gsap.ticker.add((time) => {
          state.lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);
      } else {
        function raf(time) {
          state.lenis.raf(time);
          requestAnimationFrame(raf);
        }
        requestAnimationFrame(raf);
      }
    }

    if (prefersReduced || !gsap || !ScrollTrigger) return;

    // 1. 首屏单LOGO整组展台与轨道同步轻微视差（保持绝对同心且不遮挡右上角）
    gsap
      .timeline({
        scrollTrigger: {
          trigger: "#home-hero",
          start: "top top",
          end: "bottom top",
          scrub: 0.6,
        },
      })
      .to(".hero-stage-wrap", { yPercent: 5, scale: 0.96, ease: "none" }, 0)
      .to(".hero-copy", { yPercent: 10, opacity: 0.45, ease: "none" }, 0);

    // 2. 第 2 页：六大业务板块逐格浮现
    gsap.from(".cap-cell", {
      y: 40,
      opacity: 0,
      duration: 0.78,
      stagger: 0.08,
      ease: "expo.out",
      clearProps: "transform",
      scrollTrigger: { trigger: "#capabilitiesMatrix", start: "top 86%", toggleActions: "play none none reverse" },
    });

    // 3. 第 3 页作品画廊标题、第 4 页流程与页脚揭示
    gsap.from("#home-featured-title-top > *", {
      y: 32,
      opacity: 0,
      duration: 0.8,
      stagger: 0.08,
      ease: "expo.out",
      clearProps: "transform",
      scrollTrigger: { trigger: "#home-featured-title-top", start: "top 86%", toggleActions: "play none none reverse" },
    });

    gsap.from(".process-step", {
      y: 32,
      opacity: 0,
      duration: 0.7,
      stagger: 0.08,
      ease: "expo.out",
      clearProps: "transform",
      scrollTrigger: { trigger: ".process-grid", start: "top 86%", toggleActions: "play none none reverse" },
    });

    gsap.from(".footer-cta-grid", {
      y: 30,
      opacity: 0,
      duration: 0.8,
      ease: "expo.out",
      clearProps: "transform",
      scrollTrigger: { trigger: ".site-footer", start: "top 90%", toggleActions: "play none none reverse" },
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
    initFloatingMenu();
    bindGlobalUiEvents();
    loadPortfolioData();
  });
})();
