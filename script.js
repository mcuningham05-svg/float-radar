const rivers = [
  { name:"Buffalo", section:"Ponca", site:"07055646", min:3, max:5.5 },
  { name:"Mulberry", section:"Turner Bend", site:"07194800", min:2, max:4.5 },
  { name:"White", section:"Reference", site:"07048600", min:2.5, max:6 },
  { name:"Elk", section:"Noel", site:"07189000", min:2.5, max:5 }
];

const grid = document.getElementById("riverGrid");
const template = document.getElementById("cardTemplate");
const lastUpdated = document.getElementById("lastUpdated");

function statusText(h, min, max){
  if(!h) return "No data";
  if(h < min) return "Too Low";
  if(h > max) return "High";
  return "Good to Float";
}

async function fetchData(site){
  const url = `https://waterservices.usgs.gov/nwis/iv/?format=json&sites=${site}&parameterCd=00065,00060,00010`;

  const res = await fetch(url);
  const data = await res.json();
  const series = data.value.timeSeries;

  let h=null,f=null,t=null;

  series.forEach(s=>{
    const code = s.variable.variableCode[0].value;
    const val = Number(s.values[0].value[0].value);

    if(code==="00065") h=val;
    if(code==="00060") f=val;
    if(code==="00010") t=(val*9/5)+32;
  });

  return {h,f,t};
}

async function load(){
  grid.innerHTML = "";

  for(const r of rivers){
    let d;
    try{
      d = await fetchData(r.site);
    }catch{
      d = {};
    }

    const node = template.content.cloneNode(true);

    node.querySelector(".name").textContent = r.name;
    node.querySelector(".section").textContent = r.section;

    node.querySelector(".gauge").textContent =
      d.h ? d.h.toFixed(2)+" ft" : "--";

    node.querySelector(".flow").textContent =
      d.f ? Math.round(d.f)+" cfs" : "--";

    node.querySelector(".temp").textContent =
      d.t ? d.t.toFixed(1)+"°F" : "--";

    node.querySelector(".status").textContent =
      statusText(d.h,r.min,r.max);

    node.querySelector(".note").textContent =
      `Range: ${r.min}-${r.max} ft`;

    grid.appendChild(node);
  }

  lastUpdated.textContent = "Updated: " + new Date().toLocaleTimeString();
}

document.getElementById("refreshBtn").onclick = load;

load();
