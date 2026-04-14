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
    recommendationText.textContent = "Loading recommendation...";
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

    gaugeHeight.textContent = level !== null ? `${level.toFixed(2)} ft` : "Unavailable";
    gaugeSummary.textContent = getGaugeSummary(condition, level, river.idealMin, river.idealMax);

    discharge.textContent = flow !== null ? `${Math.round(flow)} cfs` : "Unavailable";
    temp.textContent = waterTemp !== null ? `${Math.round(waterTemp)}°F` : "Unavailable";

    weatherCurrent.textContent =
      weatherData.currentTemp !== null
        ? `${Math.round(weatherData.currentTemp)}°F air temp`
        : "Weather unavailable";

    weatherSummary.textContent = weatherData.summary;
    recommendationText.textContent = getRecommendationText(condition, river);

    statusBadge.textContent = condition;
    statusBadge.className = `status-badge ${getStatusClass(condition)}`;

    renderWeatherStrip(weatherStrip, weatherData.forecast);
  } catch (error) {
    console.error(`Failed to populate card for ${river.river} / ${river.section}:`, error);

    gaugeHeight.textContent = "Unavailable";
    gaugeSummary.textContent = "Could not load gauge";
    discharge.textContent = "Unavailable";
    temp.textContent = "Unavailable";
    weatherCurrent.textContent = "Weather unavailable";
    weatherSummary.textContent = "";
    recommendationText.textContent = "Data unavailable right now.";

    statusBadge.textContent = "No Data";
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
  const key = `${lat},${lon}`;

  if (!lat || !lon) {
    return Promise.resolve({
      currentTemp: null,
      summary: "",
      forecast: []
    });
  }

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

    const forecast = dailyTimes.slice(0, 7).map((date, index) => ({
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

function getGaugeSummary(condition, level, min, max) {
  if (level === null) return "No live gauge height";

  if (condition === "Too Low") {
    return `${level.toFixed(2)} ft • below ideal ${Number(min).toFixed(1)} ft`;
  }

  if (condition === "Too High") {
    return `${level.toFixed(2)} ft • above ideal ${Number(max).toFixed(1)} ft`;
  }

  if (condition === "Good") {
    return `${level.toFixed(2)} ft • in the float window`;
  }

  return "No gauge summary";
}

function getRecommendationText(condition, river) {
  if (condition === "Good") {
    return `Looks runnable for ${river.section}.`;
  }

  if (condition === "Too Low") {
    return `Probably scrapey or bony for ${river.section}.`;
  }

  if (condition === "Too High") {
    return `Likely pushy or less friendly for casual floating.`;
  }

  return "Not enough live data to judge right now.";
}

function getStatusClass(condition) {
  if (condition === "Good") return "status-good";
  if (condition === "Too Low") return "status-warning";
  if (condition === "Too High") return "status-bad";
  return "";
}

function renderWeatherStrip(element, forecast) {
  element.innerHTML = "";

  if (!forecast.length) {
    const empty = document.createElement("span");
    empty.textContent = "No forecast";
    element.appendChild(empty);
    return;
  }

  forecast.forEach((day) => {
    const chip = document.createElement("span");
    const high = day.high !== null ? `${day.high}°` : "--";
    const low = day.low !== null ? `${day.low}°` : "--";

    chip.textContent = `${day.day} ${high}/${low}`;
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

  return map[code] || "Weather";
}

function formatDayLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function formatRange(min, max) {
  const minText = Number.isFinite(min) ? min : "--";
  const maxText = Number.isFinite(max) ? max : "--";
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
  lastUpdated.textContent = `Last updated ${now.toLocaleTimeString([], {
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
