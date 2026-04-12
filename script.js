const rivers = [
  {
    name: "Buffalo River",
    section: "Ponca area",
    site: "07055646",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07055646/",
    idealGaugeMin: 3.0,
    idealGaugeMax: 5.5,
    notes: "Starter planning range only. This should get more precise by section."
  },
  {
    name: "Mulberry River",
    section: "Turner Bend area",
    site: "07194800",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07194800/",
    idealGaugeMin: 2.0,
    idealGaugeMax: 4.5,
    notes: "This river can rise and fall quickly after rain."
  },
  {
    name: "White River",
    section: "Starter reference gauge",
    site: "07048600",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07048600/",
    idealGaugeMin: 2.5,
    idealGaugeMax: 6.0,
    notes: "Later this should be split into real float sections."
  },
  {
    name: "Elk River",
    section: "Near Noel",
    site: "07189000",
    usgsUrl: "https://waterdata.usgs.gov/monitoring-location/07189000/",
    idealGaugeMin: 2.5,
    idealGaugeMax: 5.0,
    notes: "Good starter gauge, but actual float quality depends on the section."
  }
];

const riverGrid = document.getElementById("riverGrid");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");
const template = document.getElementById("riverCardTemplate");
const messageBox = document.getElementById("messageBox");
const riverCount = document.getElementById("riverCount");

riverCount.textContent = rivers.length;

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
      recommendation: "Live reading unavailable right now."
    };
  }

  if (height < min) {
    return {
      label: "Too Low",
      className: "status-bad",
      recommendation: "Probably too low for a good float unless you know this section well."
    };
  }

  if (height > max) {
    return {
      label: "High",
      className: "status-warning",
      recommendation: "Running high. This may be pushy or less ideal depending on skill level."
    };
  }

  return {
    label: "Good",
    className: "status-good",
    recommendation: "Looks like a solid day to float based on this starter range."
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

function buildCard(river, readings) {
  const node = template.content.cloneNode(true);

  const riverName = node.querySelector(".river-name");
  const riverSection = node.querySelector(".river-section");
  const badge = node.querySelector(".status-badge");
  const gaugeHeight = node.querySelector(".gauge-height");
  const discharge = node.querySelector(".discharge");
  const temp = node.querySelector(".temp");
  const recommendationText = node.querySelector(".recommendation-text");
  const rangeText = node.querySelector(".range-text");
  const notes = node.querySelector(".notes");
  const usgsLink = node.querySelector(".usgs-link");

  riverName.textContent = river.name;
  riverSection.textContent = river.section;

  const status = getStatus(readings.gaugeHeight, river.idealGaugeMin, river.idealGaugeMax);
  badge.textContent = status.label;
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

async function loadRivers() {
  hideMessage();
  riverGrid.innerHTML = "";
  lastUpdated.textContent = "Loading latest conditions...";

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

  const hasRealData = riverGrid.textContent.includes("ft");
  if (!hasRealData) {
    showMessage("The page loaded, but live readings did not come through for one or more gauges.");
  }
}

refreshBtn.addEventListener("click", loadRivers);
loadRivers();
