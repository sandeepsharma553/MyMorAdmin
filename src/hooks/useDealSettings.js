import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../firebase";

const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

export default function useDealSettings(uid) {
  const [loading, setLoading] = useState(true);

  const [categories, setCategories] = useState([]);
  const [modes, setModes] = useState([]);
  const [status, setStatus] = useState([]);
  const [slots, setSlots] = useState([]);
  const [redemptionMethods, setRedemptionMethods] = useState([]);
  const [discoveryTags, setDiscoveryTags] = useState([]);
  const [feedSections, setFeedSections] = useState([]);
  const [offerTypes, setOfferTypes] = useState([]);

  const fetchAll = async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const w = [where("uid", "==", uid)];

      const [
        cSnap,
        mSnap,
        sSnap,
        slotSnap,
        rSnap,
        tagSnap,
        feedSnap,
        offertypeSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, "dealcategory"), ...w)),
        getDocs(query(collection(db, "dealmode"), ...w)),
        getDocs(query(collection(db, "dealstatus"), ...w)),
        getDocs(query(collection(db, "dealslot"), ...w)),
        getDocs(query(collection(db, "dealredemptionmethod"), ...w)),
        getDocs(query(collection(db, "dealdiscoverytag"), ...w)),
        getDocs(query(collection(db, "dealmfeedsection"), ...w)),
        getDocs(query(collection(db, "dealoffertype"), ...w)),
      ]);

      setCategories(mapDocs(cSnap));
      setModes(mapDocs(mSnap));
      setStatus(mapDocs(sSnap));
      setSlots(mapDocs(slotSnap));
      setRedemptionMethods(mapDocs(rSnap));
      setDiscoveryTags(mapDocs(tagSnap));
      setFeedSections(mapDocs(feedSnap));
      setOfferTypes(mapDocs(offertypeSnap));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  const slotsByCategoryId = useMemo(() => {
    const map = {};
    (slots || []).forEach((sl) => {
      const k = sl.categoryId || "unknown";
      if (!map[k]) map[k] = [];
      map[k].push(sl);
    });
    return map;
  }, [slots]);

  return {
    loading,
    refresh: fetchAll,
    categories,
    modes,
    status,
    slots,
    slotsByCategoryId,
    redemptionMethods,
    discoveryTags,
    feedSections,
    offerTypes
  };
}