// LocationPicker.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Country, State, City } from "country-state-city";

export default function LocationPicker({ value, onChange }) {
  const allCountries = useMemo(() => Country.getAllCountries(), []);
  const [country, setCountry] = useState(null);
  const [state, setState]     = useState(null);
  const [city, setCity]       = useState(null);

  // prevent onChange during initial bind/hydration
  const hydratingRef = useRef(true);

  const states = useMemo(
    () => (country ? State.getStatesOfCountry(country.isoCode) : []),
    [country]
  );
  const cities = useMemo(
    () => (country && state ? City.getCitiesOfState(country.isoCode, state.isoCode) : []),
    [country, state]
  );

  const parseCoords = (obj) => {
    if (!obj) return null;
    const lat = parseFloat(obj.latitude);
    const lng = parseFloat(obj.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  };

  const emit = () => {
    if (hydratingRef.current) return; // 🚫 skip during hydration
    const coords = parseCoords(city) || parseCoords(state) || parseCoords(country) || null;
    onChange?.({
      country: country ? { code: country.isoCode, name: country.name } : null,
      state:   state   ? { code: state.isoCode,   name: state.name   } : null,
      city:    city    ? { name: city.name }                          : null,
      coords,
    });
  };

  // Bind from parent (edit)
  useEffect(() => {
    hydratingRef.current = true; // start hydration
    const nextCountry = value?.countryCode
      ? allCountries.find(c => c.isoCode === value.countryCode) || null
      : null;
    const nextState = nextCountry && value?.stateCode
      ? State.getStatesOfCountry(nextCountry.isoCode).find(s => s.isoCode === value.stateCode) || null
      : null;
    const nextCity = nextCountry && nextState && value?.cityName
      ? City.getCitiesOfState(nextCountry.isoCode, nextState.isoCode).find(ct => ct.name === value.cityName) || null
      : null;

    setCountry(nextCountry);
    setState(nextState);
    setCity(nextCity);

    // end hydration AFTER state is set (next tick)
    // so initial onChange won't fire
    const t = setTimeout(() => { hydratingRef.current = false; }, 0);
    return () => clearTimeout(t);
  }, [value?.countryCode, value?.stateCode, value?.cityName, allCountries]);

  // Any internal change → emit (but hydration guarded)
  useEffect(() => { emit(); /* eslint-disable-next-line */ }, [country, state, city]);

  return (
    <div className="flex flex-col gap-3">
      {/* Country */}
      <select
       className="w-full border border-gray-300 p-2 rounded"
        value={country?.isoCode || ""}
        onChange={e => {
          const c = allCountries.find(x => x.isoCode === e.target.value) || null;
          setCountry(c);
          setState(null);
          setCity(null);
        }}
      >
        <option value="">Select country</option>
        {allCountries.map(c => (
          <option key={c.isoCode} value={c.isoCode}>{c.name}</option>
        ))}
      </select>

      {/* State */}
      <select
       className="w-full border border-gray-300 p-2 rounded"
        value={state?.isoCode || ""}
        onChange={e => {
          const s = states.find(x => x.isoCode === e.target.value) || null;
          setState(s);
          setCity(null);
        }}
        disabled={!country || states.length === 0}
      >
        <option value="">
          {country && states.length === 0 ? "No states/regions" : "Select state/region"}
        </option>
        {states.map(s => (
          <option key={s.isoCode} value={s.isoCode}>{s.name}</option>
        ))}
      </select>

      {/* City */}
      <select
       className="w-full border border-gray-300 p-2 rounded"
        value={city?.name || ""}
        onChange={e => {
          const ct = cities.find(x => x.name === e.target.value) || null;
          setCity(ct);
        }}
        disabled={!state || cities.length === 0}
      >
        <option value="">
          {state && cities.length === 0 ? "No cities" : "Select city"}
        </option>
        {cities.map(ct => (
          <option key={`${ct.name}-${ct.stateCode}`} value={ct.name}>{ct.name}</option>
        ))}
      </select>
    </div>
  );
}
