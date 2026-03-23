// src/pages/restaurants/RestaurantDealsPage.jsx
import React, { useEffect, useState } from "react";
import { ToastContainer } from "react-toastify";
import useRestaurantDoc from "../../hooks/useRestaurantDoc";

const DAYS = [
    { key: "mon", label: "Mon" },
    { key: "tue", label: "Tue" },
    { key: "wed", label: "Wed" },
    { key: "thu", label: "Thu" },
    { key: "fri", label: "Fri" },
    { key: "sat", label: "Sat" },
    { key: "sun", label: "Sun" },
];

const createId = (prefix) =>
    `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const newDeal = () => ({
    id: createId("deal"),
    title: "",
    subtitle: "",
    type: "percent",
    amount: "",
    code: "",
    valid: "",
    validFrom: "",
    validTo: "",
    days: [],
    startTime: "",
    endTime: "",
    isActive: true,
    notes: "",
});

function DayToggleRow({ value = [], onToggle }) {
    return (
        <div className="flex flex-wrap gap-2">
            {DAYS.map((day) => {
                const active = value.includes(day.key);
                return (
                    <button
                        key={day.key}
                        type="button"
                        onClick={() => onToggle(day.key)}
                        className={`px-3 py-1 rounded-full text-xs border ${active
                                ? "bg-black text-white border-black"
                                : "bg-white text-gray-700 border-gray-300"
                            }`}
                    >
                        {day.label}
                    </button>
                );
            })}
        </div>
    );
}

export default function RestaurantDealsPage() {
    const { restaurant, loading, updateRestaurant, restaurantId } = useRestaurantDoc();
    const [deals, setDeals] = useState([]);

    useEffect(() => {
        if (Array.isArray(restaurant?.deals)) {
            setDeals(restaurant.deals);
        }
    }, [restaurant]);

    const addDeal = () => setDeals((prev) => [...prev, newDeal()]);

    const updateDeal = (dealId, patch) =>
        setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, ...patch } : d)));

    const removeDeal = (dealId) =>
        setDeals((prev) => prev.filter((d) => d.id !== dealId));

    const toggleDealDay = (dealId, dayKey) => {
        setDeals((prev) =>
            prev.map((d) => {
                if (d.id !== dealId) return d;
                const exists = (d.days || []).includes(dayKey);
                return {
                    ...d,
                    days: exists ? d.days.filter((x) => x !== dayKey) : [...(d.days || []), dayKey],
                };
            })
        );
    };

    const handleSave = async (e) => {
        e.preventDefault();

        const cleanedDeals = (deals || []).map((d) => ({
            ...d,
            title: (d.title || "").trim(),
            subtitle: (d.subtitle || "").trim(),
            amount: d.amount === "" ? null : Number(d.amount),
            code: (d.code || "").trim(),
            valid: (d.valid || "").trim(),
            notes: (d.notes || "").trim(),
        }));

        await updateRestaurant({ deals: cleanedDeals }, "Deals updated ✅");
    };

    if (loading) return <div className="p-6">Loading...</div>;
    if (!restaurantId) return <div className="p-6">Employee restaurant id not found.</div>;

    return (
        <main className="p-6 bg-gray-100 min-h-screen">
            <div className="max-w-6xl mx-auto bg-white rounded-xl shadow p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-2xl font-semibold">Deals</h1>
                        <p className="text-sm text-gray-500">
                            {restaurant?.branchName || restaurant?.brandName || "Restaurant"}
                        </p>
                    </div>
                    <button type="button" onClick={addDeal} className="px-4 py-2 bg-black text-white rounded">
                        + Add Deal
                    </button>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                    {(deals || []).length === 0 ? (
                        <div className="text-sm text-gray-500">No deals added yet.</div>
                    ) : (
                        deals.map((d) => (
                            <div key={d.id} className="border rounded-xl p-4 space-y-4">
                                <div className="flex justify-between">
                                    <div className="font-medium">Deal</div>
                                    <button
                                        type="button"
                                        onClick={() => removeDeal(d.id)}
                                        className="text-red-600"
                                    >
                                        Delete
                                    </button>
                                </div>

                                <div className="grid grid-cols-2 gap-3">
                                    <input
                                        className="border rounded p-2"
                                        value={d.title}
                                        onChange={(e) => updateDeal(d.id, { title: e.target.value })}
                                        placeholder="Title"
                                    />
                                    <input
                                        className="border rounded p-2"
                                        value={d.subtitle}
                                        onChange={(e) => updateDeal(d.id, { subtitle: e.target.value })}
                                        placeholder="Subtitle"
                                    />
                                    <select
                                        className="border rounded p-2"
                                        value={d.type}
                                        onChange={(e) => updateDeal(d.id, { type: e.target.value })}
                                    >
                                        <option value="percent">Percent</option>
                                        <option value="flat">Flat</option>
                                        <option value="bogo">BOGO</option>
                                        <option value="code">Promo Code</option>
                                    </select>
                                    <input
                                        className="border rounded p-2"
                                        value={d.amount}
                                        onChange={(e) => updateDeal(d.id, { amount: e.target.value })}
                                        placeholder="Amount"
                                    />
                                    <input
                                        className="border rounded p-2"
                                        value={d.code}
                                        onChange={(e) => updateDeal(d.id, { code: e.target.value })}
                                        placeholder="Code"
                                    />
                                    <input
                                        className="border rounded p-2"
                                        value={d.valid}
                                        onChange={(e) => updateDeal(d.id, { valid: e.target.value })}
                                        placeholder="Valid text"
                                    />
                                </div>

                                <DayToggleRow
                                    value={d.days || []}
                                    onToggle={(dayKey) => toggleDealDay(d.id, dayKey)}
                                />

                                <div className="grid grid-cols-4 gap-3">
                                    <input
                                        type="time"
                                        className="border rounded p-2"
                                        value={d.startTime}
                                        onChange={(e) => updateDeal(d.id, { startTime: e.target.value })}
                                    />
                                    <input
                                        type="time"
                                        className="border rounded p-2"
                                        value={d.endTime}
                                        onChange={(e) => updateDeal(d.id, { endTime: e.target.value })}
                                    />
                                    <input
                                        type="datetime-local"
                                        className="border rounded p-2"
                                        value={d.validFrom}
                                        onChange={(e) => updateDeal(d.id, { validFrom: e.target.value })}
                                    />
                                    <input
                                        type="datetime-local"
                                        className="border rounded p-2"
                                        value={d.validTo}
                                        onChange={(e) => updateDeal(d.id, { validTo: e.target.value })}
                                    />
                                </div>

                                <label className="flex items-center gap-2 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={!!d.isActive}
                                        onChange={(e) => updateDeal(d.id, { isActive: e.target.checked })}
                                    />
                                    Active
                                </label>

                                <textarea
                                    className="w-full border rounded p-2"
                                    rows={2}
                                    value={d.notes}
                                    onChange={(e) => updateDeal(d.id, { notes: e.target.value })}
                                    placeholder="Notes / rules"
                                />
                            </div>
                        ))
                    )}

                    <div className="flex justify-end">
                        <button className="px-5 py-2 rounded bg-blue-600 text-white hover:bg-blue-700">
                            Save Deals
                        </button>
                    </div>
                </form>
            </div>

            <ToastContainer />
        </main>
    );
}