const riverGrid = document.getElementById("riverGrid");
const riverCardTemplate = document.getElementById("riverCardTemplate");
const messageBox = document.getElementById("messageBox");
const refreshBtn = document.getElementById("refreshBtn");
const lastUpdated = document.getElementById("lastUpdated");

let riversData = [];
let refreshInProgress = false;

let gaugeCache = new Map();
let weatherCache = new Map();

async function loadApp() {
  showMessage("", false);

  try {
    riversData = await loadRivers();
    renderRiverCards(riversData);
    await populateAllCards();
    updateLastUpdated();
  } catch (error) {
    console.error("App load failed:", error);
    showMessage("Failed to load river data.", true);
  }
}

async function loadRivers() {
  const response = await fetch("rivers.json", { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to load rivers.json (${response.status})`);
  }

  const rivers = await response.json();

  if (!Array.isArray(rivers)) {
    throw new Error("rivers.json is not a valid array");
  }

  return rivers;
}

function renderRiverCards(rivers) {
  riverGrid.innerHTML = "";

  rivers.forEach((river, index) => {
    const fragment = riverCardTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".river-card");

    const imageWrap = fragment.querySelector(".card-image-wrap");
    const image = fragment.querySelector(".river-image");

    const riverName = fragment.querySelector(".river-name");
    const riverSection = fragment.querySelector(".river-section");
    const statusBadge = fragment.querySelector(".status-badge");

    const gaugeHeight = fragment.querySelector(".gauge-height");
    const gaugeSummary = fragment.querySelector(".gauge-summary");

    const discharge = fragment.querySelector(".discharge");
    const temp = fragment.querySelector(".temp");

    const weatherCurrent = fragment.querySelector(".weather-current");
    const weatherSummary = fragment.querySelector(".weather-summary");
    const weatherStrip = fragment.querySelector(".weather-strip");

    const recommendationText = fragment.querySelector(".recommendation-text");
    const rangeText = fragment.querySelector(".range-text");
    const notes = fragment.querySelector(".notes");

    const usgsLink = fragment.querySelector(".usgs-link");

    riverName.textContent = river.river || "Unknown River";
    riverSection.textContent = river.section || "Unknown Section";

    statusBadge.textContent = "Loading";
    statusBadge.className = "status-badge";

    gaugeHeight.textContent = "--";
    gaugeSummary.textContent = "Loading gauge...";

    discharge.textContent = "--";
    temp.textContent = "--";

    weatherCurrent.textContent = "Loading weather...";
    weatherSummary.textContent = "";
    weatherStrip.innerHTML = "";

    recommendationText.textContent = "";
    rangeText.textContent = `Ideal: ${formatRange(river.idealMin, river.idealMax)} ft`;
    notes.textContent = river.notes || "";

    usgsLink.href = getUsgsSiteUrl(river.site);

    // IMAGE HANDLING (FIXED)
    if (river.image) {
      image.src = river.image;
      image.alt = `${river.river} - ${river.section}`;
      image.style.display = "block";

      image.onerror = () => {
        image.style.display = "none";
        imageWrap.classList.add("no-image");
      };
    } else {
      image.style.display = "none";
      imageWrap.classList.add("no-image");
    }

    card.dataset.index = String(index);

    riverGrid.appendChild(fragment);
  });
}

async function populateAllCards() {
  const cards = Array.from(riverGrid.querySelectorAll(".river-card"));

  await Promise.all(
    cards.map(async (card) => {
      const index = Number(card.dataset.index);
      const river = riversData[index];

      if (!river) return;

      await populateCard(card, river);
    })
  );
}

async function populateCard(card, river) {
  const statusBadge = card.querySelector(".status-badge");
  const gaugeHeight = card.querySelector(".gauge-height");
  const gaugeSummary = card.querySelector(".gauge-summary");
  const discharge = card.querySelector(".discharge");
  const temp = card.querySelector(".temp");
  const weatherCurrent = card.querySelector(".weather-current");
  const weatherSummary = card.querySelector(".weather-summary");
  const weatherStrip = card.querySelector(".weather-strip");
  const recommendationText = card.querySelector(".recommendation-text");

  try {
    const [gaugeData, weatherData] = await Promise.all([
      getGaugeData(river.site),
      getWeatherData(river.lat, river.lon)
    ]);

    const level = gaugeData.height;
    const flow = gaugeData.discharge;
    const waterTemp = gaugeData.waterTemp;
    const condition = getCondition(level, river.idealMin, river.idealMax);

    gaugeHeight.textContent = level !== null ? `${level.toFixed(2)} ft` : "--";
    gaugeSummary.textContent = getGaugeSummary(condition, level);

    discharge.textContent = flow !== null ? `${Math.round(flow)} cfs` : "--";
    temp.textContent = waterTemp !== null ? `${Math.round(waterTemp)}°F` : "--";

    weatherCurrent.textContent =
      weatherData.currentTemp !== null
        ? `${Math.round(weatherData.currentTemp)}°F air`
        : "No weather";

    weatherSummary.textContent = weatherData.summary || "";

    recommendationText.textContent = getRecommendationText(condition);

    statusBadge.textContent = getBadgeText(condition);
    statusBadge.className = `status-badge ${getStatusClass(condition)}`;

    renderWeatherStrip(weatherStrip, weatherData.forecast);
  } catch (error) {
    console.error(error);
  }
}

// REMAINING FUNCTIONS (UNCHANGED)

function getGaugeData(site) {
  if (!gaugeCache.has(site)) {
    gaugeCache.set(site, fetchGaugeData(site));
  }
  return gaugeCache.get(site);
}

function getWeatherData(lat, lon) {
  const key = `${lat},${lon}`;
  if (!weatherCache.has(key)) {
    weatherCache.set(key, fetchWeatherData(lat, lon));
  }
  return weatherCache.get(key);
}

async function fetchGaugeData(site) {
  try {
    const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00065,00060,00010`;
    const res = await fetch(url);
    const data = await res.json();

    let height = null, discharge = null, waterTempC = null;

    (data.value.timeSeries || []).forEach(item => {
      const code = item.variable.variableCode[0].value;
      const val = parseFloat(item.values[0].value[0].value);
      if (code === "00065") height = val;
      if (code === "00060") discharge = val;
      if (code === "00010") waterTempC = val;
    });

    return {
      height,
      discharge,
      waterTemp: waterTempC ? cToF(waterTempC) : null
    };
  } catch {
    return { height: null, discharge: null, waterTemp: null };
  }
}

async function fetchWeatherData(lat, lon) {
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m&daily=temperature_2m_max`);
    const data = await res.json();

    return {
      currentTemp: data.current.temperature_2m,
      summary: "",
      forecast: data.daily.time.slice(0,3).map((d,i)=>({
        day:new Date(d).toLocaleDateString(undefined,{weekday:"short"}),
        high:data.daily.temperature_2m_max[i]
      }))
    };
  } catch {
    return { currentTemp:null, summary:"", forecast:[] };
  }
}

function getCondition(l,min,max){if(l==null)return"No Data";if(l<min)return"Too Low";if(l>max)return"Too High";return"Good";}
function getBadgeText(c){return c==="Good"?"GOOD":c==="Too Low"?"LOW":c==="Too High"?"HIGH":"--";}
function getStatusClass(c){return c==="Good"?"status-good":c==="Too Low"?"status-warning":c==="Too High"?"status-bad":"";}
function getGaugeSummary(c){return c==="Good"?"In range":c==="Too Low"?"Low":c==="Too High"?"High":"No data";}
function getRecommendationText(c){return c==="Good"?"Good to float":c==="Too Low"?"Low water":c==="Too High"?"High water":"";}

function renderWeatherStrip(el,forecast){
  el.innerHTML="";
  forecast.forEach(d=>{
    const s=document.createElement("span");
    s.textContent=`${d.day} ${Math.round(d.high)}°`;
    el.appendChild(s);
  });
}

function formatRange(min,max){return`${min}–${max}`;}
function getUsgsSiteUrl(site){return`https://waterdata.usgs.gov/monitoring-location/${site}/`;}
function cToF(c){return c*9/5+32;}

function updateLastUpdated(){
  const now=new Date();
  lastUpdated.textContent=`Updated ${now.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"})}`;
}

function showMessage(msg,err=false){
  if(!msg){messageBox.classList.add("hidden");return;}
  messageBox.textContent=msg;
  messageBox.classList.remove("hidden");
  if(err)messageBox.classList.add("error");
}

refreshBtn.addEventListener("click", async ()=>{
  if(refreshInProgress)return;
  refreshInProgress=true;
  refreshBtn.disabled=true;

  gaugeCache.clear();
  weatherCache.clear();

  renderRiverCards(riversData);
  await populateAllCards();
  updateLastUpdated();

  refreshBtn.disabled=false;
  refreshInProgress=false;
});

loadApp();
