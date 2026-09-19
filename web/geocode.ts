// Reverse geocoding: turns the raw GPS fix into a street address a bystander can read to a
// dispatcher ("1400 N Charles St, Baltimore" beats reading out five decimal digits twice).
// Lives in web/ alongside geolocation itself (session.ts line 12: "web/ owns the clock,
// geolocation and the DOM; src/ stays the engine"). One-time enrichment per incident, never
// blocks the coordinate fix that's already usable, and fails silently to it on any error --
// same "episodic, local fallback always" shape as docs/04's other network calls.
// Nominatim (OpenStreetMap) needs no API key, which matches this project's default-to-free
// stance (WebSpeech before ElevenLabs, etc.); a paid geocoder can slot in behind a flag later
// the same way ElevenLabs did for voice.

const ENDPOINT = 'https://nominatim.openstreetmap.org/reverse';

/** Nominatim's own reverse-geocode response shape, fields used here only. */
type NominatimReverse = {
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    postcode?: string;
  };
  display_name?: string;
};

function formatAddress(a: NonNullable<NominatimReverse['address']>): string | null {
  const street = [a.house_number, a.road].filter(Boolean).join(' ');
  const place = a.city ?? a.town ?? a.village;
  const stateZip = [a.state, a.postcode].filter(Boolean).join(' '); // "Maryland 21218", not "Maryland, 21218"
  const line = [street || null, place, stateZip || null].filter(Boolean).join(', ');
  return line.length > 0 ? line : null;
}

export async function reverseGeocode(lat: number, lon: number, timeoutMs = 5000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `${ENDPOINT}?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      signal: controller.signal,
      // Nominatim's usage policy asks for an identifying header; a Referer is what a browser
      // fetch can actually set (User-Agent is restricted client-side).
      headers: { Referer: typeof location !== 'undefined' ? location.origin : 'mayday-app' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimReverse;
    return (data.address ? formatAddress(data.address) : null) ?? data.display_name ?? null;
  } catch {
    return null; // network down, rate-limited, aborted -- coordinates are still on screen
  } finally {
    clearTimeout(timer);
  }
}
