const grid = document.getElementById("riverGrid");

// ===== LOAD =====
async function loadRivers() {
  try {
    const res = await fetch("rivers.json");
    const rivers = await res.json();
    renderRivers(rivers);
  } catch (err) {
    console.error("Error loading rivers:", err);
  }
}

// ===== FETCH GAUGE =====
async function fetchGauge(site) {
  try {
    const res = await fetch(
      `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00065,00060&siteStatus=all`
    );
    const data = await res.json();

    let level = null;
    let flow = null;

    data.value.timeSeries.forEach((series) => {
      const code = series.variable.variableCode[0].value;

      if (code === "00065") {
        level = parseFloat(series.values[0].value[0].value);
      }

      if (code === "00060") {
        flow = parseFloat(series.values[0].value[0].value);
      }
    });

    return { level, flow };
  } catch {
    return { level: null, flow: null };
  }
}

// ===== FETCH WEATHER =====
async function fetchWeather(lat, lon) {
  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode`
    );
    const data = await res.json();

    return {
      temp: data.current.temperature_2m,
      code: data.current.weathercode
    };
  } catch {
    return { temp: null, code: null };
  }
}

// ===== STATUS LOGIC =====
function getStatus(level, min, max) {
  if (level === null) {
    return { label: "No Data", text: "No data available", class: "status-none" };
  }

  if (level < min * 0.85) {
    return { label: "Low", text: "Low water — may be scrapey", class: "status-low" };
  }

  if (level < min) {
    return { label: "Marginal", text: "Marginal — floatable in spots", class: "status-warn" };
  }

  if (level <= max) {
    return { label: "Good", text: "In range — good float", class: "status-good" };
  }

  if (level <= max * 1.3) {
    return { label: "High", text: "High water — fast current", class: "status-high" };
  }

  return { label: "Blown Out", text: "Very high — not recommended", class: "status-bad" };
}

// ===== WEATHER TEXT =====
function weatherText(code) {
  if (code === null) return "Weather unavailable";
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code <= 48) return "Cloudy";
  if (code <= 67) return "Rain";
  return "Mixed";
}

// ===== RENDER =====
function renderRivers(rivers) {
  grid.innerHTML = "";

  rivers.forEach(async (river) => {
    const card = document.createElement("div");
    card.className = "river-card";

    card.innerHTML = `
      <div class="card-body">
        <div class="card-top-row">
          <div>
            <h3 class="river-name">${river.river}</h3>
            <p class="river-section">${river.section}</p>
          </div>
          <span class="status-badge">--</span>
        </div>

        <div class="card-main-stats">
          <div class="level">-- ft</div>
          <div class="flow">-- cfs</div>
        </div>

        <div class="card-secondary">
          <div class="temp">--°</div>
          <div class="weather">--</div>
        </div>

        <div class="condition-text">Loading...</div>

        <div class="card-link">View Report →</div>
      </div>
    `;

    grid.appendChild(card);

    const gauge = await fetchGauge(river.site);
    const weather = await fetchWeather(river.lat, river.lon);
    const status = getStatus(gauge.level, river.idealMin, river.idealMax);

    // UPDATE UI
    card.querySelector(".level").textContent =
      gauge.level !== null ? `${gauge.level.toFixed(1)} ft` : "--";

    card.querySelector(".flow").textContent =
      gauge.flow !== null ? `${Math.round(gauge.flow)} cfs` : "--";

    card.querySelector(".temp").textContent =
      weather.temp !== null ? `${Math.round(weather.temp)}°` : "--";

    card.querySelector(".weather").textContent =
      weatherText(weather.code);

    const badge = card.querySelector(".status-badge");
    badge.textContent = status.label;
    badge.classList.add(status.class);

    card.querySelector(".condition-text").textContent = status.text;
  });
}

// ===== INIT =====
loadRivers();
