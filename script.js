const riverGrid = document.getElementById("riverGrid");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");
const template = document.getElementById("riverCardTemplate");
const messageBox = document.getElementById("messageBox");
const riverCount = document.getElementById("riverCount");
const topPicks = document.getElementById("topPicks");

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

function showMessage(text) {
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.classList.remove("hidden");
}

function hideMessage() {
  if (!messageBox) return;
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

function getDecisionScore(readings, weather, trendValues, river) {
  let score = 0;

  if (readings.gaugeHeight !== null) {
    if (readings.gaugeHeight >= river.idealMin && readings.gaugeHeight <= river.idealMax) {
      score += 50;
    } else if (readings.gaugeHeight < river.idealMin) {
      score += 10;
    } else {
      score += 20;
    }
  }

  if (weather) {
    if (weather.currentTemp !== null && weather.currentTemp >= 68) score += 10;
    if (weather.windSpeed !== null && weather.windSpeed <= 12) score += 10;

    const text = (weather.text || "").toLowerCase();
    if (text.includes("rain") || text.includes("storm") || text.includes("shower")) {
      score -= 8;
    }
  }

  const trend = getTrendInfo(trendValues || []);
  if (trend.label === "Stable") score += 10;
  if (trend.label === "Rising") score += 5;
  if (trend.label === "Falling") score += 3;

  if (score >= 65) return { label: "Best Bet", className: "status-good", score };
  if (score >= 45) return { label: "Good Option", className: "status-good", score };
  if (score >= 25) return { label: "Maybe", className: "status-warning", score };
  return { label: "Skip", className: "status-bad", score };
}

async function loadRiverList() {
  const res = await fetch("rivers.json");
  const data = await res.json();
  return data;
}

async function fetchRiverData(siteNumber) {
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${siteNumber}&parameterCd=00065,00060,00010`;

  const res = await fetch(url);
  const data = await res.json();

  const series = data?.value?.timeSeries || [];

  let gaugeHeight = null;
  let discharge = null;
  let tempC = null;

  for (const item of series) {
    const code = item.variable.variableCode[0].value;
    const value = Number(item.values[0].value[0].value);

    if (code === "00065") gaugeHeight = value;
    if (code === "00060") discharge = value;
    if (code === "00010") tempC = value;
  }

  return {
    gaugeHeight,
    discharge,
    temperature: tempC !== null ? (tempC * 9) / 5 + 32 : null
  };
}

async function fetchWeather(lat, lon) {
  try {
    const point = await fetch(`https://api.weather.gov/points/${lat},${lon}`);
    const pointData = await point.json();

    const forecastUrl = pointData.properties.forecast;
    const hourlyUrl = pointData.properties.forecastHourly;

    const forecast = await fetch(forecastUrl);
    const forecastData = await forecast.json();

    let currentTemp = null;
    let windSpeed = null;
    let text = null;

    if (hourlyUrl) {
      const hourly = await fetch(hourlyUrl);
      const hourlyData = await hourly.json();
      const now = hourlyData.properties.periods[0];

      currentTemp = now.temperature;
      text = now.shortForecast;

      const match = now.windSpeed.match(/\d+/);
      windSpeed = match ? Number(match[0]) : null;
    }

    const days = forecastData.properties.periods
      .filter(p => p.isDaytime)
      .slice(0, 7);

    return {
      currentTemp,
      windSpeed,
      text,
      dailyTemps: days.map(d => d.temperature),
      dailyTimes: days.map(d => d.startTime)
    };

  } catch {
    return null;
  }
}

function buildWeatherStrip(container, times, temps) {
  container.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const day = times[i] ? formatShortDay(times[i]) : "--";
    const temp = temps[i] ? `${temps[i]}°` : "--";
    const span = document.createElement("span");
    span.textContent = `${day} ${temp}`;
    container.appendChild(span);
  }
}

function buildCard(item) {
  const { river, readings, weather } = item;
  const node = template.content.cloneNode(true);

  node.querySelector(".river-name").textContent = river.river;
  node.querySelector(".river-section").textContent = river.section;

  node.querySelector(".gauge-height").textContent =
    readings.gaugeHeight ? readings.gaugeHeight.toFixed(2) + " ft" : "--";

  node.querySelector(".discharge").textContent =
    readings.discharge ? Math.round(readings.discharge) + " cfs" : "--";

  node.querySelector(".temp").textContent =
    readings.temperature ? readings.temperature.toFixed(1) + "°F" : "--";

  const weatherCurrent = node.querySelector(".weather-current");
  const weatherSummary = node.querySelector(".weather-summary");
  const weatherStrip = node.querySelector(".weather-strip");

  if (weather) {
    weatherCurrent.textContent = `${weather.currentTemp}°F • ${weather.text}`;
    weatherSummary.textContent = `${weather.windSpeed} mph wind`;
    buildWeatherStrip(weatherStrip, weather.dailyTimes, weather.dailyTemps);
  } else {
    weatherCurrent.textContent = "Weather unavailable";
  }

  return node;
}

async function loadRivers() {
  const list = await loadRiverList();

  const items = await Promise.all(
    list.map(async river => {
      const readings = await fetchRiverData(river.site);
      const weather = await fetchWeather(river.lat, river.lon);
      return { river, readings, weather };
    })
  );

  riverGrid.innerHTML = "";
  items.forEach(item => riverGrid.appendChild(buildCard(item)));
}

refreshBtn.addEventListener("click", loadRivers);
loadRivers();
