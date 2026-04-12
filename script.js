const riverGrid = document.getElementById("riverGrid");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");
const template = document.getElementById("riverCardTemplate");
const messageBox = document.getElementById("messageBox");
const riverCount = document.getElementById("riverCount");

let rivers = [];

function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(decimals);
}

function getStatus(height, min, max) {
  if (height === null || Number.isNaN(Number(height))) {
    return {
      label: "No data",
      className: "",
      summary: "Unavailable",
      recommendation: "Live reading unavailable right now."
    };
  }

  if (height < min) {
    return {
      label: "Too Low",
      className: "status-bad",
      summary: "Low",
      recommendation: "Probably too low for a smooth float unless you know this section well."
    };
  }

  if (height > max) {
    return {
      label: "High",
      className: "status-warning",
      summary: "High",
      recommendation: "Running high. This may feel pushy or less forgiving depending on experience."
    };
  }

  return {
    label: "Good",
    className: "status-good",
    summary: "Runnable",
    recommendation: "Looks like a solid float day based on this starter range."
  };
}

function weatherCodeToText(code) {
  const map = {
    0: "Clear",
    1: "Mostly Clear",
    2: "Partly Cloudy",
    3: "Cloudy",
    45: "Fog",
    48: "Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
    56: "Freezing Drizzle",
    57: "Freezing Drizzle",
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    66: "Freezing Rain",
    67: "Freezing Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    77: "Snow Grains",
    80: "Showers",
    81: "Showers",
    82: "Heavy Showers",
    85: "Snow Showers",
    86: "Snow Showers",
    95: "Thunderstorm",
    96: "Storm / Hail",
    99: "Storm / Hail"
  };

  return map[code] || "Unknown";
}

function showMessage(text) {
  messageBox.textContent = text;
  messageBox.classList.remove("hidden");
}

function hideMessage() {
  messageBox.textContent = "";
  messageBox.classList.add("hidden");
}

function formatShortDay(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString([], { weekday: "short" });
}

function getTrendInfo(values) {
  const clean = values
    .map((value) => Number(value))
    .filter((value) => !Number.isNaN(value));

  if (clean.length < 2) {
    return {
      label: "Not enough data",
      changeText: "7-day change unavailable",
      arrow: "—"
    };
  }

  const first = clean[0];
  const last = clean[clean.length - 1];
  const delta = last - first;

  if (delta > 0.15) {
    return {
      label: "Rising",
      changeText: `Up ${formatNumber(delta, 2)} ft over 7 days`,
      arrow: "↑"
    };
  }

  if (delta < -0.15) {
    return {
      label: "Falling",
      changeText: `Down ${formatNumber(Math.abs(delta), 2)} ft over 7 days`,
      arrow: "↓"
    };
  }

  return {
    label: "Stable",
    changeText: `Changed ${formatNumber(Math.abs(delta), 2)} ft over 7 days`,
    arrow: "→"
  };
}

async function loadRiverList() {
  const response = await fetch("rivers.json");

  if (!response.ok) {
    throw new Error("Could not load rivers.json");
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("rivers.json is not formatted as a list");
  }

  return data;
}

async function fetchRiverData(siteNumber) {
  const url =
    `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteNumber}` +
    `&parameterCd=00065,00060,00010&siteStatus=all`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed for site ${siteNumber}`);
  }

  const data = await response.json();
  const series = data?.value?.timeSeries || [];

  let gaugeHeight = null;
  let discharge = null;
  let temperatureC = null;

  for (const item of series) {
    const paramCode = item?.variable?.variableCode?.[0]?.value;
    const latest = item?.values?.[0]?.value?.[0]?.value;

    if (latest === undefined) continue;

    const numericValue = Number(latest);

    if (paramCode === "00065") gaugeHeight = numericValue;
    if (paramCode === "00060") discharge = numericValue;
    if (paramCode === "00010") temperatureC = numericValue;
  }

  const temperatureF =
    temperatureC !== null ? (temperatureC * 9) / 5 + 32 : null;

  return {
    gaugeHeight,
    discharge,
    temperature: temperatureF
  };
}

async function fetchRiverTrend(siteNumber) {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - 7);

  const startDT = start.toISOString().slice(0, 10);
  const endDT = today.toISOString().slice(0, 10);

  const url =
    `https://waterservices.usgs.gov/nwis/dv/?format=json&sites=${siteNumber}` +
    `&startDT=${startDT}&endDT=${endDT}&parameterCd=00065&siteStatus=all`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Trend request failed for site ${siteNumber}`);
  }

  const data = await response.json();
  const series = data?.value?.timeSeries || [];

  if (!series.length) {
    return [];
  }

  const values = series[0]?.values?.[0]?.value || [];

  return values
    .map((entry) => Number(entry.value))
    .filter((value) => !Number.isNaN(value));
}

async function fetchWeather(lat, lon) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code,wind_speed_10m` +
    `&daily=temperature_2m_max,weather_code,time` +
    `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Weather request failed");
  }

  const data = await response.json();

  return {
    currentTemp: data?.current?.temperature_2m ?? null,
    windSpeed: data?.current?.wind_speed_10m ?? null,
    weatherCode: data?.current?.weather_code ?? null,
    dailyTemps: data?.daily?.temperature_2m_max || [],
    dailyCodes: data?.daily?.weather_code || [],
    dailyTimes: data?.daily?.time || []
  };
}

function buildWeatherStrip(container, times, temps) {
  container.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const item = document.createElement("span");
    const day = times[i] ? formatShortDay(times[i]) : "--";
    const temp = temps[i] !== undefined && temps[i] !== null
      ? `${Math.round(temps[i])}°`
      : "--";

    item.textContent = `${day} ${temp}`;
    container.appendChild(item);
  }
}

function buildCard(river, readings, weather, trendValues) {
  const node = template.content.cloneNode(true);

  const riverName = node.querySelector(".river-name");
  const riverSection = node.querySelector(".river-section");
  const badge = node.querySelector(".status-badge");
  const gaugeHeight = node.querySelector(".gauge-height");
  const discharge = node.querySelector(".discharge");
  const temp = node.querySelector(".temp");
  const gaugeSummary = node.querySelector(".gauge-summary");
  const recommendationText = node.querySelector(".recommendation-text");
  const rangeText = node.querySelector(".range-text");
  const notes = node.querySelector(".notes");
  const usgsLink = node.querySelector(".usgs-link");
  const weatherCurrent = node.querySelector(".weather-current");
  const weatherSummary = node.querySelector(".weather-summary");
  const weatherStrip = node.querySelector(".weather-strip");
  const trendText = node.querySelector(".trend-text");

  riverName.textContent = river.river;
  riverSection.textContent = `${river.section} • ${river.region}`;

  const status = getStatus(readings.gaugeHeight, river.idealMin, river.idealMax);
  badge.textContent = status.label;
  gaugeSummary.textContent = status.summary;
  recommendationText.textContent = status.recommendation;

  if (status.className) {
    badge.classList.add(status.className);
  }

  gaugeHeight.textContent =
    readings.gaugeHeight !== null ? `${formatNumber(readings.gaugeHeight, 2)} ft` : "--";

  discharge.textContent =
    readings.discharge !== null ? `${Math.round(readings.discharge)} cfs` : "--";

  temp.textContent =
    readings.temperature !== null ? `${formatNumber(readings.temperature, 1)} °F` : "--";

  rangeText.textContent =
    `${river.idealMin.toFixed(1)} ft to ${river.idealMax.toFixed(1)} ft`;

  notes.textContent = river.notes;
  usgsLink.href = `https://waterdata.usgs.gov/monitoring-location/${river.site}/`;

  if (weather) {
    const weatherText = weatherCodeToText(weather.weatherCode);
    const currentTempText =
      weather.currentTemp !== null ? `${Math.round(weather.currentTemp)}°F` : "--";

    const windText =
      weather.windSpeed !== null ? `${Math.round(weather.windSpeed)} mph wind` : "wind unavailable";

    weatherCurrent.textContent = `${currentTempText} • ${weatherText}`;
    weatherSummary.textContent = windText;
    buildWeatherStrip(weatherStrip, weather.dailyTimes, weather.dailyTemps);
  } else {
    weatherCurrent.textContent = "Weather unavailable";
    weatherSummary.textContent = "No forecast";
    buildWeatherStrip(weatherStrip, [], []);
  }

  const trend = getTrendInfo(trendValues || []);
  trendText.textContent = `${trend.arrow} ${trend.label} • ${trend.changeText}`;

  return node;
}

async function loadRivers() {
  hideMessage();
  riverGrid.innerHTML = "";
  lastUpdated.textContent = "Loading latest conditions...";

  try {
    if (rivers.length === 0) {
      rivers = await loadRiverList();
      riverCount.textContent = rivers.length;
    }

    const results = await Promise.all(
      rivers.map(async (river) => {
        let readings = {
          gaugeHeight: null,
          discharge: null,
          temperature: null
        };

        let weather = null;
        let trendValues = [];

        try {
          readings = await fetchRiverData(river.site);
        } catch (error) {}

        try {
          weather = await fetchWeather(river.lat, river.lon);
        } catch (error) {}

        try {
          trendValues = await fetchRiverTrend(river.site);
        } catch (error) {}

        return buildCard(river, readings, weather, trendValues);
      })
    );

    results.forEach((card) => riverGrid.appendChild(card));
    lastUpdated.textContent = `Updated ${new Date().toLocaleString()}`;
  } catch (error) {
    showMessage("Could not load river data. Check that rivers.json exists and is committed.");
    lastUpdated.textContent = "Load failed";
  }
}

refreshBtn.addEventListener("click", loadRivers);
loadRivers();
