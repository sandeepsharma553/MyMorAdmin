
import React, { useState, useEffect, useCallback, memo } from "react";
import {
    GoogleMap,
    Marker,
    useJsApiLoader,
} from "@react-google-maps/api";
import usePlacesAutocomplete, {
    getGeocode,
    getLatLng,
} from "use-places-autocomplete";

const containerStyle = { height: "300px", width: "100%" };

function MapLocationInput({ value = "", onChange }) {

    const { isLoaded } = useJsApiLoader({
        googleMapsApiKey: process.env.REACT_APP_GOOGLE_API_KEY,
        libraries: ["places"],
    });


    const [markerPos, setMarkerPos] = useState({ lat: 28.6139, lng: 77.209 });


    useEffect(() => {
        if (!value) return;
        const [lat, lng] = value.split(",").map(Number);
        if (!isNaN(lat) && !isNaN(lng)) setMarkerPos({ lat, lng });
    }, [value]);


    const updatePosition = useCallback(
        (lat, lng) => {
            const pos = { lat, lng };
            setMarkerPos(pos);
            onChange(`${lat},${lng}`);
        },
        [onChange]
    );


    const {
        ready,
        value: placeInput,
        setValue,
        suggestions: { status, data },
        clearSuggestions,
    } = usePlacesAutocomplete();

    const handlePlaceSelect = async (description) => {
        setValue(description, false);
        clearSuggestions();
        const results = await getGeocode({ address: description });
        const { lat, lng } = await getLatLng(results[0]);
        updatePosition(lat, lng);
    };

    if (!isLoaded) {
        return (
            <div className="h-[300px] flex items-center justify-center">
                Loading&nbsp;map…
            </div>
        );
    }

    return (
        <div className="space-y-2 relative">

            <input
                className="w-full border border-gray-300 p-2 rounded"
                value={placeInput}
                disabled={!ready}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Search place or drop a pin"
            />

            {status === "OK" && (
                <ul className="absolute z-10 w-full border border-gray-200 bg-white shadow max-h-40 overflow-auto">
                    {data.map(({ place_id, description }) => (
                        <li
                            key={place_id}
                            className="px-3 py-1 hover:bg-gray-100 cursor-pointer"
                            onClick={() => handlePlaceSelect(description)}
                        >
                            {description}
                        </li>
                    ))}
                </ul>
            )}

            <GoogleMap
                mapContainerStyle={containerStyle}
                center={markerPos}
                zoom={14}
                onClick={(e) => updatePosition(e.latLng.lat(), e.latLng.lng())}
                options={{ streetViewControl: false, mapTypeControl: false }}
            >
                <Marker
                    position={markerPos}
                    draggable
                    onDragEnd={(e) => updatePosition(e.latLng.lat(), e.latLng.lng())}
                />
            </GoogleMap>
        </div>
    );
}

export default memo(MapLocationInput);
