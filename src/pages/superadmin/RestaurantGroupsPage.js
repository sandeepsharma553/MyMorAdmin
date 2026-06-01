import React, { useEffect, useState } from "react";
import {
  collection, onSnapshot, query, orderBy, addDoc, updateDoc, deleteDoc, doc, setDoc,
  writeBatch, serverTimestamp, getDocs, where, limit,
} from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { db, firebaseConfig } from "../../firebase";
import { defaultPermsForRole } from "../restaurantgroup/rgConfig";

const isEmailValid = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
const slugify = (s) => (s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
];
const VENUE_COLORS = ["#C0392B", "#e67e22", "#8b5cf6", "#2563eb", "#16a34a", "#0d9488", "#db2777", "#475569"];

const blankHours = () =>
  DAYS.reduce((acc, [k]) => ({ ...acc, [k]: { open: "09:00", close: "17:00", closed: false } }), {});

const blankVenue = (i = 0) => ({
  name: "", type: "FOH", color: VENUE_COLORS[i % VENUE_COLORS.length], status: "Trading",
  abn: "", phone: "", email: "", website: "", cuisine: "", priceRange: "$$",
  description: "", line1: "", suburb: "", state: "", postcode: "",
  hours: blankHours(), expanded: i === 0,
});

const blankForm = () => ({
  name: "", abn: "", ownerName: "", email: "", password: "", phone: "",
  venues: [blankVenue(0)],
});

const L = "text-xs font-semibold text-gray-700 uppercase tracking-wide";
const I = "mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200";

// Flatten a stored venue doc into the flat editor shape (and back).
const venueToEditor = (v = {}) => ({
  id: v.id || null, name: v.name || "", type: v.type || "FOH", color: v.color || VENUE_COLORS[0],
  status: v.status || "Trading", abn: v.abn || "", phone: v.phone || "", email: v.email || "",
  website: v.website || "", cuisine: v.cuisine || "", priceRange: v.priceRange || "$$",
  description: v.description || "", line1: v.address?.line1 || "", suburb: v.address?.suburb || "",
  state: v.address?.state || "", postcode: v.address?.postcode || "",
  hours: { ...blankHours(), ...(v.hours || {}) },
});
const editorToDoc = (e, order) => ({
  name: e.name.trim(), type: e.type, color: e.color, status: e.status,
  abn: e.abn.trim(), phone: e.phone.trim(), email: e.email.trim(), website: e.website.trim(),
  cuisine: e.cuisine.trim(), priceRange: e.priceRange, description: e.description.trim(),
  address: { line1: e.line1.trim(), suburb: e.suburb.trim(), state: e.state.trim(), postcode: e.postcode.trim() },
  hours: e.hours, ...(order != null ? { order } : {}),
});

// Reusable venue detail fields. `set(key)` and `setHours(day,key)` return onChange handlers.
function VenueFields({ v, set, setHours }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div><label className={L}>Venue name *</label><input className={I} value={v.name} onChange={set("name")} placeholder="Mad Benji" /></div>
        <div><label className={L}>Type</label>
          <select className={I} value={v.type} onChange={set("type")}><option value="FOH">Front of house</option><option value="CK">Central kitchen</option></select>
        </div>
        <div><label className={L}>Colour</label>
          <select className={I} value={v.color} onChange={set("color")}>{VENUE_COLORS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        </div>
        <div><label className={L}>ABN</label><input className={I} value={v.abn} onChange={set("abn")} /></div>
        <div><label className={L}>Phone</label><input className={I} value={v.phone} onChange={set("phone")} /></div>
        <div><label className={L}>Email</label><input className={I} value={v.email} onChange={set("email")} /></div>
        <div><label className={L}>Website</label><input className={I} value={v.website} onChange={set("website")} placeholder="https://..." /></div>
        <div><label className={L}>Cuisine</label><input className={I} value={v.cuisine} onChange={set("cuisine")} placeholder="Burgers, Coffee" /></div>
        <div><label className={L}>Price range</label>
          <select className={I} value={v.priceRange} onChange={set("priceRange")}><option>$</option><option>$$</option><option>$$$</option><option>$$$$</option></select>
        </div>
      </div>
      <div><label className={L}>Customer description (shown to customers)</label>
        <textarea className={I} rows={2} value={v.description} onChange={set("description")} placeholder="Cosy all-day diner serving smash burgers and specialty coffee..." />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="md:col-span-2"><label className={L}>Address line</label><input className={I} value={v.line1} onChange={set("line1")} /></div>
        <div><label className={L}>Suburb</label><input className={I} value={v.suburb} onChange={set("suburb")} /></div>
        <div><label className={L}>State</label><input className={I} value={v.state} onChange={set("state")} /></div>
        <div><label className={L}>Postcode</label><input className={I} value={v.postcode} onChange={set("postcode")} /></div>
      </div>
      <div>
        <label className={L}>Trading hours</label>
        <div className="mt-1 rounded-lg border border-gray-200 divide-y">
          {DAYS.map(([k, lbl]) => (
            <div key={k} className="flex items-center gap-3 px-3 py-1.5 text-sm">
              <span className="w-24 text-gray-700">{lbl}</span>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                <input type="checkbox" checked={v.hours[k].closed} onChange={setHours(k, "closed")} /> Closed
              </label>
              {!v.hours[k].closed && (
                <>
                  <input type="time" className="rounded border border-gray-200 px-2 py-1 text-sm" value={v.hours[k].open} onChange={setHours(k, "open")} />
                  <span className="text-gray-400">–</span>
                  <input type="time" className="rounded border border-gray-200 px-2 py-1 text-sm" value={v.hours[k].close} onChange={setHours(k, "close")} />
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RestaurantGroupsPage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [venueCounts, setVenueCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blankForm());

  // Manage venues (per group)
  const [manageGroup, setManageGroup] = useState(null);
  const [manageVenues, setManageVenues] = useState([]);
  const [venueEditor, setVenueEditor] = useState(null); // venueToEditor(...) | null
  const [venueSaving, setVenueSaving] = useState(false);
  const [confirmDelVenue, setConfirmDelVenue] = useState(null);

  useEffect(() => {
    const qy = query(collection(db, "restaurantGroups"), orderBy("name"));
    const unsub = onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(list);
      setLoading(false);
      list.forEach((g) =>
        getDocs(collection(db, "restaurantGroups", g.id, "venues")).then((vs) =>
          setVenueCounts((p) => ({ ...p, [g.id]: vs.size }))
        )
      );
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Live venues for the group being managed
  useEffect(() => {
    if (!manageGroup) { setManageVenues([]); return; }
    const qy = collection(db, "restaurantGroups", manageGroup.id, "venues");
    return onSnapshot(qy, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
      setManageVenues(list);
    }, () => setManageVenues([]));
  }, [manageGroup]);

  const openManage = (g) => { setManageGroup(g); setVenueEditor(null); setConfirmDelVenue(null); };
  const setVE = (k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setVenueEditor((p) => ({ ...p, [k]: val }));
  };
  const setVEHours = (day, k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setVenueEditor((p) => ({ ...p, hours: { ...p.hours, [day]: { ...p.hours[day], [k]: val } } }));
  };

  const saveVenue = async () => {
    if (!venueEditor.name.trim()) return toast.error("Venue name required");
    setVenueSaving(true);
    try {
      const col = collection(db, "restaurantGroups", manageGroup.id, "venues");
      if (venueEditor.id) {
        await updateDoc(doc(col, venueEditor.id), { ...editorToDoc(venueEditor), updatedAt: serverTimestamp() });
        toast.success("Venue updated ✅");
      } else {
        const vid = slugify(venueEditor.name) || `venue-${Date.now()}`;
        await setDoc(doc(col, vid), { ...editorToDoc(venueEditor, manageVenues.length), createdAt: serverTimestamp() });
        toast.success("Venue added ✅");
      }
      setVenueEditor(null);
      setVenueCounts((p) => ({ ...p, [manageGroup.id]: (p[manageGroup.id] ?? manageVenues.length) + (venueEditor.id ? 0 : 1) }));
    } catch (e) {
      toast.error(e?.message || "Could not save venue");
    } finally { setVenueSaving(false); }
  };

  const toggleVenueStatus = async (v) => {
    const next = v.status === "Disabled" ? "Trading" : "Disabled";
    try { await updateDoc(doc(db, "restaurantGroups", manageGroup.id, "venues", v.id), { status: next, updatedAt: serverTimestamp() }); }
    catch { toast.error("Could not update venue"); }
  };

  const deleteVenue = async (v) => {
    try {
      await deleteDoc(doc(db, "restaurantGroups", manageGroup.id, "venues", v.id));
      toast.success("Venue deleted");
      setConfirmDelVenue(null);
      setVenueCounts((p) => ({ ...p, [manageGroup.id]: Math.max(0, (p[manageGroup.id] ?? 1) - 1) }));
    } catch { toast.error("Could not delete venue"); }
  };

  const setG = (k) => (e) => setForm((p) => ({ ...p, [k]: e.target.value }));
  const setV = (i, k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((p) => ({ ...p, venues: p.venues.map((v, idx) => idx === i ? { ...v, [k]: val } : v) }));
  };
  const setVHours = (i, day, k) => (e) => {
    const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    setForm((p) => ({
      ...p,
      venues: p.venues.map((v, idx) => idx === i ? { ...v, hours: { ...v.hours, [day]: { ...v.hours[day], [k]: val } } } : v),
    }));
  };
  const addVenue = () => setForm((p) => ({ ...p, venues: [...p.venues.map((v) => ({ ...v, expanded: false })), blankVenue(p.venues.length)] }));
  const removeVenue = (i) => setForm((p) => ({ ...p, venues: p.venues.filter((_, idx) => idx !== i) }));
  const toggleVenue = (i) => setForm((p) => ({ ...p, venues: p.venues.map((v, idx) => idx === i ? { ...v, expanded: !v.expanded } : v) }));

  const create = async () => {
    if (!form.name.trim()) return toast.error("Group name required");
    const email = form.email.toLowerCase().trim();
    if (!isEmailValid(email)) return toast.error("Valid Super Admin email required");
    if (!form.venues.length || form.venues.some((v) => !v.name.trim()))
      return toast.error("Every venue needs a name");
    const password = form.password.trim() || `${slugify(form.name) || "group"}654321`;

    setSaving(true);
    let tempApp = null;
    try {
      const dupe = await getDocs(query(collection(db, "employees"), where("email", "==", email), limit(1)));
      if (!dupe.empty && dupe.docs[0].data()?.groupId) {
        toast.warn("This email already manages a group.");
        setSaving(false);
        return;
      }

      // 1) group doc
      const groupRef = await addDoc(collection(db, "restaurantGroups"), {
        name: form.name.trim(), abn: form.abn.trim(), ownerEmail: email, ownerName: form.ownerName.trim(),
        phone: form.phone.trim(), ownerUid: null, createdAt: serverTimestamp(),
      });
      const groupId = groupRef.id;

      // 2) venues (batch)
      const batch = writeBatch(db);
      form.venues.forEach((v, i) => {
        const vid = slugify(v.name) || `venue-${i}`;
        batch.set(doc(db, "restaurantGroups", groupId, "venues", vid), {
          name: v.name.trim(), type: v.type, color: v.color, status: v.status, order: i,
          abn: v.abn.trim(), phone: v.phone.trim(), email: v.email.trim(), website: v.website.trim(),
          cuisine: v.cuisine.trim(), priceRange: v.priceRange, description: v.description.trim(),
          address: { line1: v.line1.trim(), suburb: v.suburb.trim(), state: v.state.trim(), postcode: v.postcode.trim() },
          hours: v.hours, createdAt: serverTimestamp(),
        });
      });
      await batch.commit();

      // 3) Super Admin login (own email/password)
      tempApp = initializeApp(firebaseConfig, `groupCreator_${Date.now()}`);
      const tempAuth = getAuth(tempApp);
      const cred = await createUserWithEmailAndPassword(tempAuth, email, password);
      const uid = cred.user.uid;
      await updateProfile(cred.user, { displayName: form.ownerName.trim() || `${form.name.trim()} Admin` });

      await setDoc(doc(db, "employees", uid), {
        uid, name: form.ownerName.trim() || `${form.name.trim()} Admin`, email, mobileNo: form.phone.trim(),
        type: "admin", role: "groupOwner", groupRole: "owner", empType: "restaurantGroup",
        groupId, groupName: form.name.trim(), venueId: "all", permissions: defaultPermsForRole("owner"),
        isActive: true, password, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      await setDoc(doc(db, "users", uid), {
        uid, firstname: form.ownerName.trim() || form.name.trim(), lastname: "", username: form.ownerName.trim() || form.name.trim(),
        email, phone: form.phone.trim(), groupId, groupName: form.name.trim(),
        roles: { groupOwner: true }, groupRole: "owner", password, createddate: new Date(),
      });
      await updateDoc(doc(db, "restaurantGroups", groupId), { ownerUid: uid });

      toast.success(`Group created with ${form.venues.length} venue(s) + Super Admin login ✅`);
      setOpen(false);
      setForm(blankForm());
    } catch (e) {
      console.error(e);
      toast.error(e?.code === "auth/email-already-in-use" ? "Auth email already exists" : (e?.message || "Create failed"));
    } finally {
      setSaving(false);
      if (tempApp) { try { await deleteApp(tempApp); } catch {} }
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Restaurant Groups</h1>
          <p className="text-sm text-gray-500">Create a group, add its venues with full trading details, and provision the group's Super Admin login.</p>
        </div>
        <button onClick={() => { setForm(blankForm()); setOpen(true); }} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90">+ New Group</button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-56"><FadeLoader color="#C0392B" loading /></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr><th className="p-3 font-semibold">Group</th><th className="p-3 font-semibold">Venues</th><th className="p-3 font-semibold">Super Admin</th><th className="p-3 font-semibold">Group ID</th><th className="p-3 font-semibold text-right">Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((g) => (
                <tr key={g.id} className="border-t border-gray-100">
                  <td className="p-3 font-semibold text-gray-900">{g.name || "—"}<div className="text-xs font-normal text-gray-500">{g.abn}</div></td>
                  <td className="p-3 text-gray-700">{venueCounts[g.id] ?? "…"}</td>
                  <td className="p-3 text-gray-700">{g.ownerEmail || "—"}</td>
                  <td className="p-3 text-xs text-gray-500">{g.id}</td>
                  <td className="p-3 text-right">
                    <button onClick={() => openManage(g)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">Manage venues</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td className="p-6 text-gray-500" colSpan={5}>No restaurant groups yet.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto">
          <div className="w-full max-w-3xl my-6 rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="text-lg font-semibold">Create Restaurant Group</h2>
              <div className="flex gap-2">
                <button onClick={create} disabled={saving} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{saving ? "Creating..." : "Create group"}</button>
                <button onClick={() => !saving && setOpen(false)} className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Close</button>
              </div>
            </div>

            <div className="p-5 space-y-6">
              {/* Group + Super Admin */}
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="font-semibold mb-3">Group & Super Admin login</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={L}>Group name *</label><input className={I} value={form.name} onChange={setG("name")} placeholder="Mad Kitchen Group" /></div>
                  <div><label className={L}>Group ABN</label><input className={I} value={form.abn} onChange={setG("abn")} placeholder="20 079 066 407" /></div>
                  <div><label className={L}>Super Admin name</label><input className={I} value={form.ownerName} onChange={setG("ownerName")} placeholder="Ben J." /></div>
                  <div><label className={L}>Phone</label><input className={I} value={form.phone} onChange={setG("phone")} placeholder="04xx xxx xxx" /></div>
                  <div><label className={L}>Super Admin email *</label><input className={I} value={form.email} onChange={setG("email")} placeholder="admin@madkitchen.com.au" /></div>
                  <div><label className={L}>Password</label><input className={I} value={form.password} onChange={setG("password")} placeholder="auto-generated if blank" /></div>
                </div>
              </div>

              {/* Venues */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-semibold">Venues ({form.venues.length})</div>
                  <button onClick={addVenue} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold hover:bg-gray-50">+ Add venue</button>
                </div>

                <div className="space-y-3">
                  {form.venues.map((v, i) => (
                    <div key={i} className="rounded-xl border border-gray-200">
                      <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => toggleVenue(i)}>
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-3 h-3 rounded-full" style={{ background: v.color }} />
                          <span className="font-semibold text-sm">{v.name || `Venue ${i + 1}`}</span>
                          <span className="text-xs text-gray-400">{v.type}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {form.venues.length > 1 && <button onClick={(e) => { e.stopPropagation(); removeVenue(i); }} className="text-xs text-red-600 hover:underline">Remove</button>}
                          <span className="text-gray-400">{v.expanded ? "▴" : "▾"}</span>
                        </div>
                      </div>

                      {v.expanded && (
                        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
                          <VenueFields v={v} set={(k) => setV(i, k)} setHours={(d, k) => setVHours(i, d, k)} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Manage venues modal */}
      {manageGroup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-auto">
          <div className="w-full max-w-3xl my-6 rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h2 className="text-lg font-semibold">{manageGroup.name} — Venues</h2>
                <p className="text-xs text-gray-500">Add, edit, disable or delete venues for this group.</p>
              </div>
              <button onClick={() => { setManageGroup(null); setVenueEditor(null); }} className="rounded-xl border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">Close</button>
            </div>

            <div className="p-5">
              {!venueEditor ? (
                <>
                  <div className="flex justify-end mb-3">
                    <button onClick={() => setVenueEditor(venueToEditor({ color: VENUE_COLORS[manageVenues.length % VENUE_COLORS.length] }))} className="rounded-lg bg-black px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90">+ Add venue</button>
                  </div>
                  <div className="space-y-2">
                    {manageVenues.map((v) => {
                      const disabled = v.status === "Disabled";
                      return (
                        <div key={v.id} className="flex items-center justify-between rounded-xl border border-gray-200 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <span className="inline-block w-3 h-3 rounded-full" style={{ background: v.color }} />
                            <div>
                              <div className="font-semibold text-sm text-gray-900">{v.name} {v.type === "CK" && <span className="text-xs text-gray-400">· CK</span>}</div>
                              <div className="text-xs text-gray-500">{[v.address?.suburb, v.address?.state].filter(Boolean).join(", ") || v.phone || "—"}</div>
                            </div>
                            <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full ${disabled ? "bg-gray-100 text-gray-500" : "bg-green-50 text-green-700"}`}>{disabled ? "Disabled" : (v.status || "Trading")}</span>
                          </div>
                          {confirmDelVenue === v.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-red-600">Delete venue?</span>
                              <button onClick={() => deleteVenue(v)} className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white">Yes, delete</button>
                              <button onClick={() => setConfirmDelVenue(null)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs">Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button onClick={() => setVenueEditor(venueToEditor(v))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Edit</button>
                              <button onClick={() => toggleVenueStatus(v)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">{disabled ? "Enable" : "Disable"}</button>
                              <button onClick={() => setConfirmDelVenue(v.id)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 hover:border-red-200">Delete</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {manageVenues.length === 0 && <div className="text-sm text-gray-500 py-6 text-center">No venues yet. Click “+ Add venue”.</div>}
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold">{venueEditor.id ? "Edit venue" : "Add venue"}</div>
                    <button onClick={() => setVenueEditor(null)} className="text-sm text-gray-500 hover:underline">← Back to list</button>
                  </div>
                  <VenueFields v={venueEditor} set={setVE} setHours={setVEHours} />
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveVenue} disabled={venueSaving} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">{venueSaving ? "Saving..." : (venueEditor.id ? "Save venue" : "Add venue")}</button>
                    <button onClick={() => setVenueEditor(null)} className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
