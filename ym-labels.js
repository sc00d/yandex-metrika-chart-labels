// ==UserScript==
// @name         Metrika Chart Labels
// @namespace    https://t.me/seregaseo
// @version      3.0
// @description  Подписи значений на графиках Яндекс Метрики
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

  // ── Форматирование ────────────────────────────────────────────────────────

  function fmt(n) {
    if (roundEnabled) {
      if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.', ',') + '\u00a0М';
      if (n >= 1000)    return (n / 1000).toFixed(1).replace('.', ',') + '\u00a0К';
      return String(Math.round(n));
    }
    return Number(n).toLocaleString('ru-RU');
  }

  // ── Удаление меток ────────────────────────────────────────────────────────

  function removeLabels() {
    document.querySelectorAll('.custom-val-label, .custom-val-dot').forEach(e => e.remove());
  }

  // ── Отрисовка ─────────────────────────────────────────────────────────────

  function drawLabels() {
    removeLabels();
    if (!labelsEnabled) return;
    document.querySelectorAll('.highcharts-root').forEach(svg => drawLabelsForChart(svg));
  }

  function drawLabelsForChart(svg) {
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
      fiber = fiber.return;
      depth++;
    }
    if (!seriesData) return;

    const plotBg = svg.querySelector('.highcharts-plot-background');
    if (!plotBg) return;
    const plotX = parseFloat(plotBg.getAttribute('x'));
    const plotY = parseFloat(plotBg.getAttribute('y'));
    const plotH = parseFloat(plotBg.getAttribute('height'));

    const graphs = svg.querySelectorAll('.highcharts-graph');

    // Собираем все метки со всех серий чтобы разрешить коллизии
    const allLabels = []; // { cx, cy, label, lineColor, labelX, labelY }

    graphs.forEach((graph, seriesIndex) => {
      const points = seriesData[seriesIndex]?.data;
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
          seriesIndex,
          pointIndex: i,
        });
      });
    });

    // Разрешаем коллизии — поднимаем метки которые перекрываются
    const labelH = 20; // высота подписи
    const labelMinGap = 4; // минимальный зазор между подписями
    const baseOffset = 18; // базовый отступ от точки вверх

    // Для каждой метки считаем начальный Y и двигаем если пересекается
    const placed = allLabels.map(lbl => ({
      ...lbl,
      ly: lbl.cy - baseOffset, // верхний край подписи
    }));

    // Несколько проходов для устранения наложений
    for (let pass = 0; pass < 10; pass++) {
      let anyMoved = false;
      for (let a = 0; a < placed.length; a++) {
        for (let b = a + 1; b < placed.length; b++) {
          const pa = placed[a];
          const pb = placed[b];
          const dx = Math.abs(pa.cx - pb.cx);
          if (dx > 80) continue; // далеко по X — не пересекаются

          const topA = pa.ly - labelH;
          const topB = pb.ly - labelH;
          const overlap = Math.min(pa.ly, pb.ly) - Math.max(topA, topB);
          if (overlap > 0) {
            // Двигаем верхнюю выше
            if (pa.cy <= pb.cy) {
              placed[a].ly -= overlap + labelMinGap;
            } else {
              placed[b].ly -= overlap + labelMinGap;
            }
            anyMoved = true;
          }
        }
      }
      if (!anyMoved) break;
    }

    // Рисуем
    placed.forEach(({ cx, cy, label, lineColor, ly }) => {
      // Линия от точки до подписи если отступ большой
      const labelY = ly;
      const offset = cy - baseOffset - labelY;
      if (offset > 2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', cx);
        line.setAttribute('y1', cy - 8);
        line.setAttribute('x2', cx);
        line.setAttribute('y2', labelY + 2);
        line.setAttribute('stroke', lineColor);
        line.setAttribute('stroke-width', 1);
        line.setAttribute('stroke-dasharray', '2,2');
        line.setAttribute('opacity', '0.6');
        line.setAttribute('class', 'custom-val-dot');
        svg.appendChild(line);
      }

      // Внешний круг
      const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      outerCircle.setAttribute('cx', cx);
      outerCircle.setAttribute('cy', cy);
      outerCircle.setAttribute('r', 7);
      outerCircle.setAttribute('fill', 'white');
      outerCircle.setAttribute('stroke', lineColor);
      outerCircle.setAttribute('stroke-width', 2);
      outerCircle.setAttribute('class', 'custom-val-dot');
      svg.appendChild(outerCircle);

      // Внутренний круг
      const innerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      innerCircle.setAttribute('cx', cx);
      innerCircle.setAttribute('cy', cy);
      innerCircle.setAttribute('r', 3.5);
      innerCircle.setAttribute('fill', lineColor);
      innerCircle.setAttribute('class', 'custom-val-dot');
      svg.appendChild(innerCircle);

      // Измеряем ширину текста
      const tempText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tempText.setAttribute('font-size', '11');
      tempText.setAttribute('font-family', 'YS Text, Arial, sans-serif');
      tempText.textContent = label;
      svg.appendChild(tempText);
      const tw = tempText.getComputedTextLength();
      svg.removeChild(tempText);

      const pad = 5;
      const bw = tw + pad * 2;
      const bh = 18;

      // Фон
      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', cx - bw / 2);
      rect.setAttribute('y', labelY - bh + 2);
      rect.setAttribute('width', bw);
      rect.setAttribute('height', bh);
      rect.setAttribute('rx', 4);
      rect.setAttribute('ry', 4);
      rect.setAttribute('fill', lineColor);
      rect.setAttribute('opacity', '0.9');
      rect.setAttribute('class', 'custom-val-label');
      svg.appendChild(rect);

      // Текст
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', labelY - 4);
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

  // ── UI ────────────────────────────────────────────────────────────────────

  function createToggle() {
    if (document.getElementById('metrika-labels-toggle-wrap')) return;

    const wrap = document.createElement('div');
    wrap.id = 'metrika-labels-toggle-wrap';
    wrap.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 99999;
      background: #fff;
      border: 1px solid #d9d9d9;
      border-radius: 8px;
      padding: 8px 14px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.13);
      font-family: YS Text, Arial, sans-serif;
      font-size: 13px;
      color: #333;
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


    const authorDiv = document.createElement('div');
    authorDiv.style.cssText = 'border-top:1px solid #eee;margin-top:2px;padding-top:6px;font-size:11px;color:#999;display:flex;align-items:center;gap:4px;';
    authorDiv.innerHTML = 'by <a href="https://t.me/seregaseo" target="_blank" rel="noopener noreferrer" style="color:#5B8AF0;text-decoration:none;font-weight:600;">@sc00d</a>';
    wrap.appendChild(authorDiv);

    document.body.appendChild(wrap);
  }

  // ── Запуск ────────────────────────────────────────────────────────────────

  // Ждём появления графика — опрашиваем каждые 500мс до 30 секунд
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
      if (tries > 60) clearInterval(interval); // 30 сек таймаут
    }, 500);
  }

  // После первого появления — следим за изменениями
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
