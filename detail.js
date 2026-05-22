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
    // NEW: read river slug instead of index
    const params = new URLSearchParams(window.location.search);
    const riverSlug = params.get("river");

    if (!riverSlug) {
      throw new Error("Missing river slug");
    }

    // Load grouped rivers.json
    const response = await fetch("rivers.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load rivers.json (${response.status})`);
    }

    const rivers = await response.json();
    if (!Array.isArray(rivers)) {
      throw new Error("rivers.json is not a valid array");
    }

    // Find river by slug
    const river = rivers.find(r => r.slug === riverSlug);
    if (!river) {
      throw new Error("River not found");
    }

    // For detail page: show ALL sections, but default to the FIRST section
    const section = river.sections[0];
    if (!section) {
      throw new Error("River has no sections");
    }

    // Fetch gauge + weather for this section
    const [gauge, weather] = await Promise.all([
      getGaugeData(section.site),
      getWeatherData(section.lat, section.lon)
    ]);

    const status = getStatus(gauge.level, section.idealMin, section.idealMax);

    // Fill UI
    detailTitle.textContent = river.river;
    detailRiver.textContent = river.river;
    detailSectionName.textContent = section.name;

    detailLevel.textContent = formatLevel(gauge.level);
    detailFlow.textContent = formatFlow(gauge.flow);
    detailWaterTemp.textContent = formatTemp(gauge.waterTemp);
    detailAirTemp.textContent = formatTemp(weather.airTemp);

    detailCondition.textContent = `${status.emoji} ${status.text}`;
    detailRange.textContent = `Ideal range: ${formatRange(section.idealMin, section.idealMax)}`;
    detailNotes.textContent = section.notes || "";

    detailUsgsLink.href = getUsgsSiteUrl(section.site);

  } catch (error) {
    console.error(error);
    detailTitle.textContent = "River Report";
    showMessage("Could not load this river report.");
  }
}

/* ---------------------------------------------------------
   GAUGE + WEATHER FETCHING
--------------------------------------------------------- */

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
    const url =
      `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${encodeURIComponent(site)}` +
      `&parameterCd=00065,00060,00010&siteStatus=all`;

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

      if (variableCode === "00065") level = numericValue;
      else if (variableCode === "00060") flow = numericValue;
      else if (variableCode === "00010") waterTempC = numericValue;
    }

    return {
      level
