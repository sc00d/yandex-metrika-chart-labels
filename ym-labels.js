// ==UserScript==
// @name         Metrika Chart Labels
// @namespace    https://t.me/seregaseo
// @version      4.4
// @description  Подписи значений и полные метки оси X на графиках Яндекс Метрики
// @author       @sc00d (https://t.me/seregaseo)
// @match        https://metrika.yandex.ru/*
// @match        https://metrika.yandex.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  let labelsEnabled = true;
  let roundEnabled  = false;
  let xAxisEnabled  = true;

  function fmt(n) {
    if (roundEnabled) {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + '\u00a0М';
      if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + '\u00a0К';
      return String(Math.round(n));
    }
    return Number(n).toLocaleString('ru-RU');
  }

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
    const fmtMonth = dt => dt.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    const fmtDay   = dt => `${dt.getDate()} ${dt.toLocaleDateString('ru-RU', { month: 'short' })}`;
    for (let i = 0; i < count; i++) {
      if (group === 'month') { labels.push(fmtMonth(new Date(d))); d.setMonth(d.getMonth() + 1); }
      else if (group === 'week') { labels.push(fmtDay(new Date(d))); d.setDate(d.getDate() + 7); }
      else { labels.push(fmtDay(new Date(d))); d.setDate(d.getDate() + 1); }
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

  function removeLabels() {
    document.querySelectorAll('.custom-val-label, .custom-val-dot, .custom-xaxis-label, .custom-xaxis-line').forEach(e => e.remove());
    restoreNativeXLabels();
  }

  function drawLabels() {
    removeLabels();
    document.querySelectorAll('.highcharts-root').forEach(svg => drawForChart(svg));
  }

  function drawForChart(svg) {
    const plotBg = svg.querySelector('.highcharts-plot-background');
    if (!plotBg) return;
    const plotX = parseFloat(plotBg.getAttribute('x'));
    const plotY = parseFloat(plotBg.getAttribute('y'));
    const plotH = parseFloat(plotBg.getAttribute('height'));

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

    if (xAxisEnabled && pointCount > 0) {
      const periodLabels = buildLabels(pointCount);
      if (periodLabels && periodLabels.length === pointCount) {
        hideNativeXLabelsForSvg(svg);
        const axisY = plotY + plotH + 1;
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

    if (!labelsEnabled) return;

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

    const LABEL_H   = 20;
    const ABOVE_OFF = 22;
    const BELOW_OFF = 22;

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

      // Чётная серия — подпись выше, нечётная — ниже
      const placeBelow = si % 2 === 1;

      const labels = selectedIdxs.map(i => {
        const cx = pathCoords[i].x + plotX;
        const cy = pathCoords[i].y + plotY;
        const ly = placeBelow ? cy + BELOW_OFF : cy - ABOVE_OFF;
        return { cx, cy, ly, placeBelow, label: fmt(yVals[i] ?? 0), lineColor };
      });

      // O(n) антиколлизия внутри серии
      if (!placeBelow) {
        labels.sort((a, b) => a.cy - b.cy);
        for (let k = 1; k < labels.length; k++) {
          const prev = labels[k - 1], cur = labels[k];
          if (Math.abs(cur.cx - prev.cx) < 60) {
            const gap = prev.ly - (cur.ly - LABEL_H);
            if (gap > 0) cur.ly -= gap + 4;
          }
        }
      } else {
        labels.sort((a, b) => b.cy - a.cy);
        for (let k = 1; k < labels.length; k++) {
          const prev = labels[k - 1], cur = labels[k];
          if (Math.abs(cur.cx - prev.cx) < 60) {
            const gap = (cur.ly - LABEL_H) - prev.ly;
            if (gap < 0) cur.ly -= gap - 4;
          }
        }
      }

      labels.forEach(({ cx, cy, label, lineColor, ly, placeBelow }) => {
        const lineY1 = placeBelow ? cy + 8 : cy - 8;
        const lineY2 = placeBelow ? ly - 4 : ly + LABEL_H - 2;
        if (Math.abs(lineY2 - lineY1) > 2) {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', cx); line.setAttribute('y1', lineY1);
          line.setAttribute('x2', cx); line.setAttribute('y2', lineY2);
          line.setAttribute('stroke', lineColor); line.setAttribute('stroke-width', 1);
          line.setAttribute('stroke-dasharray', '2,2'); line.setAttribute('opacity', '0.6');
          line.setAttribute('class', 'custom-val-dot');
          svg.appendChild(line);
        }
        const oc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        oc.setAttribute('cx', cx); oc.setAttribute('cy', cy); oc.setAttribute('r', 7);
        oc.setAttribute('fill', 'white'); oc.setAttribute('stroke', lineColor);
        oc.setAttribute('stroke-width', 2); oc.setAttribute('class', 'custom-val-dot');
        svg.appendChild(oc);
        const ic = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ic.setAttribute('cx', cx); ic.setAttribute('cy', cy); ic.setAttribute('r', 3.5);
        ic.setAttribute('fill', lineColor); ic.setAttribute('class', 'custom-val-dot');
        svg.appendChild(ic);

        const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        tmp.setAttribute('font-size', '11'); tmp.setAttribute('font-family', 'YS Text, Arial, sans-serif');
        tmp.textContent = label; svg.appendChild(tmp);
        const tw = tmp.getComputedTextLength(); svg.removeChild(tmp);

        const pad = 5, bw = tw + pad * 2, bh = 18;
        const rectY = placeBelow ? ly : ly - bh + 2;
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', cx - bw / 2); rect.setAttribute('y', rectY);
        rect.setAttribute('width', bw); rect.setAttribute('height', bh);
        rect.setAttribute('rx', 4); rect.setAttribute('ry', 4);
        rect.setAttribute('fill', lineColor); rect.setAttribute('opacity', '0.9');
        rect.setAttribute('class', 'custom-val-label');
        svg.appendChild(rect);

        const textY = placeBelow ? ly + bh - 5 : ly - 4;
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

  function createToggle() {
    if (document.getElementById('metrika-labels-toggle-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'metrika-labels-toggle-wrap';
    wrap.style.cssText = `
      position: fixed; bottom: 20px; right: 20px; z-index: 99999;
      background: #fff; border: 1px solid #d9d9d9; border-radius: 8px;
      padding: 8px 14px; display: flex; flex-direction: column; gap: 6px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.13);
      font-family: YS Text, Arial, sans-serif; font-size: 13px; color: #333;
    `;
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
    wrap.appendChild(makeRow('metrika-labels-cb', 'Подписать значения', labelsEnabled, val => { labelsEnabled = val; drawLabels(); }));
    wrap.appendChild(makeRow('metrika-round-cb',  'Округлять значения', roundEnabled,  val => { roundEnabled  = val; drawLabels(); }));
    wrap.appendChild(makeRow('metrika-xaxis-cb',  'Все метки оси X',    xAxisEnabled,  val => { xAxisEnabled  = val; drawLabels(); }));
    const authorDiv = document.createElement('div');
    authorDiv.style.cssText = 'border-top:1px solid #eee;margin-top:2px;padding-top:6px;font-size:11px;color:#999;display:flex;align-items:center;gap:4px;';
    authorDiv.innerHTML = 'by <a href="https://t.me/seregaseo" target="_blank" rel="noopener noreferrer" style="color:#5B8AF0;text-decoration:none;font-weight:600;">@sc00d</a>';
    wrap.appendChild(authorDiv);
    document.body.appendChild(wrap);
  }

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
