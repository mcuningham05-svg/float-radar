const messageBox = document.getElementById("messageBox");
const detailTitle = document.getElementById("detailTitle");
const detailRiver = document.getElementById("detailRiver");
const detailSectionName = document.getElementById("detailSectionName");
const detailLevel = document.getElementById("detailLevel");
const detailFlow = document.getElementById("detailFlow");
const detailWaterTemp = document.getElementById("detailWaterTemp");
const detailAirTemp = document.getElementById("detailAirTemp");
const detailCondition = document.getElementById("detailCondition");
const detailRange = document.getElementById("detailRange");
const detailNotes = document.getElementById("detailNotes");
const detailUsgsLink = document.getElementById("detailUsgsLink");

async function loadDetailPage() {
  showMessage("");

  try {
    const params = new URLSearchParams(window.location.search);
    const rawIndex = params.get("i");
    const index = Number.parseInt(rawIndex, 10);

    if (!Number.isInteger(index) || index < 0) {
      throw new Error("Invalid river index");
    }

    const response = await fetch("rivers.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load rivers.json (${response.status})`);
    }

    const rivers = await response.json();
    if (!Array.isArray(rivers)) {
      throw new Error("rivers.json is not a valid array");
    }

    const river = rivers[index];
    if (!river) {
      throw new Error("River not found");
    }

    const [gauge, weather] = await Promise.all([
      getGaugeData(river.site),
      getWeatherData(river.lat, river.lon)
    ]);

    const status = getStatus(gauge.level, river.idealMin, river.idealMax);

    detailTitle.textContent = river.section;
    detailRiver.textContent = river.river;
    detailSectionName.textContent = river.section;
    detailLevel.textContent = formatLevel(gauge.level);
    detailFlow.textContent = formatFlow(gauge.flow);
    detailWaterTemp.textContent = formatTemp(gauge.waterTemp);
    detailAirTemp.textContent = formatTemp(weather.airTemp);
    detailCondition.textContent = `${status.emoji} ${status.text}`;
    detailRange.textContent = `Ideal range: ${formatRange(river.idealMin, river.idealMax)}`;
    detailNotes.textContent = river.notes || "";
    detailUsgsLink.href = getUsgsSiteUrl(river.site);
  } catch (error) {
    console.error(error);
    detailTitle.textContent = "River Report";
    showMessage("Could not load this river report.");
  }
}

function getGaugeData(site) {
  if (!site) {
    return Promise.resolve({
      level: null,
      flow: null,
      waterTemp: null
    });
  }

  return fetchGaugeData(site);
}

function getWeatherData(lat, lon) {
  if (lat === undefined || lon === undefined || lat === null || lon === null) {
    return Promise.resolve({
      airTemp: null,
      code: null
    });
  }

  return fetchWeatherData(lat, lon);
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

function getStatus(level, min, max) {
  if (level === null || !Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      label: "No Data",
      text: "No live reading available",
      emoji: "😐"
    };
  }

  if (level < min * 0.85) {
    return {
      label: "Low",
      text: "Low water — may be scrapey",
      emoji: "☹️"
    };
  }

  if (level < min) {
    return {
      label: "Marginal",
      text: "Marginal — floatable in spots",
      emoji: "🙂"
    };
  }

  const strongGoodThreshold = min + (max - min) * 0.55;

  if (level <= max) {
    return {
      label: level >= strongGoodThreshold ? "Great" : "Good",
      text: level >= strongGoodThreshold ? "Strong range — great float" : "In range — good float",
      emoji: level >= strongGoodThreshold ? "😄" : "😊"
    };
  }

  if (level <= max * 1.3) {
    return {
      label: "High",
      text: "High water — fast current",
      emoji: "😬"
    };
  }

  return {
    label: "Blown Out",
    text: "Very high — not recommended",
    emoji: "😵"
  };
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

function formatRange(min, max) {
  const minText = Number.isFinite(min) ? min.toFixed(1) : "--";
  const maxText = Number.isFinite(max) ? max.toFixed(1) : "--";
  return `${minText}–${maxText} ft`;
}

function getUsgsSiteUrl(site) {
  return `https://waterdata.usgs.gov/monitoring-location/${encodeURIComponent(site)}/`;
}

function cToF(celsius) {
  return (celsius * 9) / 5 + 32;
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

loadDetailPage();
