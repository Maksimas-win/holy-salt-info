/*!
 * BH Intro — Premium Salt Particle Animation
 * bukiski-hram.net
 *
 * Архитектура: Canvas 2D (частицы) + CSS 3D (текст) + vanilla JS
 * Зависимостей: 0
 * Вес: ~7KB minified
 *
 * Публичный API:
 *   BHIntro.skip()   — немедленно закрыть интро
 *   BHIntro.reset()  — сбросить sessionStorage (интро сыграет снова)
 *   BHIntro.disable() — полностью отключить (записать постоянный флаг)
 *
 * Событие: document.dispatchEvent(new CustomEvent('bhIntroComplete'))
 * после завершения анимации.
 *
 * Настройка: все параметры — в объекте CFG ниже.
 */

/* global window, document, sessionStorage */
'use strict';

(function (global) {

  // ─── Конфигурация ──────────────────────────────────────────────────
  // Изменяй эти значения для настройки анимации.
  const CFG = Object.freeze({

    // Ключи хранилища
    SESSION_KEY:   'bh_intro_v1',     // sessionStorage — в рамках сессии
    DISABLE_KEY:   'bh_intro_off',    // localStorage — постоянное отключение

    // ─ Тайминг (мс) ────────────────────────────────────────────────
    // Общая схема:
    //   0               → overlay появляется
    //   SALT_START      → соль начинает сыпаться
    //   TEXT_GLOW       → текст начинает проявляться (blur reveal)
    //   TEXT_SOLID      → текст проясняется и становится чётким
    //   TEXT_SOLID + HOLD → финальное удержание — люди читают название
    //   → fade out → complete

    SALT_START:    500,   // соль начинает сыпаться сразу
    TEXT_GLOW:    2800,   // текст начинает появляться через 2.8с
    TEXT_SOLID:   4600,   // текст полностью чёткий на 4.6с
    HOLD:         3200,   // 3.2с держим название — можно прочитать и запомнить
    FADE_OUT:      900,   // плавный уход

    // Когда кнопка "Пропустить" становится активной
    SKIP_READY:   1800,

    // ─ Частицы ─────────────────────────────────────────────────────
    // Уменьши для слабых устройств, увеличь для более плотного снегопада
    PARTICLES_DESKTOP: 300,
    PARTICLES_MOBILE:  110,

    // ─ Физика ──────────────────────────────────────────────────────
    GRAVITY:          0.046,   // ускорение вниз (px/frame²)
    TERMINAL_VEL:     5.6,     // максимальная скорость падения
    AIR_RESIST:       0.993,   // горизонтальное торможение (< 1)

    // ─ Зона притяжения к тексту ─────────────────────────────────
    // Частицы слегка замедляются вблизи текста — усиливает иллюзию
    // «оседания соли» при формировании надписи
    TEXT_Y_FRAC:      0.58,    // текст расположен на 58% высоты viewport
    TEXT_ATTRACT_PX:  90,      // диапазон (px) выше/ниже текста
    TEXT_ATTRACT_K:   0.88,    // коэффициент торможения в этой зоне

    // ─ Мобильный брейкпоинт ──────────────────────────────────────
    MOBILE_BP: 768,
  });

  // Общее время анимации до начала fade-out
  const TOTAL_MS = CFG.TEXT_SOLID + CFG.HOLD;

  // ─── Вспомогательные функции ───────────────────────────────────────

  const lerp        = (a, b, t) => a + (b - a) * t;
  const clamp       = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand        = (lo, hi) => lo + Math.random() * (hi - lo);

  // Кривые ease — разные характеры движения
  const easeOutCubic  = t => 1 - Math.pow(1 - t, 3);
  const easeOutQuint  = t => 1 - Math.pow(1 - t, 5);
  const easeInOutSine = t => -(Math.cos(Math.PI * t) - 1) / 2;

  // ─── Состояние модуля ─────────────────────────────────────────────

  let _overlay    = null;
  let _canvas     = null;
  let _ctx        = null;
  let _textWrap   = null;
  let _textEl     = null;
  let _lineEl     = null;
  let _particles  = [];
  let _raf        = null;
  let _startTs    = 0;
  let _finished   = false;
  let _skipReady  = false;
  let _isMobile   = false;


  // ─── Создание DOM-структуры оверлея ───────────────────────────────

  function buildOverlay() {
    _overlay = document.createElement('div');
    _overlay.id = 'bh-intro';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-label', 'Вступительная анимация');
    _overlay.setAttribute('aria-modal', 'true');

    // Canvas для частиц
    _canvas = document.createElement('canvas');
    _canvas.id = 'bh-intro-canvas';
    _canvas.setAttribute('aria-hidden', 'true');

    // Обёртка текста
    _textWrap = document.createElement('div');
    _textWrap.className = 'bh-intro__text-wrap';
    _textWrap.setAttribute('aria-hidden', 'true'); // aria-hidden: текст дублируется в <title>

    _textEl = document.createElement('p');
    _textEl.className = 'bh-intro__text';
    _textEl.innerHTML =
      '<span class="bh-t-main">Соль мира сего</span>';

    _lineEl = document.createElement('span');
    _lineEl.className = 'bh-intro__line';
    _lineEl.setAttribute('aria-hidden', 'true');

    _textWrap.appendChild(_textEl);
    _textWrap.appendChild(_lineEl);

    // Кнопка «Пропустить»
    const skip = document.createElement('button');
    skip.className = 'bh-intro__skip';
    skip.setAttribute('type', 'button');
    skip.textContent = 'Пропустить  ›';
    skip.addEventListener('click', onSkipClick);

    _overlay.appendChild(_canvas);
    _overlay.appendChild(_textWrap);
    _overlay.appendChild(skip);

    // Вставить первым дочерним элементом <body>
    document.body.insertBefore(_overlay, document.body.firstChild);
  }

  function onSkipClick() {
    if (_skipReady) finish(/* immediate= */ true);
  }

  // ─── Ресайз canvas ────────────────────────────────────────────────

  function resizeCanvas() {
    _canvas.width  = window.innerWidth;
    _canvas.height = window.innerHeight;
  }

  // ─── Точка эмиссии частиц ─────────────────────────────────────────
  // Без соломки соль сыпется по всей ширине сверху —
  // как из невидимого рассеивателя над сценой.

  function emitOrigin() {
    return {
      x: rand(_canvas.width * 0.08, _canvas.width * 0.92), // случайная X по ширине
      y: rand(-8, 6),  // чуть выше верхнего края — появляются из ниоткуда
    };
  }

  // ─── Частица: фабрика ─────────────────────────────────────────────
  //
  // Каждая частица имитирует кристалл соли:
  //   - вытянутый эллипс (crystalShape: elongated)
  //   - перламутровое ядро с радиальным градиентом
  //   - мерцание (shimmerPhase/Speed) — разные у каждой частицы
  //   - warmth — доля тёплого золотистого оттенка
  //

  function makeParticle(origin) {
    return {
      x:  origin.x,
      y:  origin.y,
      vx: rand(-0.7, 0.7),
      vy: rand(0.5, 1.8),

      // Размер: 1.3..3.9px desktop, 1.2..3.2px mobile
      size: _isMobile ? rand(1.2, 3.2) : rand(1.3, 3.9),

      opacity:    0,
      opacityMax: rand(0.44, 0.93),

      angle: rand(0, Math.PI * 2),
      angV:  rand(-0.065, 0.065),     // угловая скорость (кристалл кувыркается)

      shimmerPhase: rand(0, Math.PI * 2),
      shimmerSpeed: rand(1.9, 4.4),   // Hz мерцания

      warmth:   rand(0, 0.65),        // 0 = холодный жемчуг, 1 = тёплое золото
      turbSeed: rand(0, 600),         // сдвиг фазы для ветрового шума

      active: false,
      delay:  0,  // Задержка от SALT_START до активации (мс)
    };
  }

  // ─── Инициализация пула частиц ────────────────────────────────────

  function initParticles() {
    const count = _isMobile ? CFG.PARTICLES_MOBILE : CFG.PARTICLES_DESKTOP;

    _particles = Array.from({ length: count }, (_, i) => {
      // Каждая частица стартует из своей случайной точки по ширине
      const p = makeParticle(emitOrigin());
      // Задержки распределены по 2.5с — соль нарастает постепенно
      p.delay = (i / count) * 2500;
      return p;
    });
  }

  // ─── Ветровая турбулентность ─────────────────────────────────────
  //
  // Лёгкие несинхронные колебания по X — воздушный поток.
  // Две частоты создают нерегулярность.
  //

  function windX(x, t, seed) {
    return Math.sin(x * 0.016 + t * 0.38 + seed * 0.01) * 0.095
         + Math.sin(x * 0.009 - t * 0.27 + seed * 0.02) * 0.05;
  }

  // ─── Обновление частиц ────────────────────────────────────────────

  function updateParticles(elapsed) {
    const saltActive = elapsed >= CFG.SALT_START;
    const t          = elapsed / 1000;  // секунды
    const textY      = _canvas.height * CFG.TEXT_Y_FRAC;
    const inTextZone = elapsed >= CFG.TEXT_GLOW;

    for (const p of _particles) {

      // ── Активация ──────────────────────────────────────────────
      if (!p.active) {
        if (saltActive && (elapsed - CFG.SALT_START) >= p.delay) {
          p.active = true;
          // Сброс координат к кончику соломки
          p.x  = rand(_canvas.width * 0.05, _canvas.width * 0.95);
          p.y  = rand(-8, 6);
          p.vy = rand(0.5, 1.8);
          p.vx = rand(-0.7, 0.7);
          p.opacity = 0;
        }
        continue;
      }

      // ── Физика ─────────────────────────────────────────────────

      // Нарастание прозрачности (появление)
      p.opacity = Math.min(p.opacityMax, p.opacity + 0.058);

      // Ветровой дрейф по X
      p.vx += windX(p.x + p.turbSeed, t, p.turbSeed);
      p.vx *= CFG.AIR_RESIST;

      // Гравитация
      p.vy = Math.min(p.vy + CFG.GRAVITY, CFG.TERMINAL_VEL);

      // Притяжение к зоне текста: частицы замедляются, «оседая» на буквах
      if (inTextZone) {
        const dist = Math.abs(p.y - textY);
        if (dist < CFG.TEXT_ATTRACT_PX) {
          p.vy *= CFG.TEXT_ATTRACT_K;
        }
      }

      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.angV;

      // ── Рециклинг ──────────────────────────────────────────────
      // Вышла за экран — выпустить заново из случайной точки сверху
      if (
        p.y > _canvas.height + 14 ||
        p.x < -22 ||
        p.x > _canvas.width + 22
      ) {
        if (!_finished) {
          p.x  = rand(_canvas.width * 0.05, _canvas.width * 0.95);
          p.y  = rand(-8, 4);
          p.vy = rand(0.5, 1.8);
          p.vx = rand(-0.7, 0.7);
          p.opacity = 0;
          p.delay   = rand(0, 350);
          p.active  = false;
        } else {
          p.active  = false;
          p.opacity = 0;
        }
      }
    }
  }

  // ─── Рендеринг частиц ─────────────────────────────────────────────

  function drawParticles(elapsed) {
    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

    // Фоновое свечение в зоне текста — появляется вместе с текстом
    drawTextAmbientGlow(elapsed);

    const t = elapsed / 1000;

    for (const p of _particles) {
      if (!p.active || p.opacity < 0.012) continue;

      // Мерцание: 0..1
      const shimmer = Math.sin(p.shimmerPhase + t * p.shimmerSpeed) * 0.5 + 0.5;

      _ctx.save();
      _ctx.translate(p.x, p.y);
      _ctx.rotate(p.angle);
      _ctx.globalAlpha = p.opacity;

      // ── Свечение для крупных частиц ────────────────────────────
      // Только при сильном мерцании — экономим на shadowBlur
      if (p.size > 3.0 && shimmer > 0.62) {
        _ctx.shadowBlur  = p.size * 3.5;
        _ctx.shadowColor = `rgba(255, 244, 215, ${shimmer * 0.28})`;
      }

      // ── Основная форма кристалла ────────────────────────────────
      //
      // Радиальный градиент: яркое жемчужное ядро → тёплая прозрачная кромка
      // Создаёт ощущение плотной кристаллической среды с преломлением.
      //
      const gr = _ctx.createRadialGradient(
        0, -p.size * 0.28, 0,          // inner: смещён вверх (свет сверху)
        0,  0,             p.size * 1.5 // outer
      );

      // Цвет ядра — зависит от warmth и мерцания
      const coreL = Math.round(lerp(240, 255, shimmer * 0.35 + p.warmth * 0.15));
      gr.addColorStop(0,    `rgba(${coreL}, ${coreL - 2}, ${coreL - 12}, ${0.82 + shimmer * 0.18})`);
      gr.addColorStop(0.28, `rgba(248, 238, 210, ${0.52 + p.warmth * 0.18})`);
      gr.addColorStop(0.62, `rgba(222, 198, 152, ${0.22 + p.warmth * 0.14})`);
      gr.addColorStop(1,    'rgba(192, 162, 110, 0)');

      _ctx.beginPath();
      _ctx.ellipse(0, 0, p.size * 0.54, p.size * 1.24, 0, 0, Math.PI * 2);
      _ctx.fillStyle = gr;
      _ctx.fill();

      // ── Facet highlight — яркая грань ──────────────────────────
      // Виден только у крупных частиц при мерцании.
      // Имитирует грань кристалла, поймавшую свет.
      if (p.size > 2.2 && shimmer > 0.45) {
        const hq = (shimmer - 0.45) / 0.55; // 0..1 нормализованный
        const hGr = _ctx.createLinearGradient(0, -p.size * 1.1, 0, -p.size * 0.2);
        hGr.addColorStop(0, `rgba(255, 255, 255, ${hq * 0.55})`);
        hGr.addColorStop(1, 'rgba(255, 255, 255, 0)');
        _ctx.beginPath();
        _ctx.ellipse(
          -p.size * 0.10, -p.size * 0.60,
           p.size * 0.16,  p.size * 0.36,
          0, 0, Math.PI * 2
        );
        _ctx.fillStyle = hGr;
        _ctx.fill();
      }

      // Сбросить shadow (иначе влияет на следующие частицы)
      if (p.size > 3.0 && shimmer > 0.62) {
        _ctx.shadowBlur  = 0;
        _ctx.shadowColor = 'transparent';
      }

      _ctx.restore();
    }
  }

  // ── Атмосферное свечение за текстом ────────────────────────────────
  //
  // Мягкий тёплый нимб появляется когда текст начинает проявляться.
  // Создаёт ощущение, что буквы «светятся изнутри».
  //

  function drawTextAmbientGlow(elapsed) {
    if (elapsed < CFG.TEXT_GLOW) return;

    const progress  = clamp(
      (elapsed - CFG.TEXT_GLOW) / (CFG.TEXT_SOLID - CFG.TEXT_GLOW),
      0, 1
    );
    const intensity = easeOutCubic(progress);
    const textY     = _canvas.height * CFG.TEXT_Y_FRAC;
    const cx        = _canvas.width  * 0.5;
    const radius    = lerp(0, 220, intensity);
    const alpha     = lerp(0, 0.11, intensity);

    if (radius < 2) return;

    const grd = _ctx.createRadialGradient(cx, textY, 0, cx, textY, radius);
    grd.addColorStop(0,   `rgba(215, 178, 98,  ${alpha})`);
    grd.addColorStop(0.45, `rgba(195, 155, 72,  ${alpha * 0.45})`);
    grd.addColorStop(1,   'rgba(170, 130, 55,  0)');

    _ctx.save();
    _ctx.beginPath();
    _ctx.ellipse(cx, textY, radius * 2.2, radius, 0, 0, Math.PI * 2);
    _ctx.fillStyle = grd;
    _ctx.fill();
    _ctx.restore();
  }

  // ─── Анимация текста ──────────────────────────────────────────────
  //
  // Три фазы:
  //   1. Скрыт (до TEXT_GLOW)
  //   2. Blur reveal: расплывчатый → нарастающий (TEXT_GLOW → TEXT_SOLID)
  //   3. Solid: чёткий, финальная форма, линия разворачивается
  //

  function updateText(elapsed) {
    if (!_textWrap) return;

    if (elapsed < CFG.TEXT_GLOW) {
      _textWrap.style.opacity = '0';
      return;
    }

    if (elapsed <= CFG.TEXT_SOLID) {
      // ── Фаза 2: blur reveal ──────────────────────────────────────
      const progress = clamp(
        (elapsed - CFG.TEXT_GLOW) / (CFG.TEXT_SOLID - CFG.TEXT_GLOW),
        0, 1
      );
      const e = easeOutCubic(progress);

      _textWrap.style.opacity   = String(e * 0.70);
      _textWrap.style.filter    = `blur(${lerp(18, 1.2, e)}px)`;
      _textWrap.style.transform = `translateX(-50%) translateY(${lerp(30, 4, e)}px)`;
      _textEl.style.transform   = `perspective(700px) rotateX(${lerp(20, 5, e)}deg)`;
      _textEl.style.letterSpacing = `${lerp(0.04, 0.14, e)}em`;

    } else {
      // ── Фаза 3: solid / finale ───────────────────────────────────
      const progress = clamp(
        (elapsed - CFG.TEXT_SOLID) / CFG.HOLD,
        0, 1
      );
      const e  = easeOutQuint(progress);
      const eL = easeInOutSine(clamp(progress * 1.3, 0, 1)); // чуть быстрее для линии

      _textWrap.style.opacity   = String(lerp(0.70, 1.0, e));
      _textWrap.style.filter    = `blur(${lerp(1.2, 0, e)}px)`;
      _textWrap.style.transform = `translateX(-50%) translateY(${lerp(4, 0, e)}px)`;
      _textEl.style.transform   = `perspective(700px) rotateX(${lerp(5, 0, e)}deg)`;
      _textEl.style.letterSpacing = '0.14em';

      // Разворачивание линии под текстом
      if (_lineEl) {
        _lineEl.style.width = `${eL * 82}%`;
      }
    }
  }

  // ─── Главный цикл ─────────────────────────────────────────────────

  function loop(ts) {
    if (_finished) return;

    if (!_startTs) _startTs = ts;
    const elapsed = ts - _startTs;

    // Активировать skip-кнопку
    if (!_skipReady && elapsed >= CFG.SKIP_READY) {
      _skipReady = true;
      const btn = _overlay.querySelector('.bh-intro__skip');
      if (btn) btn.classList.add('is-ready');
    }

    updateParticles(elapsed);
    drawParticles(elapsed);
    updateText(elapsed);

    if (elapsed >= TOTAL_MS) {
      finish(false);
      return;
    }

    _raf = requestAnimationFrame(loop);
  }

  // ─── Завершение и очистка ─────────────────────────────────────────

  function finish(immediate) {
    if (_finished) return;
    _finished = true;

    if (_raf) {
      cancelAnimationFrame(_raf);
      _raf = null;
    }

    const duration = immediate ? 260 : CFG.FADE_OUT;
    _overlay.style.transition   = `opacity ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    _overlay.style.opacity      = '0';
    _overlay.style.pointerEvents = 'none';

    setTimeout(function () {
      if (_overlay && _overlay.parentNode) {
        _overlay.remove();
      }
      document.documentElement.classList.remove('bh-intro-active');

      // Оповестить остальной код об окончании интро
      document.dispatchEvent(
        new CustomEvent('bhIntroComplete', { bubbles: false, detail: { skipped: immediate } })
      );
    }, duration + 60);

    // Отметить сессию
    try { sessionStorage.setItem(CFG.SESSION_KEY, '1'); } catch (_) { /* noop */ }
  }

  // ─── Fallback для reduced-motion ──────────────────────────────────

  function runReducedMotion() {
    _overlay.classList.add('is-reduced');

    // Мгновенно показать текст
    if (_textWrap) {
      _textWrap.style.opacity   = '1';
      _textWrap.style.filter    = 'none';
      _textWrap.style.transform = 'translateX(-50%)';
    }
    if (_lineEl) {
      _lineEl.style.width = '80%';
    }

    // Короткое удержание → уход
    setTimeout(function () { finish(false); }, 1200);
  }

  // ─── Инициализация ────────────────────────────────────────────────

  function init() {

    // ── Проверка флагов отключения ────────────────────────────────
    try {
      if (localStorage.getItem(CFG.DISABLE_KEY)) return;  // постоянное отключение
      if (sessionStorage.getItem(CFG.SESSION_KEY)) return; // уже играло в этой сессии
    } catch (_) { /* noop — private browsing */ }

    _isMobile = window.innerWidth < CFG.MOBILE_BP;

    buildOverlay();
    resizeCanvas();
    _ctx = _canvas.getContext('2d', {
      alpha:          true,
      desynchronized: true, // подсказка браузеру снизить latency
    });

    document.documentElement.classList.add('bh-intro-active');

    // ── Reduced motion: без частиц ────────────────────────────────
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      runReducedMotion();
      return;
    }

    initParticles();

    // Корректировать canvas при ресайзе
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Запустить анимационный цикл
    requestAnimationFrame(loop);
  }

  // ─── Запуск ───────────────────────────────────────────────────────
  //
  // Используем requestAnimationFrame для первого вызова init —
  // это гарантирует, что браузер уже отрисовал страницу,
  // и оверлей не мешает LCP.
  //

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      requestAnimationFrame(init);
    }, { once: true });
  } else {
    requestAnimationFrame(init);
  }

  // ─── Публичный API ────────────────────────────────────────────────

  global.BHIntro = {

    /** Немедленно закрыть интро */
    skip: function () {
      finish(true);
    },

    /**
     * Сбросить флаг сессии — интро сыграет снова при следующей загрузке.
     * Полезно для тестирования: BHIntro.reset(); location.reload();
     */
    reset: function () {
      try {
        sessionStorage.removeItem(CFG.SESSION_KEY);
      } catch (_) { /* noop */ }
    },

    /**
     * Постоянно отключить интро (localStorage).
     * Для обратного: localStorage.removeItem('bh_intro_off')
     */
    disable: function () {
      try {
        localStorage.setItem(CFG.DISABLE_KEY, '1');
        finish(true);
      } catch (_) { /* noop */ }
    },
  };

}(typeof window !== 'undefined' ? window : this));
