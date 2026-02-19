import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "../../firebase"; // adjust path

import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import DealForm from "./DealForm"; // adjust path

export default function DealEditPage({ navbarHeight }) {
  const { id } = useParams();
  const navigate = useNavigate();

  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "deals", id));
        if (!snap.exists()) {
          toast.error("Deal not found");
          if (alive) setLoading(false);
          return;
        }
        const data = snap.data();
        if (alive) {
          setInitial({ ...data });
          setLoading(false);
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load deal");
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const onUpdate = async (values) => {
    setSaving(true);
    try {
      let imageUrl = values.imageUrl || initial?.imageUrl || "";
      let imagePath = initial?.imagePath || "";

      if (values.imageFile) {
        imagePath = `deals/${initial.businessId || "unknown"}/${Date.now()}_${values.imageFile.name}`;
        const r = storageRef(storage, imagePath);
        await uploadBytes(r, values.imageFile);
        imageUrl = await getDownloadURL(r);
      }

      const payload = {
        dealType: values.dealType,
        header: values.header?.trim() || "",
        slot: values.slot || "",
        mapIcon: values.mapIcon || "",
        descriptionHtml: values.descriptionHtml || "",
        bookingLink: values.bookingLink || "",

        offerType: values.offerType || "free",
        priceValue: values.priceValue ?? null,
        discountPercent: values.discountPercent ?? null,
        daysActive: values.daysActive || [],

        imageUrl,
        imagePath,

        featured: !!values.featured,
        active: !!values.active,

        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "deals", id), payload);
      toast.success("Updated ✅");

      // Go back to business page
      if (initial?.businessId) navigate(`/admin/businesses/${initial.businessId}`);
      else navigate("/admin/deals");
    } catch (e) {
      console.error(e);
      toast.error("Update failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Edit Deal</h1>
          <p className="text-sm text-gray-500">Update offer details.</p>
        </div>

        <button
          onClick={() => (initial?.businessId ? navigate(`/admin/businesses/${initial.businessId}`) : navigate("/admin/deals"))}
          className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          Back
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <FadeLoader color="#111827" loading />
        </div>
      ) : (
        <div className="max-w-4xl rounded-2xl border border-gray-200 bg-white p-5">
          <DealForm initialValues={initial} onSubmit={onUpdate} loading={saving} submitText="Save Changes" />
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
