const riverGrid = document.getElementById("riverGrid");
const riverCardTemplate = document.getElementById("riverCardTemplate");
const messageBox = document.getElementById("messageBox");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");

let riversData = [];
let refreshInProgress = false;

let gaugeCache = new Map();
let weatherCache = new Map();

async function loadApp() {
  showMessage("", false);

  try {
    riversData = await loadRivers();
    renderRiverCards(riversData);
    await populateAllCards();
    updateLastUpdated();
  } catch (error) {
    console.error("App load failed:", error);
    showMessage("Failed to load river data.", true);
  }
}

async function loadRivers() {
  const response = await fetch("rivers.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load rivers.json (${response.status})`);
  }

  const rivers = await response.json();

  if (!Array.isArray(rivers)) {
    throw new Error("rivers.json is not a valid array");
  }

  return rivers;
}

function renderRiverCards(rivers) {
  riverGrid.innerHTML = "";

  rivers.forEach((river, index) => {
    const fragment = riverCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".river-card");

    const imageWrap = fragment.querySelector(".card-image-wrap");
    const image = fragment.querySelector(".river-image");
    const riverName = fragment.querySelector(".river-name");
    const riverSection = fragment.querySelector(".river-section");
    const statusBadge = fragment.querySelector(".status-badge");
    const gaugeHeight = fragment.querySelector(".gauge-height");
    const gaugeSummary = fragment.querySelector(".gauge-summary");
    const discharge = fragment.querySelector(".discharge");
    const temp = fragment.querySelector(".temp");
    const weatherCurrent = fragment.querySelector(".weather-current");
    const weatherSummary = fragment.querySelector(".weather-summary");
    const weatherStrip = fragment.querySelector(".weather-strip");
    const recommendationText = fragment.querySelector(".recommendation-text");
    const rangeText = fragment.querySelector(".range-text");
    const notes = fragment.querySelector(".notes");
    const usgsLink = fragment.querySelector(".usgs-link");

    riverName.textContent = river.river || "Unknown River";
    riverSection.textContent = river.section || "Unknown Section";
    statusBadge.textContent = "Loading";
    statusBadge.className = "status-badge";

    gaugeHeight.textContent = "--";
    gaugeSummary.textContent = "Loading gauge...";
    discharge.textContent = "--";
    temp.textContent = "--";
    weatherCurrent.textContent = "Loading weather...";
    weatherSummary.textContent = "";
    recommendationText.textContent = "";
    rangeText.textContent = `Ideal range: ${formatRange(river.idealMin, river.idealMax)}`;
    notes.textContent = river.notes || "";

    usgsLink.href = getUsgsSiteUrl(river.site);

    if (river.image) {
      image.src = river.image;
      image.alt = `${river.river} - ${river.section}`;
      image.loading = "lazy";
      image.decoding = "async";
      image.addEventListener("error", () => {
        imageWrap.style.display = "none";
      });
    } else {
      imageWrap.style.display = "none";
    }

    card.dataset.index = String(index);

    riverGrid.appendChild(fragment);
  });
}

async function populateAllCards() {
  const cards = Array.from(riverGrid.querySelectorAll(".river-card"));

  await Promise.all(
    cards.map(async (card) => {
      const index = Number(card.dataset.index);
      const river = riversData[index];
      if (!river) return;
      await populateCard(card, river);
    })
  );
}

async function populateCard(card, river) {
  const statusBadge = card.querySelector(".status-badge");
  const gaugeHeight = card.querySelector(".gauge-height");
  const gaugeSummary = card.querySelector(".gauge-summary");
  const discharge = card.querySelector(".discharge");
  const temp = card.querySelector(".temp");
  const weatherCurrent = card.querySelector(".weather-current");
  const weatherSummary = card.querySelector(".weather-summary");
  const weatherStrip = card.querySelector(".weather-strip");
  const recommendationText = card.querySelector(".recommendation-text");

  try {
    const [gaugeData, weatherData] = await Promise.all([
      getGaugeData(river.site),
      getWeatherData(river.lat, river.lon)
    ]);

    const level = gaugeData.height;
    const flow = gaugeData.discharge;
    const waterTemp = gaugeData.waterTemp;
    const condition = getCondition(level, river.idealMin, river.idealMax);

    // CLEAN DISPLAY LOGIC
    gaugeHeight.textContent = level !== null ? `${level.toFixed(2)} ft` : "--";

    gaugeSummary.textContent = getGaugeSummary(condition, level, river);

    discharge.textContent = flow !== null ? `${Math.round(flow)} cfs` : "--";
    temp.textContent = waterTemp !== null ? `${Math.round(waterTemp)}°F` : "--";

    weatherCurrent.textContent =
      weatherData.currentTemp !== null
        ? `${Math.round(weatherData.currentTemp)}°F air`
        : "No weather";

    weatherSummary.textContent = weatherData.summary || "";

    recommendationText.textContent = getRecommendationText(condition, river);

    statusBadge.textContent = getShortCondition(condition);
    statusBadge.className = `status-badge ${getStatusClass(condition)}`;

    renderWeatherStrip(weatherStrip, weatherData.forecast);
  } catch (error) {
    console.error("Card error:", error);

    gaugeHeight.textContent = "--";
    gaugeSummary.textContent = "No data";
    discharge.textContent = "--";
    temp.textContent = "--";
    weatherCurrent.textContent = "No weather";
    weatherSummary.textContent = "";
    recommendationText.textContent = "";

    statusBadge.textContent = "--";
    statusBadge.className = "status-badge";

    weatherStrip.innerHTML = "";
  }
}

function getGaugeData(site) {
  if (!gaugeCache.has(site)) {
    gaugeCache.set(site, fetchGaugeData(site));
  }
  return gaugeCache.get(site);
}

function getWeatherData(lat, lon) {
  const key = `${lat},${lon}`;
  if (!weatherCache.has(key)) {
    weatherCache.set(key, fetchWeatherData(lat, lon));
  }
  return weatherCache.get(key);
}

async function fetchGaugeData(site) {
  try {
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00065,00060,00010`;
    const res = await fetch(url);
    const data = await res.json();

    const series = data?.value?.timeSeries || [];

    let height = null;
    let discharge = null;
    let waterTempC = null;

    for (const item of series) {
      const code = item.variable.variableCode[0].value;
      const val = parseFloat(item.values[0].value[0].value);

      if (code === "00065") height = val;
      if (code === "00060") discharge = val;
      if (code === "00010") waterTempC = val;
    }

    return {
      height,
      discharge,
      waterTemp: waterTempC ? cToF(waterTempC) : null
    };
  } catch {
    return { height: null, discharge: null, waterTemp: null };
  }
}

async function fetchWeatherData(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    const data = await res.json();

    const forecast = (data.daily.time || []).slice(0, 7).map((d, i) => ({
      day: new Date(d).toLocaleDateString(undefined, { weekday: "short" }),
      high: data.daily.temperature_2m_max[i],
      low: data.daily.temperature_2m_min[i]
    }));

    return {
      currentTemp: data.current.temperature_2m,
      summary: weatherCodeToText(data.current.weather_code),
      forecast
    };
  } catch {
    return { currentTemp: null, summary: "", forecast: [] };
  }
}

function getCondition(level, min, max) {
  if (level === null) return "No Data";
  if (level < min) return "Too Low";
  if (level > max) return "Too High";
  return "Good";
}

function getShortCondition(condition) {
  if (condition === "Good") return "Good";
  if (condition === "Too Low") return "Low";
  if (condition === "Too High") return "High";
  return "--";
}

function getStatusClass(condition) {
  if (condition === "Good") return "status-good";
  if (condition === "Too Low") return "status-warning";
  if (condition === "Too High") return "status-bad";
  return "";
}

function getGaugeSummary(condition, level, river) {
  if (level === null) return "No gauge data";

  if (condition === "Good") return "In float range";
  if (condition === "Too Low") return "Below float range";
  if (condition === "Too High") return "Above float range";

  return "";
}

function getRecommendationText(condition, river) {
  if (condition === "Good") return "Good float conditions";
  if (condition === "Too Low") return "Likely scrapey";
  if (condition === "Too High") return "High / pushy water";
  return "";
}

function renderWeatherStrip(el, forecast) {
  el.innerHTML = "";

  forecast.forEach((d) => {
    const span = document.createElement("span");
    span.textContent = `${d.day} ${Math.round(d.high)}°`;
    el.appendChild(span);
  });
}

function weatherCodeToText(code) {
  return ["Clear", "Partly cloudy", "Cloudy", "Rain", "Storm"][code] || "";
}

function formatRange(min, max) {
  return `${min}–${max}`;
}

function getUsgsSiteUrl(site) {
  return `https://waterdata.usgs.gov/monitoring-location/${site}/`;
}

function cToF(c) {
  return (c * 9) / 5 + 32;
}

function updateLastUpdated() {
  const now = new Date();
  lastUpdated.textContent = `Updated ${now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function showMessage(msg, error = false) {
  if (!msg) {
    messageBox.classList.add("hidden");
    return;
  }
  messageBox.textContent = msg;
  messageBox.classList.remove("hidden");
  if (error) messageBox.classList.add("error");
}

function clearCaches() {
  gaugeCache.clear();
  weatherCache.clear();
}

refreshBtn.addEventListener("click", async () => {
  if (refreshInProgress) return;

  refreshInProgress = true;
  refreshBtn.disabled = true;

  clearCaches();
  renderRiverCards(riversData);
  await populateAllCards();
  updateLastUpdated();

  refreshBtn.disabled = false;
  refreshInProgress = false;
});

loadApp();
