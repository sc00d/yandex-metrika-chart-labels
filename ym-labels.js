// ==UserScript==
// @name         Metrika Chart Labels
// @namespace    https://t.me/seregaseo
// @version      4.8
// @description  Подписи значений, метки оси X, АППГ под графиком на графиках Яндекс Метрики
// @author       @sc00d (https://t.me/seregaseo)
// @match        https://metrika.yandex.ru/*
// @match        https://metrika.yandex.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  let labelsEnabled  = true;
  let roundEnabled   = false;
  let xAxisEnabled   = true;
  let appgEnabled    = true;
  let panelCollapsed = false;

  // ── Форматирование ───────────────────────────────────────────────────────

  function fmt(n) {
    if (roundEnabled) {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + '\u00a0М';
      if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + '\u00a0К';
      return String(Math.round(n));
    }
    return Number(n).toLocaleString('ru-RU');
  }

  // ── Период из URL ────────────────────────────────────────────────────────

  function getPeriodInfo() {
    const params = new URLSearchParams(location.search);
    const period = params.get('period');
    const group  = params.get('group') || 'day';
    if (!period) return null;
    const presets = { day:1, week:7, month:30, quarter:90, year:365 };
    let start;
    if (period.includes(':')) {
      start = new Date(period.split(':')[0]);
    } else if (presets[period] !== undefined) {
      start = new Date();
      start.setDate(start.getDate() - presets[period]);
    } else return null;
    return { start, group };
  }

  function buildLabels(count) {
    const info = getPeriodInfo();
    if (!info) return null;
    const { start, group } = info;
    const labels = [];
    const d = new Date(start);
    const fmtMonth = dt => dt.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
    const fmtDay   = dt => `${dt.getDate()} ${dt.toLocaleDateString('ru-RU', { month: 'short' })}`;
    for (let i = 0; i < count; i++) {
      if (group === 'month')     { labels.push(fmtMonth(new Date(d))); d.setMonth(d.getMonth() + 1); }
      else if (group === 'week') { labels.push(fmtDay(new Date(d)));   d.setDate(d.getDate() + 7); }
      else                       { labels.push(fmtDay(new Date(d)));   d.setDate(d.getDate() + 1); }
    }
    return labels;
  }

  function calcStep(count, group) {
    if (group === 'month') return 1;
    if (group === 'week')  return count <= 20 ? 1 : 2;
    if (count <= 14)  return 1;
    if (count <= 31)  return 3;
    if (count <= 62)  return 5;
    if (count <= 120) return 7;
    return 10;
  }

  // ── Родные метки X ────────────────────────────────────────────────────────

  function restoreNativeXLabels() {
    document.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels').forEach(e => e.style.display = '');
    document.querySelectorAll('.highcharts-xaxis-labels').forEach(e => e.style.display = '');
  }

  function hideNativeXLabelsForSvg(svg) {
    const svgXLabels = svg.querySelector('.highcharts-xaxis-labels');
    if (svgXLabels) svgXLabels.style.display = 'none';
    const chartContainer = svg.closest('.highcharts-container');
    let candidates = [];
    [chartContainer?.parentElement, chartContainer?.parentElement?.parentElement].forEach(el => {
      if (el) candidates.push(...el.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels'));
    });
    if (!candidates.length) candidates.push(...document.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels'));
    candidates.forEach(el => el.style.display = 'none');
  }

  // ── Позиция подписи с учётом границ ──────────────────────────────────────
  // Возвращает { ly, placeBelow } с зажатыми значениями
  // plotTop  — верхняя граница области (plotY)
  // plotBot  — нижняя граница области (plotY + plotH), НЕ включая ось X
  // LABEL_H  — высота бейджа
  // ABOVE/BELOW_OFF — желаемое смещение от точки

  const LABEL_H   = 18;
  const ABOVE_OFF = 22;
  const BELOW_OFF = 22;
  const X_AXIS_CLEARANCE = 26; // px ниже plotBot — зона оси X, туда не лезем

  function calcLabelPos(cy, placeBelow, plotTop, plotBot) {
    const safeBot = plotBot - X_AXIS_CLEARANCE; // нижняя безопасная граница
    let ly;

    if (placeBelow) {
      ly = cy + BELOW_OFF;
      // Если подпись выходит за нижнюю безопасную зону — переносим выше точки
      if (ly + LABEL_H > safeBot) {
        placeBelow = false;
        ly = cy - ABOVE_OFF;
      }
    } else {
      ly = cy - ABOVE_OFF;
    }

    // Зажимаем сверху: подпись не выше верхнего края области
    if (!placeBelow && ly - LABEL_H < plotTop + 4) {
      ly = plotTop + 4 + LABEL_H;
    }

    // Зажимаем снизу (на случай если даже выше не вмещается)
    if (placeBelow && ly + LABEL_H > safeBot) {
      ly = safeBot - LABEL_H;
    }

    return { ly, placeBelow };
  }

  // ── АППГ-блок ─────────────────────────────────────────────────────────────

  function removeAppgBlocks() {
    document.querySelectorAll('.custom-appg-block').forEach(e => e.remove());
  }

  function drawAppgBlock(seriesData, uniqueGraphs) {
    removeAppgBlocks();
    const info = getPeriodInfo();
    if (!info || info.group !== 'month') return;
    const pts0 = seriesData[0]?.data;
    if (!pts0 || pts0.length < 13) return;

    const rows = [];
    uniqueGraphs.forEach((graph, si) => {
      const pts = seriesData[si]?.data;
      if (!pts || pts.length < 13) return;
      const last  = pts[pts.length - 1];
      const appg  = pts[pts.length - 13];
      const name  = seriesData[si]?.name;
      const color = graph.getAttribute('stroke') || '#5B8AF0';
      const seriesName = Array.isArray(name) ? name.join(', ') : (name || `Серия ${si + 1}`);
      const diff  = last.y - appg.y;
      const pct   = appg.y !== 0 ? (diff / appg.y) * 100 : 0;
      const sign  = diff >= 0 ? '+' : '';
      const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '—';
      const diffColor = diff > 0 ? '#27ae60' : diff < 0 ? '#e74c3c' : '#888';
      const labels    = buildLabels(pts.length);
      const lastLabel = labels ? labels[pts.length - 1]  : 'последний месяц';
      const appgLabel = labels ? labels[pts.length - 13] : 'АППГ';
      rows.push({ seriesName, color, lastVal: fmt(last.y), appgVal: fmt(appg.y),
        lastLabel, appgLabel, arrow, diffColor,
        diffStr: `${sign}${fmt(Math.abs(diff))}`,
        pctStr:  `${sign}${pct.toFixed(1).replace('.', ',')}%` });
    });
    if (!rows.length) return;

    const block = document.createElement('div');
    block.className = 'custom-appg-block';
    block.style.cssText = `
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      z-index:99998; background:#fff; border:1px solid #dde0ea; border-radius:12px;
      padding:14px 36px 14px 20px; font-family:YS Text,Arial,sans-serif;
      font-size:15px; color:#222; display:flex; align-items:flex-start;
      gap:28px; box-shadow:0 4px 24px rgba(0,0,0,.13); max-width:90vw;
    `;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `position:absolute;top:6px;right:10px;background:none;border:none;
      font-size:20px;color:#aaa;cursor:pointer;line-height:1;padding:0;`;
    closeBtn.addEventListener('click', () => block.remove());
    block.appendChild(closeBtn);

    const titleEl = document.createElement('div');
    titleEl.style.cssText = `font-size:12px;color:#999;text-transform:uppercase;letter-spacing:.05em;
      font-weight:600;writing-mode:vertical-rl;text-orientation:mixed;align-self:center;margin-right:4px;`;
    titleEl.textContent = 'АППГ';
    block.appendChild(titleEl);

    const divider0 = document.createElement('div');
    divider0.style.cssText = 'width:1px;background:#eee;align-self:stretch;';
    block.appendChild(divider0);

    rows.forEach((row, ri) => {
      if (ri > 0) {
        const sep = document.createElement('div');
        sep.style.cssText = 'width:1px;background:#eee;align-self:stretch;';
        block.appendChild(sep);
      }
      const cell = document.createElement('div');
      cell.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:180px;';
      cell.innerHTML = `
        <div style="font-weight:700;color:${row.color};font-size:14px;">${row.seriesName}</div>
        <div>
          <div style="color:#aaa;font-size:12px;">${row.lastLabel}</div>
          <div style="font-weight:800;font-size:22px;color:#222;line-height:1.2;">${row.lastVal}</div>
        </div>
        <div>
          <div style="color:#bbb;font-size:12px;">${row.appgLabel}: <b style="color:#888;">${row.appgVal}</b></div>
          <div style="font-size:17px;font-weight:700;color:${row.diffColor};">
            ${row.arrow} ${row.diffStr} <span style="font-size:15px;">(${row.pctStr})</span>
          </div>
        </div>`;
      block.appendChild(cell);
    });
    document.body.appendChild(block);
  }

  // ── Очистка ───────────────────────────────────────────────────────────────

  function removeLabels() {
    document.querySelectorAll('.custom-val-label,.custom-val-dot,.custom-xaxis-label,.custom-xaxis-line').forEach(e => e.remove());
    restoreNativeXLabels();
    removeAppgBlocks();
  }

  function drawLabels() {
    removeLabels();
    document.querySelectorAll('.highcharts-root').forEach(svg => drawForChart(svg));
  }

  // ── Основная отрисовка ───────────────────────────────────────────────────

  function drawForChart(svg) {
    const plotBg = svg.querySelector('.highcharts-plot-background');
    if (!plotBg) return;
    const plotX   = parseFloat(plotBg.getAttribute('x'));
    const plotY   = parseFloat(plotBg.getAttribute('y'));
    const plotH   = parseFloat(plotBg.getAttribute('height'));
    const plotBot = plotY + plotH; // нижняя граница области

    const uniqueGraphs = [];
    const seenPaths = new Set();
    svg.querySelectorAll('.highcharts-graph').forEach(g => {
      if ((g.getAttribute('stroke') || '').startsWith('rgba')) return;
      const key = (g.getAttribute('d') || '').slice(0, 30);
      if (seenPaths.has(key)) return;
      seenPaths.add(key);
      uniqueGraphs.push(g);
    });
    if (!uniqueGraphs.length) return;

    const xCoords = [];
    for (const m of uniqueGraphs[0].getAttribute('d').matchAll(/[ML]\s*([\d.]+)[,\s]([\d.]+)/g)) {
      xCoords.push(parseFloat(m[1]) + plotX);
    }
    const pointCount = xCoords.length;
    const info  = getPeriodInfo();
    const group = info?.group || 'day';
    const step  = calcStep(pointCount, group);

    // ── Ось X ─────────────────────────────────────────────────────────────
    if (xAxisEnabled && pointCount > 0) {
      const periodLabels = buildLabels(pointCount);
      if (periodLabels && periodLabels.length === pointCount) {
        hideNativeXLabelsForSvg(svg);
        const axisY = plotBot + 1;
        xCoords.forEach((cx, i) => {
          if (i % step !== 0 && i !== pointCount - 1) return;
          const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          tick.setAttribute('x1', cx); tick.setAttribute('y1', axisY);
          tick.setAttribute('x2', cx); tick.setAttribute('y2', axisY + 4);
          tick.setAttribute('stroke', '#aaa'); tick.setAttribute('stroke-width', 1);
          tick.setAttribute('class', 'custom-xaxis-line');
          svg.appendChild(tick);
          const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
          text.setAttribute('x', cx); text.setAttribute('y', axisY + 16);
          text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '12');
          text.setAttribute('font-weight', '500'); text.setAttribute('fill', 'rgba(26,43,77,0.6)');
          text.setAttribute('font-family', 'YS Text, Arial, sans-serif');
          text.setAttribute('class', 'custom-xaxis-label');
          text.textContent = periodLabels[i];
          svg.appendChild(text);
        });
      }
    }

    // ── React fiber → данные ──────────────────────────────────────────────
    const chartEl = svg.closest('[class*="chart_type"]');
    if (!chartEl) return;
    const fiberKey = Object.keys(chartEl).find(k => k.startsWith('__reactFiber'));
    if (!fiberKey) return;
    let fiber = chartEl[fiberKey];
    let seriesData = null;
    let depth = 0;
    while (fiber && depth < 5) {
      const props = fiber.memoizedProps;
      if (props?.data?.[0]?.data) { seriesData = props.data; break; }
      fiber = fiber.return; depth++;
    }
    if (!seriesData) return;

    if (appgEnabled) drawAppgBlock(seriesData, uniqueGraphs);
    if (!labelsEnabled) return;

    // ── Подписи значений ──────────────────────────────────────────────────
    uniqueGraphs.forEach((graph, si) => {
      const points = seriesData[si]?.data;
      if (!points?.length) return;
      const yVals     = points.map(p => p.y);
      const lineColor = graph.getAttribute('stroke') || '#5B8AF0';
      const pathCoords = [];
      for (const m of graph.getAttribute('d').matchAll(/[ML]\s*([\d.]+)[,\s]([\d.]+)/g)) {
        pathCoords.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
      }

      const selectedIdxs = pathCoords.map((_, i) => i)
        .filter(i => i % step === 0 || i === pathCoords.length - 1);

      // Чётные серии — выше, нечётные — ниже
      const defaultBelow = si % 2 === 1;

      // Вычисляем позиции с учётом границ
      const labels = selectedIdxs.map(i => {
        const cx = pathCoords[i].x + plotX;
        const cy = pathCoords[i].y + plotY;
        const { ly, placeBelow } = calcLabelPos(cy, defaultBelow, plotY, plotBot);
        return { cx, cy, ly, placeBelow, label: fmt(yVals[i] ?? 0), lineColor };
      });

      // O(n) антиколлизия внутри серии
      const above = labels.filter(l => !l.placeBelow);
      const below = labels.filter(l => l.placeBelow);

      above.sort((a, b) => a.cy - b.cy);
      for (let k = 1; k < above.length; k++) {
        const prev = above[k-1], cur = above[k];
        if (Math.abs(cur.cx - prev.cx) < 60) {
          const gap = prev.ly - (cur.ly - LABEL_H);
          if (gap > 0) cur.ly -= gap + 4;
        }
        // после сдвига снова зажимаем сверху
        if (cur.ly - LABEL_H < plotY + 4) cur.ly = plotY + 4 + LABEL_H;
      }

      below.sort((a, b) => b.cy - a.cy);
      for (let k = 1; k < below.length; k++) {
        const prev = below[k-1], cur = below[k];
        if (Math.abs(cur.cx - prev.cx) < 60) {
          const gap = (cur.ly - LABEL_H) - prev.ly;
          if (gap < 0) cur.ly -= gap - 4;
        }
        // после сдвига зажимаем снизу
        const safeBot = plotBot - X_AXIS_CLEARANCE;
        if (cur.ly + LABEL_H > safeBot) cur.ly = safeBot - LABEL_H;
      }

      labels.forEach(({ cx, cy, label, lineColor, ly, placeBelow }) => {
        // Соединительная линия от точки до бейджа
        const lineY1 = placeBelow ? cy + 8  : cy - 8;
        const lineY2 = placeBelow ? ly - 2  : ly + LABEL_H;
        if (Math.abs(lineY2 - lineY1) > 2) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', cx); line.setAttribute('y1', lineY1);
          line.setAttribute('x2', cx); line.setAttribute('y2', lineY2);
          line.setAttribute('stroke', lineColor); line.setAttribute('stroke-width', 1);
          line.setAttribute('stroke-dasharray', '2,2'); line.setAttribute('opacity', '0.6');
          line.setAttribute('class', 'custom-val-dot');
          svg.appendChild(line);
        }

        // Точка (внешний + внутренний круг)
        [[7,'white',lineColor,2],[3.5,lineColor,'none',0]].forEach(([r,fill,stroke,sw]) => {
          const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);
          c.setAttribute('fill', fill);
          if (sw > 0) { c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', sw); }
          c.setAttribute('class', 'custom-val-dot');
          svg.appendChild(c);
        });

        // Размер бейджа
        const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tmp.setAttribute('font-size', '11'); tmp.setAttribute('font-family', 'YS Text, Arial, sans-serif');
        tmp.textContent = label; svg.appendChild(tmp);
        const tw = tmp.getComputedTextLength(); svg.removeChild(tmp);

        const pad = 5, bw = tw + pad * 2, bh = LABEL_H;
        const rectY = placeBelow ? ly : ly - bh;

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', cx - bw / 2); rect.setAttribute('y', rectY);
        rect.setAttribute('width', bw); rect.setAttribute('height', bh);
        rect.setAttribute('rx', 4); rect.setAttribute('fill', lineColor);
        rect.setAttribute('opacity', '0.9'); rect.setAttribute('class', 'custom-val-label');
        svg.appendChild(rect);

        const textY = placeBelow ? rectY + bh - 5 : rectY + bh - 5;
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', cx); text.setAttribute('y', textY);
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '11');
        text.setAttribute('font-weight', '600'); text.setAttribute('fill', 'white');
        text.setAttribute('font-family', 'YS Text, Arial, sans-serif');
        text.setAttribute('class', 'custom-val-label');
        text.textContent = label;
        svg.appendChild(text);
      });
    });
  }

  // ── UI панель ─────────────────────────────────────────────────────────────

  function createToggle() {
    if (document.getElementById('metrika-labels-toggle-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'metrika-labels-toggle-wrap';
    wrap.style.cssText = `
      position:fixed; bottom:20px; right:20px; z-index:99999;
      background:#fff; border:1px solid #d9d9d9; border-radius:8px;
      box-shadow:0 2px 10px rgba(0,0,0,.13);
      font-family:YS Text,Arial,sans-serif; font-size:13px; color:#333; overflow:hidden;
    `;

    const header = document.createElement('div');
    header.style.cssText = `
      display:flex; align-items:center; justify-content:space-between;
      padding:7px 10px 7px 14px; cursor:pointer;
      border-bottom:1px solid #eee; gap:10px; user-select:none;
    `;
    const headerTitle = document.createElement('span');
    headerTitle.textContent = '📊 Метрика';
    headerTitle.style.cssText = 'font-weight:600;font-size:12px;color:#555;';
    const collapseBtn = document.createElement('button');
    collapseBtn.style.cssText = `background:none;border:none;cursor:pointer;
      font-size:16px;color:#aaa;line-height:1;padding:0;transition:transform .2s;`;
    collapseBtn.textContent = '▲';
    collapseBtn.title = 'Свернуть';
    header.appendChild(headerTitle);
    header.appendChild(collapseBtn);

    const body = document.createElement('div');
    body.style.cssText = 'padding:8px 14px; display:flex; flex-direction:column; gap:6px;';

    function makeRow(id, labelText, checked, onChange) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = id; cb.checked = checked;
      cb.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:#5B8AF0;flex-shrink:0;';
      const lbl = document.createElement('label');
      lbl.htmlFor = id; lbl.textContent = labelText; lbl.style.cursor = 'pointer';
      cb.addEventListener('change', () => onChange(cb.checked));
      row.appendChild(cb); row.appendChild(lbl);
      return row;
    }

    body.appendChild(makeRow('metrika-labels-cb', 'Подписать значения', labelsEnabled, val => { labelsEnabled = val; drawLabels(); }));
    body.appendChild(makeRow('metrika-round-cb',  'Округлять значения', roundEnabled,  val => { roundEnabled  = val; drawLabels(); }));
    body.appendChild(makeRow('metrika-xaxis-cb',  'Все метки оси X',    xAxisEnabled,  val => { xAxisEnabled  = val; drawLabels(); }));
    body.appendChild(makeRow('metrika-appg-cb',   'АППГ под графиком',  appgEnabled,   val => { appgEnabled   = val; drawLabels(); }));

    const authorDiv = document.createElement('div');
    authorDiv.style.cssText = 'border-top:1px solid #eee;margin-top:2px;padding-top:6px;font-size:11px;color:#999;display:flex;align-items:center;gap:4px;';
    authorDiv.innerHTML = 'by <a href="https://t.me/seregaseo" target="_blank" rel="noopener noreferrer" style="color:#5B8AF0;text-decoration:none;font-weight:600;">@sc00d</a>';
    body.appendChild(authorDiv);

    function applyCollapsed() {
      if (panelCollapsed) {
        body.style.display = 'none';
        collapseBtn.textContent = '▼';
        collapseBtn.title = 'Развернуть';
        header.style.borderBottom = 'none';
      } else {
        body.style.display = 'flex';
        collapseBtn.textContent = '▲';
        collapseBtn.title = 'Свернуть';
        header.style.borderBottom = '1px solid #eee';
      }
    }
    header.addEventListener('click', () => { panelCollapsed = !panelCollapsed; applyCollapsed(); });
    applyCollapsed();

    wrap.appendChild(header);
    wrap.appendChild(body);
    document.body.appendChild(wrap);
  }

  // ── Запуск ────────────────────────────────────────────────────────────────

  function waitForChart() {
    let tries = 0;
    const interval = setInterval(() => {
      tries++;
      if (document.querySelector('.highcharts-root')) {
        clearInterval(interval); createToggle(); drawLabels(); startObserver();
      }
      if (tries > 60) clearInterval(interval);
    }, 500);
  }

  function startObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => { createToggle(); drawLabels(); }, 700);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  waitForChart();
})();
