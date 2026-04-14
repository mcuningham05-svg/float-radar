const container = document.getElementById("riverContainer");

// Fetch river data
async function loadRivers() {
  try {
    const res = await fetch("rivers.json");
    const rivers = await res.json();

    renderRivers(rivers);
  } catch (err) {
    console.error("Error loading rivers:", err);
    container.innerHTML = "<p>Failed to load river data.</p>";
  }
}

// Fetch USGS data
async function fetchGauge(site) {
  try {
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00065&siteStatus=all`;
    const res = await fetch(url);
    const data = await res.json();

    const value =
      data.value.timeSeries[0].values[0].value[0].value;

    return parseFloat(value);
  } catch {
    return null;
  }
}

// Fetch weather (Open-Meteo)
async function fetchWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`;
    const res = await fetch(url);
    const data = await res.json();

    return data.current.temperature_2m;
  } catch {
    return null;
  }
}

// Determine condition
function getCondition(level, min, max) {
  if (level === null) return "No Data";
  if (level < min) return "Too Low";
  if (level > max) return "Too High";
  return "Good";
}

// Render rivers
async function renderRivers(rivers) {
  container.innerHTML = "";

  for (const river of rivers) {
    const card = document.createElement("div");
    card.className = "river-card";

    // Image (lazy loaded)
    const imageHTML = river.image
      ? `<img src="${river.image}" alt="${river.river}" loading="lazy" />`
      : "";

    card.innerHTML = `
      ${imageHTML}
      <div class="river-content">
        <h2>${river.river}</h2>
        <p class="section">${river.section}</p>
        <p class="level">Loading level...</p>
        <p class="weather">Loading weather...</p>
        <p class="condition">Checking conditions...</p>
      </div>
    `;

    container.appendChild(card);

    // Load data AFTER card renders (faster UI feel)
    updateCardData(card, river);
  }
}

// Update each card asynchronously
async function updateCardData(card, river) {
  const levelEl = card.querySelector(".level");
  const weatherEl = card.querySelector(".weather");
  const conditionEl = card.querySelector(".condition");

  const level = await fetchGauge(river.site);
  const temp = await fetchWeather(river.lat, river.lon);

  levelEl.textContent =
    level !== null ? `Level: ${level.toFixed(2)} ft` : "Level unavailable";

  weatherEl.textContent =
    temp !== null ? `Temp: ${Math.round(temp)}°F` : "Weather unavailable";

  const condition = getCondition(level, river.idealMin, river.idealMax);
  conditionEl.textContent = `Condition: ${condition}`;
}

// Init
loadRivers();
