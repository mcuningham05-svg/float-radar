const riverGrid = document.getElementById("riverGrid");
const riverSearch = document.getElementById("riverSearch");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");
const messageBox = document.getElementById("messageBox");
const heroTipText = document.getElementById("heroTipText");

let riversData = [];
let cardState = [];
let gaugeCache = new Map();
let weatherCache = new Map();

const heroTips = [
  "Drink lots of water.",
  "Don’t forget your life vest.",
  "Pick up your trash.",
  "Check the weather before you launch.",
  "Tell someone your float plan.",
  "Wear sunscreen.",
  "Watch for strainers and downed trees.",
  "Bring a dry bag for your phone and keys."
];

let currentTipIndex = 0;
let tipIntervalId = null;

async function loadApp() {
  showMessage("");

  try {
    const response = await fetch("rivers.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load rivers.json (${response.status})`);
    }

    const rivers = await response.json();
    if (!Array.isArray(rivers)) {
      throw new Error("rivers.json is not a valid array");
    }

    riversData = rivers;
    await buildCardState(riversData);
    renderCards(cardState);
    updateLastUpdated();
    startHeroTips();
  } catch (error) {
    console.error(error);
    showMessage("Could not load river data.");
  }
}

async function buildCardState(rivers) {
  const results = await Promise.all(
    rivers.map(async (river, index) => {
      const [gauge, weather] = await Promise.all([
        getGaugeData(river.site),
        getWeatherData(river.lat, river.lon)
      ]);

      const status = getStatus(gauge.level, river.idealMin, river.idealMax);

      return {
        index,
        river,
        gauge,
        weather,
        status
      };
    })
  );

  cardState = results;
}

function renderCards(items) {
  riverGrid.innerHTML = "";

  items.forEach((item) => {
    const { gauge, weather, status, index } = item;
    const river = item.river;

    const weatherLabel = getWeatherText(weather.code, weather.airTemp);
    const weatherEmoji = getWeatherEmoji(weather.code);
    const statusWithEmoji = `${status.emoji} ${status.label}`;

    const card = document.createElement("article");
    card.className = "river-card";
    card.tabIndex = 0;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-body">
          <div class="card-top-row">
            <div class="card-title-wrap">
              <h3 class="river-name">${escapeHtml(river.river)}</h3>
              <p class="river-section">${escapeHtml(river.section)}</p>
            </div>
            <span class="status-badge ${status.badgeClass}">${escapeHtml(statusWithEmoji)}</span>
          </div>

          <div class="card-main-stats">
            <div class="level">${formatLevel(gauge.level)}</div>
            <div class="flow">${formatFlow(gauge.flow)}</div>
          </div>

          <div class="card-secondary">
            <div class="secondary-item">
              <span class="secondary-label">Water Temp</span>
              <span class="secondary-value">${formatTemp(gauge.waterTemp)}</span>
            </div>
            <div class="secondary-item">
              <span class="secondary-label">Weather</span>
              <span class="secondary-value">${escapeHtml(`${weatherEmoji} ${weatherLabel}`)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card-band ${status.bandClass}">${escapeHtml(`${status.emoji} ${status.text}`)}</div>

      <div class="card-footer">
        <span class="card-link">View Report →</span>
      </div>
    `;

    card.addEventListener("click", () => openDetailPage(index));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetailPage(index);
      }
    });

    riverGrid.appendChild(card);
  });
}

function openDetailPage(index) {
  window.location.href = `detail.html?i=${encodeURIComponent(index)}`;
}

async function refreshData() {
  clearCaches();

  try {
    await buildCardState(riversData);
    renderCards(cardState);
    updateLastUpdated();
    showMessage("River data refreshed.");
    window.setTimeout(() => showMessage(""), 1400);
  } catch (error) {
    console.error(error);
    showMessage("Refresh failed.");
  }
}

function filterCards(query) {
  const search = query.trim().toLowerCase();

  if (!search) {
    renderCards(cardState);
    return;
  }

  const filtered = cardState.filter(({ river }) => {
    return [
      river.river,
      river.section,
      river.region,
      river.notes
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search));
  });

  renderCards(filtered);
}

function startHeroTips() {
  if (!heroTipText || heroTips.length === 0) return;

  heroTipText.textContent = heroTips[0];

  if (tipIntervalId) {
    clearInterval(tipIntervalId);
  }

  tipIntervalId = window.setInterval(() => {
    currentTipIndex = (currentTipIndex + 1) % heroTips.length;
    heroTipText.textContent = heroTips[currentTipIndex];
  }, 3200);
}

function getGaugeData(site) {
  if (!site) {
    return Promise.resolve({
      level: null,
      flow: null,
      waterTemp: null
    });
  }

  if (!gaugeCache.has(site)) {
    gaugeCache.set(site, fetchGaugeData(site));
  }

  return gaugeCache.get(site);
}

function getWeatherData(lat, lon) {
  if (lat === undefined || lon === undefined || lat === null || lon === null) {
    return Promise.resolve({
      airTemp: null,
      code: null
    });
  }

  const key = `${lat},${lon}`;

  if (!weatherCache.has(key)) {
    weatherCache.set(key, fetchWeatherData(lat, lon));
  }

  return weatherCache.get(key);
}

async function fetchGaugeData(site) {
  try {
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(site)}&parameterCd=00065,00060,00010&siteStatus=all`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`USGS request failed (${response.status})`);
    }

    const data = await response.json();
    const series = data?.value?.timeSeries || [];

    let level = null;
    let flow = null;
    let waterTempC = null;

    for (const item of series) {
      const variableCode = item?.variable?.variableCode?.[0]?.value;
      const value = item?.values?.[0]?.value?.[0]?.value;
      const numericValue =
        value !== undefined && value !== null && value !== ""
          ? parseFloat(value)
          : null;

      if (!Number.isFinite(numericValue)) continue;

      if (variableCode === "00065") {
        level = numericValue;
      } else if (variableCode === "00060") {
        flow = numericValue;
      } else if (variableCode === "00010") {
        waterTempC = numericValue;
      }
    }

    return {
      level,
      flow,
      waterTemp: waterTempC !== null ? cToF(waterTempC) : null
    };
  } catch (error) {
    console.error(`Gauge fetch failed for ${site}:`, error);
    return {
      level: null,
      flow: null,
      waterTemp: null
    };
  }
}

async function fetchWeatherData(lat, lon) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      `&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather request failed (${response.status})`);
    }

    const data = await response.json();

    return {
      airTemp: Number.isFinite(data?.current?.temperature_2m) ? data.current.temperature_2m : null,
      code: data?.current?.weather_code ?? null
    };
  } catch (error) {
    console.error(`Weather fetch failed for ${lat}, ${lon}:`, error);
    return {
      airTemp: null,
      code: null
    };
  }
}

function getWeatherEmoji(code) {
  if (code === null || code === undefined) return "❔";
  if (code === 0) return "☀️";
  if (code === 1) return "🌤️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) return "🌦️";
  if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) return "🌧️";
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) return "❄️";
  if (code === 80 || code === 81 || code === 82) return "🌦️";
  if (code === 95 || code === 96 || code === 99) return "⛈️";
  return "🌤️";
}

function getWeatherText(code, airTemp) {
  const temp = airTemp !== null ? `${Math.round(airTemp)}°F` : null;
  const label = weatherCodeToText(code);

  if (temp && label) return `${temp} • ${label}`;
  if (temp) return temp;
  return label || "Weather unavailable";
}

function weatherCodeToText(code) {
  const map = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Heavy drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    80: "Showers",
    81: "Showers",
    82: "Heavy showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm"
  };

  return map[code] || "Mixed";
}

function formatLevel(level) {
  return level !== null ? `${level.toFixed(1)} ft` : "--";
}

function formatFlow(flow) {
  return flow !== null ? `${Math.round(flow)} cfs` : "--";
}

function formatTemp(temp) {
  return temp !== null ? `${Math.round(temp)}°F` : "--";
}

function cToF(celsius) {
  return (celsius * 9) / 5 + 32;
}

function updateLastUpdated() {
  const now = new Date();
  lastUpdated.textContent = `Updated ${now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  })}`;
}

function showMessage(message) {
  if (!message) {
    messageBox.textContent = "";
    messageBox.classList.add("hidden");
    return;
  }

  messageBox.textContent = message;
  messageBox.classList.remove("hidden");
}

function clearCaches() {
  gaugeCache = new Map();
  weatherCache = new Map();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

if (riverSearch) {
  riverSearch.addEventListener("input", (event) => {
    filterCards(event.target.value);
  });
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", refreshData);
}

loadApp();
