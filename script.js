
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';
const LIVE_API = '/api/live';
const NOMINATIM = 'https://nominatim.openstreetmap.org';
const DEFAULT_LAT = 17.385;
const DEFAULT_LON = 78.4867;

let chart = null;
let autoMode = true;
let liveMode = false;
let currentWeather = null;
let userCoords = { lat: DEFAULT_LAT, lon: DEFAULT_LON };
let lastAutoTheme = null;
let leafletMap = null;
let mapMarker = null;
let searchTimeout = null;
let locationName = 'Hyderabad, India';

// ─── Leaflet Map ───
let mapInitialized = false;

function initMap() {
  const saved = loadSavedLocation();
  if (saved) {
    userCoords = { lat: saved.lat, lon: saved.lon };
    locationName = saved.name || 'Saved location';
  }
  updateLocationDisplay();
}

function ensureMapCreated() {
  if (mapInitialized) return;
  mapInitialized = true;

  leafletMap = L.map('leaflet-map', {
    center: [userCoords.lat, userCoords.lon],
    zoom: 11,
    zoomControl: true,
    attributionControl: false
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19
  }).addTo(leafletMap);

  mapMarker = L.marker([userCoords.lat, userCoords.lon], {
    draggable: true
  }).addTo(leafletMap);

  mapMarker.on('dragend', function () {
    var pos = mapMarker.getLatLng();
    selectLocation(pos.lat, pos.lng);
  });

  leafletMap.on('click', function (ev) {
    selectLocation(ev.latlng.lat, ev.latlng.lng);
  });
}

function toggleMap() {
  var card = document.getElementById('map-card');
  card.classList.toggle('expanded');
  if (card.classList.contains('expanded')) {
    ensureMapCreated();
    setTimeout(function () { if (leafletMap) leafletMap.invalidateSize(); }, 400);
  }
}

async function selectLocation(lat, lon, name) {
  userCoords = { lat, lon };
  if (mapMarker) mapMarker.setLatLng([lat, lon]);
  if (leafletMap) leafletMap.setView([lat, lon], leafletMap.getZoom());

  if (!name) {
    name = await reverseGeocode(lat, lon);
  }
  locationName = name;
  updateLocationDisplay();
  saveLocation(lat, lon, name);
  lastAutoTheme = null;
  currentWeather = null;
  fetchWeather();
}

function updateLocationDisplay() {
  document.getElementById('map-location-name').textContent = locationName;
  document.getElementById('location-coords').textContent =
    `${userCoords.lat.toFixed(4)}°N, ${userCoords.lon.toFixed(4)}°E`;
  const sub = document.getElementById('condition-sub');
  if (sub && locationName) {
    // Will be overwritten by applyData, but set initially
  }
}

// ─── Geocoding (Nominatim — free) ───
async function reverseGeocode(lat, lon) {
  try {
    var res = await fetch(NOMINATIM + '/reverse?lat=' + lat + '&lon=' + lon + '&format=json&zoom=10');
    var d = await res.json();
    var addr = d.address || {};
    var dn = d.display_name || '';
    return addr.city || addr.town || addr.village || addr.county || dn.split(',').slice(0, 2).join(',') || 'Unknown location';
  } catch (e) { return 'Unknown location'; }
}

async function searchLocation(query) {
  try {
    var res = await fetch(NOMINATIM + '/search?q=' + encodeURIComponent(query) + '&format=json&limit=6&addressdetails=1');
    return await res.json();
  } catch (e) { return []; }
}

// ─── Search Input ───
function setupSearch() {
  const input = document.getElementById('location-search');
  const results = document.getElementById('search-results');

  input.addEventListener('input', function () {
    clearTimeout(searchTimeout);
    const q = this.value.trim();
    if (q.length < 2) { results.classList.remove('show'); return; }
    searchTimeout = setTimeout(async () => {
      const data = await searchLocation(q);
      if (data.length === 0) {
        results.innerHTML = '<div class="search-no-results">No locations found</div>';
      } else {
        results.innerHTML = data.map(r => {
          const name = r.display_name.length > 60 ? r.display_name.substring(0, 57) + '...' : r.display_name;
          return `<div class="search-result-item" onclick="pickSearchResult(${r.lat}, ${r.lon}, '${r.display_name.replace(/'/g, "\\'")}')">
                <span class="result-icon">📍</span>
                <span class="result-name">${name}</span>
              </div>`;
        }).join('');
      }
      results.classList.add('show');
    }, 350);
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { results.classList.remove('show'); }
  });

  document.addEventListener('click', function (e) {
    if (!e.target.closest('.search-input-wrap')) results.classList.remove('show');
  });
}

function pickSearchResult(lat, lon, name) {
  document.getElementById('search-results').classList.remove('show');
  document.getElementById('location-search').value = '';
  var shortName = name.split(',').slice(0, 2).join(',').trim();
  selectLocation(lat, lon, shortName);
  // Expand map to show the pin
  var card = document.getElementById('map-card');
  if (!card.classList.contains('expanded')) {
    card.classList.add('expanded');
  }
  ensureMapCreated();
  setTimeout(function () {
    if (leafletMap) {
      leafletMap.invalidateSize();
      leafletMap.setView([lat, lon], 12);
    }
  }, 400);
}

// ─── GPS ───
function useMyLocation() {
  if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
  var btn = document.getElementById('gps-btn');
  btn.classList.add('locating');
  navigator.geolocation.getCurrentPosition(
    async function (pos) {
      btn.classList.remove('locating');
      var lat = pos.coords.latitude;
      var lon = pos.coords.longitude;
      var name = await reverseGeocode(lat, lon);
      selectLocation(lat, lon, name);
      var card = document.getElementById('map-card');
      if (!card.classList.contains('expanded')) {
        card.classList.add('expanded');
      }
      ensureMapCreated();
      setTimeout(function () {
        if (leafletMap) {
          leafletMap.invalidateSize();
          leafletMap.setView([lat, lon], 13);
        }
      }, 400);
    },
    function () { btn.classList.remove('locating'); alert('Location access denied'); }
  );
}

// ─── LocalStorage ───
function saveLocation(lat, lon, name) {
  try { localStorage.setItem('cp_location', JSON.stringify({ lat, lon, name })); } catch (e) { }
}
function loadSavedLocation() {
  try { return JSON.parse(localStorage.getItem('cp_location')); } catch (e) { return null; }
}

const scenarios = {
  pleasant: {
    temp: 26, hum: 55, pres: 1015, rain: 'No', light: 720, disc: 22, feels: 25,
    title: 'Pleasant', sub: 'Clear skies — great day to be outside', alert: null,
    humSub: 'Comfortable', presSub: 'Stable', rainSub: 'No rain detected', lightSub: 'Bright daylight',
    discLevel: 'Comfortable', discText: 'Ideal conditions — no heat stress',
    report: 'temperature is a comfortable 26°C with moderate humidity at 55%. Pressure is stable at 1015 hPa. Great conditions for outdoor activities.',
    trend: [23, 22, 22, 23, 24, 25, 26, 27, 27, 26, 25, 24], theme: 'pleasant'
  },
  hot: {
    temp: 41, hum: 28, pres: 1008, rain: 'No', light: 950, disc: 36, feels: 44,
    title: 'Extreme heat', sub: 'Stay hydrated — avoid outdoor exposure',
    alert: 'Heat advisory in effect. Avoid outdoor activity between 11am – 4pm.',
    humSub: 'Very dry air', presSub: 'Slight drop', rainSub: 'No rain', lightSub: 'Intense sunlight',
    discLevel: 'Dangerous', discText: 'Extreme heat stress — seek shade and hydration immediately',
    report: 'temperature is experiencing dangerous heat at 41°C. Feels-like 44°C. UV exposure is extreme. Postpone all outdoor activities.',
    trend: [32, 33, 35, 37, 38, 40, 41, 41, 40, 38, 36, 34], theme: 'hot'
  },
  rain: {
    temp: 23, hum: 90, pres: 997, rain: 'Yes', light: 180, disc: 26, feels: 22,
    title: 'Rainy', sub: 'Moderate rainfall — carry an umbrella', alert: null,
    humSub: 'Very humid', presSub: 'Low — rain likely', rainSub: 'Active rainfall', lightSub: 'Overcast',
    discLevel: 'Moderate', discText: 'Humidity is high — feels muggy indoors too',
    report: 'Active rainfall . Humidity 90%, pressure 997 hPa. Rain expected for 2–3 more hours.',
    trend: [26, 26, 25, 24, 24, 23, 23, 23, 23, 24, 24, 25], theme: 'rain'
  },
  night: {
    temp: 21, hum: 68, pres: 1014, rain: 'No', light: 5, disc: 18, feels: 20,
    title: 'Clear night', sub: 'Cool and calm — good visibility', alert: null,
    humSub: 'Moderate', presSub: 'Stable', rainSub: 'Dry', lightSub: 'Nighttime',
    discLevel: 'Very comfortable', discText: 'Cool night — light jacket recommended',
    report: 'temperature is calm tonight at 21°C under clear skies. Perfect for late-night study or relaxation.',
    trend: [28, 27, 25, 24, 23, 22, 21, 20, 19, 19, 20, 21], theme: 'night'
  },
  cold: {
    temp: 11, hum: 74, pres: 1024, rain: 'No', light: 320, disc: 10, feels: 8,
    title: 'Cold', sub: 'Unusually chilly — dress warmly', alert: null,
    humSub: 'Moderate', presSub: 'High — dry and stable', rainSub: 'No rain', lightSub: 'Pale sunlight',
    discLevel: 'Cold', discText: 'Wind chill makes it feel colder — layer up',
    report: 'Unusually cold at 11°C, feels like 8°C. Warm clothing essential. Max 14°C today.',
    trend: [9, 9, 10, 11, 12, 13, 14, 13, 12, 12, 11, 10], theme: 'cold'
  },
  storm: {
    temp: 20, hum: 97, pres: 983, rain: 'Yes', light: 40, disc: 28, feels: 19,
    title: 'Thunderstorm', sub: 'Dangerous — stay indoors immediately',
    alert: 'Severe thunderstorm warning. All outdoor activities suspended.',
    humSub: 'Saturated', presSub: 'Very low — severe storm', rainSub: 'Heavy rainfall', lightSub: 'Very dark',
    discLevel: 'Dangerous', discText: 'Severe weather event in progress — do not go outside',
    report: 'SEVERE ALERT: Pressure 983 hPa — thunderstorm in progress. Stay in buildings away from windows.',
    trend: [27, 26, 24, 23, 22, 21, 20, 20, 20, 21, 22, 24], theme: 'storm'
  },
  dawn: {
    temp: 19, hum: 72, pres: 1013, rain: 'No', light: 120, disc: 16, feels: 18,
    title: 'Sunrise', sub: 'A new day begins — golden light on campus', alert: null,
    humSub: 'Cool moisture', presSub: 'Stable', rainSub: 'Dry', lightSub: 'First light',
    discLevel: 'Very comfortable', discText: 'Cool morning air — perfect for a walk',
    report: 'The sun is rising. Temperature is a cool 19°C with 72% humidity. Fresh and crisp — ideal for early activities.',
    trend: [17, 17, 17, 18, 19, 20, 22, 24, 26, 27, 28, 27], theme: 'dawn'
  },
  dusk: {
    temp: 27, hum: 52, pres: 1012, rain: 'No', light: 210, disc: 24, feels: 26,
    title: 'Sunset', sub: 'Golden hour — the sky is ablaze', alert: null,
    humSub: 'Comfortable', presSub: 'Stable', rainSub: 'Dry', lightSub: 'Fading light',
    discLevel: 'Comfortable', discText: 'Cooling down — pleasant evening ahead',
    report: 'Sunset paints the sky. Temperature settling at 27°C. Perfect for an evening stroll.',
    trend: [24, 26, 28, 30, 31, 31, 30, 29, 28, 27, 25, 23], theme: 'dusk'
  },
  cloudy: {
    temp: 25, hum: 65, pres: 1010, rain: 'No', light: 280, disc: 21, feels: 24,
    title: 'Overcast', sub: 'Thick cloud cover — grey skies all around', alert: null,
    humSub: 'Moderate', presSub: 'Slightly low', rainSub: 'No rain', lightSub: 'Dim daylight',
    discLevel: 'Comfortable', discText: 'Comfortable under cloud cover',
    report: 'Overcast skies at 25°C with 65% humidity. No rain expected but clouds persist.',
    trend: [23, 23, 24, 24, 25, 25, 25, 25, 24, 24, 23, 23], theme: 'cloudy'
  },
  fog: {
    temp: 18, hum: 95, pres: 1018, rain: 'No', light: 60, disc: 15, feels: 17,
    title: 'Foggy', sub: 'Low visibility — drive carefully', alert: null,
    humSub: 'Near saturation', presSub: 'Stable', rainSub: 'No rain', lightSub: 'Very hazy',
    discLevel: 'Comfortable', discText: 'Cool and damp — visibility under 500m',
    report: 'Dense fog with visibility below 500m. Temperature 18°C, humidity 95%. Drive with fog lights.',
    trend: [16, 16, 17, 17, 18, 19, 20, 20, 19, 18, 17, 16], theme: 'fog'
  },
  partlycloudy: {
    temp: 28, hum: 50, pres: 1013, rain: 'No', light: 520, disc: 23, feels: 27,
    title: 'Partly cloudy', sub: 'Sun peeks through scattered clouds', alert: null,
    humSub: 'Comfortable', presSub: 'Stable', rainSub: 'No rain', lightSub: 'Filtered sunlight',
    discLevel: 'Comfortable', discText: 'Pleasant with occasional shade from clouds',
    report: 'Partly cloudy at 28°C. Scattered clouds provide occasional shade. Good conditions overall.',
    trend: [24, 25, 26, 27, 28, 29, 29, 28, 28, 27, 26, 25], theme: 'partlycloudy'
  }
};

// ─── Local Time ───
function getLocalDate() {
  return new Date();
}

function updateClock() {
  var now = getLocalDate();
  var h = String(now.getHours()).padStart(2, '0');
  var m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('time-badge').textContent = h + ':' + m;
  if (autoMode) applyAutoTheme();
}

// ─── Time Period ───
function getTimePeriod(d) {
  var t = d.getHours() + d.getMinutes() / 60;
  if (t >= 5 && t < 6.5) return 'dawn';
  if (t >= 6.5 && t < 16) return 'day';
  if (t >= 16 && t < 17.5) return 'golden';
  if (t >= 17.5 && t < 19.5) return 'dusk';
  return 'night';
}

// ─── Weather Code (WMO standard) ───
function interpretWeatherCode(code) {
  var map = {
    0: { cond: 'clear', label: 'Clear sky', rain: 'No' },
    1: { cond: 'clear', label: 'Mainly clear', rain: 'No' },
    2: { cond: 'partly', label: 'Partly cloudy', rain: 'No' },
    3: { cond: 'cloudy', label: 'Overcast', rain: 'No' },
    45: { cond: 'fog', label: 'Foggy', rain: 'No' },
    48: { cond: 'fog', label: 'Depositing rime fog', rain: 'No' },
    51: { cond: 'drizzle', label: 'Light drizzle', rain: 'Yes' },
    53: { cond: 'drizzle', label: 'Moderate drizzle', rain: 'Yes' },
    55: { cond: 'drizzle', label: 'Dense drizzle', rain: 'Yes' },
    56: { cond: 'drizzle', label: 'Freezing drizzle', rain: 'Yes' },
    57: { cond: 'drizzle', label: 'Heavy freezing drizzle', rain: 'Yes' },
    61: { cond: 'rain', label: 'Light rain', rain: 'Yes' },
    63: { cond: 'rain', label: 'Moderate rain', rain: 'Yes' },
    65: { cond: 'rain', label: 'Heavy rain', rain: 'Yes' },
    66: { cond: 'rain', label: 'Freezing rain', rain: 'Yes' },
    67: { cond: 'rain', label: 'Heavy freezing rain', rain: 'Yes' },
    71: { cond: 'snow', label: 'Light snowfall', rain: 'No' },
    73: { cond: 'snow', label: 'Moderate snowfall', rain: 'No' },
    75: { cond: 'snow', label: 'Heavy snowfall', rain: 'No' },
    77: { cond: 'snow', label: 'Snow grains', rain: 'No' },
    80: { cond: 'rain', label: 'Light rain showers', rain: 'Yes' },
    81: { cond: 'rain', label: 'Moderate rain showers', rain: 'Yes' },
    82: { cond: 'rain', label: 'Violent rain showers', rain: 'Yes' },
    85: { cond: 'snow', label: 'Light snow showers', rain: 'No' },
    86: { cond: 'snow', label: 'Heavy snow showers', rain: 'No' },
    95: { cond: 'storm', label: 'Thunderstorm', rain: 'Yes' },
    96: { cond: 'storm', label: 'Thunderstorm with hail', rain: 'Yes' },
    99: { cond: 'storm', label: 'Thunderstorm with heavy hail', rain: 'Yes' }
  };
  return map[code] || { cond: 'clear', label: 'Clear sky', rain: 'No' };
}

// ─── Determine Theme ───
function determineTheme(now, w) {
  var p = getTimePeriod(now);
  if (w) {
    var wx = interpretWeatherCode(w.weatherCode);
    // Severe weather first
    if (wx.cond === 'storm') return 'storm';
    if (wx.cond === 'rain' || wx.cond === 'drizzle') return 'rain';
    if (wx.cond === 'snow') return 'cold';
    if (wx.cond === 'fog') return 'fog';
    // Cloud conditions before temperature
    if (wx.cond === 'cloudy') return 'cloudy';
    if (wx.cond === 'partly') return 'partlycloudy';
    // Time of day
    if (p === 'dawn') return 'dawn';
    if (p === 'dusk') return 'dusk';
    if (p === 'night') return 'night';
    // Temperature extremes (only for clear/mainly clear)
    if (w.temp > 38) return 'hot';
    if (w.temp < 10) return 'cold';
    return 'pleasant';
  }
  if (p === 'dawn') return 'dawn';
  if (p === 'dusk') return 'dusk';
  if (p === 'night') return 'night';
  return 'pleasant';
}

// ─── Build live data from API ───
function buildLiveData(w, theme) {
  var now = getLocalDate();
  var wx = interpretWeatherCode(w.weatherCode);
  var disc = w.temp - 0.55 * (1 - w.humidity / 100) * (w.temp - 14.5);
  var feels = Math.round(w.temp + (w.humidity > 70 ? 2 : 0) - (w.temp < 15 ? 2 : 0));
  var p = getTimePeriod(now);
  let ll, ls;
  if (p === 'night') { ll = 5; ls = 'Nighttime'; } else if (p === 'dawn') { ll = 120; ls = 'First light'; }
  else if (p === 'dusk') { ll = 210; ls = 'Fading light'; } else if (w.cloud > 80) { ll = 180; ls = 'Overcast'; }
  else if (w.cloud > 50) { ll = 450; ls = 'Partly cloudy'; } else { ll = 750; ls = 'Bright daylight'; }
  var tl = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  var title = wx.label;
  if (wx.cond === 'clear' && p === 'dawn') title = 'Sunrise';
  if (wx.cond === 'clear' && p === 'dusk') title = 'Sunset';
  if (wx.cond === 'clear' && p === 'night') title = 'Clear night';
  return {
    temp: Math.round(w.temp * 10) / 10, hum: Math.round(w.humidity), pres: Math.round(w.pressure),
    rain: wx.rain, light: ll, disc: Math.round(disc * 10) / 10, feels,
    title, sub: `${locationName} · Live weather`,
    alert: disc > 33 ? 'High discomfort — limit outdoor exposure.' : (wx.cond === 'storm' ? 'Severe weather — stay indoors.' : null),
    humSub: w.humidity > 80 ? 'Very humid' : w.humidity > 60 ? 'Humid' : 'Comfortable',
    presSub: w.pressure < 995 ? 'Low — rain likely' : w.pressure > 1020 ? 'High — stable' : 'Normal',
    rainSub: wx.rain === 'Yes' ? 'Active rainfall' : 'No rain detected', lightSub: ls,
    discLevel: disc > 30 ? 'Dangerous' : disc > 22 ? 'Moderate' : 'Comfortable',
    discText: disc > 30 ? 'Avoid prolonged outdoor exposure' : disc > 22 ? 'Moderate strain in sun' : 'Ideal conditions',
    report: `${locationName}: ${Math.round(w.temp)}°C, ${Math.round(w.humidity)}% humidity, ${Math.round(w.pressure)} hPa. ${wx.label}. Wind ${w.wind} km/h. Cloud ${w.cloud}%.`,
    trend: w.hourly || Array(12).fill(0).map(() => Math.round(w.temp + (Math.random() - 0.5) * 4)),
    nextHours: w.nextHours,
    yesterday: w.yesterday,
    theme
  };
}

// ─── Smart weather code correction ───
// Open-Meteo uses forecast models that can predict storms/rain
// before they actually happen. Cross-check with actual rain data.
function correctWeatherCode(code, rainMm, cloudCover) {
  // If API says storm/rain but there's zero actual rainfall, override
  if (rainMm === 0 || rainMm === 0.0) {
    // Storm codes (95-99) with no rain → just cloudy
    if (code >= 95) {
      return cloudCover > 80 ? 3 : cloudCover > 40 ? 2 : 1;
    }
    // Rain/drizzle codes (51-82) with no rain → cloudy based on cloud cover
    if (code >= 51 && code <= 82) {
      return cloudCover > 80 ? 3 : cloudCover > 40 ? 2 : 1;
    }
  }
  return code;
}

// ─── Fetch Weather (Open-Meteo, free, no key) ───
async function fetchWeather() {
  try {
    const url = `${OPEN_METEO}?latitude=${userCoords.lat}&longitude=${userCoords.lon}` +
      `&current=temperature_2m,relative_humidity_2m,surface_pressure,rain,weather_code,cloud_cover,wind_speed_10m` +
      `&hourly=temperature_2m,weather_code&timezone=auto&forecast_days=2&past_days=1` +
      `&daily=temperature_2m_max,temperature_2m_min,weather_code`;
    const res = await fetch(url);
    if (!res.ok) return;
    const d = await res.json();
    const c = d.current;
    
    let currentHourIdx = 24; // Default if not found (assuming 24 hours in past_days=1)
    if (d.hourly && d.hourly.time && c.time) {
      currentHourIdx = d.hourly.time.findIndex(t => t >= c.time.substring(0, 13) + ':00');
      if (currentHourIdx === -1) currentHourIdx = 24;
    }

    const ht = d.hourly?.temperature_2m || [];
    const ht24 = ht.slice(currentHourIdx, currentHourIdx + 24);
    const step = Math.floor(ht24.length / 12) || 1;
    const trend = [];
    for (let i = 0; i < 12 && i * step < ht24.length; i++) trend.push(Math.round(ht24[i * step]));

    const nextHours = [];
    if (d.hourly && d.hourly.time) {
      for (let i = 1; i <= 3; i++) {
        const idx = currentHourIdx + i;
        if (idx < d.hourly.time.length) {
          nextHours.push({
            time: d.hourly.time[idx],
            temp: Math.round(d.hourly.temperature_2m[idx]),
            code: d.hourly.weather_code[idx]
          });
        }
      }
    }

    let yesterdayData = null;
    if (d.daily && d.daily.time && d.daily.time.length > 0) {
      yesterdayData = {
        high: Math.round(d.daily.temperature_2m_max[0]),
        low: Math.round(d.daily.temperature_2m_min[0]),
        code: d.daily.weather_code[0]
      };
    }

    // Correct weather code using actual rain data
    const rawCode = c.weather_code;
    const correctedCode = correctWeatherCode(rawCode, c.rain, c.cloud_cover);

    currentWeather = {
      temp: c.temperature_2m, humidity: c.relative_humidity_2m, pressure: c.surface_pressure,
      rain: c.rain, weatherCode: correctedCode, cloud: c.cloud_cover, wind: c.wind_speed_10m,
      hourly: trend.length >= 12 ? trend : undefined,
      nextHours: nextHours,
      yesterday: yesterdayData
    };

    if (rawCode !== correctedCode) {
      console.log('Weather corrected:', { raw: rawCode + ' (' + interpretWeatherCode(rawCode).label + ')', corrected: correctedCode + ' (' + interpretWeatherCode(correctedCode).label + ')', rain: c.rain + 'mm', cloud: c.cloud_cover + '%' });
    }
    console.log('Weather:', { code: correctedCode, label: interpretWeatherCode(correctedCode).label, temp: c.temperature_2m, rain: c.rain, cloud: c.cloud_cover });

    document.getElementById('api-dot').className = 'api-dot live';
    document.getElementById('api-label').textContent = 'Live weather · auto-updating every 10 min';
    if (autoMode) applyAutoTheme();
  } catch (e) {
    console.log('Weather fetch failed:', e);
    if (autoMode) applyAutoTheme();
  }
}

// ─── Auto Theme ───
function applyAutoTheme() {
  if (!autoMode) return;
  var now = getLocalDate();
  var theme = determineTheme(now, currentWeather);
  if (theme === lastAutoTheme) return;
  lastAutoTheme = theme;
  if (currentWeather) {
    applyData(buildLiveData(currentWeather, theme));
  } else {
    applyData(scenarios[theme] || scenarios.pleasant);
  }
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const ab = document.getElementById('btn-auto');
  if (ab) ab.classList.add('active');
}

function enableAutoMode() {
  autoMode = true; liveMode = false; lastAutoTheme = null;
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  const ab = document.getElementById('btn-auto');
  if (ab) ab.classList.add('active');
  applyAutoTheme();
}

function setScenario(name) {
  autoMode = false; liveMode = false; lastAutoTheme = null;
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  applyData(scenarios[name]);
}

// ─── Sky Effects ───
function drawSkyEffects(s) {
  const overlay = document.getElementById('sky-overlay');
  overlay.innerHTML = '';

  // Stars
  if (['night', 'storm', 'dawn', 'dusk'].includes(s.theme)) {
    const ct = s.theme === 'night' ? 80 : s.theme === 'storm' ? 20 : 12;
    const maxY = s.theme === 'dawn' || s.theme === 'dusk' ? 40 : 65;
    const maxOp = s.theme === 'dawn' || s.theme === 'dusk' ? 0.35 : 1;
    for (let i = 0; i < ct; i++) {
      const star = document.createElement('div');
      star.className = 'star';
      const sz = Math.random() * 2.5 + 0.5;
      star.style.cssText = `width:${sz}px;height:${sz}px;top:${Math.random() * maxY}%;left:${Math.random() * 100}%;animation-delay:${Math.random() * 4}s;animation-duration:${1.5 + Math.random() * 2.5}s;opacity:${0.2 + Math.random() * maxOp}`;
      overlay.appendChild(star);
    }
  }

  // Lightning
  if (s.theme === 'storm') {
    const fl = document.createElement('div');
    fl.className = 'lightning'; overlay.appendChild(fl);
  }

  // Rain
  if (s.rain === 'Yes') {
    const ct = s.theme === 'storm' ? 100 : 50;
    for (let i = 0; i < ct; i++) {
      const d = document.createElement('div'); d.className = 'raindrop';
      const h = 10 + Math.random() * 20, dur = 0.4 + Math.random() * 0.6;
      d.style.cssText = `height:${h}px;left:${Math.random() * 110 - 5}%;animation-duration:${dur}s;animation-delay:${Math.random() * 2}s;opacity:${0.3 + Math.random() * 0.5};`;
      overlay.appendChild(d);
    }
  }

  // Snow
  if (s.theme === 'cold') {
    for (let i = 0; i < 20; i++) {
      const sf = document.createElement('div'); sf.className = 'snowflake'; sf.textContent = '❄';
      sf.style.cssText = `left:${Math.random() * 100}%;animation-duration:${4 + Math.random() * 6}s;animation-delay:${Math.random() * 5}s;font-size:${8 + Math.random() * 8}px;`;
      overlay.appendChild(sf);
    }
  }

  // Horizon glow for dawn/dusk
  if (s.theme === 'dawn' || s.theme === 'dusk') {
    const glow = document.createElement('div');
    const c = s.theme === 'dawn'
      ? 'radial-gradient(ellipse 130% 100% at 50% 100%, rgba(255,170,50,0.4) 0%, rgba(255,120,80,0.18) 40%, transparent 70%)'
      : 'radial-gradient(ellipse 130% 100% at 50% 100%, rgba(255,100,30,0.45) 0%, rgba(200,50,80,0.2) 40%, transparent 70%)';
    glow.style.cssText = `position:absolute;bottom:0;left:0;right:0;height:50%;background:${c};pointer-events:none;`;
    overlay.appendChild(glow);
  }

  // Clouds
  if (['pleasant', 'rain', 'cold', 'dawn', 'dusk', 'cloudy', 'partlycloudy', 'fog'].includes(s.theme)) {
    var ct = s.theme === 'cloudy' ? 6 : s.theme === 'fog' ? 5 : s.theme === 'rain' ? 4 : s.theme === 'partlycloudy' ? 3 : 2;
    for (let i = 0; i < ct; i++) {
      const wrap = document.createElement('div'); wrap.className = 'cloud-wrap';
      const top = 5 + Math.random() * 20, scale = 0.6 + Math.random() * 0.8, dur = 40 + Math.random() * 40, delay = Math.random() * -30;
      wrap.style.cssText = `top:${top}%;animation-duration:${dur}s;animation-delay:${delay}s;transform:scale(${scale});`;
      let fill;
      if (s.theme === 'rain') fill = 'rgba(100,110,130,0.7)';
      else if (s.theme === 'dawn') fill = 'rgba(255,200,150,0.6)';
      else if (s.theme === 'dusk') fill = 'rgba(255,160,100,0.55)';
      else if (s.theme === 'cloudy') fill = 'rgba(180,185,195,0.8)';
      else if (s.theme === 'fog') fill = 'rgba(200,205,215,0.6)';
      else if (s.theme === 'partlycloudy') fill = 'rgba(220,230,245,0.7)';
      else fill = 'rgba(255,255,255,0.75)';
      wrap.innerHTML = `<svg width="140" height="60" viewBox="0 0 140 60" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="38" r="22" fill="${fill}"/><circle cx="72" cy="28" r="20" fill="${fill}"/>
        <circle cx="92" cy="35" r="18" fill="${fill}"/><circle cx="38" cy="42" r="15" fill="${fill}"/>
        <circle cx="105" cy="40" r="14" fill="${fill}"/><rect x="24" y="38" width="96" height="22" rx="4" fill="${fill}"/>
      </svg>`;
      overlay.appendChild(wrap);
    }
  }

  // Fog haze overlay
  if (s.theme === 'fog') {
    var haze = document.createElement('div');
    haze.style.cssText = 'position:absolute;inset:0;background:rgba(200,205,215,0.25);pointer-events:none;';
    overlay.appendChild(haze);
  }
}

// ─── Weather Icon ───
function drawWeatherIcon(s) {
  const svg = document.getElementById('weather-svg');
  const ns = 'http://www.w3.org/2000/svg';
  svg.innerHTML = '';
  const cx = 28, cy = 28;

  if (s.theme === 'dawn' || s.theme === 'dusk') {
    const sunY = s.theme === 'dawn' ? 38 : 40;
    const color = s.theme === 'dawn' ? '#FFD060' : '#FF7830';
    const id = s.theme + '-clip';
    const defs = document.createElementNS(ns, 'defs');
    const clip = document.createElementNS(ns, 'clipPath'); clip.setAttribute('id', id);
    const cr = document.createElementNS(ns, 'rect');
    cr.setAttribute('x', 0); cr.setAttribute('y', 0); cr.setAttribute('width', 56); cr.setAttribute('height', sunY);
    clip.appendChild(cr); defs.appendChild(clip); svg.appendChild(defs);
    // horizon
    const hl = document.createElementNS(ns, 'line');
    hl.setAttribute('x1', 6); hl.setAttribute('y1', sunY); hl.setAttribute('x2', 50); hl.setAttribute('y2', sunY);
    hl.setAttribute('stroke', 'rgba(255,200,100,0.4)'); hl.setAttribute('stroke-width', '1'); svg.appendChild(hl);
    // sun
    const sun = document.createElementNS(ns, 'circle');
    sun.setAttribute('cx', cx); sun.setAttribute('cy', sunY); sun.setAttribute('r', '13');
    sun.setAttribute('fill', color); sun.setAttribute('clip-path', `url(#${id})`); svg.appendChild(sun);
    // rays
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI / 6) * (i - 2);
      const r = document.createElementNS(ns, 'line');
      r.setAttribute('x1', cx + Math.cos(a - Math.PI / 2) * 16); r.setAttribute('y1', sunY + Math.sin(a - Math.PI / 2) * 16);
      r.setAttribute('x2', cx + Math.cos(a - Math.PI / 2) * 22); r.setAttribute('y2', sunY + Math.sin(a - Math.PI / 2) * 22);
      r.setAttribute('stroke', color); r.setAttribute('stroke-width', '2'); r.setAttribute('stroke-linecap', 'round');
      svg.appendChild(r);
    }
  } else if (s.theme === 'pleasant') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2; const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', cx + Math.cos(a) * 18); l.setAttribute('y1', cy + Math.sin(a) * 18);
      l.setAttribute('x2', cx + Math.cos(a) * 24); l.setAttribute('y2', cy + Math.sin(a) * 24);
      l.setAttribute('stroke', '#FFD700'); l.setAttribute('stroke-width', '2.5'); l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    }
    const sun = document.createElementNS(ns, 'circle');
    sun.setAttribute('cx', cx); sun.setAttribute('cy', cy); sun.setAttribute('r', '13');
    sun.setAttribute('fill', '#FFD700'); svg.appendChild(sun);
  } else if (s.theme === 'hot') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2; const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', cx + Math.cos(a) * 18); l.setAttribute('y1', cy + Math.sin(a) * 18);
      l.setAttribute('x2', cx + Math.cos(a) * 26); l.setAttribute('y2', cy + Math.sin(a) * 26);
      l.setAttribute('stroke', '#FF6B00'); l.setAttribute('stroke-width', '3'); l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    }
    const sun = document.createElementNS(ns, 'circle');
    sun.setAttribute('cx', cx); sun.setAttribute('cy', cy); sun.setAttribute('r', '14');
    sun.setAttribute('fill', '#FF8C00'); svg.appendChild(sun);
    const gl = document.createElementNS(ns, 'circle');
    gl.setAttribute('cx', cx); gl.setAttribute('cy', cy); gl.setAttribute('r', '14');
    gl.setAttribute('fill', 'none'); gl.setAttribute('stroke', 'rgba(255,200,0,0.4)'); gl.setAttribute('stroke-width', '4');
    svg.appendChild(gl);
  } else if (s.theme === 'night') {
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M 40 12 A 16 16 0 1 1 40 44 A 11 11 0 1 0 40 12');
    p.setAttribute('fill', '#E8E8C8'); svg.appendChild(p);
    [[12, 14], [18, 8], [8, 24], [20, 28]].forEach(([x, y]) => {
      const s2 = document.createElementNS(ns, 'circle');
      s2.setAttribute('cx', x); s2.setAttribute('cy', y); s2.setAttribute('r', '1.5');
      s2.setAttribute('fill', 'white'); svg.appendChild(s2);
    });
  } else if (s.theme === 'cold') {
    [[28, 6, 28, 50], [6, 28, 50, 28], [11, 11, 45, 45], [45, 11, 11, 45]].forEach(([x1, y1, x2, y2]) => {
      const l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', 'rgba(200,230,255,0.85)'); l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    });
    [[28, 6], [28, 50], [6, 28], [50, 28], [11, 11], [45, 45], [45, 11], [11, 45]].forEach(([x, y]) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', '2.5'); c.setAttribute('fill', 'rgba(220,240,255,0.9)');
      svg.appendChild(c);
    });
    const cc = document.createElementNS(ns, 'circle');
    cc.setAttribute('cx', '28'); cc.setAttribute('cy', '28'); cc.setAttribute('r', '4'); cc.setAttribute('fill', 'white');
    svg.appendChild(cc);
  } else if (s.theme === 'cloudy') {
    // Big grey cloud
    var cf = '#9CA3AF';
    [[28, 24, 16], [40, 20, 12], [16, 22, 11], [32, 16, 10]].forEach(([x, y, r]) => {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('fill', cf);
      svg.appendChild(c);
    });
    var base = document.createElementNS(ns, 'rect');
    base.setAttribute('x', 5); base.setAttribute('y', 28); base.setAttribute('width', 46); base.setAttribute('height', 14);
    base.setAttribute('rx', 7); base.setAttribute('fill', '#9CA3AF'); svg.appendChild(base);
  } else if (s.theme === 'fog') {
    // Cloud with fog lines
    [[24, 18, 12], [36, 15, 10], [14, 17, 9]].forEach(([x, y, r]) => {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('fill', '#B0B8C4');
      svg.appendChild(c);
    });
    // Horizontal fog lines
    [[8, 32, 48, 32], [5, 38, 51, 38], [10, 44, 46, 44]].forEach(([x1, y1, x2, y2]) => {
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('stroke', 'rgba(200,210,220,0.7)'); l.setAttribute('stroke-width', '2.5'); l.setAttribute('stroke-linecap', 'round');
      svg.appendChild(l);
    });
  } else if (s.theme === 'partlycloudy') {
    // Sun behind cloud
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * Math.PI * 2; var rl = document.createElementNS(ns, 'line');
      rl.setAttribute('x1', 18 + Math.cos(a) * 12); rl.setAttribute('y1', 18 + Math.sin(a) * 12);
      rl.setAttribute('x2', 18 + Math.cos(a) * 17); rl.setAttribute('y2', 18 + Math.sin(a) * 17);
      rl.setAttribute('stroke', '#FFD700'); rl.setAttribute('stroke-width', '2'); rl.setAttribute('stroke-linecap', 'round');
      svg.appendChild(rl);
    }
    var sun = document.createElementNS(ns, 'circle');
    sun.setAttribute('cx', 18); sun.setAttribute('cy', 18); sun.setAttribute('r', '8');
    sun.setAttribute('fill', '#FFD700'); svg.appendChild(sun);
    // Cloud in front
    [[32, 30, 12], [42, 26, 10], [24, 28, 9]].forEach(([x, y, r]) => {
      var c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('fill', 'rgba(220,230,245,0.95)');
      svg.appendChild(c);
    });
    var cbase = document.createElementNS(ns, 'rect');
    cbase.setAttribute('x', 15); cbase.setAttribute('y', 33); cbase.setAttribute('width', 36); cbase.setAttribute('height', 12);
    cbase.setAttribute('rx', 6); cbase.setAttribute('fill', 'rgba(220,230,245,0.95)'); svg.appendChild(cbase);
  } else {
    const cf = s.theme === 'storm' ? '#4A5568' : '#90A0B0';
    [[28, 22, 16], [38, 17, 12], [18, 18, 11], [30, 14, 10]].forEach(([x, y, r]) => {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); c.setAttribute('fill', cf);
      svg.appendChild(c);
    });
    if (s.theme === 'storm') {
      const b = document.createElementNS(ns, 'polyline');
      b.setAttribute('points', '32,34 28,44 31,44 26,54');
      b.setAttribute('stroke', '#FFE500'); b.setAttribute('stroke-width', '2.5');
      b.setAttribute('fill', 'none'); b.setAttribute('stroke-linecap', 'round'); b.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(b);
    } else {
      [[22, 38], [29, 42], [37, 38]].forEach(([x, y]) => {
        const l = document.createElementNS(ns, 'line');
        l.setAttribute('x1', x); l.setAttribute('y1', y); l.setAttribute('x2', x - 3); l.setAttribute('y2', y + 8);
        l.setAttribute('stroke', 'rgba(150,190,230,0.9)'); l.setAttribute('stroke-width', '2'); l.setAttribute('stroke-linecap', 'round');
        svg.appendChild(l);
      });
    }
  }
}

// ─── Chart ───
function drawChart(trend) {
  const ctx = document.getElementById('tempChart').getContext('2d');
  const labels = ['6a', '7a', '8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p'];
  const min = Math.min(...trend), max = Math.max(...trend);
  document.getElementById('chart-range').textContent = min + '° – ' + max + '°';
  if (chart) { chart.destroy(); }
  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels, datasets: [{
        data: trend, borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 2, pointBackgroundColor: 'rgba(255,255,255,0.9)', pointRadius: 3, pointHoverRadius: 5, tension: 0.4, fill: true
      }]
    },
    options: {
      responsive: true, plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false } },
        y: { ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 }, callback: v => v + '°' }, grid: { color: 'rgba(255,255,255,0.07)' }, border: { display: false } }
      }
    }
  });
}

// ─── Apply Data ───
function applyData(data) {
  document.getElementById('val-temp').textContent = data.temp;
  document.getElementById('val-hum').textContent = data.hum;
  document.getElementById('val-pres').textContent = data.pres;
  document.getElementById('val-rain').textContent = data.rain === 'Yes' ? 'Raining 🌧' : 'Dry ✓';
  document.getElementById('val-light').textContent = data.light;
  document.getElementById('val-disc').textContent = typeof data.disc === 'number' ? data.disc.toFixed(1) : data.disc;
  document.getElementById('val-feels').textContent = data.feels;
  document.getElementById('condition-title').textContent = data.title;
  document.getElementById('condition-sub').textContent = data.sub;
  document.getElementById('hum-sub').textContent = data.humSub;
  document.getElementById('pres-sub').textContent = data.presSub;
  document.getElementById('rain-sub').textContent = data.rainSub;
  document.getElementById('light-sub').textContent = data.lightSub;
  document.getElementById('disc-level').textContent = '— ' + data.discLevel;
  document.getElementById('disc-text').textContent = data.discText;
  document.getElementById('report-text').textContent = data.report;
  const pct = Math.min(100, (data.disc / 40) * 100);
  const bc = data.disc > 30 ? '#FF6B6B' : data.disc > 22 ? '#FBBF24' : '#4ADE80';
  document.getElementById('disc-bar').style.width = pct + '%';
  document.getElementById('disc-bar').style.background = bc;
  const al = document.getElementById('alert-banner');
  if (data.alert) { al.classList.add('show'); document.getElementById('alert-text').textContent = data.alert; }
  else { al.classList.remove('show'); }
  
  const nhRow = document.getElementById('next-hours-row');
  if (nhRow) {
    if (data.nextHours && data.nextHours.length === 3) {
      let html = '';
      data.nextHours.forEach(h => {
        const tDate = new Date(h.time);
        let hStr = tDate.getHours() % 12 || 12;
        let ampm = tDate.getHours() >= 12 ? 'pm' : 'am';
        let wx = interpretWeatherCode(h.code);
        html += `<div class="forecast-item"><span class="f-time">${hStr} ${ampm}</span><span class="f-temp">${h.temp}°</span><span class="f-cond" title="${wx.label}">${wx.label}</span></div>`;
      });
      nhRow.innerHTML = html;
    } else {
      nhRow.innerHTML = `
        <div class="forecast-item"><span class="f-time">+1h</span><span class="f-temp">${Math.round(data.temp)}°</span><span class="f-cond">Similar</span></div>
        <div class="forecast-item"><span class="f-time">+2h</span><span class="f-temp">${Math.round(data.temp)}°</span><span class="f-cond">Similar</span></div>
        <div class="forecast-item"><span class="f-time">+3h</span><span class="f-temp">${Math.round(data.temp)}°</span><span class="f-cond">Similar</span></div>
      `;
    }
  }

  if (data.yesterday) {
    document.getElementById('y-high').textContent = data.yesterday.high + '°';
    document.getElementById('y-low').textContent = data.yesterday.low + '°';
    let wx = interpretWeatherCode(data.yesterday.code);
    document.getElementById('y-cond').textContent = wx.label;
    document.getElementById('y-cond').title = wx.label;
  } else {
    const yHigh = document.getElementById('y-high');
    if(yHigh) {
      yHigh.textContent = Math.round(data.temp + 2) + '°';
      document.getElementById('y-low').textContent = Math.round(data.temp - 3) + '°';
      document.getElementById('y-cond').textContent = 'Varies';
    }
  }

  document.body.className = 'theme-' + data.theme;
  drawSkyEffects(data); drawWeatherIcon(data); drawChart(data.trend);
}

// ─── Init ───
initMap();
setupSearch();
updateClock();
setInterval(updateClock, 30000);

// Apply time-based theme immediately (before weather loads)
applyAutoTheme();

// Fetch weather for initial location
fetchWeather();

// Re-fetch weather every 10 minutes
setInterval(fetchWeather, 600000);

// Also try the local sensor API
async function fetchLive() {
  try {
    const res = await fetch(LIVE_API); if (!res.ok) return;
    const raw = await res.json(); if (raw.error) return;
    liveMode = true;
    document.getElementById('api-dot').className = 'api-dot live';
    document.getElementById('api-label').textContent = 'Live sensor + weather API';
  } catch (e) { }
}
fetchLive(); setInterval(fetchLive, 30000);