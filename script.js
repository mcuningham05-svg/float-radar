const riverGrid = document.getElementById("riverGrid");
const riverSearch = document.getElementById("riverSearch");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");
const messageBox = document.getElementById("messageBox");

let riversData = [];
let cardState = [];

async function loadApp() {
  showMessage("");

  try {
    const response = await fetch("rivers.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load rivers.json (${response.status})`);
    }

    const rivers = await response.json();
    if (!Array.isArray(rivers)) {
      throw new Error("rivers.json is not a valid array");
    }

    riversData = rivers;
    await buildCardState(riversData);
    renderCards(cardState);
    updateLastUpdated();
  } catch (error) {
    console.error(error);
    showMessage("Could not load river data.");
  }
}

async function buildCardState(rivers) {
  const results = await Promise.all(
    rivers.map(async (river, index) => {
      const [gauge, weather] = await Promise.all([
        FloatRadar.getGaugeData(river.site),
        FloatRadar.getWeatherData(river.lat, river.lon)
      ]);

      const status = FloatRadar.getStatus(gauge.level, river.idealMin, river.idealMax);

      return {
        index,
        river,
        gauge,
        weather,
        status
      };
    })
  );

  cardState = results;
}

function renderCards(items) {
  riverGrid.innerHTML = "";

  items.forEach((item) => {
    const { river, gauge, weather, status, index } = item;

    const weatherLabel = FloatRadar.getWeatherText(weather.code, weather.airTemp);
    const weatherEmoji = FloatRadar.getWeatherEmoji(weather.code);
    const statusWithEmoji = `${status.emoji} ${status.label}`;

    const card = document.createElement("article");
    card.className = "river-card";
    card.tabIndex = 0;

    card.innerHTML = `
      <div class="card-top">
        <div class="card-body">
          <div class="card-top-row">
            <div class="card-title-wrap">
              <h3 class="river-name">${FloatRadar.escapeHtml(river.river)}</h3>
              <p class="river-section">${FloatRadar.escapeHtml(river.section)}</p>
            </div>
            <span class="status-badge ${status.badgeClass}">${FloatRadar.escapeHtml(statusWithEmoji)}</span>
          </div>

          <div class="card-main-stats">
            <div class="level">${FloatRadar.formatLevel(gauge.level)}</div>
            <div class="flow">${FloatRadar.formatFlow(gauge.flow)}</div>
          </div>

          <div class="card-secondary">
            <div class="secondary-item">
              <span class="secondary-label">Water Temp</span>
              <span class="secondary-value">${FloatRadar.formatTemp(gauge.waterTemp)}</span>
            </div>
            <div class="secondary-item">
              <span class="secondary-label">Weather</span>
              <span class="secondary-value">${FloatRadar.escapeHtml(`${weatherEmoji} ${weatherLabel}`)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="card-band ${status.bandClass}">${FloatRadar.escapeHtml(`${status.emoji} ${status.text}`)}</div>

      <div class="card-footer">
        <span class="card-link">View Report →</span>
      </div>
    `;

    card.addEventListener("click", () => openDetailPage(index));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openDetailPage(index);
      }
    });

    riverGrid.appendChild(card);
  });
}

function openDetailPage(index) {
  window.location.href = `detail.html?i=${encodeURIComponent(index)}`;
}

async function refreshData() {
  refreshBtn.disabled = true;
  refreshBtn.textContent = "Refreshing...";
  FloatRadar.clearCaches();

  try {
    await buildCardState(riversData);
    renderCards(cardState);
    updateLastUpdated();
    showMessage("River data refreshed.");
    window.setTimeout(() => showMessage(""), 1400);
  } catch (error) {
    console.error(error);
    showMessage("Refresh failed.");
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = "Refresh Data";
  }
}

function filterCards(query) {
  const search = query.trim().toLowerCase();

  if (!search) {
    renderCards(cardState);
    return;
  }

  const filtered = cardState.filter(({ river }) => {
    return [
      river.river,
      river.section,
      river.region,
      river.notes
    ]
      .filter(Boolean)
      .some((value) => value.toLowerCase().includes(search));
  });

  renderCards(filtered);
}

function updateLastUpdated() {
  const now = new Date();
  lastUpdated.textContent = `Updated ${now.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  })}`;
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

riverSearch.addEventListener("input", (event) => {
  filterCards(event.target.value);
});

refreshBtn.addEventListener("click", refreshData);

loadApp();
