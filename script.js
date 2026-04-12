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
    if (
      text.includes("rain") ||
      text.includes("storm") ||
      text.includes("shower") ||
      text.includes("thunder")
    ) {
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

function renderTopPicks(items) {
  if (!topPicks) return;

  topPicks.innerHTML = "";

  const best = [...items]
    .sort((a, b) => b.decision.score - a.decision.score)
    .slice(0, 3);

  best.forEach((item) => {
    const div = document.createElement("div");
    div.className = "stat-box";
    div.innerHTML = `
      <span class="stat-label">${item.decision.label}</span>
      <span class="stat-value">${item.river.river} — ${item.river.section}</span>
    `;
    topPicks.appendChild(div);
  });
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

  return {
    gaugeHeight,
    discharge,
    temperature: temperatureC !== null ? (temperatureC * 9) / 5 + 32 : null
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
    return [];
  }

  const data = await response.json();
  const series = data?.value?.timeSeries || [];
  if (!series.length) return [];

  const values = series[0]?.values?.[0]?.value || [];
  return values.map((entry) => Number(entry.value)).filter((value) => !Number.isNaN(value));
}

async function fetchWeatherFromNws(lat, lon) {
  try {
    const pointRes = await fetch(
      `https://api.weather.gov/points/${encodeURIComponent(lat)},${encodeURIComponent(lon)}`,
      {
        headers: {
          Accept: "application/geo+json"
        }
      }
    );

    if (!pointRes.ok) {
      return null;
    }

    const pointData = await pointRes.json();
    const forecastUrl = pointData?.properties?.forecast;
    const hourlyUrl = pointData?.properties?.forecastHourly;

    if (!forecastUrl) {
      return null;
    }

    const forecastRes = await fetch(forecastUrl, {
      headers: {
        Accept: "application/geo+json"
      }
    });

    if (!forecastRes.ok) {
      return null;
    }

    const forecastData = await forecastRes.json();
    const dailyPeriods = forecastData?.properties?.periods || [];

    let currentTemp = null;
    let windSpeed = null;
    let text = null;

    if (hourlyUrl) {
      const hourlyRes = await fetch(hourlyUrl, {
        headers: {
          Accept: "application/geo+json"
        }
      });

      if (hourlyRes.ok) {
        const hourlyData = await hourlyRes.json();
        const now = hourlyData?.properties?.periods?.[0];

        if (now) {
          currentTemp = now.temperature ?? null;
          text = now.shortForecast ?? null;

          if (typeof now.windSpeed === "string") {
            const match = now.windSpeed.match(/\d+/);
            windSpeed = match ? Number(match[0]) : null;
          } else {
            windSpeed = now.windSpeed ?? null;
          }
        }
      }
    }

    const daytimePeriods = dailyPeriods
      .filter((period) => period.isDaytime)
      .slice(0, 7);

    return {
      source: "NWS",
      currentTemp,
      windSpeed,
      text,
      dailyTemps: daytimePeriods.map((period) => period.temperature ?? null),
      dailyTimes: daytimePeriods.map((period) => period.startTime ?? null)
    };
  } catch (error) {
    console.error("NWS weather failed:", error);
    return null;
  }
}

async function fetchWeatherFromOpenMeteo(lat, lon) {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}` +
      `&longitude=${encodeURIComponent(lon)}` +
      `&current=temperature_2m,weather_code,wind_speed_10m` +
      `&daily=temperature_2m_max,time` +
      `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7`;

    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    return {
      source: "Open-Meteo",
      currentTemp: data?.current?.temperature_2m ?? null,
      windSpeed: data?.current?.wind_speed_10m ?? null,
      text: weatherCodeToText(data?.current?.weather_code ?? null),
      dailyTemps: data?.daily?.temperature_2m_max || [],
      dailyTimes: data?.daily?.time || []
    };
  } catch (error) {
    console.error("Open-Meteo weather failed:", error);
    return null;
  }
}

async function fetchWeather(lat, lon) {
  const nwsWeather = await fetchWeatherFromNws(lat, lon);
  if (nwsWeather) {
    return nwsWeather;
  }

  const openMeteoWeather = await fetchWeatherFromOpenMeteo(lat, lon);
  if (openMeteoWeather) {
    return openMeteoWeather;
  }

  return null;
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
    61: "Light Rain",
    63: "Rain",
    65: "Heavy Rain",
    71: "Light Snow",
    73: "Snow",
    75: "Heavy Snow",
    80: "Showers",
    81: "Showers",
    82: "Heavy Showers",
    95: "Thunderstorm",
    96: "Storm / Hail",
    99: "Storm / Hail"
  };

  return map[code] || "Forecast unavailable";
}

function buildWeatherStrip(container, times, temps) {
  if (!container) return;

  container.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const item = document.createElement("span");
    const day = times[i] ? formatShortDay(times[i]) : "--";
    const temp =
      temps[i] !== undefined && temps[i] !== null ? `${Math.round(temps[i])}°` : "--";
    item.textContent = `${day} ${temp}`;
    container.appendChild(item);
  }
}

function buildCard(item) {
  const { river, readings, weather, trendValues, decision } = item;
  const node = template.content.cloneNode(true);

  const riverName = node.querySelector(".river-name");
  const riverSection = node.querySelector(".river-section");
  const badge = node.querySelector(".status-badge");
  const decisionBadge = node.querySelector(".decision-badge");
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
  const riverImage = node.querySelector(".river-image");
  const imageWrap = node.querySelector(".card-image-wrap");

  riverName.textContent = river.river;
  riverSection.textContent = `${river.section} • ${river.region}`;

  const status = getStatus(readings.gaugeHeight, river.idealMin, river.idealMax);
  badge.textContent = status.label;
  gaugeSummary.textContent = status.summary;
  recommendationText.textContent = status.recommendation;

  if (decisionBadge) {
    decisionBadge.textContent = decision.label;
    if (decision.className) decisionBadge.classList.add(decision.className);
  }

  if (status.className) {
    badge.classList.add(status.className);
  }

  gaugeHeight.textContent =
    readings.gaugeHeight !== null ? `${formatNumber(readings.gaugeHeight, 2)} ft` : "--";
  discharge.textContent =
    readings.discharge !== null ? `${Math.round(readings.discharge)} cfs` : "--";
  temp.textContent =
    readings.temperature !== null ? `${formatNumber(readings.temperature, 1)} °F` : "--";
  rangeText.textContent = `${river.idealMin.toFixed(1)} ft to ${river.idealMax.toFixed(1)} ft`;
  notes.textContent = river.notes;
  usgsLink.href = `https://waterdata.usgs.gov/monitoring-location/${river.site}/`;

  if (riverImage && imageWrap) {
    if (river.image) {
      riverImage.src = river.image;
      riverImage.alt = `${river.river} - ${river.section}`;
    } else {
      imageWrap.style.display = "none";
    }
  }

  if (weather) {
    const currentTempText =
      weather.currentTemp !== null ? `${Math.round(weather.currentTemp)}°F` : "--";
    const forecastText = weather.text || "Forecast unavailable";
    const windText =
      weather.windSpeed !== null ? `${Math.round(weather.windSpeed)} mph wind` : "wind unavailable";

    if (weatherCurrent) weatherCurrent.textContent = `${currentTempText} • ${forecastText}`;
    if (weatherSummary) weatherSummary.textContent = windText;
    buildWeatherStrip(weatherStrip, weather.dailyTimes, weather.dailyTemps);
  } else {
    if (weatherCurrent) weatherCurrent.textContent = "Weather unavailable";
    if (weatherSummary) weatherSummary.textContent = "No forecast";
    buildWeatherStrip(weatherStrip, [], []);
  }

  const trend = getTrendInfo(trendValues || []);
  if (trendText) {
    trendText.textContent = `${trend.arrow} ${trend.label} • ${trend.changeText}`;
  }

  return node;
}

async function loadRivers() {
  hideMessage();
  if (riverGrid) riverGrid.innerHTML = "";
  if (topPicks) topPicks.innerHTML = "";
  if (lastUpdated) lastUpdated.textContent = "Loading latest conditions...";

  try {
    if (rivers.length === 0) {
      rivers = await loadRiverList();
      if (riverCount) riverCount.textContent = rivers.length;
    }

    const items = await Promise.all(
      rivers.map(async (river) => {
        let readings = { gaugeHeight: null, discharge: null, temperature: null };
        let weather = null;
        let trendValues = [];

        try {
          readings = await fetchRiverData(river.site);
        } catch (error) {
          console.error(`River data failed for ${river.river} / ${river.section}:`, error);
        }

        try {
          weather = await fetchWeather(river.lat, river.lon);
        } catch (error) {
          console.error(`Weather failed for ${river.river} / ${river.section}:`, error);
        }

        try {
          trendValues = await fetchRiverTrend(river.site);
        } catch (error) {
          console.error(`Trend failed for ${river.river} / ${river.section}:`, error);
        }

        const decision = getDecisionScore(readings, weather, trendValues, river);
        return { river, readings, weather, trendValues, decision };
      })
    );

    items
      .sort((a, b) => b.decision.score - a.decision.score)
      .forEach((item) => {
        if (riverGrid) riverGrid.appendChild(buildCard(item));
      });

    renderTopPicks(items);

    if (lastUpdated) {
      lastUpdated.textContent = `Updated ${new Date().toLocaleString()}`;
    }

    const weatherFailedForAll = items.every((item) => item.weather === null);
    if (weatherFailedForAll) {
      showMessage("River data loaded, but weather did not. Both weather sources failed.");
    }
  } catch (error) {
    console.error(error);
    showMessage("The page loaded, but script logic failed after loading the river list.");
    if (lastUpdated) lastUpdated.textContent = "Load failed";
  }
}

if (refreshBtn) {
  refreshBtn.addEventListener("click", loadRivers);
}

loadRivers();
