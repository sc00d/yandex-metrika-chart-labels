// ==UserScript==
// @name         Metrika Chart Labels
// @namespace    https://t.me/seregaseo
// @version      4.1
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
  let roundEnabled = false;
  let xAxisEnabled = true;

  function fmt(n) {
    if (roundEnabled) {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + '\u00a0М';
      if (n >= 1000) return (n / 1000).toFixed(1).replace('.', ',') + '\u00a0К';
      return String(Math.round(n));
    }
    return Number(n).toLocaleString('ru-RU');
  }

  function getPeriodLabels(count) {
    const params = new URLSearchParams(location.search);
    const period = params.get('period');
    const group = params.get('group') || 'day';
    if (!period) return null;

    const [startStr, endStr] = period.split(':');
    const start = new Date(startStr);
    const end = new Date(endStr);
    const labels = [];
    const d = new Date(start);

    const fmtMonth = dt => dt.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' });
    const fmtDay = dt => dt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });

    if (group === 'month') {
      while (d <= end && labels.length < count) {
        labels.push(fmtMonth(new Date(d)));
        d.setMonth(d.getMonth() + 1);
      }
    } else if (group === 'week') {
      while (d <= end && labels.length < count) {
        labels.push(fmtDay(new Date(d)));
        d.setDate(d.getDate() + 7);
      }
    } else {
      while (d <= end && labels.length < count) {
        labels.push(fmtDay(new Date(d)));
        d.setDate(d.getDate() + 1);
      }
    }

    return labels;
  }

  function restoreNativeXLabels() {
    document.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels')
      .forEach(e => e.style.display = '');

    document.querySelectorAll('.highcharts-xaxis-labels')
      .forEach(e => e.style.display = '');
  }

  function hideNativeXLabelsForSvg(svg) {
    const svgXLabels = svg.querySelector('.highcharts-xaxis-labels');
    if (svgXLabels) svgXLabels.style.display = 'none';

    const chartContainer = svg.closest('.highcharts-container');
    const candidates = [];

    if (chartContainer?.parentElement) {
      candidates.push(
        ...chartContainer.parentElement.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels')
      );
    }

    if (chartContainer?.parentElement?.parentElement) {
      candidates.push(
        ...chartContainer.parentElement.parentElement.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels')
      );
    }

    if (!candidates.length) {
      candidates.push(...document.querySelectorAll('.highcharts-axis-labels.highcharts-xaxis-labels'));
    }

    candidates.forEach(el => {
      el.style.display = 'none';
    });
  }

  function removeLabels() {
    document.querySelectorAll(
      '.custom-val-label, .custom-val-dot, .custom-xaxis-label, .custom-xaxis-line'
    ).forEach(e => e.remove());

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

    if (xAxisEnabled) {
      const graph = svg.querySelector('.highcharts-graph');
      if (graph) {
        const xCoords = [];
        for (const m of graph.getAttribute('d').matchAll(/[ML]\s*([\d.]+)[,\s]([\d.]+)/g)) {
          xCoords.push(parseFloat(m[1]) + plotX);
        }

        const periodLabels = getPeriodLabels(xCoords.length);

        if (periodLabels && periodLabels.length === xCoords.length) {
          hideNativeXLabelsForSvg(svg);

          const axisY = plotY + plotH + 1;

          xCoords.forEach((cx, i) => {
            const label = periodLabels[i];

            const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            tick.setAttribute('x1', cx);
            tick.setAttribute('y1', axisY);
            tick.setAttribute('x2', cx);
            tick.setAttribute('y2', axisY + 4);
            tick.setAttribute('stroke', '#aaa');
            tick.setAttribute('stroke-width', 1);
            tick.setAttribute('class', 'custom-xaxis-line');
            svg.appendChild(tick);

            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', cx);
            text.setAttribute('y', axisY + 15);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '12');
            text.setAttribute('fill', '#666');
            text.setAttribute('font-family', 'YS Text, Arial, sans-serif');
            text.setAttribute('class', 'custom-xaxis-label');
            text.textContent = label;
            svg.appendChild(text);
          });
        }
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
      if (props?.data?.[0]?.data) {
        seriesData = props.data;
        break;
      }
      fiber = fiber.return;
      depth++;
    }

    if (!seriesData) return;

    const graphs = svg.querySelectorAll('.highcharts-graph');
    const allLabels = [];

    graphs.forEach((graph, si) => {
      const points = seriesData[si]?.data;
      if (!points?.length) return;

      const yVals = points.map(p => p.y);
      const lineColor = graph.getAttribute('stroke') || '#5B8AF0';

      const pathCoords = [];
      for (const m of graph.getAttribute('d').matchAll(/[ML]\s*([\d.]+)[,\s]([\d.]+)/g)) {
        pathCoords.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) });
      }

      pathCoords.forEach((coord, i) => {
        if (i >= yVals.length) return;
        allLabels.push({
          cx: coord.x + plotX,
          cy: coord.y + plotY,
          label: fmt(yVals[i]),
          lineColor,
        });
      });
    });

    const labelH = 20;
    const labelMinGap = 4;
    const baseOffset = 18;
    const placed = allLabels.map(l => ({ ...l, ly: l.cy - baseOffset }));

    for (let pass = 0; pass < 15; pass++) {
      let anyMoved = false;
      for (let a = 0; a < placed.length; a++) {
        for (let b = a + 1; b < placed.length; b++) {
          const pa = placed[a];
          const pb = placed[b];
          if (Math.abs(pa.cx - pb.cx) > 80) continue;

          const overlap = Math.min(pa.ly, pb.ly) - Math.max(pa.ly - labelH, pb.ly - labelH);
          if (overlap > 0) {
            if (pa.cy <= pb.cy) placed[a].ly -= overlap + labelMinGap;
            else placed[b].ly -= overlap + labelMinGap;
            anyMoved = true;
          }
        }
      }
      if (!anyMoved) break;
    }

    placed.forEach(({ cx, cy, label, lineColor, ly }) => {
      if (cy - baseOffset - ly > 2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx);
        line.setAttribute('y1', cy - 8);
        line.setAttribute('x2', cx);
        line.setAttribute('y2', ly + 2);
        line.setAttribute('stroke', lineColor);
        line.setAttribute('stroke-width', 1);
        line.setAttribute('stroke-dasharray', '2,2');
        line.setAttribute('opacity', '0.6');
        line.setAttribute('class', 'custom-val-dot');
        svg.appendChild(line);
      }

      const oc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      oc.setAttribute('cx', cx);
      oc.setAttribute('cy', cy);
      oc.setAttribute('r', 7);
      oc.setAttribute('fill', 'white');
      oc.setAttribute('stroke', lineColor);
      oc.setAttribute('stroke-width', 2);
      oc.setAttribute('class', 'custom-val-dot');
      svg.appendChild(oc);

      const ic = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ic.setAttribute('cx', cx);
      ic.setAttribute('cy', cy);
      ic.setAttribute('r', 3.5);
      ic.setAttribute('fill', lineColor);
      ic.setAttribute('class', 'custom-val-dot');
      svg.appendChild(ic);

      const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tmp.setAttribute('font-size', '11');
      tmp.setAttribute('font-family', 'YS Text, Arial, sans-serif');
      tmp.textContent = label;
      svg.appendChild(tmp);
      const tw = tmp.getComputedTextLength();
      svg.removeChild(tmp);

      const pad = 5;
      const bw = tw + pad * 2;
      const bh = 18;

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', cx - bw / 2);
      rect.setAttribute('y', ly - bh + 2);
      rect.setAttribute('width', bw);
      rect.setAttribute('height', bh);
      rect.setAttribute('rx', 4);
      rect.setAttribute('ry', 4);
      rect.setAttribute('fill', lineColor);
      rect.setAttribute('opacity', '0.9');
      rect.setAttribute('class', 'custom-val-label');
      svg.appendChild(rect);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', ly - 4);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-size', '11');
      text.setAttribute('font-weight', '600');
      text.setAttribute('fill', 'white');
      text.setAttribute('font-family', 'YS Text, Arial, sans-serif');
      text.setAttribute('class', 'custom-val-label');
      text.textContent = label;
      svg.appendChild(text);
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

    function makeRow(id, text, checked, onChange) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.checked = checked;
      cb.style.cssText = 'width:15px;height:15px;cursor:pointer;accent-color:#5B8AF0;flex-shrink:0;';

      const lbl = document.createElement('label');
      lbl.htmlFor = id;
      lbl.textContent = text;
      lbl.style.cursor = 'pointer';

      cb.addEventListener('change', () => onChange(cb.checked));

      row.appendChild(cb);
      row.appendChild(lbl);
      return row;
    }

    wrap.appendChild(makeRow('metrika-labels-cb', 'Подписать значения', labelsEnabled, val => {
      labelsEnabled = val;
      drawLabels();
    }));

    wrap.appendChild(makeRow('metrika-round-cb', 'Округлять значения', roundEnabled, val => {
      roundEnabled = val;
      drawLabels();
    }));

    wrap.appendChild(makeRow('metrika-xaxis-cb', 'Подписать все месяцы', xAxisEnabled, val => {
      xAxisEnabled = val;
      drawLabels();
    }));

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
        clearInterval(interval);
        createToggle();
        drawLabels();
        startObserver();
      }
      if (tries > 60) clearInterval(interval);
    }, 500);
  }

  function startObserver() {
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        createToggle();
        drawLabels();
      }, 700);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  waitForChart();
})();
