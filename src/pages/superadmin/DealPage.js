import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  addDoc,
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase";

import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import DealForm from "./DealForm";
import OfferBlocksEditor from "./OfferBlocksEditor";

export default function DealPage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  useEffect(() => {
    const qy = query(collection(db, "deals"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setIsLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error("Failed to load deals");
        setIsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const t = qText.trim().toLowerCase();
    if (!t) return rows;
    return rows.filter((r) =>
      [
        r.header,
        r.category,
        r.slot,
        r.campaignType,
        r.mode,
        r.status,
        r.venue?.name,
        r.partner?.partnerId,
        r.partner?.merchantId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [rows, qText]);

  const toggle = async (id, key, val) => {
    try {
      await updateDoc(doc(db, "deals", id), {
        [key]: val,
        updatedAt: serverTimestamp(),
      });
      toast.success("Updated ✅");
    } catch (e) {
      console.error(e);
      toast.error("Update failed");
    }
  };

  const uploadIfFile = async (file, folder) => {
    const path = `${folder}/${Date.now()}_${file.name}`;
    const r = storageRef(storage, path);
    await uploadBytes(r, file);
    const url = await getDownloadURL(r);
    return { url, path };
  };

  const handleSubmitDeal = async (values) => {
    setSaving(true);
    try {
      // Poster upload
      let posterUrl = values.imageUrl || "";
      let posterPath = editing?.posterPath || "";

      if (values.imageFile) {
        const up = await uploadIfFile(values.imageFile, "deals/posters");
        posterUrl = up.url;
        posterPath = up.path;
      } else if (!posterUrl && editing?.posterUrl) {
        posterUrl = editing.posterUrl;
      }

      // Catalog upload (if catalog mode)
      let catalogUrl = values?.retail?.catalogUrl || "";
      let catalogPath = editing?.retail?.catalogPath || "";

      if (values?.retail?.catalogFile) {
        const up2 = await uploadIfFile(values.retail.catalogFile, "deals/catalogs");
        catalogUrl = up2.url;
        catalogPath = up2.path;
      } else if (!catalogUrl && editing?.retail?.catalogUrl) {
        catalogUrl = editing.retail.catalogUrl;
      }

      const payload = {
        header: values.header || "",
        campaignType: values.campaignType || "single_offer",
        category: values.category || "dining",
        slot: values.slot || "",
        mode: values.mode || "simple",

        status: values.status || "draft",
        active: !!values.active,
        featured: !!values.featured,

        discovery: {
          tags: values?.discovery?.tags || [],
          sections: values?.discovery?.sections || [],
        },

        partner: {
          partnerId: values?.partner?.partnerId || "",
          merchantId: values?.partner?.merchantId || "",
        },

        venue: {
          id: "",
          name: values?.venue?.name || "",
          locationLabel: values?.venue?.locationLabel || "",
          lat: typeof values?.venue?.lat === "number" ? values.venue.lat : null,
          lng: typeof values?.venue?.lng === "number" ? values.venue.lng : null,
        },

        descriptionHtml: values.descriptionHtml || "",

        schedule: values.schedule || {
          activeDays: [],
          validFrom: "",
          validTo: "",
          timeWindow: null,
        },

        redemption: values.redemption || {
          method: "student_id",
          requiresStudentId: true,
          oneClaimPerStudent: true,
          claimLimit: null,
          promoCode: "",
          instructions: "",
        },

        booking: values.booking || {
          enabled: false,
          bookingLink: "",
          sessionLabel: "",
        },

        retail:
          values.mode === "catalog"
            ? {
                saleType: values?.retail?.saleType || "storewide",
                discountRangeLabel: values?.retail?.discountRangeLabel || "",
                catalogUrl: catalogUrl || "",
                catalogPath: catalogPath || "",
                highlights: values?.retail?.highlights || [],
              }
            : null,

        posterUrl: posterUrl || "",
        posterPath: posterPath || "",

        metrics: editing?.metrics || {
          views: 0,
          opens: 0,
          saves: 0,
          claims: 0,
          redemptions: 0,
          bookingClicks: 0,
        },

        daysLeft: typeof values.daysLeft === "number" ? values.daysLeft : null,

        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        await updateDoc(doc(db, "deals", editing.id), payload);
        toast.success("Deal updated ✅");
      } else {
        const ref = await addDoc(collection(db, "deals"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Deal created ✅");

        // keep modal open + enable offer blocks for menu mode
        setEditing({ id: ref.id, ...payload });
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc(doc(db, "deals", deleteId));
      toast.success("Deleted ✅");
      setDeleteId(null);
    } catch (e) {
      console.error(e);
      toast.error("Delete failed");
    }
  };

  const openCreate = () => {
    setEditing(null);
    setOpenModal(true);
  };

  const openEdit = (row) => {
    setEditing(row);
    setOpenModal(true);
  };

  const closeModal = () => {
    if (saving) return;
    setOpenModal(false);
    setEditing(null);
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          <p className="text-sm text-gray-500">Create and manage deal campaigns.</p>
        </div>

        <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded-xl hover:opacity-90">
          + Add Deal
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full sm:w-96">
          <input
            value={qText}
            onChange={(e) => setQText(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-900 outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-200"
            placeholder="Search deals..."
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded-2xl shadow border border-gray-200">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-[1200px] w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="text-gray-600">
                <th className="p-3 font-semibold">Deal</th>
                <th className="p-3 font-semibold">Category</th>
                <th className="p-3 font-semibold">Mode</th>
                <th className="p-3 font-semibold">Status</th>
                <th className="p-3 font-semibold">Slot</th>
                <th className="p-3 font-semibold">Featured</th>
                <th className="p-3 font-semibold">Active</th>
                <th className="p-3 font-semibold w-44">Actions</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <img
                        src={r.posterUrl || "https://via.placeholder.com/160x96"}
                        alt=""
                        className="h-12 w-20 rounded-xl object-cover border border-gray-100"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">{r.header || "Untitled"}</div>
                        <div className="text-gray-500 truncate">{r.venue?.name || "—"}</div>
                        <div className="text-[11px] text-gray-400 truncate">
                          {r.partner?.partnerId ? `Partner: ${r.partner.partnerId}` : "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">{r.category || "—"}</td>
                  <td className="p-3 text-gray-700">{r.mode || "—"}</td>
                  <td className="p-3 text-gray-700">{r.status || "draft"}</td>
                  <td className="p-3 text-gray-700">{r.slot || "—"}</td>

                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!r.featured}
                      onChange={(e) => toggle(r.id, "featured", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>

                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={!!r.active}
                      onChange={(e) => toggle(r.id, "active", e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </td>

                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-900 hover:bg-gray-50"
                        onClick={() => openEdit(r)}
                      >
                        Edit
                      </button>

                      <button
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-gray-900 hover:bg-red-50 hover:border-red-200 hover:text-red-700"
                        onClick={() => setDeleteId(r.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filtered.length === 0 && (
                <tr>
                  <td className="p-8 text-gray-500" colSpan={8}>
                    No deals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE/EDIT MODAL */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-5xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{editing ? "Edit Deal" : "Add Deal"}</h2>
                <p className="text-xs text-gray-500">
                  {editing ? "Update details and save." : "Create deal first, then add Offer Blocks (menu mode)."}
                </p>
              </div>

              <button onClick={closeModal} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">
                Close
              </button>
            </div>

            <div className="p-5 max-h-[78vh] overflow-auto">
              <DealForm
                initialValues={editing || {}}
                onSubmit={handleSubmitDeal}
                loading={saving}
                submitText={editing ? "Save Changes" : "Create Deal"}
              />

              {/* Offer Blocks only when deal exists + mode menu OR multi offer */}
              {editing?.id && (editing?.mode === "menu" || editing?.campaignType === "multi_offer_campaign") && (
                <OfferBlocksEditor dealId={editing.id} disabled={saving} />
              )}

              {editing?.id && editing?.mode !== "menu" && editing?.campaignType !== "multi_offer_campaign" && (
                <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
                  Offer Blocks available only in <b>Menu mode</b> (or multi-offer campaign).
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900">Delete Deal?</h3>
              <p className="mt-2 text-sm text-gray-500">This action cannot be undone.</p>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  onClick={() => setDeleteId(null)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
                >
                  Cancel
                </button>

                <button
                  onClick={confirmDelete}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
