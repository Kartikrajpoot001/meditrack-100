import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export type LocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable' | 'timeout';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

export interface LocationData {
  coords: LocationCoordinates | null;
  accuracy: number | null; // in meters
  timestamp: number | null; // epoch ms
  address: string;
  isLowConfidence: boolean; // true if older than 2 minutes or accuracy > 1000m
  status: LocationStatus;
  error: string | null;
  source: 'gps' | 'manual' | 'pin' | 'none';
}

export interface LocationContextValue extends LocationData {
  requestLocation: () => Promise<LocationCoordinates | null>;
  setManualLocation: (coords: LocationCoordinates, address?: string) => void;
  searchAddress: (query: string) => Promise<{ lat: number; lng: number; address: string } | null>;
  startWatching: () => void;
  stopWatching: () => void;
  isWatching: boolean;
  clearLocation: () => void;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

const TWO_MINUTES_MS = 2 * 60 * 1000;
const LOW_CONFIDENCE_ACCURACY_METERS = 1000;

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [coords, setCoords] = useState<LocationCoordinates | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [address, setAddress] = useState<string>('');
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<'gps' | 'manual' | 'pin' | 'none'>('none');
  const [isWatching, setIsWatching] = useState<boolean>(false);

  const watchIdRef = useRef<number | null>(null);

  // Helper to reverse geocode coordinates via server proxy
  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const res = await fetch(`/api/maps/geocode?lat=${lat}&lng=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.address) {
          return data.address;
        }
      }
    } catch (err) {
      console.warn('[LocationService] Reverse geocode error:', err);
    }
    return `Coordinates: ${lat.toFixed(5)}°N, ${lng.toFixed(5)}°E`;
  }, []);

  // Compute confidence based on age (>2 mins) and accuracy (>1000m)
  const isLowConfidence = Boolean(
    coords &&
      source === 'gps' &&
      ((accuracy !== null && accuracy > LOW_CONFIDENCE_ACCURACY_METERS) ||
        (timestamp !== null && Date.now() - timestamp > TWO_MINUTES_MS))
  );

  // Core function to acquire GPS with high-accuracy timeout + low-accuracy fallback
  const requestLocation = useCallback(async (): Promise<LocationCoordinates | null> => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      setError('Geolocation is not supported by your browser or environment.');
      return null;
    }

    setStatus('requesting');
    setError(null);

    return new Promise((resolve) => {
      // 1. Try high accuracy with 12s timeout
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = Number(position.coords.latitude.toFixed(6));
          const lng = Number(position.coords.longitude.toFixed(6));
          const acc = Math.round(position.coords.accuracy);
          const time = position.timestamp || Date.now();

          setCoords({ lat, lng });
          setAccuracy(acc);
          setTimestamp(time);
          setStatus('granted');
          setError(null);
          setSource('gps');

          const resolvedAddr = await reverseGeocode(lat, lng);
          setAddress(resolvedAddr);
          resolve({ lat, lng });
        },
        (highAccErr) => {
          console.warn('[LocationService] High-accuracy geolocation failed/timed out, attempting lower accuracy fallback:', highAccErr.message);

          if (highAccErr.code === highAccErr.PERMISSION_DENIED) {
            setStatus('denied');
            setError('Location permission was denied. Please allow location access in your browser or search by address.');
            resolve(null);
            return;
          }

          // 2. Retry with lower accuracy if high accuracy timed out or was unavailable
          navigator.geolocation.getCurrentPosition(
            async (posFallback) => {
              const lat = Number(posFallback.coords.latitude.toFixed(6));
              const lng = Number(posFallback.coords.longitude.toFixed(6));
              const acc = Math.round(posFallback.coords.accuracy);
              const time = posFallback.timestamp || Date.now();

              setCoords({ lat, lng });
              setAccuracy(acc);
              setTimestamp(time);
              setStatus('granted');
              setError(null);
              setSource('gps');

              const resolvedAddr = await reverseGeocode(lat, lng);
              setAddress(resolvedAddr);
              resolve({ lat, lng });
            },
            (lowAccErr) => {
              console.warn('[LocationService] Low-accuracy fallback failed:', lowAccErr.message);
              if (lowAccErr.code === lowAccErr.PERMISSION_DENIED) {
                setStatus('denied');
                setError('Location permission was denied.');
              } else if (lowAccErr.code === lowAccErr.TIMEOUT) {
                setStatus('timeout');
                setError('Location request timed out. Please enter an address or choose a point on the map.');
              } else {
                setStatus('unavailable');
                setError('Location is currently unavailable. Please enter an address or drop a pin.');
              }
              resolve(null);
            },
            {
              enableHighAccuracy: false,
              timeout: 10000,
              maximumAge: 60000,
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        }
      );
    });
  }, [reverseGeocode]);

  // Set manual location (pin drop or address selection)
  const setManualLocation = useCallback(
    async (manualCoords: LocationCoordinates, customAddress?: string) => {
      setCoords(manualCoords);
      setAccuracy(5); // Manual precision
      setTimestamp(Date.now());
      setStatus('granted');
      setError(null);
      setSource('manual');

      if (customAddress) {
        setAddress(customAddress);
      } else {
        const addr = await reverseGeocode(manualCoords.lat, manualCoords.lng);
        setAddress(addr);
      }
    },
    [reverseGeocode]
  );

  // Search address via server geocoding endpoint
  const searchAddress = useCallback(
    async (query: string): Promise<{ lat: number; lng: number; address: string } | null> => {
      if (!query.trim()) return null;
      try {
        const res = await fetch(`/api/maps/geocode/search?q=${encodeURIComponent(query.trim())}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data.lat && data.lng) {
          const manualCoords = { lat: Number(data.lat), lng: Number(data.lng) };
          const resolvedAddr = data.formattedAddress || query.trim();
          setManualLocation(manualCoords, resolvedAddr);
          return { ...manualCoords, address: resolvedAddr };
        }
      } catch (err) {
        console.warn('[LocationService] Search address failed:', err);
      }
      return null;
    },
    [setManualLocation]
  );

  // Live location watcher for active SOS or ambulance/responder tracking
  const startWatching = useCallback(() => {
    if (watchIdRef.current !== null || typeof window === 'undefined' || !navigator.geolocation) {
      return;
    }

    setIsWatching(true);
    setStatus('requesting');

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const acc = Math.round(pos.coords.accuracy);
        const time = pos.timestamp || Date.now();

        setCoords({ lat, lng });
        setAccuracy(acc);
        setTimestamp(time);
        setStatus('granted');
        setError(null);
        setSource('gps');
      },
      (err) => {
        console.warn('[LocationService] watchPosition error:', err.message);
        if (err.code === err.PERMISSION_DENIED) {
          setStatus('denied');
          setError('Location permission denied during tracking.');
        } else {
          setError(err.message);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      }
    );
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
  }, []);

  const clearLocation = useCallback(() => {
    stopWatching();
    setCoords(null);
    setAccuracy(null);
    setTimestamp(null);
    setAddress('');
    setStatus('idle');
    setError(null);
    setSource('none');
  }, [stopWatching]);

  // Clean up watcher on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null && typeof window !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  return (
    <LocationContext.Provider
      value={{
        coords,
        accuracy,
        timestamp,
        address,
        isLowConfidence,
        status,
        error,
        source,
        requestLocation,
        setManualLocation,
        searchAddress,
        startWatching,
        stopWatching,
        isWatching,
        clearLocation,
      }}
    >
      {children}
    </LocationContext.Provider>
  );
};

export function useLocation(): LocationContextValue {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
}
