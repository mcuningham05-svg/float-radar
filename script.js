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
    weatherStrip.innerHTML = "";

    recommendationText.textContent = "";
    rangeText.textContent = `Ideal: ${formatRange(river.idealMin, river.idealMax)} ft`;
    notes.textContent = river.notes || "";

    usgsLink.href = getUsgsSiteUrl(river.site);

    if (river.image) {
      imageWrap.style.display = "";
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

    gaugeHeight.textContent = level !== null ? `${level.toFixed(2)} ft` : "--";
    gaugeSummary.textContent = getGaugeSummary(condition, level);

    discharge.textContent = flow !== null ? `${Math.round(flow)} cfs` : "--";
    temp.textContent = waterTemp !== null ? `${Math.round(waterTemp)}°F` : "--";

    weatherCurrent.textContent =
      weatherData.currentTemp !== null
        ? `${Math.round(weatherData.currentTemp)}°F air`
        : "No weather";

    weatherSummary.textContent = weatherData.summary || "";

    recommendationText.textContent = getRecommendationText(condition);

    statusBadge.textContent = getBadgeText(condition);
    statusBadge.className = `status-badge ${getStatusClass(condition)}`;

    renderWeatherStrip(weatherStrip, weatherData.forecast);
  } catch (error) {
    console.error(`Failed to populate card for ${river.river} / ${river.section}:`, error);

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
  if (!site) {
    return Promise.resolve({
      height: null,
      discharge: null,
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
      currentTemp: null,
      summary: "",
      forecast: []
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

    let height = null;
    let discharge = null;
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
        height = numericValue;
      } else if (variableCode === "00060") {
        discharge = numericValue;
      } else if (variableCode === "00010") {
        waterTempC = numericValue;
      }
    }

    return {
      height,
      discharge,
      waterTemp: waterTempC !== null ? cToF(waterTempC) : null
    };
  } catch (error) {
    console.error(`Gauge fetch failed for site ${site}:`, error);
    return {
      height: null,
      discharge: null,
      waterTemp: null
    };
  }
}

async function fetchWeatherData(lat, lon) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      `&current=temperature_2m,weather_code` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
      `&temperature_unit=fahrenheit&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Weather request failed (${response.status})`);
    }

    const data = await response.json();

    const currentTemp = Number.isFinite(data?.current?.temperature_2m)
      ? data.current.temperature_2m
      : null;

    const currentCode = data?.current?.weather_code;
    const dailyTimes = data?.daily?.time || [];
    const dailyMax = data?.daily?.temperature_2m_max || [];
    const dailyMin = data?.daily?.temperature_2m_min || [];
    const dailyCodes = data?.daily?.weather_code || [];

    const forecast = dailyTimes.slice(0, 3).map((date, index) => ({
      day: formatDayLabel(date),
      high: Number.isFinite(dailyMax[index]) ? Math.round(dailyMax[index]) : null,
      low: Number.isFinite(dailyMin[index]) ? Math.round(dailyMin[index]) : null,
      label: weatherCodeToText(dailyCodes[index])
    }));

    return {
      currentTemp,
      summary: weatherCodeToText(currentCode),
      forecast
    };
  } catch (error) {
    console.error(`Weather fetch failed for ${lat}, ${lon}:`, error);
    return {
      currentTemp: null,
      summary: "",
      forecast: []
    };
  }
}

function getCondition(level, min, max) {
  if (level === null) return "No Data";
  if (level < min) return "Too Low";
  if (level > max) return "Too High";
  return "Good";
}

function getBadgeText(condition) {
  if (condition === "Good") return "GOOD";
  if (condition === "Too Low") return "LOW";
  if (condition === "Too High") return "HIGH";
  return "--";
}

function getStatusClass(condition) {
  if (condition === "Good") return "status-good";
  if (condition === "Too Low") return "status-warning";
  if (condition === "Too High") return "status-bad";
  return "";
}

function getGaugeSummary(condition, level) {
  if (level === null) return "No gauge data";
  if (condition === "Good") return "In float range";
  if (condition === "Too Low") return "Below float range";
  if (condition === "Too High") return "Above float range";
  return "";
}

function getRecommendationText(condition) {
  if (condition === "Good") return "Good to float";
  if (condition === "Too Low") return "Low water";
  if (condition === "Too High") return "High water";
  return "";
}

function renderWeatherStrip(element, forecast) {
  element.innerHTML = "";

  if (!forecast.length) return;

  forecast.forEach((day) => {
    const chip = document.createElement("span");
    const high = day.high !== null ? `${day.high}°` : "--";
    chip.textContent = `${day.day} ${high}`;
    chip.title = day.label || "";
    element.appendChild(chip);
  });
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
    56: "Freezing drizzle",
    57: "Freezing drizzle",
    61: "Light rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Freezing rain",
    67: "Freezing rain",
    71: "Light snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Rain showers",
    81: "Rain showers",
    82: "Heavy showers",
    85: "Snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm",
    99: "Thunderstorm"
  };

  return map[code] || "";
}

function formatDayLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function formatRange(min, max) {
  const minText = Number.isFinite(min) ? min.toFixed(1) : "--";
  const maxText = Number.isFinite(max) ? max.toFixed(1) : "--";
  return `${minText}–${maxText}`;
}

function getUsgsSiteUrl(site) {
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(site)}/`;
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

function showMessage(message, isError = false) {
  if (!message) {
    messageBox.textContent = "";
    messageBox.classList.add("hidden");
    messageBox.classList.remove("error");
    return;
  }

  messageBox.textContent = message;
  messageBox.classList.remove("hidden");

  if (isError) {
    messageBox.classList.add("error");
  } else {
    messageBox.classList.remove("error");
  }
}

function clearRequestCaches() {
  gaugeCache = new Map();
  weatherCache = new Map();
}

refreshBtn.addEventListener("click", async () => {
  if (refreshInProgress) return;

  refreshInProgress = true;
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";

  try {
    clearRequestCaches();
    renderRiverCards(riversData);
    await populateAllCards();
    updateLastUpdated();
    showMessage("River data refreshed.");
    window.setTimeout(() => showMessage("", false), 1500);
  } catch (error) {
    console.error("Refresh failed:", error);
    showMessage("Refresh failed.", true);
  } finally {
    refreshInProgress = false;
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Data";
  }
});

loadApp();
