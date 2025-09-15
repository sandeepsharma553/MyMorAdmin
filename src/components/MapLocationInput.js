// src/components/MapLocationInput.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxGeocoder from "@mapbox/mapbox-gl-geocoder";

export default function MapLocationInput({ value = "", onChange, height = 420 }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const resizeObsRef = useRef(null);
  const didLocateRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const [error, setError] = useState("");

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const token = useMemo(() => process.env.REACT_APP_MAPBOX_TOKEN || "", []);

  const parseValue = () => {
    const [lngS, latS] = String(value || "").split(",");
    const lng = Number(lngS), lat = Number(latS);
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
  };

  useEffect(() => {
    if (!token) { setError("Mapbox token missing (REACT_APP_MAPBOX_TOKEN)."); return; }
    if (!containerRef.current) return;

    mapboxgl.accessToken = token;

    const fromProp = parseValue();
    const fallback = fromProp || { lng: 144.9631, lat: -37.8136 }; // any safe default

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: [fallback.lng, fallback.lat],
      zoom: fromProp ? 14 : 11,
      attributionControl: true,
    });
    mapRef.current = map;

    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    const geocoder = new MapboxGeocoder({
      accessToken: token,
      mapboxgl,
      marker: false,
      placeholder: "Search places, buildings…",
      proximity: fallback,
    });
    map.addControl(geocoder, "top-left");
    geocoder.on("result", (e) => {
      const [lng, lat] = e.result?.center || [];
      if (Number.isFinite(lng) && Number.isFinite(lat)) placeMarker({ lng, lat }, true);
    });

    const marker = new mapboxgl.Marker({ draggable: true });
    markerRef.current = marker;

    function placeMarker(lngLat, fly = false) {
      marker.setLngLat(lngLat).addTo(map);
      if (fly) map.flyTo({ center: [lngLat.lng, lngLat.lat], zoom: Math.max(map.getZoom(), 14), essential: true });
      onChangeRef.current?.(`${lngLat.lng.toFixed(6)},${lngLat.lat.toFixed(6)}`);
    }

    // Initial marker if value provided
    if (fromProp) placeMarker(fromProp, true);

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
          () => { /* user denied or error -> stay on fallback */ },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
        );
      }
    });

    // Click/drag interactions
    const onClick = (e) => placeMarker(e.lngLat, false);
    map.on("click", onClick);
    marker.on("dragend", () => placeMarker(marker.getLngLat(), false));

    // Debug errors (token/CSP issues show here)
    map.on("error", (e) => console.error("Mapbox error:", e?.error || e));

    // Cleanup
    const onWinResize = () => map.resize();
    window.addEventListener("resize", onWinResize);
    return () => {
      try { window.removeEventListener("resize", onWinResize); } catch {}
      try { resizeObsRef.current?.disconnect(); } catch {}
      try { marker.remove(); } catch {}
      try { map.remove(); } catch {}
    };
  }, [token]); // ← run once

  // If parent later sets a new value, sync marker without re-creating map
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const parsed = parseValue();
    if (!parsed) return;
    const current = markerRef.current.getLngLat?.();
    if (!current || current.lng !== parsed.lng || current.lat !== parsed.lat) {
      markerRef.current.setLngLat(parsed).addTo(mapRef.current);
      mapRef.current.flyTo({ center: [parsed.lng, parsed.lat], zoom: Math.max(mapRef.current.getZoom(), 14) });
    }
  }, [value]);

  return (
    <div style={{ position: "relative", height }}>
      {error ? (
        <div className="p-3 text-sm text-red-600 bg-red-50 rounded">{error}</div>
      ) : (
        <>
          <div ref={containerRef} style={{ width: "100%", height: "100%", borderRadius: 8, overflow: "hidden" }} />
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
            }}
          >
            {value ? <>Selected: <strong>{value}</strong></> : "Click map or search to pick a point"}
          </div>
        </>
      )}
    </div>
  );
}

// import React, { useState, useEffect, useCallback, memo } from "react";
// import {
//     GoogleMap,
//     Marker,
//     useJsApiLoader,
// } from "@react-google-maps/api";
// import usePlacesAutocomplete, {
//     getGeocode,
//     getLatLng,
// } from "use-places-autocomplete";

// const containerStyle = { height: "300px", width: "100%" };
// const fallbackPos = { lat: 28.6139, lng: 77.2090 };
// function MapLocationInput({ value = "", onChange }) {
//     const [markerPos, setMarkerPos] = useState({ lat: 28.6139, lng: 77.209 });
//     const { isLoaded } = useJsApiLoader({
//         googleMapsApiKey: process.env.REACT_APP_GOOGLE_API_KEY,
//         libraries: ["places"],
//     });



//     const updatePosition = useCallback(
//         (lat, lng) => {
//             const pos = { lat, lng };
//             setMarkerPos(pos);
//             onChange(`${lat},${lng}`);
//         },
//         [onChange]
//     );

//     useEffect(() => {
//         if (value) return;               // parent already supplied coords
//         if (!navigator.geolocation) {
//             console.info("Geolocation not supported; using fallback.");
//             return;
//         }

//         navigator.geolocation.getCurrentPosition(
//             ({ coords }) => updatePosition(coords.latitude, coords.longitude),
//             () => console.info("User denied geolocation; using fallback.")
//         );
//     }, []);

//     useEffect(() => {
//         if (!value) return;
//         const [lat, lng] = value.split(",").map(Number);
//         if (!isNaN(lat) && !isNaN(lng)) setMarkerPos({ lat, lng });
//     }, [value]);

//     const {
//         ready,
//         value: placeInput,
//         setValue,
//         suggestions: { status, data },
//         clearSuggestions,
//     } = usePlacesAutocomplete();

//     const handlePlaceSelect = async (description) => {
//         setValue(description, false);
//         clearSuggestions();
//         const results = await getGeocode({ address: description });
//         const { lat, lng } = await getLatLng(results[0]);
//         updatePosition(lat, lng);
//     };

//     if (!isLoaded) {
//         return (
//             <div className="h-[300px] flex items-center justify-center">
//                 Loading&nbsp;map…
//             </div>
//         );
//     }

//     return (
//         <div className="space-y-2 relative">

//             <input
//                 className="w-full border border-gray-300 p-2 rounded"
//                 value={placeInput}
//                 disabled={!ready}
//                 onChange={(e) => setValue(e.target.value)}
//                 placeholder="Search place or drop a pin"
//             />

//             {status === "OK" && (
//                 <ul className="absolute z-10 w-full border border-gray-200 bg-white shadow max-h-40 overflow-auto">
//                     {data.map(({ place_id, description }) => (
//                         <li
//                             key={place_id}
//                             className="px-3 py-1 hover:bg-gray-100 cursor-pointer"
//                             onClick={() => handlePlaceSelect(description)}
//                         >
//                             {description}
//                         </li>
//                     ))}
//                 </ul>
//             )}

//             <GoogleMap
//                 mapContainerStyle={containerStyle}
//                 center={markerPos}
//                 zoom={14}
//                 onClick={(e) => updatePosition(e.latLng.lat(), e.latLng.lng())}
//                 options={{ streetViewControl: false, mapTypeControl: false }}
//             >
//                 <Marker
//                     position={markerPos}
//                     draggable
//                     onDragEnd={(e) => updatePosition(e.latLng.lat(), e.latLng.lng())}
//                 />
//             </GoogleMap>
//         </div>
//     );
// }

// export default memo(MapLocationInput);