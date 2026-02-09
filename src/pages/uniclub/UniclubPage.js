import React, { useState, useEffect, useRef } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { database, storage, db } from "../../firebase";
import {
  ref as dbRef,
  onValue,
  set as rtdbSet,
  push,
  update as rtdbUpdate,
  remove,
  off,
  serverTimestamp,
  get as rtdbGet,
  orderByChild,
  equalTo,
  query as rtdbQuery,
} from "firebase/database";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { useNavigate } from "react-router-dom";
import MapLocationInput from "../../components/MapLocationInput";
import { MapPin } from "lucide-react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
dayjs.extend(customParseFormat);

/* ------------------------------------------------
   Helpers
-------------------------------------------------*/
const pad2 = (n) => String(n).padStart(2, "0");

const toLocalInputValue = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(
    d.getMinutes()
  )}`;
};

const toDateInputValue = (ms) => {
  if (!ms) return "";
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const fromLocalInputValue = (str) => (str ? new Date(str).getTime() : 0);

const parseTags = (s = "") => s.split(",").map((t) => t.trim()).filter(Boolean);

const normalizeNumOrNull = (v) => {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/* Safe answers renderer */
const renderAnswers = (ans) => {
  if (!ans) return null;
  const isPrimitive = (x) => ["string", "number", "boolean"].includes(typeof x);

  if (Array.isArray(ans)) {
    return (
      <ul className="list-disc list-inside space-y-1">
        {ans.map((item, idx) => {
          if (isPrimitive(item)) return <li key={idx}>{String(item)}</li>;
          if (item && typeof item === "object") {
            if ("value" in item || "questionId" in item) {
              const label = item.questionId ?? `Q${idx + 1}`;
              const val = item.value ?? "";
              return (
                <li key={idx}>
                  <strong>{label}:</strong> {String(val)}
                </li>
              );
            }
            return <li key={idx}>{JSON.stringify(item)}</li>;
          }
          return <li key={idx}>{String(item)}</li>;
        })}
      </ul>
    );
  }

  if (typeof ans === "object") {
    return (
      <ul className="list-disc list-inside space-y-1">
        {Object.entries(ans).map(([k, v]) => (
          <li key={k}>
            <strong>{k}:</strong> {isPrimitive(v) ? String(v) : JSON.stringify(v)}
          </li>
        ))}
      </ul>
    );
  }
  return <span>{String(ans)}</span>;
};

/* ------------------------------------------------
   Component
-------------------------------------------------*/
export default function UniclubPage({ navbarHeight }) {
  /* ---------- State ---------- */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);

  // Requests/Members separate modals
  const [reqModalOpen, setReqModalOpen] = useState(false);
  const [memModalOpen, setMemModalOpen] = useState(false);
  const [activeClubId, setActiveClubId] = useState("");
  const [activeClubTitle, setActiveClubTitle] = useState("");
  const [requests, setRequests] = useState([]);
  const [membersList, setMembersList] = useState([]);

  const [isLoading, setIsLoading] = useState(false);
  const [category, setCategory] = useState([]);
  const [roles, setRoles] = useState([]);
  const [members, setMembers] = useState([]);
  const [showMapModal, setShowMapModal] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  const navigate = useNavigate();

  // Sorting + Filters
  const [sortConfig, setSortConfig] = useState({ key: "title", direction: "asc" });
  const [filters, setFilters] = useState({ title: "" });
  const debounceRef = useRef(null);

  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [field]: value }));
    }, 250);
  };

  const onSort = (key) =>
    setSortConfig((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );

  // Auth
  const uid = useSelector((s) => s.auth?.user?.uid);
  const emp = useSelector((s) => s.auth?.employee);
  const user = useSelector((s) => s.auth?.user);

  // File input
  const [fileName, setFileName] = useState("No file chosen");
  const [previewUrl, setPreviewUrl] = useState("");

  /* ---------------- Ticket defaults + handlers ---------------- */

  const defaultPaidTicket = () => ({
    id: `t_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    name: "",
    description: "",
    price: "",
    allowedGroupId: "",

    maxCapacity: "",
    maxPurchasePerUser: "",

    startAtMs: 0,
    endAtMs: 0,

    passwordEnabled: false,
    password: "",

    collectExtraInfo: false,
    extraInfo: {
      name: true,
      email: false,
      number: false,
      studentId: false,
      degree: false,
    },

    hasTablesPods: false,
    tableType: "",
    tableCount: "",
    ticketsPerTable: "",
  });

  const initialForm = {
    id: 0,
    title: "",
    desc: "",
    address: "",
    location: "",
    website: "",
    link: "",
    links: [{ label: "", url: "" }],
    contactName: "",
    contactPhone: "",
    contactEmail: "",

    startAtMs: 0, // club valid from
    endAtMs: 0, // club valid to

    imageFile: null,
    imageUrl: "",
    privacyType: "",
    category: "",
    tags: [],
    tagInput: "",
    rules: "",
    joinQInput: "",
    joinQuestions: [],
    joinQType: "short",
    joinQOptionInput: "",
    joinQOptionList: [],
    allowEventsByMembers: false,
    pollsEnabled: false,
    sharedFilesEnabled: false,
    allowSubGroups: false,
    enableChat: false,
    allowNotifications: true,
    maxMembers: "",

    // ✅ Membership ticketing (your screenshots)
    ticketType: "free", // "free" | "paid"
    qrCheckInEnabled: false,

    freeTicket: {
      maxCapacity: "",
      maxPurchasePerUser: "",
      startAtMs: 0,
      endAtMs: 0,
      hasTablesPods: false,
      tableType: "",
      tableCount: "",
      ticketsPerTable: "",
    },

    paidTickets: [defaultPaidTicket()],

    // settings membership validity (used in handleAdd + UI)
    memberValidFromMs: 0,
    memberValidToMs: 0,

    // Ownership / roles
    successorUid: "",
    successor: "",
    memberId: "",
    roleId: "",
    role: "",

    // Contact toggles
    showPhone: false,
    showEmail: false,

    // extra contacts
    contacts: [{ name: "", phone: "", email: "" }],

    editingJoinQId: "",
  };

  const [form, setForm] = useState(initialForm);

  const addPaidTicket = () => {
    setForm((p) => ({
      ...p,
      paidTickets: [...(p.paidTickets || []), defaultPaidTicket()],
    }));
  };

  const removePaidTicket = (idx) => {
    setForm((p) => {
      const next = [...(p.paidTickets || [])];
      if (next.length <= 1) return p;
      next.splice(idx, 1);
      return { ...p, paidTickets: next };
    });
  };

  const updatePaidTicket = (idx, patch) => {
    setForm((p) => {
      const next = [...(p.paidTickets || [])];
      next[idx] = { ...next[idx], ...patch };
      return { ...p, paidTickets: next };
    });
  };

  const updatePaidTicketExtraInfo = (idx, key, checked) => {
    setForm((p) => {
      const next = [...(p.paidTickets || [])];
      const cur = next[idx] || {};
      next[idx] = {
        ...cur,
        extraInfo: {
          ...(cur.extraInfo || {}),
          [key]: checked,
        },
      };
      return { ...p, paidTickets: next };
    });
  };

  /* ---------- Effects ---------- */
  useEffect(() => {
    getList();
    getMembers();
    getCategory();
    getRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, sortConfig]);

  // Live listeners for requests
  useEffect(() => {
    if (!reqModalOpen || !activeClubId) return;
    const reqRef = dbRef(database, `uniclubs/${activeClubId}/joinRequests`);
    const handler = (snap) => {
      const val = snap.val() || {};
      const arr = Object.entries(val).map(([uid, r]) => ({ uid, ...r }));
      setRequests(arr);
    };
    onValue(reqRef, handler);
    return () => off(reqRef, "value", handler);
  }, [reqModalOpen, activeClubId]);

  // Live listeners for members
  useEffect(() => {
    if (!memModalOpen || !activeClubId) return;
    const memRef = dbRef(database, `uniclubs/${activeClubId}/members`);
    const handler = (snap) => {
      const val = snap.val() || {};
      const arr = Object.entries(val).map(([uid, m]) => ({ uid, ...m }));
      setMembersList(arr);
    };
    onValue(memRef, handler);
    return () => off(memRef, "value", handler);
  }, [memModalOpen, activeClubId]);

  /* ---------- Data IO ---------- */
  const getList = () => {
    if (!emp?.universityId) return;

    setIsLoading(true);

    const ref = rtdbQuery(dbRef(database, "uniclubs"), orderByChild("universityid"), equalTo(emp.universityId));

    const handler = async (snap) => {
      const val = snap.val();
      const rawEntries = val ? Object.entries(val) : [];

      // filter only own club if emp.uniclubid exists
      const filteredEntries = emp?.uniclubid ? rawEntries.filter(([id]) => id === emp.uniclubid) : rawEntries;

      const arr = filteredEntries.map(([id, v]) => ({ id, ...v }));

      const withCounts = await Promise.all(
        arr.map(async (item) => {
          try {
            const [reqSnap, memSnap] = await Promise.all([
              rtdbGet(dbRef(database, `uniclubs/${item.id}/joinRequests`)),
              rtdbGet(dbRef(database, `uniclubs/${item.id}/members`)),
            ]);
            const requestsCount = reqSnap.exists() ? Object.keys(reqSnap.val()).length : 0;
            const membersCount = memSnap.exists() ? Object.keys(memSnap.val()).length : 0;
            return { ...item, requestsCount, membersCount };
          } catch {
            return { ...item, requestsCount: 0, membersCount: 0 };
          }
        })
      );

      setList(withCounts);
      setIsLoading(false);
    };

    onValue(ref, handler, { onlyOnce: false });
    return () => off(ref, "value", handler);
  };

  const getMembers = async () => {
    setIsLoading(true);
    try {
      const constraints = [where("createdby", "==", uid), where("livingtype", "==", "university")];
      const q = query(collection(db, "users"), ...constraints);
      const snap = await getDocs(q);
      const rows = snap.docs
        .map((d) => ({
          id: d.id,
          name: d.data().firstname || "User",
          photoURL: d.data().imageUrl || d.data().photoURL || "",
        }))
        .filter((u) => u.name !== (emp?.name || ""));
      setMembers(rows);
    } catch (err) {
      console.error("getMembers error:", err);
      toast.error("Failed to load students");
    } finally {
      setIsLoading(false);
    }
  };

  const getCategory = async () => {
    try {
      if (!uid) return setCategory([]);
      const qCat = query(collection(db, "discovercategory"));
      const snap = await getDocs(qCat);
      setCategory(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load categories");
    }
  };

  const getRole = async () => {
    try {
      if (!uid) return setRoles([]);
      const qCat = query(collection(db, "uniclubrole"), where("uid", "==", uid));
      const snap = await getDocs(qCat);
      setRoles(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
      toast.error("Failed to load roles");
    }
  };

  /* ---------- Join Question builder helpers ---------- */
  const startEditJoinQuestion = (q) => {
    setForm((p) => ({
      ...p,
      editingJoinQId: q.id,
      joinQInput: q.question || "",
      joinQType: q.type || "short",
      joinQOptionInput: "",
      joinQOptionList: Array.isArray(q.options) ? q.options : [],
    }));
  };

  const cancelEditJoinQuestion = () => {
    setForm((p) => ({
      ...p,
      editingJoinQId: "",
      joinQInput: "",
      joinQType: "short",
      joinQOptionInput: "",
      joinQOptionList: [],
    }));
  };

  const saveEditedJoinQuestion = () => {
    const qText = (form.joinQInput || "").trim();
    if (!qText) return;

    const type = form.joinQType || "short";
    const options = type === "short" ? [] : form.joinQOptionList || [];

    setForm((p) => ({
      ...p,
      joinQuestions: (p.joinQuestions || []).map((q) =>
        q.id === p.editingJoinQId ? { ...q, question: qText, type, options } : q
      ),
      editingJoinQId: "",
      joinQInput: "",
      joinQType: "short",
      joinQOptionInput: "",
      joinQOptionList: [],
    }));
  };

  const handleChange = (e) => {
    const { name, value, files, type } = e.target;
    if (type === "file") {
      const f = files?.[0] || null;
      setForm((prev) => ({ ...prev, imageFile: f }));
      setFileName(f?.name || "No file chosen");
      setPreviewUrl(f ? URL.createObjectURL(f) : "");
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  /* ---------- ✅ Fixed validate (your code had wrong keys: form.ticketing/form.tickets) ---------- */
  const validate = () => {
    if (!form.title?.trim()) {
      toast.error("Title is required");
      return false;
    }

    const isPositiveIntOrBlank = (v) => {
      if (v === "" || v == null) return true;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0;
    };

    const validateTablesPods = (obj, label = "Tables/Pods") => {
      if (!obj?.hasTablesPods) return true;
      if (!obj.tableType) {
        toast.error(`${label}: Please select table type`);
        return false;
      }
      if (!obj.tableCount || Number(obj.tableCount) <= 0) {
        toast.error(`${label}: Please enter number of tables/pods`);
        return false;
      }
      if (!obj.ticketsPerTable || Number(obj.ticketsPerTable) <= 0) {
        toast.error(`${label}: Please enter tickets per table/pod`);
        return false;
      }
      return true;
    };

    if (form.ticketType === "free") {
      const ft = form.freeTicket || {};
      if (!isPositiveIntOrBlank(ft.maxCapacity)) {
        toast.error("Max Capacity must be a number");
        return false;
      }
      if (!isPositiveIntOrBlank(ft.maxPurchasePerUser)) {
        toast.error("Max Purchase per user must be a number");
        return false;
      }
      if (ft.startAtMs && ft.endAtMs && ft.endAtMs < ft.startAtMs) {
        toast.error("Ticket end time must be after start time");
        return false;
      }
      if (!validateTablesPods(ft, "Tables/Pods")) return false;
    }

    if (form.ticketType === "paid") {
      const tickets = Array.isArray(form.paidTickets) ? form.paidTickets : [];
      if (!tickets.length) {
        toast.error("Please add at least 1 ticket");
        return false;
      }

      for (let i = 0; i < tickets.length; i++) {
        const tk = tickets[i];
        const idx = i + 1;

        if (!tk.name?.trim()) {
          toast.error(`Ticket ${idx}: name is required`);
          return false;
        }

        const price = Number(tk.price);
        if (!Number.isFinite(price) || price <= 0) {
          toast.error(`Ticket ${idx}: price must be > 0`);
          return false;
        }

        if (!isPositiveIntOrBlank(tk.maxCapacity)) {
          toast.error(`Ticket ${idx}: max capacity must be a number`);
          return false;
        }
        if (!isPositiveIntOrBlank(tk.maxPurchasePerUser)) {
          toast.error(`Ticket ${idx}: max purchase per user must be a number`);
          return false;
        }

        if (tk.startAtMs && tk.endAtMs && tk.endAtMs < tk.startAtMs) {
          toast.error(`Ticket ${idx}: end time must be after start time`);
          return false;
        }

        if (tk.passwordEnabled && !tk.password?.trim()) {
          toast.error(`Ticket ${idx}: password is enabled, please enter password`);
          return false;
        }

        if (!validateTablesPods(tk, `Ticket ${idx} Tables/Pods`)) return false;
      }
    }

    // membership validity (if you want required, keep required in UI; validation optional)
    if (form.memberValidFromMs && form.memberValidToMs && form.memberValidToMs < form.memberValidFromMs) {
      toast.error("Membership valid to must be after valid from");
      return false;
    }

    return true;
  };

  /* ---------- Contacts + Links helpers ---------- */
  const updateContactRow = (index, field, value) => {
    setForm((prev) => {
      const next = { ...prev };
      const contacts = Array.isArray(next.contacts) ? [...next.contacts] : [];
      contacts[index] = { ...contacts[index], [field]: value };
      next.contacts = contacts;
      return next;
    });
  };

  const addContactRow = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...(Array.isArray(prev.contacts) ? prev.contacts : []), { name: "", phone: "", email: "" }],
    }));
  };

  const removeContactRow = (index) => {
    setForm((prev) => {
      const contacts = Array.isArray(prev.contacts) ? [...prev.contacts] : [];
      if (contacts.length <= 1) return prev;
      contacts.splice(index, 1);
      return { ...prev, contacts };
    });
  };

  const updateLinkRow = (index, field, value) => {
    setForm((prev) => {
      const next = { ...prev };
      const links = Array.isArray(next.links) ? [...next.links] : [];
      links[index] = { ...links[index], [field]: value };
      next.links = links;
      return next;
    });
  };

  const addLinkRow = () => {
    setForm((prev) => ({
      ...prev,
      links: [...(Array.isArray(prev.links) ? prev.links : []), { label: "", url: "" }],
    }));
  };

  const removeLinkRow = (index) => {
    setForm((prev) => {
      const links = Array.isArray(prev.links) ? [...prev.links] : [];
      if (links.length <= 1) return prev;
      links.splice(index, 1);
      return { ...prev, links };
    });
  };

  /* ---------- Create / Update ---------- */
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const startAtMs = form.startAtMs || 0;
      const endAtMs = form.endAtMs || 0;

      // ---- image upload ----
      let imageUrl = form.imageUrl || "";
      const isNewImage = !!(form.imageFile && typeof form.imageFile.name === "string");
      if (!editingData && !imageUrl && !isNewImage) {
        toast.error("Please choose the file");
        return;
      }
      if (isNewImage) {
        const key = `${Date.now()}_${form.imageFile.name}`;
        const storRef = storageRef(storage, `discover/${key}`);
        await uploadBytes(storRef, form.imageFile);
        imageUrl = await getDownloadURL(storRef);
      }

      // ---- derived values ----
      const cleanedTags = Array.isArray(form.tags) ? form.tags.map((t) => t.trim()).filter(Boolean) : parseTags(form.tags);

      const safeString = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));

      const creatorName = safeString(emp?.name || user?.displayName || "");
      const creatorPhone = safeString(emp?.phone || user?.phoneNumber || form.contactPhone);
      const creatorEmail = safeString(user?.email || emp?.email || form.contactEmail);

      // extra contacts
      const cleanedContacts = (Array.isArray(form.contacts) ? form.contacts : [])
        .map((c) => ({
          name: safeString(c.name),
          phone: safeString(c.phone),
          email: safeString(c.email),
        }))
        .filter((c) => c.name || c.phone || c.email);

      const cleanedLinks = (Array.isArray(form.links) ? form.links : [])
        .map((l) => ({
          label: safeString(l.label),
          url: safeString(l.url),
        }))
        .filter((l) => l.url);

      const primaryLink = cleanedLinks[0];
      const secondaryLink = cleanedLinks[1];

      const settingsPayload = {
        chatEnabled: !!form.enableChat,
        allowEventsByMembers: !!form.allowEventsByMembers,
        pollsEnabled: !!form.pollsEnabled,
        sharedFilesEnabled: !!form.sharedFilesEnabled,
        allowSubGroups: !!form.allowSubGroups,
        allowNotifications: !!form.allowNotifications,
        maxMembers: form.maxMembers ? Number(form.maxMembers) : null,

        // membership validity
        memberValidFromMs: form.memberValidFromMs || 0,
        memberValidToMs: form.memberValidToMs || 0,
      };

      // ✅ membershipTickets (FULL: password/extraInfo/tables fields saved)
      const membershipTickets =
        form.ticketType === "paid"
          ? {
            type: "paid",
            qrCheckInEnabled: !!form.qrCheckInEnabled,
            tickets: (form.paidTickets || []).map((t) => ({
              id: t.id || `t_${Date.now()}`,
              name: (t.name || "").trim(),
              description: (t.description || "").trim(),
              price: Number(t.price) || 0,
              allowedGroupId: t.allowedGroupId || "",
              maxCapacity: normalizeNumOrNull(t.maxCapacity),
              maxPurchasePerUser: normalizeNumOrNull(t.maxPurchasePerUser),
              startAtMs: t.startAtMs || 0,
              endAtMs: t.endAtMs || 0,
              passwordEnabled: !!t.passwordEnabled,
              password: t.passwordEnabled ? (t.password || "").trim() : "",
              collectExtraInfo: !!t.collectExtraInfo,
              extraInfo: t.collectExtraInfo
                ? {
                  name: !!t.extraInfo?.name,
                  email: !!t.extraInfo?.email,
                  number: !!t.extraInfo?.number,
                  studentId: !!t.extraInfo?.studentId,
                  degree: !!t.extraInfo?.degree,
                }
                : { name: false, email: false, number: false, studentId: false, degree: false },

              hasTablesPods: !!t.hasTablesPods,
              tableType: t.hasTablesPods ? (t.tableType || "") : "",
              tableCount: t.hasTablesPods ? normalizeNumOrNull(t.tableCount) : null,
              ticketsPerTable: t.hasTablesPods ? normalizeNumOrNull(t.ticketsPerTable) : null,
            })),
          }
          : {
            type: "free",
            qrCheckInEnabled: !!form.qrCheckInEnabled,
            maxCapacity: normalizeNumOrNull(form.freeTicket?.maxCapacity),
            maxPurchasePerUser: normalizeNumOrNull(form.freeTicket?.maxPurchasePerUser),
            startAtMs: form.freeTicket?.startAtMs || 0,
            endAtMs: form.freeTicket?.endAtMs || 0,

            hasTablesPods: !!form.freeTicket?.hasTablesPods,
            tableType: form.freeTicket?.hasTablesPods ? (form.freeTicket?.tableType || "") : "",
            tableCount: form.freeTicket?.hasTablesPods ? normalizeNumOrNull(form.freeTicket?.tableCount) : null,
            ticketsPerTable: form.freeTicket?.hasTablesPods ? normalizeNumOrNull(form.freeTicket?.ticketsPerTable) : null,
          };

      const payload = {
        title: form.title.trim(),
        location: (form.location || "").trim(),
        address: (form.address || "").trim(),
        desc: (form.desc || "").trim(),
        website: (form.website || "").trim() || primaryLink?.url || "",
        link: (form.link || "").trim() || secondaryLink?.url || "",
        links: cleanedLinks.length ? cleanedLinks : undefined,

        contactName: creatorName,
        contactPhone: form.showPhone && creatorPhone ? creatorPhone : "",
        contactEmail: form.showEmail && creatorEmail ? creatorEmail : "",

        date: startAtMs ? dayjs(startAtMs).format("dddd, MMMM D") : "",
        time: startAtMs ? dayjs(startAtMs).format("h:mm A") : "",
        startAt: startAtMs,
        endAt: endAtMs,

        image: imageUrl,

        createdAt: editingData ? undefined : Date.now(),
        updatedAt: Date.now(),
        uid: user?.uid || "",
        displayName: user?.displayName || emp?.name || "",
        photoURL: user?.photoURL || emp?.imageUrl || "",

        privacyType: form.privacyType,
        tags: cleanedTags,
        role: "Admin",
        rules: (form.rules || "").trim(),

        joinQuestions: (form.joinQuestions || [])
          .map((q, idx) => {
            if (typeof q === "string") {
              return { id: `q${idx + 1}`, question: q.trim(), type: "short", options: [] };
            }
            return {
              id: q.id || `q${idx + 1}`,
              question: (q.question || "").trim(),
              type: q.type || "short",
              options: Array.isArray(q.options) ? q.options : [],
            };
          })
          .filter((q) => q.question),

        category: form.category || "",

        settings: settingsPayload,
        contacts: cleanedContacts.length ? cleanedContacts : undefined,

        membershipTickets, // ✅ NEW
      };

      Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);

      // ---- create vs update ----
      let clubId;
      if (editingData?.id) {
        clubId = editingData.id;
        await rtdbUpdate(dbRef(database, `uniclubs/${clubId}`), payload);
        toast.success("Uniclub updated successfully!");
      } else {
        const newRef = push(dbRef(database, "uniclubs/"));
        clubId = newRef.key;
        await rtdbSet(newRef, { ...payload, id: clubId });

        // add creator as admin
        if (user?.uid) {
          await rtdbSet(dbRef(database, `uniclubs/${clubId}/members/${user.uid}`), {
            uid: user.uid,
            name: user.displayName || "",
            photoURL: user.photoURL ?? "",
            role: "admin",
            status: "active",
            joinedAt: serverTimestamp(),
          });
        }
        toast.success("Uniclub created successfully");
      }

      const base = `uniclubs/${clubId}`;

      // ownership transfer
      if (form.successorUid && form.successorUid !== user?.uid) {
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/joinedAt`), serverTimestamp());
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/name`), form.successor?.name || "");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/photoURL`), form.successor?.photoURL || "");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/role`), "admin");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/status`), "active");
        await rtdbSet(dbRef(database, `${base}/members/${form.successorUid}/uid`), form.successorUid);
        if (user?.uid) {
          await rtdbSet(dbRef(database, `${base}/members/${user.uid}/role`), "moderator");
        }
        await rtdbSet(dbRef(database, `${base}/uid`), form.successorUid);
      }

      // moderator + role
      if (form.memberId && form.roleId) {
        await Promise.all([
          rtdbSet(dbRef(database, `${base}/roles/${form.memberId}`), { roleId: form.roleId, roleName: form.role }),
          rtdbSet(dbRef(database, `${base}/members/${form.memberId}/role`), form.role || "contributor"),
        ]);
      }

      // ---- reset + refresh ----
      getList();
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName("No file chosen");
      setPreviewUrl("");
    } catch (error) {
      console.error("Error saving uniclubs:", error);
      toast.error("Failed to save uniclubs.");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await remove(dbRef(database, `uniclubs/${deleteData.id}`));
      toast.success("Successfully deleted!");
      getList();
    } catch (error) {
      console.error("Error deleting uniclubs: ", error);
      toast.error("Failed to delete uniclub.");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  /* ---------- Approve / Reject join requests ---------- */
  const approveRequest = async (clubId, req) => {
    const base = `uniclubs/${clubId}`;
    const memberRecord = {
      uid: req.uid,
      name: req.name || req.displayName || "",
      photoURL: req.photoURL || "",
      role: "member",
      status: "active",
      joinedAt: serverTimestamp(),
      answers: req.answers || null,
    };
    try {
      await rtdbSet(dbRef(database, `${base}/joinRequests/${req.uid}/status`), "approved");
      await Promise.all([
        rtdbSet(dbRef(database, `${base}/members/${req.uid}`), memberRecord),
        remove(dbRef(database, `${base}/joinRequests/${req.uid}`)),
      ]);

      setRequests((prev) => prev.filter((r) => r.uid !== req.uid));
      setMembersList((prev) => {
        const without = prev.filter((m) => m.uid !== req.uid);
        return [...without, memberRecord];
      });

      getList();
      toast.success("Request approved");
    } catch (e) {
      console.error("approveRequest error", e);
      toast.error("Could not approve request");
    }
  };

  const rejectRequest = async (clubId, req) => {
    const base = `uniclubs/${clubId}`;
    try {
      await rtdbSet(dbRef(database, `${base}/joinRequests/${req.uid}/status`), "rejected");
      await remove(dbRef(database, `${base}/joinRequests/${req.uid}`));
      setRequests((prev) => prev.filter((r) => r.uid !== req.uid));
      getList();
      toast.success("Request rejected");
    } catch (e) {
      console.error("rejectRequest error", e);
      toast.error("Could not reject request");
    }
  };

  /* ---------- Filter + Sort + Paginate ---------- */
  const filteredData = list.filter((g) => {
    const titleOK = !filters.title || (g.title || "").toLowerCase().includes(filters.title.toLowerCase());
    return titleOK;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const dir = sortConfig.direction === "asc" ? 1 : -1;
    const key = sortConfig.key;
    const sa = (a[key] ?? "").toString().toLowerCase();
    const sb = (b[key] ?? "").toString().toLowerCase();
    return sa.localeCompare(sb) * dir;
  });

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));
  const paginatedData = sortedData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const truncateText = (text = "", max = 120) => {
    if (!text) return "";
    return text.length > max ? text.slice(0, max) + "…" : text;
  };

  /* ---------- Render ---------- */
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto no-scrollbar" style={{ paddingTop: navbarHeight || 0 }}>
      {/* Top bar */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Uniclub</h1>
      </div>

      <div className="overflow-x-auto bg-white rounded shadow no-scrollbar">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader color="#36d7b7" loading={isLoading} />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {[
                  { key: "title", label: "Title" },
                  { key: "location", label: "Address" },
                  { key: "when", label: "When", sortable: false },
                  { key: "desc", label: "Description" },
                  { key: "requests", label: "Requests", sortable: false },
                  { key: "members", label: "Members", sortable: false },
                  { key: "actions", label: "Action", sortable: false },
                ].map((col) => (
                  <th key={col.key} className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none">
                    {col.sortable === false ? (
                      <span>{col.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:underline"
                        onClick={() => onSort(col.key)}
                      >
                        <span>{col.label}</span>
                        {sortConfig.key === col.key && (
                          <span className="text-gray-400">{sortConfig.direction === "asc" ? "▲" : "▼"}</span>
                        )}
                      </button>
                    )}
                  </th>
                ))}
              </tr>

              {/* header filters */}
              <tr className="border-t border-gray-200">
                <th className="px-6 pb-3">
                  <input
                    className="w-full border border-gray-300 p-1 rounded text-sm"
                    placeholder="Search title"
                    defaultValue={filters.title}
                    onChange={(e) => setFilterDebounced("title", e.target.value)}
                  />
                </th>
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
                <th className="px-6 pb-3" />
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-200">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-4 text-center text-gray-500">
                    No matching uniclubs found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => {
                  const start = item.startAtMs || item.startAt;
                  const end = item.endAtMs || item.endAt;
                  const whenLabel = start
                    ? `${dayjs(start).format("DD MMM, h:mm A")}${end ? ` – ${dayjs(end).format("DD MMM, h:mm A")}` : ""}`
                    : item.date || item.time
                      ? `${item.date || ""}${item.time ? ` • ${item.time}${item.endAt ? ` – ${item.endAt}` : ""}` : ""}`
                      : "-";

                  return (
                    <tr key={item.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.address || "-"}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{whenLabel}</td>
                      <td
                        className="px-6 py-4 text-sm text-gray-500 whitespace-normal break-words max-w-xs"
                        title={item.desc}
                      >
                        {truncateText(item.desc, 100)}
                      </td>

                      {/* Requests */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                          onClick={() => {
                            setActiveClubId(item.id);
                            setActiveClubTitle(item.title || "Club");
                            setReqModalOpen(true);
                          }}
                        >
                          <span>View</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200">{item.requestsCount ?? 0}</span>
                        </button>
                      </td>

                      {/* Members */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          className="inline-flex items-center gap-2 px-2 py-1 rounded bg-gray-100 hover:bg-gray-200"
                          onClick={() => {
                            setActiveClubId(item.id);
                            setActiveClubTitle(item.title || "Club");
                            setMemModalOpen(true);
                          }}
                        >
                          <span>View</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200">{item.membersCount ?? 0}</span>
                        </button>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex items-center gap-3">
                          <button
                            className="text-blue-600 hover:underline"
                            onClick={() => {
                              const mt = item?.membershipTickets || null;

                              setEditing(item);
                              setForm({
                                ...initialForm,
                                ...item,
                                imageFile: null,
                                imageUrl: item.image || "",
                                startAtMs: item.startAtMs || item.startAt || 0,
                                endAtMs: item.endAtMs || item.endAt || 0,
                                tags: Array.isArray(item.tags) ? item.tags : parseTags(item.tags || ""),
                                tagInput: "",
                                rules: item.rules || "",

                                // join questions hydrate
                                editingJoinQId: "",
                                joinQType: "short",
                                joinQInput: "",
                                joinQOptionInput: "",
                                joinQOptionList: [],
                                joinQuestions: Array.isArray(item.joinQuestions)
                                  ? item.joinQuestions.map((q, idx) =>
                                    typeof q === "string"
                                      ? { id: `q${idx + 1}`, question: q, type: "short", options: [] }
                                      : {
                                        id: q.id || `q${idx + 1}`,
                                        question: q.question || "",
                                        type: q.type || "short",
                                        options: Array.isArray(q.options) ? q.options : [],
                                      }
                                  )
                                  : [],

                                category: item.category || "",

                                enableChat: !!item?.settings?.chatEnabled,
                                allowEventsByMembers: !!item?.settings?.allowEventsByMembers,
                                pollsEnabled: !!item?.settings?.pollsEnabled,
                                sharedFilesEnabled: !!item?.settings?.sharedFilesEnabled,
                                allowSubGroups: !!item?.settings?.allowSubGroups,
                                allowNotifications: item?.settings?.allowNotifications === false ? false : true,
                                maxMembers: Number.isFinite(item?.settings?.maxMembers) ? String(item?.settings?.maxMembers) : "",

                                memberValidFromMs: item?.settings?.memberValidFromMs || 0,
                                memberValidToMs: item?.settings?.memberValidToMs || 0,

                                successorUid: item?.ownership?.successorUid || "",
                                memberId: "",
                                roleId: "",
                                role: "",

                                contacts:
                                  Array.isArray(item.contacts) && item.contacts.length > 0
                                    ? item.contacts
                                    : [{ name: "", phone: "", email: "" }],

                                showPhone: !!item.contactPhone,
                                showEmail: !!item.contactEmail,

                                links:
                                  Array.isArray(item.links) && item.links.length > 0
                                    ? item.links
                                    : (
                                      [
                                        item.website ? { label: "Website", url: item.website } : null,
                                        item.link ? { label: "External", url: item.link } : null,
                                      ].filter(Boolean).length > 0
                                        ? [...[item.website ? { label: "Website", url: item.website } : null, item.link ? { label: "External", url: item.link } : null].filter(Boolean)]
                                        : [{ label: "", url: "" }]
                                    ),

                                // ✅ Tickets hydrate (FULL)
                                ticketType: mt?.type || "free",
                                qrCheckInEnabled: !!mt?.qrCheckInEnabled,

                                freeTicket:
                                  mt?.type === "free"
                                    ? {
                                      maxCapacity: mt?.maxCapacity ?? "",
                                      maxPurchasePerUser: mt?.maxPurchasePerUser ?? "",
                                      startAtMs: mt?.startAtMs || 0,
                                      endAtMs: mt?.endAtMs || 0,
                                      hasTablesPods: !!mt?.hasTablesPods,
                                      tableType: mt?.tableType || "",
                                      tableCount: mt?.tableCount ?? "",
                                      ticketsPerTable: mt?.ticketsPerTable ?? "",
                                    }
                                    : initialForm.freeTicket,

                                paidTickets:
                                  mt?.type === "paid" && Array.isArray(mt?.tickets)
                                    ? mt.tickets.map((t) => ({
                                      id: t.id || `t_${Date.now()}`,
                                      name: t.name || "",
                                      description: t.description || "",
                                      price: t.price != null ? String(t.price) : "",
                                      allowedGroupId: t.allowedGroupId || "",
                                      maxCapacity: t.maxCapacity ?? "",
                                      maxPurchasePerUser: t.maxPurchasePerUser ?? "",
                                      startAtMs: t.startAtMs || 0,
                                      endAtMs: t.endAtMs || 0,
                                      passwordEnabled: !!t.passwordEnabled,
                                      password: t.password || "",
                                      collectExtraInfo: !!t.collectExtraInfo,
                                      extraInfo: t.extraInfo || {
                                        name: true,
                                        email: false,
                                        number: false,
                                        studentId: false,
                                        degree: false,
                                      },
                                      hasTablesPods: !!t.hasTablesPods,
                                      tableType: t.tableType || "",
                                      tableCount: t.tableCount ?? "",
                                      ticketsPerTable: t.ticketsPerTable ?? "",
                                    }))
                                    : [defaultPaidTicket()],
                              });

                              setFileName("No file chosen");
                              setPreviewUrl(item.image || "");
                              setModalOpen(true);
                            }}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">
          Page {currentPage} of {totalPages}
        </p>
        <div className="space-x-2">
          <button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
            className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      {/* Create/Edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? "Edit uniclub" : "Add uniclub"}</h2>

            <form onSubmit={handleAdd} className="space-y-4">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Title"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  required
                />

                <textarea
                  placeholder="Description"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.desc}
                  onChange={(e) => setForm({ ...form, desc: e.target.value })}
                  required
                />

                <input
                  type="text"
                  placeholder="Address"
                  className="w-full border border-gray-300 p-2 rounded"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  required
                />

                {/* Location */}
                <div className="space-y-1">
                  <label className="block text-sm font-medium text-gray-700">Location</label>
                  <div className="relative">
                    <input
                      type="text"
                      name="location"
                      placeholder="Select on map"
                      className="w-full border border-gray-300 p-2 pl-10 rounded cursor-pointer"
                      value={form.location}
                      onClick={() => setShowMapModal(true)}
                      readOnly
                    />
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  </div>
                </div>

                {/* Club valid from/to (date) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Club valid from</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="date"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={toDateInputValue(form.startAtMs)}
                      onChange={(e) => {
                        const ms = e.target.value ? new Date(e.target.value).getTime() : 0;
                        setForm((p) => ({ ...p, startAtMs: ms }));
                      }}
                    />
                    <input
                      type="date"
                      className="w-full border border-gray-300 p-2 rounded"
                      value={toDateInputValue(form.endAtMs)}
                      onChange={(e) => {
                        const ms = e.target.value ? new Date(e.target.value).getTime() : 0;
                        setForm((p) => ({ ...p, endAtMs: ms }));
                      }}
                    />
                  </div>
                </div>

                {/* Privacy */}
                <section className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Privacy Type</label>
                  <select
                    name="privacyType"
                    value={form.privacyType}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                  >
                    <option value="">Select Privacy Type</option>
                    <option value="Public">Public</option>
                    <option value="Private">Private</option>
                    <option value="Hidden">Hidden / Invite-only</option>
                  </select>
                </section>

                {/* Category */}
                <section className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">Category</label>
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className="w-full border border-gray-300 p-2 rounded"
                    required
                  >
                    <option value="">Select Category</option>
                    {category?.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </section>

                {/* Tags + Rules + Join Questions */}
                {/* (your existing section kept as-is) */}
                {/* ... (unchanged: tags/rules/join questions) ... */}

                {/* ✅ Membership Tickets (FULL screenshot system) */}
                <section className="space-y-4">
                  <h3 className="text-sm font-semibold text-gray-900">Membership Tickets</h3>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="block text-sm font-medium text-gray-700">Ticket Type</label>
                    <select
                      className="w-full border border-gray-300 p-2 rounded"
                      value={form.ticketType}
                      onChange={(e) => setForm((p) => ({ ...p, ticketType: e.target.value }))}
                    >
                      <option value="free">Free</option>
                      <option value="paid">Paid</option>
                    </select>

                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={!!form.qrCheckInEnabled}
                        onChange={(e) => setForm((p) => ({ ...p, qrCheckInEnabled: e.target.checked }))}
                      />
                      Enable QR check-in
                    </label>
                  </div>

                  {/* FREE MODE */}
                  {form.ticketType === "free" ? (
                    <div className="space-y-3 border rounded-lg p-4 bg-gray-50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          className="w-full border border-gray-300 p-2 rounded"
                          placeholder="Max Capacity (total members)"
                          value={form.freeTicket?.maxCapacity || ""}
                          onChange={(e) =>
                            setForm((p) => ({ ...p, freeTicket: { ...(p.freeTicket || {}), maxCapacity: e.target.value } }))
                          }
                        />
                        <input
                          className="w-full border border-gray-300 p-2 rounded"
                          placeholder="Max Purchase per user"
                          value={form.freeTicket?.maxPurchasePerUser || ""}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              freeTicket: { ...(p.freeTicket || {}), maxPurchasePerUser: e.target.value },
                            }))
                          }
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Ticket Start Time</div>
                          <input
                            type="datetime-local"
                            className="w-full border border-gray-300 p-2 rounded"
                            value={toLocalInputValue(form.freeTicket?.startAtMs || 0)}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                freeTicket: { ...(p.freeTicket || {}), startAtMs: fromLocalInputValue(e.target.value) },
                              }))
                            }
                          />
                        </div>
                        <div>
                          <div className="text-xs text-gray-600 mb-1">Ticket End Time</div>
                          <input
                            type="datetime-local"
                            className="w-full border border-gray-300 p-2 rounded"
                            value={toLocalInputValue(form.freeTicket?.endAtMs || 0)}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                freeTicket: { ...(p.freeTicket || {}), endAtMs: fromLocalInputValue(e.target.value) },
                              }))
                            }
                          />
                        </div>
                      </div>

                      <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={!!form.freeTicket?.hasTablesPods}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              freeTicket: { ...(p.freeTicket || {}), hasTablesPods: e.target.checked },
                            }))
                          }
                        />
                        Does this ticket have Tables / Pods?
                      </label>

                      {/* ✅ Missing section fixed: show fields when checked */}
                      {form.freeTicket?.hasTablesPods && (
                        <div className="space-y-2">
                          <select
                            className="w-full border border-gray-300 p-2 rounded"
                            value={form.freeTicket?.tableType || ""}
                            onChange={(e) =>
                              setForm((p) => ({
                                ...p,
                                freeTicket: { ...(p.freeTicket || {}), tableType: e.target.value },
                              }))
                            }
                          >
                            <option value="">Select type of table</option>
                            <option value="table">Table</option>
                            <option value="pod">Pod</option>
                            <option value="booth">Booth</option>
                            <option value="vip">VIP Section</option>
                          </select>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              className="w-full border border-gray-300 p-2 rounded"
                              placeholder="Number of tables / pods available"
                              type="number"
                              min="1"
                              value={form.freeTicket?.tableCount || ""}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  freeTicket: { ...(p.freeTicket || {}), tableCount: e.target.value },
                                }))
                              }
                            />
                            <input
                              className="w-full border border-gray-300 p-2 rounded"
                              placeholder="Number of tickets per table / pod"
                              type="number"
                              min="1"
                              value={form.freeTicket?.ticketsPerTable || ""}
                              onChange={(e) =>
                                setForm((p) => ({
                                  ...p,
                                  freeTicket: { ...(p.freeTicket || {}), ticketsPerTable: e.target.value },
                                }))
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* PAID MODE */
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-gray-900">Tickets</div>
                        <button
                          type="button"
                          className="px-3 py-2 rounded border bg-white hover:bg-gray-50"
                          onClick={addPaidTicket}
                        >
                          + Add Ticket
                        </button>
                      </div>

                      <div className="space-y-4">
                        {(form.paidTickets || []).map((t, idx) => (
                          <div key={t.id || idx} className="border rounded-lg p-4 bg-gray-50">
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-sm font-semibold">Ticket {idx + 1}</div>
                              {form.paidTickets?.length > 1 && (
                                <button
                                  type="button"
                                  className="text-red-600 text-sm hover:underline"
                                  onClick={() => removePaidTicket(idx)}
                                >
                                  Remove
                                </button>
                              )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              <input
                                className="w-full border border-gray-300 p-2 rounded"
                                placeholder="Ticket Name (e.g. General, VIP)"
                                value={t.name || ""}
                                onChange={(e) => updatePaidTicket(idx, { name: e.target.value })}
                              />
                              <input
                                className="w-full border border-gray-300 p-2 rounded"
                                placeholder="Description"
                                value={t.description || ""}
                                onChange={(e) => updatePaidTicket(idx, { description: e.target.value })}
                              />

                              <input
                                className="w-full border border-gray-300 p-2 rounded"
                                placeholder="Price"
                                type="number"
                                min="0"
                                value={t.price || ""}
                                onChange={(e) => updatePaidTicket(idx, { price: e.target.value })}
                              />

                              <input
                                className="w-full border border-gray-300 p-2 rounded"
                                placeholder="Which club/sub-group can buy? (optional id)"
                                value={t.allowedGroupId || ""}
                                onChange={(e) => updatePaidTicket(idx, { allowedGroupId: e.target.value })}
                              />

                              <input
                                className="w-full border border-gray-300 p-2 rounded"
                                placeholder="Ticket Max Capacity (override club)"
                                value={t.maxCapacity || ""}
                                onChange={(e) => updatePaidTicket(idx, { maxCapacity: e.target.value })}
                              />

                              <input
                                className="w-full border border-gray-300 p-2 rounded"
                                placeholder="Ticket Max Purchase per user"
                                value={t.maxPurchasePerUser || ""}
                                onChange={(e) => updatePaidTicket(idx, { maxPurchasePerUser: e.target.value })}
                              />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                              <div>
                                <div className="text-xs text-gray-600 mb-1">Ticket Start Time</div>
                                <input
                                  type="datetime-local"
                                  className="w-full border border-gray-300 p-2 rounded"
                                  value={toLocalInputValue(t.startAtMs || 0)}
                                  onChange={(e) => updatePaidTicket(idx, { startAtMs: fromLocalInputValue(e.target.value) })}
                                />
                              </div>
                              <div>
                                <div className="text-xs text-gray-600 mb-1">Ticket End Time</div>
                                <input
                                  type="datetime-local"
                                  className="w-full border border-gray-300 p-2 rounded"
                                  value={toLocalInputValue(t.endAtMs || 0)}
                                  onChange={(e) => updatePaidTicket(idx, { endAtMs: fromLocalInputValue(e.target.value) })}
                                />
                              </div>
                            </div>

                            <div className="mt-3 space-y-3">
                              {/* Password */}
                              <div className="space-y-2">
                                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={!!t.passwordEnabled}
                                    onChange={(e) => updatePaidTicket(idx, { passwordEnabled: e.target.checked })}
                                  />
                                  Add Password for special members to buy
                                </label>

                                {t.passwordEnabled && (
                                  <input
                                    className="w-full border border-gray-300 p-2 rounded"
                                    placeholder="Password"
                                    value={t.password || ""}
                                    onChange={(e) => updatePaidTicket(idx, { password: e.target.value })}
                                  />
                                )}
                              </div>

                              {/* Collect extra info */}
                              <div className="space-y-2">
                                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={!!t.collectExtraInfo}
                                    onChange={(e) => updatePaidTicket(idx, { collectExtraInfo: e.target.checked })}
                                  />
                                  Collect extra information for ticketholders
                                </label>

                                {t.collectExtraInfo && (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-2">
                                    {[
                                      ["name", "name"],
                                      ["email", "email"],
                                      ["number", "number"],
                                      ["studentId", "studentId"],
                                      ["degree", "degree"],
                                    ].map(([k, label]) => (
                                      <label key={k} className="inline-flex items-center gap-2 text-sm text-gray-700">
                                        <input
                                          type="checkbox"
                                          checked={!!t.extraInfo?.[k]}
                                          onChange={(e) => updatePaidTicketExtraInfo(idx, k, e.target.checked)}
                                        />
                                        {label}
                                      </label>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Tables / Pods */}
                              <div className="space-y-2">
                                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                                  <input
                                    type="checkbox"
                                    checked={!!t.hasTablesPods}
                                    onChange={(e) => updatePaidTicket(idx, { hasTablesPods: e.target.checked })}
                                  />
                                  Does this ticket have Tables / Pods?
                                </label>

                                {t.hasTablesPods && (
                                  <div className="space-y-2">
                                    <select
                                      className="w-full border border-gray-300 p-2 rounded"
                                      value={t.tableType || ""}
                                      onChange={(e) => updatePaidTicket(idx, { tableType: e.target.value })}
                                    >
                                      <option value="">Select type of table</option>
                                      <option value="table">Table</option>
                                      <option value="pod">Pod</option>
                                      <option value="booth">Booth</option>
                                      <option value="vip">VIP Section</option>
                                    </select>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      <input
                                        className="w-full border border-gray-300 p-2 rounded"
                                        placeholder="Number of tables/pods available"
                                        type="number"
                                        min="1"
                                        value={t.tableCount || ""}
                                        onChange={(e) => updatePaidTicket(idx, { tableCount: e.target.value })}
                                      />
                                      <input
                                        className="w-full border border-gray-300 p-2 rounded"
                                        placeholder="Tickets per table/pod"
                                        type="number"
                                        min="1"
                                        value={t.ticketsPerTable || ""}
                                        onChange={(e) => updatePaidTicket(idx, { ticketsPerTable: e.target.value })}
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Membership validity */}
                <section className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Student Membership Valid From</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 p-2 rounded"
                        value={toDateInputValue(form.memberValidFromMs)}
                        onChange={(e) => {
                          const ms = e.target.value ? new Date(e.target.value).getTime() : 0;
                          setForm((p) => ({ ...p, memberValidFromMs: ms }));
                        }}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Student Membership Valid To</label>
                      <input
                        type="date"
                        className="w-full border border-gray-300 p-2 rounded"
                        value={toDateInputValue(form.memberValidToMs)}
                        onChange={(e) => {
                          const ms = e.target.value ? new Date(e.target.value).getTime() : 0;
                          setForm((p) => ({ ...p, memberValidToMs: ms }));
                        }}
                        required
                      />
                    </div>
                  </div>
                </section>

                {/* Logo */}
                <section className="space-y-2">
                  <h2 className="text-sm font-semibold">Upload Logo</h2>
                  <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                    <label className="cursor-pointer">
                      <input type="file" name="image" accept="image/*" className="hidden" onChange={handleChange} />
                      📁 Choose File
                    </label>
                    <span className="text-sm text-gray-600 truncate max-w-[150px]">{fileName}</span>
                  </div>
                  {(previewUrl || form.imageUrl) && <img src={previewUrl || form.imageUrl} alt="Poster Preview" width="150" />}
                </section>
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Map modal */}
      <Dialog open={showMapModal} onClose={() => setShowMapModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>Pick a Location</DialogTitle>
        <DialogContent dividers sx={{ overflow: "hidden" }}>
          <MapLocationInput
            value={form.location}
            onChange={(val) => {
              setForm({ ...form, location: val.address });
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMapModal(false)}>Cancel</Button>
          <Button variant="contained" onClick={() => setShowMapModal(false)} disabled={!form.location}>
            Save location
          </Button>
        </DialogActions>
      </Dialog>

      {/* Requests modal */}
      {reqModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Join Requests — {activeClubTitle} {requests.length ? `(${requests.length})` : ""}
              </h3>
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => {
                  setReqModalOpen(false);
                  setActiveClubId("");
                  setActiveClubTitle("");
                  setRequests([]);
                }}
              >
                Close
              </button>
            </div>

            {requests.length === 0 ? (
              <div className="text-sm text-gray-500">No pending requests.</div>
            ) : (
              <ul className="space-y-3">
                {requests.map((r) => (
                  <li key={r.uid} className="border rounded p-3 flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="font-medium">{r.name || r.displayName || r.uid}</div>
                      {r.answers && <div className="text-sm bg-gray-50 rounded p-2">{renderAnswers(r.answers)}</div>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-green-600 text-white"
                        onClick={() => approveRequest(activeClubId, r)}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-red-600 text-white"
                        onClick={() => rejectRequest(activeClubId, r)}
                      >
                        Reject
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Members modal */}
      {memModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                Members — {activeClubTitle} {membersList.length ? `(${membersList.length})` : ""}
              </h3>
              <button
                className="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300"
                onClick={() => {
                  setMemModalOpen(false);
                  setActiveClubId("");
                  setActiveClubTitle("");
                  setMembersList([]);
                }}
              >
                Close
              </button>
            </div>

            {membersList.length === 0 ? (
              <div className="text-sm text-gray-500">No members yet.</div>
            ) : (
              <ul className="divide-y">
                {membersList.map((m) => (
                  <li key={m.uid} className="py-2 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {m.photoURL ? (
                        <img src={m.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200" />
                      )}
                      <div>
                        <div className="font-medium">{m.name || m.uid}</div>
                        <div className="text-xs text-gray-500">{m.role || "member"}</div>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${m.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                        }`}
                    >
                      {m.status || "active"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete uniclub</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.title}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setConfirmDeleteOpen(false);
                  setDelete(null);
                }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer />
    </main>
  );
}
