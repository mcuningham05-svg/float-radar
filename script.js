const rivers = [
  {
    name: "Buffalo River",
    section: "Ponca area",
    site: "07055646",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07055646/",
    idealGaugeMin: 3.0,
    idealGaugeMax: 5.5,
    notes: "Starter planning range only. This will get more precise by section later."
  },
  {
    name: "Mulberry River",
    section: "Turner Bend area",
    site: "07194800",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07194800/",
    idealGaugeMin: 2.0,
    idealGaugeMax: 4.5,
    notes: "This river can rise and fall fast after rain."
  },
  {
    name: "White River",
    section: "Starter reference gauge",
    site: "07048600",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07048600/",
    idealGaugeMin: 2.5,
    idealGaugeMax: 6.0,
    notes: "Later this should be broken into real float sections."
  },
  {
    name: "Elk River",
    section: "Near Noel",
    site: "07189000",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07189000/",
    idealGaugeMin: 2.5,
    idealGaugeMax: 5.0,
    notes: "Good starter gauge, but exact float quality depends on the section."
  }
];

const AUTO_REFRESH_MS = 5 * 60 * 1000;

const riverGrid = document.getElementById("riverGrid");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");
const template = document.getElementById("riverCardTemplate");
const messageBox = document.getElementById("messageBox");
const riverCount = document.getElementById("riverCount");

let autoRefreshTimer = null;
let countdownTimer = null;
let nextRefreshTime = null;
let isLoading = false;

riverCount.textContent = rivers.length;

function formatNumber(value, decimals = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "--";
  }
  return Number(value).toFixed(decimals);
}

function getStatus(height, min, max) {
  if (height === null || Number.isNaN(Number(height))) {
    return { label: "No data", className: "", summary: "Unavailable" };
  }

  if (height < min) {
    return { label: "Too Low", className: "status-bad", summary: "Low" };
  }

  if (height > max) {
    return { label: "High", className: "status-warning", summary: "High" };
  }

  return { label: "Good", className: "status-good", summary: "Runnable" };
}

function showMessage(text) {
  messageBox.textContent = text;
  messageBox.classList.remove("hidden");
}

function hideMessage() {
  messageBox.textContent = "";
  messageBox.classList.add("hidden");
}

function formatTime(date) {
  return date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
}

function updateCountdownText() {
  if (!nextRefreshTime) return;

  const msRemaining = nextRefreshTime - Date.now();

  if (msRemaining <= 0) {
    lastUpdated.textContent = "Refreshing now...";
    return;
  }

  const totalSeconds = Math.ceil(msRemaining / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  lastUpdated.textContent =
    `Last updated: ${new Date().toLocaleString()} · Next refresh in ${minutes}:${String(seconds).padStart(2, "0")}`;
}

function scheduleAutoRefresh() {
  if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
  if (countdownTimer) clearInterval(countdownTimer);

  nextRefreshTime = Date.now() + AUTO_REFRESH_MS;

  autoRefreshTimer = setTimeout(() => {
    loadRivers(true);
  }, AUTO_REFRESH_MS);

  countdownTimer = setInterval(() => {
    if (!nextRefreshTime) return;

    const msRemaining = nextRefreshTime - Date.now();

    if (msRemaining <= 0) {
      lastUpdated.textContent = "Refreshing now...";
      clearInterval(countdownTimer);
      countdownTimer = null;
      return;
    }

    const totalSeconds = Math.ceil(msRemaining / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    lastUpdated.textContent =
      `Last updated: ${window.lastLoadTimestamp || new Date().toLocaleString()} · Next refresh in ${minutes}:${String(seconds).padStart(2, "0")}`;
  }, 1000);
}

function buildCard(river, readings) {
  const node = template.content.cloneNode(true);

  const riverName = node.querySelector(".river-name");
  const riverSection = node.querySelector(".river-section");
  const badge = node.querySelector(".status-badge");
  const gaugeHeight = node.querySelector(".gauge-height");
  const discharge = node.querySelector(".discharge");
  const temp = node.querySelector(".temp");
  const rangeText = node.querySelector(".range-text");
  const notes = node.querySelector(".notes");
  const usgsLink = node.querySelector(".usgs-link");
  const miniStatusValue = node.querySelector(".mini-status-value");

  riverName.textContent = river.name;
  riverSection.textContent = river.section;

  const status = getStatus(readings.gaugeHeight, river.idealGaugeMin, river.idealGaugeMax);
  badge.textContent = status.label;
  miniStatusValue.textContent = status.summary;

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
    `${river.idealGaugeMin.toFixed(1)} ft to ${river.idealGaugeMax.toFixed(1)} ft`;

  notes.textContent = river.notes;
  usgsLink.href = river.usgsUrl;

  return node;
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

async function loadRivers(isAutoRefresh = false) {
  if (isLoading) return;
  isLoading = true;

  hideMessage();
  riverGrid.innerHTML = "";

  if (isAutoRefresh) {
    lastUpdated.textContent = "Auto-refreshing data...";
  } else {
    lastUpdated.textContent = "Loading latest readings...";
  }

  try {
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

    window.lastLoadTimestamp = new Date().toLocaleString();
    scheduleAutoRefresh();

    const hasRealData = riverGrid.textContent.includes("ft");
    if (!hasRealData) {
      showMessage("The page loaded, but the live readings did not. One or more gauges may need adjustment.");
    }
  } catch (error) {
    showMessage("Something went wrong while refreshing the river data.");
    lastUpdated.textContent = "Refresh failed";
  } finally {
    isLoading = false;
  }
}

refreshBtn.addEventListener("click", () => {
  loadRivers(false);
});

loadRivers(false);
