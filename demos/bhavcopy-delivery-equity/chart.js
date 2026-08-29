(function () {
  const state = { symbol: null, view: "lines", data: [], cache: {} };

  const svg = document.getElementById("chart");
  const tooltip = document.getElementById("tooltip");
  const wrap = document.querySelector(".chart-wrap");
  const legend = document.getElementById("legend");
  const subtitle = document.getElementById("chart-subtitle");
  const symbolSelect = document.getElementById("symbol-select");
  const NS = "http://www.w3.org/2000/svg";

  const M = { top: 16, right: 20, bottom: 34, left: 64 };
  const W = 900, H = 380;
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;

  function fmtShares(v) {
    const sign = v < 0 ? "-" : "";
    v = Math.abs(v);
    if (v >= 1e7) return sign + (v / 1e7).toFixed(2) + "Cr";
    if (v >= 1e5) return sign + (v / 1e5).toFixed(2) + "L";
    if (v >= 1e3) return sign + (v / 1e3).toFixed(1) + "K";
    return sign + String(Math.round(v));
  }
  function fmtDate(iso) {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
  }

  async function loadManifest() {
    const res = await fetch("data/manifest.json");
    return res.json();
  }

  async function loadSymbol(symbol) {
    if (state.cache[symbol]) return state.cache[symbol];
    const res = await fetch(`data/${symbol}.json`);
    const data = await res.json();
    state.cache[symbol] = data;
    return data;
  }

  function renderLegend() {
    if (state.view === "lines") {
      legend.innerHTML = `
        <div class="legend-item"><span class="swatch" style="background:var(--series-1)"></span>Traded volume (max vol_traded_today)</div>
        <div class="legend-item"><span class="swatch" style="background:var(--series-2)"></span>Delivered shares (delivery % × traded volume)</div>
      `;
    } else {
      legend.innerHTML = `
        <div class="legend-item"><span class="swatch" style="background:var(--series-1)"></span>Traded &gt; delivered</div>
        <div class="legend-item"><span class="swatch" style="background:var(--series-diff-neg)"></span>Delivered &gt; traded</div>
      `;
    }
  }

  function clearSvg() { while (svg.firstChild) svg.removeChild(svg.firstChild); }

  function drawAxes(yMin, yMax, dates, yFmt) {
    const y = v => M.top + plotH - (plotH * (v - yMin)) / (yMax - yMin);
    const ticks = 5;
    for (let t = 0; t <= ticks; t++) {
      const v = yMin + ((yMax - yMin) / ticks) * t;
      const gy = y(v);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", M.left);
      line.setAttribute("x2", W - M.right);
      line.setAttribute("y1", gy);
      line.setAttribute("y2", gy);
      line.setAttribute("class", "grid-line");
      svg.appendChild(line);

      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", M.left - 10);
      label.setAttribute("y", gy + 4);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("class", "axis-label");
      label.textContent = yFmt(v);
      svg.appendChild(label);
    }

    const n = dates.length;
    const step = Math.ceil(n / 10);
    const x = i => M.left + (plotW * i) / (n - 1);
    dates.forEach((d, i) => {
      if (i % step !== 0 && i !== n - 1) return;
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", x(i));
      label.setAttribute("y", H - M.bottom + 18);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "axis-label");
      label.textContent = fmtDate(d);
      svg.appendChild(label);
    });

    return { x, y };
  }

  function attachHover(n, x, onHover) {
    const crosshair = document.createElementNS(NS, "line");
    crosshair.setAttribute("y1", M.top);
    crosshair.setAttribute("y2", H - M.bottom);
    crosshair.setAttribute("class", "crosshair-line");
    svg.appendChild(crosshair);

    for (let i = 0; i < n; i++) {
      const bandW = plotW / n;
      const hit = document.createElementNS(NS, "rect");
      hit.setAttribute("x", x(i) - bandW / 2);
      hit.setAttribute("y", M.top);
      hit.setAttribute("width", bandW);
      hit.setAttribute("height", plotH);
      hit.setAttribute("class", "hit-area");
      hit.addEventListener("mouseenter", () => {
        crosshair.setAttribute("x1", x(i));
        crosshair.setAttribute("x2", x(i));
        crosshair.style.opacity = 1;
        onHover(i);
        tooltip.style.opacity = 1;
      });
      hit.addEventListener("mousemove", (e) => {
        const rect = wrap.getBoundingClientRect();
        tooltip.style.left = (e.clientX - rect.left + 14) + "px";
        tooltip.style.top = (e.clientY - rect.top - 10) + "px";
      });
      hit.addEventListener("mouseleave", () => {
        crosshair.style.opacity = 0;
        tooltip.style.opacity = 0;
      });
      svg.appendChild(hit);
    }
  }

  function renderLines(data) {
    const dates = data.map(d => d.date);
    const maxVal = Math.max(...data.map(d => Math.max(d.traded_volume, d.delivered_shares)));
    const { x, y } = drawAxes(0, maxVal * 1.08, dates, fmtShares);

    function pathFor(key) {
      return data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d[key])}`).join(" ");
    }
    const pathTraded = document.createElementNS(NS, "path");
    pathTraded.setAttribute("d", pathFor("traded_volume"));
    pathTraded.setAttribute("class", "line-traded");
    svg.appendChild(pathTraded);

    const pathDelivered = document.createElementNS(NS, "path");
    pathDelivered.setAttribute("d", pathFor("delivered_shares"));
    pathDelivered.setAttribute("class", "line-delivered");
    svg.appendChild(pathDelivered);

    data.forEach((d, i) => {
      const dotT = document.createElementNS(NS, "circle");
      dotT.setAttribute("cx", x(i)); dotT.setAttribute("cy", y(d.traded_volume));
      dotT.setAttribute("class", "dot dot-traded");
      svg.appendChild(dotT);

      const dotD = document.createElementNS(NS, "circle");
      dotD.setAttribute("cx", x(i)); dotD.setAttribute("cy", y(d.delivered_shares));
      dotD.setAttribute("class", "dot dot-delivered");
      svg.appendChild(dotD);
    });

    attachHover(data.length, x, (i) => {
      const d = data[i];
      tooltip.innerHTML = `
        <div class="t-date">${fmtDate(d.date)}</div>
        <div class="t-row"><span><span class="t-dot" style="background:var(--series-1)"></span>Traded</span><span class="v">${d.traded_volume.toLocaleString("en-IN")}</span></div>
        <div class="t-row"><span><span class="t-dot" style="background:var(--series-2)"></span>Delivered</span><span class="v">${d.delivered_shares.toLocaleString("en-IN")}</span></div>
        <div class="t-row"><span>Delivery %</span><span class="v">${d.delivery_pct.toFixed(1)}%</span></div>
      `;
    });
  }

  function renderDiff(data) {
    const dates = data.map(d => d.date);
    const maxAbs = Math.max(...data.map(d => Math.abs(d.diff))) * 1.15;
    const { x, y } = drawAxes(-maxAbs, maxAbs, dates, fmtShares);

    const zeroY = y(0);
    const zline = document.createElementNS(NS, "line");
    zline.setAttribute("x1", M.left); zline.setAttribute("x2", W - M.right);
    zline.setAttribute("y1", zeroY); zline.setAttribute("y2", zeroY);
    zline.setAttribute("class", "zero-line");
    svg.appendChild(zline);

    const n = data.length;
    const barW = Math.max(2, (plotW / n) * 0.6);
    data.forEach((d, i) => {
      const barY = d.diff >= 0 ? y(d.diff) : zeroY;
      const barH = Math.abs(y(d.diff) - zeroY);
      const rect = document.createElementNS(NS, "rect");
      rect.setAttribute("x", x(i) - barW / 2);
      rect.setAttribute("y", barY);
      rect.setAttribute("width", barW);
      rect.setAttribute("height", Math.max(barH, 1));
      rect.setAttribute("class", d.diff >= 0 ? "diff-bar-pos" : "diff-bar-neg");
      rect.setAttribute("rx", 2);
      svg.appendChild(rect);
    });

    attachHover(n, x, (i) => {
      const d = data[i];
      const label = d.diff >= 0 ? "Traded &gt; delivered" : "Delivered &gt; traded";
      const color = d.diff >= 0 ? "var(--series-1)" : "var(--series-diff-neg)";
      tooltip.innerHTML = `
        <div class="t-date">${fmtDate(d.date)}</div>
        <div class="t-row"><span><span class="t-dot" style="background:${color}"></span>${label}</span><span class="v">${fmtShares(d.diff)}</span></div>
        <div class="t-row"><span>Delivery %</span><span class="v">${d.delivery_pct.toFixed(1)}%</span></div>
      `;
    });
  }

  function renderTable(data) {
    const tbody = document.getElementById("table-body");
    tbody.innerHTML = data.map(d => `
      <tr>
        <td>${fmtDate(d.date)}</td>
        <td>${d.traded_volume.toLocaleString("en-IN")}</td>
        <td>${d.delivered_shares.toLocaleString("en-IN")}</td>
        <td>${d.delivery_pct.toFixed(1)}%</td>
        <td>${fmtShares(d.diff)}</td>
      </tr>
    `).join("");
  }

  function render() {
    clearSvg();
    renderLegend();
    const data = state.data;
    if (!data || data.length === 0) return;
    if (state.view === "lines") renderLines(data);
    else renderDiff(data);
    renderTable(data);
  }

  async function selectSymbol(symbol) {
    state.symbol = symbol;
    state.data = await loadSymbol(symbol);
    render();
  }

  document.getElementById("toggle-table").addEventListener("click", (e) => {
    const table = document.getElementById("data-table");
    table.classList.toggle("visible");
    e.target.textContent = table.classList.contains("visible") ? "Hide table" : "Show table";
  });

  document.querySelectorAll(".view-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".view-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      state.view = btn.dataset.view;
      render();
    });
  });

  symbolSelect.addEventListener("change", (e) => selectSymbol(e.target.value));

  (async function init() {
    const manifest = await loadManifest();
    symbolSelect.innerHTML = manifest.symbols
      .map(s => `<option value="${s}">${s}</option>`)
      .join("");
    subtitle.textContent = `Daily, ${manifest.start_date} to ${manifest.end_date} · NSE cash market`;
    await selectSymbol(manifest.symbols[0]);
  })();
})();
