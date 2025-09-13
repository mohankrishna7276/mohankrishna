/* Main frontend script for Nagara Seva
   Features:
   - loadIssues() fetches from /api/issues with filters
   - render left-side issue cards with mini maps and photo
   - public map with colored markers by status (Solved -> check -> vanish)
   - report form that posts to /api/issues
   - officer dashboard with buttons to update status via PATCH
*/

let publicMap = null;
let publicMarkers = [];
const ICONS = {
  Reported: L.icon({ iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/red-dot.png", iconSize: [32,32], iconAnchor:[16,32]}),
  "In Progress": L.icon({ iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/orange-dot.png", iconSize: [32,32], iconAnchor:[16,32]}),
  Solved: L.icon({ iconUrl: "https://maps.gstatic.com/mapfiles/ms2/micons/green-dot.png", iconSize: [32,32], iconAnchor:[16,32]}),
  SolvedFinal: L.icon({ iconUrl: "https://upload.wikimedia.org/wikipedia/commons/5/50/Yes_Check_Circle.svg", iconSize: [32,32], iconAnchor:[16,32]}),
};

function statusClass(status){
  if(status === "Reported") return "status-reported";
  if(status === "In Progress") return "status-progress";
  if(status === "Solved") return "status-solved";
  return "";
}

/* ========== Render left issue list ========== */
function renderIssueList(issues){
  const container = document.getElementById("issueList");
  container.innerHTML = "";
  if(!issues || issues.length === 0){
    container.innerHTML = `<div style="padding:12px;color:#6b7280">No issues found.</div>`;
    return;
  }

  issues.forEach((issue, idx) => {
    const card = document.createElement("div");
    card.className = "issue-card";

    card.innerHTML = `
      <h4>${escapeHtml(issue.title)}</h4>
      <p>${escapeHtml(issue.description)}</p>
      <div>
        <span class="status-badge ${statusClass(issue.status)}">${escapeHtml(issue.status)}</span>
        <span style="float:right;color:#6b7280;font-size:0.85rem">${escapeHtml(issue.date)}</span>
      </div>
      ${issue.photo ? `<img src="${issue.photo}" alt="photo" class="issue-photo">` : ""}
      <div id="miniMap${idx}" class="mini-map"></div>
      <div style="margin-top:8px;display:flex;gap:8px">
        <button class="btn small" onclick="centerOnIssue(${issue.id})">View on map</button>
        <button class="btn small outline" onclick="showIssueHistory(${issue.id})">History</button>
      </div>
    `;

    container.appendChild(card);

    // render mini map after element is inserted
    setTimeout(() => {
      if(issue.lat != null && issue.lng != null){
        try{
          const mini = L.map(`miniMap${idx}`, { zoomControl:false, attributionControl:false }).setView([issue.lat, issue.lng], 14);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mini);
          L.marker([issue.lat, issue.lng], { icon: ICONS[issue.status] || ICONS.Reported }).addTo(mini);
        }catch(e){
          console.warn("mini map error", e);
        }
      } else {
        document.getElementById(`miniMap${idx}`).innerHTML = `<div style="padding:12px;color:#6b7280">No location</div>`;
      }
    }, 80);
  });
}

/* ========== Show issue history modal (simple alert for now) ========== */
function showIssueHistory(id){
  // fetch single list and find
  fetch(`/api/issues`)
    .then(r=>r.json())
    .then(list=>{
      const issue = list.find(i=>i.id === id);
      if(!issue){ alert("Issue not found"); return; }
      const lines = issue.history || [];
      alert("History for: " + issue.title + "\n\n" + lines.join("\n"));
    });
}

/* ========== Public map rendering ========== */
function initPublicMap(){
  if(publicMap) return;
  publicMap = L.map("publicMap").setView([20.5937,78.9629], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(publicMap);
}

function clearPublicMarkers(){
  publicMarkers.forEach(m => {
    try{ publicMap.removeLayer(m); }catch(e){}
  });
  publicMarkers = [];
}

function addPublicMarker(issue){
  if(!issue || issue.lat == null || issue.lng == null) return;

  // Solved special behaviour: green -> check -> vanish
  if(issue.status === "Solved"){
    const m = L.marker([issue.lat, issue.lng], { icon: ICONS.Solved }).addTo(publicMap)
      .bindPopup(`<b>${escapeHtml(issue.title)}</b><br>${escapeHtml(issue.description)}<br><b>✅ Solved</b>`);
    publicMarkers.push(m);

    // after short delay swap to check icon then remove
    setTimeout(()=>{
      try{ publicMap.removeLayer(m); }catch(e){}
      const done = L.marker([issue.lat, issue.lng], { icon: ICONS.SolvedFinal }).addTo(publicMap)
        .bindPopup(`<b>${escapeHtml(issue.title)}</b><br>✅ Solved`);
      publicMarkers.push(done);
      setTimeout(()=>{ try{ publicMap.removeLayer(done); }catch(e){} }, 4500);
    }, 1800);

    return;
  }

  const icon = ICONS[issue.status] || ICONS.Reported;
  const marker = L.marker([issue.lat, issue.lng], { icon }).addTo(publicMap)
    .bindPopup(`<b>${escapeHtml(issue.title)}</b><br>${escapeHtml(issue.description)}<br><b>${escapeHtml(issue.status)}</b>`);
  publicMarkers.push(marker);
}

/* center public map on an issue */
function centerOnIssue(issueId){
  // get issue and center
  fetch(`/api/issues`)
    .then(r=>r.json())
    .then(list=>{
      const issue = list.find(i=>i.id===issueId);
      if(!issue){ alert("Issue not found"); return; }
      if(publicMap && issue.lat != null && issue.lng != null){
        publicMap.setView([issue.lat, issue.lng], 15);
        // show popup by adding a temporary marker:
        const tmp = L.marker([issue.lat, issue.lng]).addTo(publicMap);
        tmp.bindPopup(`<b>${escapeHtml(issue.title)}</b>`).openPopup();
        setTimeout(()=>{ try{ publicMap.removeLayer(tmp); }catch(e){} }, 3000);
      } else alert("No location for this issue");
    });
}

/* ========== Load issues and populate UI ========== */
async function loadIssues(){
  const status = document.getElementById("statusFilter").value || "All";
  const date = document.getElementById("dateFilter").value || "All";
  const search = document.getElementById("searchBox").value || "";

  const q = `/api/issues?status=${encodeURIComponent(status)}&date=${encodeURIComponent(date)}&search=${encodeURIComponent(search)}`;
  const res = await fetch(q);
  const issues = await res.json();

  // render left list
  renderIssueList(issues);

  // public map
  initPublicMap();
  clearPublicMarkers();
  issues.forEach(addPublicMarker);
  if(publicMarkers.length>0){
    try{
      publicMap.fitBounds(publicMarkers.map(m=>m.getLatLng()), { padding: [30,30] });
    }catch(e){}
  }
}

/* ========== Submit issue flow ========== */
function useCurrentLocation(){
  if(!navigator.geolocation){ alert("Geolocation not supported"); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    document.getElementById("issueLocation").value = `${pos.coords.latitude},${pos.coords.longitude}`;
    // show small map in the report section
    if(!document.getElementById("clientMap")) return;
    try{
      const mapEl = document.getElementById("clientMap");
      mapEl.innerHTML = ""; // clear
      const cm = L.map("clientMap").setView([pos.coords.latitude,pos.coords.longitude],14);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(cm);
      L.marker([pos.coords.latitude,pos.coords.longitude]).addTo(cm).bindPopup("Your location").openPopup();
    }catch(e){ console.warn(e); }
  }, err => {
    alert("Unable to get location: please allow location access.");
  });
}

function escapeHtml(s){
  return String(s||"").replace(/[&<>"']/g, function(m){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]; });
}

function submitIssue(){
  const title = document.getElementById("issueTitle").value.trim();
  const desc = document.getElementById("issueDesc").value.trim();
  const loc = document.getElementById("issueLocation").value.trim();
  const photoInput = document.getElementById("issuePhoto");

  if(!title || !desc || !loc){
    alert("Please fill title, description and location (or use current location).");
    return;
  }
  let lat=0, lng=0;
  try{
    const parts = loc.split(',').map(x => Number(x.trim()));
    if(parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])){
      lat = parts[0]; lng = parts[1];
    } else { alert("Location should be 'lat,lng'"); return; }
  }catch(e){ alert("Invalid location"); return; }

  // if photo present, read as base64
  const file = photoInput.files[0];
  if(file){
    const reader = new FileReader();
    reader.onload = () => { postIssue(title, desc, lat, lng, reader.result); };
    reader.readAsDataURL(file);
  } else {
    postIssue(title, desc, lat, lng, "");
  }
}

async function postIssue(title, desc, lat, lng, photo){
  try{
    const res = await fetch("/api/issues", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ title, description: desc, lat, lng, photo })
    });
    if(res.status === 201){
      alert("Issue reported successfully");
      // clear fields
      document.getElementById("issueTitle").value = "";
      document.getElementById("issueDesc").value = "";
      document.getElementById("issueLocation").value = "";
      document.getElementById("issuePhoto").value = "";
      showSection("home");
      loadIssues();
    } else {
      const err = await res.json();
      alert("Error: "+ (err.message || JSON.stringify(err)));
    }
  }catch(e){ alert("Network error"); console.error(e); }
}

/* ========== Officer Dashboard ========== */
async function loadOfficerDashboard(){
  // reuse loadIssues to fetch (unfiltered), but we want full set:
  const res = await fetch("/api/issues?status=All&date=All&search=");
  const issues = await res.json();

  // render officer list (left side is still public)
  const officerList = document.getElementById("officerList");
  officerList.innerHTML = "";
  if(!issues || issues.length === 0){
    officerList.innerHTML = `<div style="padding:12px;color:#6b7280">No issues.</div>`;
    return;
  }

  issues.forEach(issue => {
    const card = document.createElement("div");
    card.className = "issue-card";
    card.style.display = "flex";
    card.style.flexDirection = "column";

    card.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
        <div style="flex:1">
          <h4>${escapeHtml(issue.title)}</h4>
          <p style="margin:4px 0;color:#374151">${escapeHtml(issue.description)}</p>
          <div><span class="status-badge ${statusClass(issue.status)}">${escapeHtml(issue.status)}</span>
              <span style="margin-left:10px;color:#6b7280">${escapeHtml(issue.date)}</span></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="btn small" onclick="updateIssueStatus(${issue.id}, 'In Progress')">Mark In Progress</button>
          <button class="btn small" onclick="updateIssueStatus(${issue.id}, 'Solved')">Mark Solved</button>
        </div>
      </div>
      ${issue.photo ? `<img src="${issue.photo}" class="issue-photo">` : ""}
      <div id="offMini${issue.id}" class="mini-map" style="margin-top:10px"></div>
    `;

    officerList.appendChild(card);

    // render mini map
    setTimeout(()=> {
      if(issue.lat != null && issue.lng != null){
        try{
          const mini = L.map(`offMini${issue.id}`, { zoomControl:false, attributionControl:false }).setView([issue.lat, issue.lng], 14);
          L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(mini);
          L.marker([issue.lat, issue.lng], { icon: ICONS[issue.status] || ICONS.Reported }).addTo(mini);
        }catch(e){ console.warn(e); }
      } else {
        document.getElementById(`offMini${issue.id}`).innerHTML = `<div style="padding:12px;color:#6b7280">No location</div>`;
      }
    }, 80);
  });
}

async function updateIssueStatus(issueId, newStatus){
  try{
    const res = await fetch(`/api/issues/${issueId}`, {
      method: "PATCH",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ status: newStatus })
    });
    if(res.ok){
      loadIssues();
      loadOfficerDashboard();
    } else {
      alert("Failed to update");
    }
  }catch(e){ alert("Network error"); console.error(e); }
}

/* ========== Helpers / Navigation ========== */
function showSection(id){
  document.querySelectorAll("main .container > section").forEach(s => s.classList.add("hidden"));
  const s = document.getElementById(id);
  if(!s) return;
  s.classList.remove("hidden");
  if(id === "home") loadIssues();
  if(id === "officerDashboard") loadOfficerDashboard();
}

window.addEventListener("DOMContentLoaded", ()=>{
  initPublicMap();
  loadIssues();
});
