import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import EditorPro from "../../components/EditorPro";
import useDealSettings from "../../hooks/useDealSettings";

// ====== STYLES ======
const labelCls = "text-sm font-semibold text-gray-900";
const inputCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const selectCls =
  "mt-2 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";
const cardCls = "rounded-2xl border border-gray-200 bg-white p-4";
const chipOn = "rounded-full border border-black bg-black px-3 py-1 text-xs font-semibold text-white";
const chipOff = "rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-900 hover:bg-gray-50";

const DAYS = [
  { id: "mon", label: "M" },
  { id: "tue", label: "T" },
  { id: "wed", label: "W" },
  { id: "thu", label: "T" },
  { id: "fri", label: "F" },
  { id: "sat", label: "S" },
  { id: "sun", label: "S" },
];

export default function DealForm({ initialValues, onSubmit, loading, submitText = "Save Deal", formId = "deal-form",
  hideSubmit = false, }) {
  const uid = useSelector((s) => s.auth.user?.uid);

  const {
    loading: settingsLoading,
    categories,
    modes,
    status,
    slotsByCategoryId,
    redemptionMethods,
    discoveryTags,
    feedSections,
  } = useDealSettings(uid);

  const initialForm = useMemo(
    () => ({
      header: "",
      categoryId: "",
      category: "",
      slotId: "",
      slot: "",
      modeKey: "simple",
      mode: "",
      statusKey: "",
      status: "",
      active: true,
      featured: false,
      discoveryTags: [],
      feedSections: [],
      imageFile: null,
      imageUrl: "",
      venueName: "",
      venueLocationLabel: "",
      lat: "",
      lng: "",
      descriptionHtml: "",
      validFrom: "",
      validTo: "",
      daysActive: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      timeWindowStart: "",
      timeWindowEnd: "",
      redemptionMethodKey: "student_id",
      requiresStudentId: true,
      oneClaimPerStudent: true,
      claimLimit: "",
      promoCode: "",
      instructions: "",
      bookingEnabled: false,
      bookingLink: "",
      sessionLabel: "",
      saleType: "storewide",
      discountRangeLabel: "",
      catalogFile: null,
      catalogUrl: "",
      retailHighlights: [],
      ...(initialValues || {}),
    }),
    [initialValues]
  );

  const [form, setForm] = useState(initialForm);
  const [openEditor, setOpenEditor] = useState(false);

  useEffect(() => setForm(initialForm), [initialForm]);

  // Set first category automatically (once categories arrive) if empty
  useEffect(() => {
    if (settingsLoading) return;
    if (!form.categoryId && categories?.length) {
      setForm((p) => ({ ...p, categoryId: categories[0].id, slotId: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoading, categories]);

  const slotOptions = useMemo(() => {
    if (!form.categoryId) return [];
    return slotsByCategoryId[form.categoryId] || [];
  }, [form.categoryId, slotsByCategoryId]);

  const daysLeft = useMemo(() => {
    if (!form.validTo) return null;
    const end = new Date(form.validTo);
    const now = new Date();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Number.isFinite(diff) ? Math.max(diff, 0) : null;
  }, [form.validTo]);

  const previewUrl = useMemo(() => {
    if (!form.imageFile) return "";
    return URL.createObjectURL(form.imageFile);
  }, [form.imageFile]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const set = (key) => (e) => {
    const val = e?.target?.type === "checkbox" ? e.target.checked : e?.target?.value ?? e;
    setForm((p) => ({ ...p, [key]: val }));
  };

  const toggleDay = (dayId) => {
    setForm((p) => {
      const has = p.daysActive.includes(dayId);
      return { ...p, daysActive: has ? p.daysActive.filter((d) => d !== dayId) : [...p.daysActive, dayId] };
    });
  };

  const toggleTag = (tagName) => {
    setForm((p) => {
      const has = (p.discoveryTags || []).includes(tagName);
      return { ...p, discoveryTags: has ? p.discoveryTags.filter((t) => t !== tagName) : [...(p.discoveryTags || []), tagName] };
    });
  };

  const toggleSection = (secName) => {
    setForm((p) => {
      const has = (p.feedSections || []).includes(secName);
      return { ...p, feedSections: has ? p.feedSections.filter((t) => t !== secName) : [...(p.feedSections || []), secName] };
    });
  };

  const onPickImage = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const okTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
    if (!okTypes.includes(file.type)) return alert("Invalid image. Only jpg/jpeg/png/gif/webp");
    setForm((p) => ({ ...p, imageFile: file }));
  };

  const onPickCatalog = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!ok.includes(file.type)) return alert("Catalog must be PDF or image (jpg/png/webp).");
    setForm((p) => ({ ...p, catalogFile: file }));
  };

  const addHighlight = () => {
    setForm((p) => ({
      ...p,
      retailHighlights: [...(p.retailHighlights || []), { title: "", priceLabel: "", imageUrl: "" }],
    }));
  };

  const removeHighlight = (idx) => {
    setForm((p) => ({
      ...p,
      retailHighlights: (p.retailHighlights || []).filter((_, i) => i !== idx),
    }));
  };

  const setHighlight = (idx, key, val) => {
    setForm((p) => {
      const arr = [...(p.retailHighlights || [])];
      arr[idx] = { ...(arr[idx] || {}), [key]: val };
      return { ...p, retailHighlights: arr };
    });
  };

  const isCatalog = form.modeKey === "catalog";

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.header.trim()) return alert("Header is required");
    if (!form.imageFile && !form.imageUrl) return alert("Poster image is required");
    if (!form.categoryId) return alert("Category is required");
    if (!form.slotId) return alert("Slot is required");

    if (form.redemptionMethodKey === "promo" && !String(form.promoCode).trim()) return alert("Promo code is required");
    if (form.bookingEnabled && !String(form.bookingLink).trim()) return alert("Booking link required");

    if (isCatalog) {
      if (!form.catalogFile && !form.catalogUrl) return alert("Catalog file or URL required");
      if ((form.retailHighlights || []).length > 8) return alert("Retail highlights max 8 items");
    }

    await onSubmit({ ...form, daysLeft });
  };

  // show minimal loading state for options
  if (settingsLoading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="text-sm text-gray-600">Loading deal settings…</div>
      </div>
    );
  }

  return (
    <form id={formId} onSubmit={handleSubmit} className="space-y-6">
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Campaign Basics</div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Header *</label>
            <input value={form.header} onChange={set("header")} className={inputCls} placeholder="Thursday Steak Night" />
          </div>

          <div>
            <label className={labelCls}>Category *</label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value, slotId: "" }))}
              className={selectCls}
            >
              <option value="">Select Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Slot *</label>
            <select value={form.slotId} onChange={set("slotId")} className={selectCls}>
              <option value="">Select Slot</option>
              {slotOptions.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Detail Mode *</label>
            <select
              value={form.modeKey}
              onChange={(e) => {
                const next = e.target.value;
                setForm((p) => ({
                  ...p,
                  modeKey: next,
                  // if catalog -> auto pick first category named Retail if you want, else keep current
                }));
              }}
              className={selectCls}
            >
              {modes.map((m) => (
                <option key={m.id} value={m.key || m.name?.toLowerCase()}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-gray-500">
              Simple = one offer. Menu = multiple offer blocks. Catalog = retail campaign.
            </div>
          </div>

          <div>
            <label className={labelCls}>Lifecycle Status</label>
            <select value={form.status} onChange={set("status")} className={selectCls}>
              {status.map((s) => (
                <option key={s.id} value={s.key || s.name?.toLowerCase()}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Discovery */}
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Discovery Settings</div>

        <div className="mt-4">
          <div className="text-xs font-semibold text-gray-700">Discovery Tags</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {discoveryTags.map((t) => {
              const name = t.name;
              const on = (form.discoveryTags || []).includes(name);
              return (
                <button key={t.id} type="button" className={on ? chipOn : chipOff} onClick={() => toggleTag(name)}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs font-semibold text-gray-700">Feed Sections</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {feedSections.map((t) => {
              const name = t.name;
              const on = (form.feedSections || []).includes(name);
              return (
                <button key={t.id} type="button" className={on ? chipOn : chipOff} onClick={() => toggleSection(name)}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Poster */}
      <div className={cardCls}>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Poster Image *</div>
            <div className="text-xs text-gray-500">Allowed: jpg/jpeg/png/gif/webp</div>
          </div>
          <input type="file" accept="image/*" onChange={onPickImage} className="text-sm" />
        </div>

        {(form.imageFile || form.imageUrl) && (
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <img alt="preview" className="h-44 w-full object-cover" src={form.imageFile ? previewUrl : form.imageUrl} />
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs text-gray-500">Or paste image URL</label>
          <input value={form.imageUrl} onChange={set("imageUrl")} className={inputCls} placeholder="https://..." />
        </div>
      </div>

      {/* Description */}
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Description</div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpenEditor(true)}
            className="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:opacity-90"
          >
            ✍️ Open Editor
          </button>
          <div className="text-xs text-gray-500">{form.descriptionHtml ? "Description added ✅" : "No description yet"}</div>
        </div>
      </div>

      {/* Schedule */}
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Schedule</div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>Valid From</label>
            <input type="date" value={form.validFrom} onChange={set("validFrom")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Valid To</label>
            <input type="date" value={form.validTo} onChange={set("validTo")} className={inputCls} />
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
            <div className="text-xs text-gray-500">Days Left (auto)</div>
            <div className="mt-1 text-lg font-bold text-red-600">{daysLeft ?? "—"}</div>
          </div>
        </div>

        <div className="mt-5">
          <div className="text-xs font-semibold text-gray-700">Active Days</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const on = form.daysActive.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleDay(d.id)}
                  className={[
                    "h-9 w-10 rounded-lg border text-sm font-semibold",
                    on ? "bg-black text-white border-black" : "bg-white text-gray-900 border-gray-200 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Time Window Start (optional)</label>
            <input type="time" value={form.timeWindowStart} onChange={set("timeWindowStart")} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Time Window End (optional)</label>
            <input type="time" value={form.timeWindowEnd} onChange={set("timeWindowEnd")} className={inputCls} />
          </div>
        </div>
      </div>

      {/* Redemption */}
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Redemption / Voucher Rules</div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className={labelCls}>Redemption Method *</label>
            <select value={form.redemptionMethodKey} onChange={set("redemptionMethodKey")} className={selectCls}>
              {redemptionMethods.map((m) => (
                <option key={m.id} value={m.key || m.name?.toLowerCase()}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}>Claim Limit (optional)</label>
            <input value={form.claimLimit} onChange={set("claimLimit")} className={inputCls} placeholder="200" />
          </div>

          {form.redemptionMethodKey === "promo" && (
            <div className="md:col-span-2">
              <label className={labelCls}>Promo Code *</label>
              <input value={form.promoCode} onChange={set("promoCode")} className={inputCls} placeholder="MYMOR50" />
            </div>
          )}

          <div className="md:col-span-2">
            <label className={labelCls}>Voucher Instructions (optional)</label>
            <textarea
              value={form.instructions}
              onChange={set("instructions")}
              className={inputCls}
              rows={3}
              placeholder="Show QR to staff. Valid before 10pm."
            />
          </div>
        </div>
      </div>

      {/* Booking */}
      <div className={cardCls}>
        <div className="text-sm font-semibold text-gray-900">Booking</div>

        <div className="mt-3 flex items-center gap-3">
          <input type="checkbox" checked={!!form.bookingEnabled} onChange={set("bookingEnabled")} className="h-4 w-4 rounded" />
          <div className="text-sm text-gray-900">Enable booking link</div>
        </div>

        {form.bookingEnabled && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Booking Link *</label>
              <input value={form.bookingLink} onChange={set("bookingLink")} className={inputCls} placeholder="https://..." />
            </div>
            <div>
              <label className={labelCls}>Session Label (optional)</label>
              <input value={form.sessionLabel} onChange={set("sessionLabel")} className={inputCls} placeholder="Sessions from 7pm" />
            </div>
          </div>
        )}
      </div>

      {/* Retail Catalog */}
      {isCatalog && (
        <div className={cardCls}>
          <div className="text-sm font-semibold text-gray-900">Retail Catalog</div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls}>Sale Type</label>
              <select value={form.saleType} onChange={set("saleType")} className={selectCls}>
                <option value="storewide">Storewide</option>
                <option value="selected">Selected Items</option>
                <option value="clearance">Clearance</option>
              </select>
            </div>

            <div>
              <label className={labelCls}>Discount Range Label</label>
              <input value={form.discountRangeLabel} onChange={set("discountRangeLabel")} className={inputCls} placeholder="Up to 50% off" />
            </div>

            <div className="md:col-span-2">
              <div className="text-xs text-gray-500 mb-2">Upload Catalog (PDF/Image)</div>
              <input type="file" accept="application/pdf,image/*" onChange={onPickCatalog} className="text-sm" />
              {form.catalogFile && (
                <div className="mt-2 text-xs text-gray-700">
                  Selected: <b>{form.catalogFile.name}</b>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className={labelCls}>Or paste Catalog URL</label>
              <input value={form.catalogUrl} onChange={set("catalogUrl")} className={inputCls} placeholder="https://..." />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-gray-900">Retail Highlights</div>
                <div className="text-xs text-gray-500">Max 8 tiles.</div>
              </div>
              <button
                type="button"
                onClick={addHighlight}
                className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
              >
                + Add
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {(form.retailHighlights || []).slice(0, 8).map((h, idx) => (
                <div key={idx} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-gray-900">Highlight #{idx + 1}</div>
                    <button
                      type="button"
                      onClick={() => removeHighlight(idx)}
                      className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <div className="text-xs text-gray-600">Title</div>
                      <input className={inputCls} value={h.title} onChange={(e) => setHighlight(idx, "title", e.target.value)} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Price</div>
                      <input className={inputCls} value={h.priceLabel} onChange={(e) => setHighlight(idx, "priceLabel", e.target.value)} />
                    </div>
                    <div>
                      <div className="text-xs text-gray-600">Image URL</div>
                      <input className={inputCls} value={h.imageUrl} onChange={(e) => setHighlight(idx, "imageUrl", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Featured / Active */}
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input type="checkbox" checked={!!form.featured} onChange={set("featured")} className="h-4 w-4 rounded" />
          Featured
        </label>

        <label className="flex items-center gap-2 text-sm text-gray-900">
          <input type="checkbox" checked={!!form.active} onChange={set("active")} className="h-4 w-4 rounded" />
          Active
        </label>
      </div>

      {/* Editor Modal */}
      {openEditor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <div className="text-sm font-semibold text-gray-900">Description</div>
              <button type="button" onClick={() => setOpenEditor(false)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
                Close
              </button>
            </div>

            <div className="p-4">
              <EditorPro value={form.descriptionHtml} onChange={(html) => setForm((p) => ({ ...p, descriptionHtml: html }))} />
              <div className="mt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setOpenEditor(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">
                  Cancel
                </button>
                <button type="button" onClick={() => setOpenEditor(false)} className="rounded-xl bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 hover:opacity-90">
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Submit */}
      {!hideSubmit && (
        <button
          disabled={loading}
          className="w-full rounded-2xl bg-black px-4 py-3 text-white text-sm font-semibold transition hover:opacity-90 disabled:opacity-60"
          type="submit"
        >
          {loading ? "Saving..." : submitText}
        </button>
      )}
    </form>
  );
}