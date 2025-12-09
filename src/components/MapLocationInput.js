// src/components/MapLocationInput.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";

export default function MapLocationInput({ value, onChange, height = 420 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const resizeObsRef = useRef(null);
  const didLocateRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null); // {lng, lat, address}

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const token = useMemo(() => process.env.REACT_APP_MAPBOX_TOKEN || "", []);

  // value -> { lng, lat, address } || "lng,lat"
  const parseValue = () => {
    if (!value) return null;

    // Support old string "lng,lat" format
    if (typeof value === "string") {
      const [lngS, latS] = String(value || "").split(",");
      const lng = Number(lngS),
        lat = Number(latS);
      return Number.isFinite(lng) && Number.isFinite(lat)
        ? { lng, lat, address: "" }
        : null;
    }

    // New preferred object format { lng, lat, address? }
    if (typeof value === "object") {
      const { lng, lat, address = "" } = value || {};
      return Number.isFinite(lng) && Number.isFinite(lat)
        ? { lng, lat, address }
        : null;
    }

    return null;
  };

  useEffect(() => {
    if (!token) {
      setError("Mapbox token missing (REACT_APP_MAPBOX_TOKEN).");
      return;
    }
    if (!containerRef.current) return;

    mapboxgl.accessToken = token;

    const fromProp = parseValue();
    const fallback = fromProp || { lng: 144.9631, lat: -37.8136 }; // Melbourne CBD

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [fallback.lng, fallback.lat],
      zoom: fromProp ? 14 : 11,
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(
      new mapboxgl.NavigationControl({ visualizePitch: true }),
      "top-right"
    );
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    const geocoder = new MapboxGeocoder({
      accessToken: token,
      mapboxgl,
      marker: false,
      placeholder: "Search places, buildings…",
      proximity: fallback,
    });
    map.addControl(geocoder, "top-left");

    const marker = new mapboxgl.Marker({ draggable: true });
    markerRef.current = marker;

    // Helper: reverse geocode & fire onChange
    const updateSelection = async (lngLat, opts = {}) => {
      const { lng, lat } = lngLat;
      let address = opts.address || "";

      // If address not provided (click/drag/geo), do reverse geocode
      if (!address && !opts.skipGeocode) {
        try {
          const resp = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}`
          );
          const data = await resp.json();
          address = data?.features?.[0]?.place_name || "";
        } catch (err) {
          console.error("Reverse geocoding failed:", err);
        }
      }

      const payload = { lng, lat, address };
      setSelected(payload);
      onChangeRef.current?.(payload); // 👈 parent ko full object
    };

    function placeMarker(lngLat, fly = false, opts = {}) {
      marker.setLngLat(lngLat).addTo(map);
      if (fly) {
        map.flyTo({
          center: [lngLat.lng, lngLat.lat],
          zoom: Math.max(map.getZoom(), 14),
          essential: true,
        });
      }
      updateSelection(lngLat, opts);
    }

    // Geocoder result -> already has address
    geocoder.on("result", (e) => {
      const [lng, lat] = e.result?.center || [];
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        const fullAddress = e.result?.place_name || "";
        placeMarker(
          { lng, lat },
          true,
          { address: fullAddress, skipGeocode: !!fullAddress }
        );
      }
    });

    // Initial marker if value provided
    if (fromProp) {
      setSelected(fromProp);
      placeMarker(
        { lng: fromProp.lng, lat: fromProp.lat },
        true,
        { address: fromProp.address || "", skipGeocode: !!fromProp.address }
      );
    }

    // 1) Ensure map has dimensions (modal fix)
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);
    resizeObsRef.current = ro;
    requestAnimationFrame(() => map.resize());

    map.once("load", () => {
      map.resize();

      // 2) After map LOADS, try to get current location ONCE
      if (!fromProp && !didLocateRef.current && navigator.geolocation?.getCurrentPosition) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (didLocateRef.current) return;
            const { longitude: lng, latitude: lat } = pos.coords || {};
            if (Number.isFinite(lng) && Number.isFinite(lat)) {
              didLocateRef.current = true;
              placeMarker({ lng, lat }, true);
            }
          },
          () => {
            // user denied or error -> stay on fallback
          },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
      }
    });

    // Click/drag interactions
    const onClick = (e) => placeMarker(e.lngLat, false);
    map.on("click", onClick);

    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      placeMarker(lngLat, false);
    });

    map.on("error", (e) => console.error("Mapbox error:", e?.error || e));

    const onWinResize = () => map.resize();
    window.addEventListener("resize", onWinResize);

    // Cleanup
    return () => {
      try {
        window.removeEventListener("resize", onWinResize);
      } catch {}
      try {
        resizeObsRef.current?.disconnect();
      } catch {}
      try {
        marker.remove();
      } catch {}
      try {
        map.remove();
      } catch {}
    };
  }, [token]); // run once

  // If parent later sets a new value, sync marker without re-creating map
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const parsed = parseValue();
    if (!parsed) return;

    const current = markerRef.current.getLngLat?.();
    if (
      !current ||
      current.lng !== parsed.lng ||
      current.lat !== parsed.lat
    ) {
      markerRef.current.setLngLat(parsed).addTo(mapRef.current);
      mapRef.current.flyTo({
        center: [parsed.lng, parsed.lat],
        zoom: Math.max(mapRef.current.getZoom(), 14),
      });
    }
    setSelected(parsed);
  }, [value]);

  return (
    <div style={{ position: "relative", height }}>
      {error ? (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded">
          {error}
        </div>
      ) : (
        <>
          <div
            ref={containerRef}
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 8,
              overflow: "hidden",
            }}
          />
          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              background: "rgba(255,255,255,0.9)",
              padding: "6px 10px",
              borderRadius: 6,
              fontSize: 12,
              boxShadow: "0 1px 6px rgba(0,0,0,0.15)",
              maxWidth: "80%",
            }}
          >
            {selected ? (
              <>
                <div style={{ fontWeight: 500 }}>
                  {selected.address || "Dropped pin"}
                </div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>
                  {selected.lat.toFixed(6)}, {selected.lng.toFixed(6)}
                </div>
              </>
            ) : (
              "Click map or search to pick a point"
            )}
          </div>
        </>
      )}
    </div>
  );
}
