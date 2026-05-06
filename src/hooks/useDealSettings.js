import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query } from "firebase/firestore";
import { db } from "../firebase";

const mapDocs = (snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

// uid param kept for API compatibility but settings are now platform-global
export default function useDealSettings(_uid) {
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
    setLoading(true);
    try {
      // No uid filter — deal settings are global platform config managed by superadmin
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
        getDocs(query(collection(db, "dealcategory"))),
        getDocs(query(collection(db, "dealmode"))),
        getDocs(query(collection(db, "dealstatus"))),
        getDocs(query(collection(db, "dealslot"))),
        getDocs(query(collection(db, "dealredemptionmethod"))),
        getDocs(query(collection(db, "dealdiscoverytag"))),
        getDocs(query(collection(db, "dealmfeedsection"))),
        getDocs(query(collection(db, "dealoffertype"))),
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
  }, []);

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