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

function showMessage(text) {
  messageBox.textContent = text;
  messageBox.classList.remove("hidden");
}

function hideMessage() {
  messageBox.textContent = "";
  messageBox.classList.add("hidden");
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

function buildCard(river, readings) {
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
        try {
          const readings = await fetchRiverData(river.site);
          return buildCard(river, readings);
        } catch (error) {
          return buildCard(river, {
            gaugeHeight: null,
            discharge: null,
            temperature: null
          });
        }
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
