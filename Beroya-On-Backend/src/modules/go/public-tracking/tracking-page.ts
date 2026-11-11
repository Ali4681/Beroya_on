export type TrackingPageLang = 'ar' | 'en';

const COPY = {
  ar: {
    title: 'تتبع الرحلة',
    header: 'تتبع الرحلة',
    etaPrefix: 'الوقت المتوقع: ',
    etaUnit: ' دقيقة',
    driverFallback: 'السائق',
    locationLabel: 'موقع السائق الحالي',
    openInMaps: 'افتح في الخرائط',
    locationUnavailable: 'الموقع غير متاح حالياً',
    ended: 'انتهت هذه الرحلة ولم يعد الرابط فعّالاً.',
    invalid: 'رابط التتبع غير صالح.',
    status: {
      SEARCHING: 'جارٍ البحث عن سائق',
      DRIVER_ASSIGNED: 'تم تعيين السائق',
      DRIVER_EN_ROUTE: 'السائق في الطريق إليك',
      ARRIVED: 'السائق وصل إلى نقطة الالتقاء',
      IN_PROGRESS: 'الرحلة جارية',
    },
  },
  en: {
    title: 'Track trip',
    header: 'Track trip',
    etaPrefix: 'ETA: ',
    etaUnit: ' min',
    driverFallback: 'Driver',
    locationLabel: 'Driver location',
    openInMaps: 'Open in Maps',
    locationUnavailable: 'Location unavailable',
    ended: 'This trip has ended and the link is no longer active.',
    invalid: 'This tracking link is invalid.',
    status: {
      SEARCHING: 'Looking for a driver',
      DRIVER_ASSIGNED: 'Driver assigned',
      DRIVER_EN_ROUTE: 'Driver is on the way',
      ARRIVED: 'Driver arrived at pickup',
      IN_PROGRESS: 'Trip in progress',
    },
  },
} as const;

/**
 * Temporary self-contained HTML at the API host `/t/:token`.
 * Production UI is the website page at `{APP_PUBLIC_URL}/t/:token` — keep this as fallback only.
 * Language: `?lang=en|ar`, else the booking customer's preferred_language.
 * Map: no embedded tiles — open driver_location in the system / Google Maps app.
 */
export function trackingPageHtml(apiPrefix: string, lang: TrackingPageLang = 'ar') {
  const t = COPY[lang] ?? COPY.ar;
  const dir = lang === 'en' ? 'ltr' : 'rtl';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${t.title}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif; background: #f4f5fa; color: #1d1d3b; }
  header { background: #313193; color: #fff; padding: 14px 16px; font-weight: 600; }
  .card { background: #fff; margin: 12px; border-radius: 14px; padding: 14px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
  .row { display: flex; align-items: center; gap: 12px; }
  #avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover; background: #dfe1f0; flex: none; }
  #driver { font-size: 17px; font-weight: 600; }
  #vehicle { color: #555; margin-top: 2px; }
  #plate { display: inline-block; margin-top: 8px; padding: 4px 10px; border: 2px solid #1d1d3b; border-radius: 6px; font-weight: 700; letter-spacing: 1px; }
  #status { font-size: 16px; font-weight: 600; color: #313193; }
  #eta { color: #555; margin-top: 4px; }
  #locationLabel { font-weight: 600; margin-bottom: 10px; }
  #openMaps {
    display: block; width: 100%; text-align: center; text-decoration: none;
    background: #313193; color: #fff; font-weight: 600; font-size: 16px;
    padding: 14px 16px; border-radius: 12px;
  }
  #openMaps:active { opacity: .9; }
  .muted { color: #888; }
  .hidden { display: none !important; }
</style>
</head>
<body>
<header>${t.header}</header>
<div id="message" class="card hidden"></div>
<div id="content" class="hidden">
  <div class="card">
    <div id="status"></div>
    <div id="eta"></div>
  </div>
  <div class="card row" id="driverCard">
    <img id="avatar" alt="">
    <div>
      <div id="driver"></div>
      <div id="vehicle"></div>
      <div id="plate" class="hidden"></div>
    </div>
  </div>
  <div class="card" id="locationCard">
    <div id="locationUnavailable" class="muted">${t.locationUnavailable}</div>
    <div id="locationReady" class="hidden">
      <div id="locationLabel">${t.locationLabel}</div>
      <a id="openMaps" href="#" target="_blank" rel="noopener noreferrer">${t.openInMaps}</a>
    </div>
  </div>
</div>
<script>
(function () {
  var API = ${JSON.stringify(`/${apiPrefix}`)};
  var token = location.pathname.split('/').filter(Boolean).pop() || '';
  var T = ${JSON.stringify(t)};
  var STATUS = T.status;
  var $ = function (id) { return document.getElementById(id); };
  var timer;

  function mapsHref(lat, lng) {
    return 'https://www.google.com/maps?q=' + encodeURIComponent(lat + ',' + lng);
  }

  function show(msg) {
    $('content').classList.add('hidden');
    $('message').textContent = msg;
    $('message').classList.remove('hidden');
    if (timer) clearInterval(timer);
  }

  function render(d) {
    $('message').classList.add('hidden');
    $('content').classList.remove('hidden');
    $('status').textContent = STATUS[d.status] || d.status;
    $('eta').textContent = d.driver_eta_sec != null
      ? T.etaPrefix + Math.max(1, Math.round(d.driver_eta_sec / 60)) + T.etaUnit
      : '';
    if (d.driver) {
      $('driverCard').classList.remove('hidden');
      $('driver').textContent = d.driver.name || T.driverFallback;
      if (d.driver.avatar_url) $('avatar').src = d.driver.avatar_url; else $('avatar').removeAttribute('src');
    } else {
      $('driverCard').classList.add('hidden');
    }
    if (d.vehicle) {
      $('vehicle').textContent = [d.vehicle.make, d.vehicle.model, d.vehicle.color].filter(Boolean).join(' · ');
      $('plate').textContent = d.vehicle.plate;
      $('plate').classList.remove('hidden');
    } else {
      $('vehicle').textContent = '';
      $('plate').classList.add('hidden');
    }
    var loc = d.driver_location;
    if (loc && typeof loc.lat === 'number' && typeof loc.lng === 'number') {
      $('locationUnavailable').classList.add('hidden');
      $('locationReady').classList.remove('hidden');
      $('openMaps').href = mapsHref(loc.lat, loc.lng);
    } else {
      $('locationReady').classList.add('hidden');
      $('locationUnavailable').classList.remove('hidden');
      $('openMaps').removeAttribute('href');
    }
  }

  function load() {
    fetch(API + '/public/track/' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 410) return show(T.ended);
        if (!res.ok) return show(T.invalid);
        return res.json().then(render);
      })
      .catch(function () { /* keep the last view and retry on the next tick */ });
  }

  load();
  timer = setInterval(load, 5000);
})();
</script>
</body>
</html>`;
}

export function parseTrackingLang(raw: string | undefined | null): TrackingPageLang | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'en' || v === 'en-us' || v === 'en-gb') return 'en';
  if (v === 'ar' || v === 'ar-sy' || v === 'ar-sa') return 'ar';
  return null;
}
