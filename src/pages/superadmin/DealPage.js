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

export default function DealPage({ navbarHeight }) {
  const [rows, setRows] = useState([]);
  const [qText, setQText] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // modal states (create/edit)
  const [openModal, setOpenModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // <-- deal object for edit
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
        r.title,
        r.subtitle,
        r.header,
        r.businessName,
        r.categoryLabel,
        r.dealType,
        r.slot,
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

  /** ✅ Create OR Update handler */
  const handleSubmitDeal = async (values) => {
    setSaving(true);
    try {
      let imageUrl = values.imageUrl || "";
      let imagePath = editing?.imagePath || "";

      // if new file uploaded
      if (values.imageFile) {
        imagePath = `deals/${Date.now()}_${values.imageFile.name}`;
        const r = storageRef(storage, imagePath);
        await uploadBytes(r, values.imageFile);
        imageUrl = await getDownloadURL(r);
      } else {
        // edit mode: keep old image if not changed
        if (editing?.imageUrl && !imageUrl) imageUrl = editing.imageUrl;
      }

      const payload = {
        // new fields (app wali)
        dealType: values.dealType || "",
        header: values.header?.trim() || "",
        slot: values.slot || "",
        mapIcon: values.mapIcon || "",
        descriptionHtml: values.descriptionHtml || "",
        bookingLink: values.bookingLink?.trim() || "",
        offerType: values.offerType || "free",
        priceValue: values.priceValue ?? null,
        discountPercent: values.discountPercent ?? null,
        daysActive: values.daysActive || [],

        // old compatibility fields
        title: values.title?.trim() || values.header?.trim() || "",
        subtitle: values.subtitle?.trim() || "",
        businessName: values.businessName?.trim() || "",
        categoryId: values.categoryId || "food",
        categoryLabel: values.categoryLabel || "",

        featured: !!values.featured,
        active: !!values.active,

        validFrom: values.validFrom || "",
        validTo: values.validTo || "",
        daysLeft: typeof values.daysLeft === "number" ? values.daysLeft : null,

        terms: values.terms?.trim() || "",
        address: values.address?.trim() || "",
        lat: typeof values.lat === "number" ? values.lat : null,
        lng: typeof values.lng === "number" ? values.lng : null,

        imageUrl: imageUrl || "",
        imagePath: imagePath || "",

        updatedAt: serverTimestamp(),
      };

      if (editing?.id) {
        // ✅ UPDATE
        await updateDoc(doc(db, "deals", editing.id), payload);
        toast.success("Deal updated ✅");
      } else {
        // ✅ CREATE
        await addDoc(collection(db, "deals"), {
          ...payload,
          createdAt: serverTimestamp(),
        });
        toast.success("Deal created ✅");
      }

      setOpenModal(false);
      setEditing(null);
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  /** ✅ Delete via modal */
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

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Deals</h1>
          <p className="text-sm text-gray-500">Create and manage deals.</p>
        </div>

        <button onClick={openCreate} className="px-4 py-2 bg-black text-white rounded-xl hover:opacity-90">
          + Add Deal
        </button>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative w-full sm:w-80">
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
            <FadeLoader color="#111827" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr className="text-gray-600">
                <th className="p-3 font-semibold">Deal</th>
                <th className="p-3 font-semibold">Type</th>
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
                        src={r.imageUrl || "https://via.placeholder.com/160x96"}
                        alt=""
                        className="h-12 w-20 rounded-xl object-cover border border-gray-100"
                      />
                      <div className="min-w-0">
                        <div className="font-semibold text-gray-900 truncate">
                          {r.header || r.title || "Untitled"}
                        </div>
                        <div className="text-gray-500 truncate">
                          {r.subtitle || r.businessName || "—"}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="p-3 text-gray-700">{r.dealType || r.categoryLabel || r.categoryId || "—"}</td>
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
                  <td className="p-8 text-gray-500" colSpan={6}>
                    No deals found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* ✅ CREATE/EDIT MODAL */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-100 p-5">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  {editing ? "Edit Deal" : "Add Deal"}
                </h2>
                <p className="text-xs text-gray-500">
                  {editing ? "Update details and save." : "Fill details and press create."}
                </p>
              </div>

              <button
                onClick={() => !saving && (setOpenModal(false), setEditing(null))}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                Close
              </button>
            </div>

            <div className="p-5 max-h-[75vh] overflow-auto">
              <DealForm
                initialValues={editing || {}}
                onSubmit={handleSubmitDeal}
                loading={saving}
                submitText={editing ? "Save Changes" : "Create Deal"}
              />
            </div>
          </div>
        </div>
      )}

      {/* ✅ DELETE MODAL */}
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
