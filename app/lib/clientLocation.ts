export type DetectedLocation = {
  city: string | null;
  countryCode: string | null;
};

let detectedLocationPromise: Promise<DetectedLocation> | null = null;

export function detectBrowserLocation(): Promise<DetectedLocation> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ city: null, countryCode: null });
  }

  if (!detectedLocationPromise) {
    detectedLocationPromise = new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async ({ coords }) => {
          try {
            const params = new URLSearchParams({
              latitude: String(coords.latitude),
              longitude: String(coords.longitude),
            });
            const response = await fetch(`/api/location?${params.toString()}`);
            const data = (await response.json()) as Partial<DetectedLocation>;

            resolve({
              city: response.ok ? data.city ?? null : null,
              countryCode: response.ok ? data.countryCode ?? null : null,
            });
          } catch {
            resolve({ city: null, countryCode: null });
          }
        },
        () => resolve({ city: null, countryCode: null }),
        {
          enableHighAccuracy: false,
          maximumAge: 30 * 60 * 1000,
          timeout: 8000,
        },
      );
    });
  }

  return detectedLocationPromise;
}
