import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { db, database, storage } from "../../firebase";
import { ref as dbRef, query as datquery, onValue, off, set, push, update, remove, get, orderByChild, equalTo } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, serverTimestamp, Timestamp } from "firebase/firestore";
import dayjs from 'dayjs';
import { DateRange } from 'react-date-range';
import 'react-date-range/dist/styles.css';
import 'react-date-range/dist/theme/default.css';
import { enUS } from 'date-fns/locale';
import { format } from 'date-fns';
import { useLocation, useSearchParams, Link } from "react-router-dom";

export default function UniclubAnnouncementPage(props) {
  const { navbarHeight } = props;
  const { state } = useLocation();
  const [params] = useSearchParams();
  const uid = useSelector((state) => state.auth.user.uid);
  const user = useSelector((state) => state.auth.user);
  const emp = useSelector((state) => state.auth.employee);
  const groupId = emp.uniclubid;
  const groupName = emp.uniclub;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingData, setEditing] = useState(null);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [fileName, setFileName] = useState('No file chosen');

 

  const [visiblePoll, setVisiblePoll] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [timeFilter, setTimeFilter] = useState('current'); // 'past' | 'current' | 'future'
  useEffect(() => { setCurrentPage(1); }, [timeFilter]);

  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  const [filters, setFilters] = useState({ title: '', desc: '', date: '' });
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
  const debounceRef = useRef(null);
  const setFilterDebounced = (field, value) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setFilters(prev => ({ ...prev, [field]: value }));
    }, 250);
  };
  const onSort = (key) => {
    setSortConfig(prev => prev.key === key
      ? { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction: 'asc' }
    );
  };
  useEffect(() => { setCurrentPage(1); }, [filters, sortConfig]);

  const [range, setRange] = useState([{ startDate: new Date(), endDate: new Date(), key: 'selection' }]);
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef();

  // === Header date filter for LIST (live) ===
  const [listDateRange, setListDateRange] = useState(null); // { startDate: Date, endDate: Date }
  const [showListPicker, setShowListPicker] = useState(false);
  const listPickerRef = useRef(null);

  // Close header calendar on outside click
  useEffect(() => {
    const onDocClick = (e) => {
      if (!showListPicker) return;
      if (listPickerRef.current && !listPickerRef.current.contains(e.target)) {
        setShowListPicker(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [showListPicker]);

  const initialForm = {
    id: 0,
    title: '',
    shortdesc: '',
    description: '',
    date: '',
    user: '',
    role: '',
    likes: [],
    comments: [],
    bookmarked: false,
    link: '',
    pollData: {
      question: '',
      allowMulti: false,
      options: { opt1: { text: '' }, opt2: { text: '' } },
      allowaddoption: false,
    },
    isPinned: false,
    pinnedAt: null,
    pinnedOrder: 0,
    posterUrls: [],
    postersFiles: [],
  };
  const [form, setForm] = useState(initialForm);

  // ===== Realtime load (scoped to group) =====
  useEffect(() => {

    setIsLoading(true);
    const groupRef = datquery(dbRef(database, 'discoverannouncements'),
      orderByChild('groupid'),
      equalTo(groupId));
    const cb = (snapshot) => {
      const data = snapshot.val();
      const documents = data
        ? Object.entries(data).map(([id, value]) => {
          const posterUrls = Array.isArray(value.posterUrls)
            ? value.posterUrls
            : (value.posterUrl ? [value.posterUrl] : []);
          return {
            id,
            ...value,
            posterUrls,
            isPinned: !!value.isPinned,
            pinnedOrder: Number.isFinite(value?.pinnedOrder) ? Number(value.pinnedOrder) : 0,
            pinnedAt: typeof value?.pinnedAt === 'number' ? value.pinnedAt : null,
          };
        })
        : [];
      setList(documents);
      setSelectedIds(new Set());
      setIsLoading(false);
    };
    onValue(groupRef, cb, () => setIsLoading(false));
    return () => { off(groupRef); };
  }, [groupId]);

  // ===== Helpers =====
  const toJsDate = (d) => {
    if (!d) return null;
    if (d instanceof Date) return d;
    if (typeof d === 'string') return new Date(d);
    if (typeof d === 'number') return new Date(d);
    if (d.seconds) return new Date(d.seconds * 1000);
    return null;
  };

  const classifyByDate = (dateObj) => {
    const s = toJsDate(dateObj?.startDate);
    const e = toJsDate(dateObj?.endDate);
    if (!s || !e) return 'current';
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    if (e < startOfToday) return 'past';
    if (s > endOfToday) return 'future';
    return 'current';
  };

  const formatDateTime = (dateObj) => {
    if (!dateObj?.startDate || !dateObj?.endDate) return 'N/A';
    const start = dayjs(dateObj.startDate.seconds ? dateObj.startDate.seconds * 1000 : dateObj.startDate).format('MMM DD, YYYY');
    const end = dayjs(dateObj.endDate.seconds ? dateObj.endDate.endDate * 1000 : dateObj.endDate).format('MMM DD, YYYY');
    // NOTE: fixed typo in the next line:
    const endSafe = dayjs(dateObj.endDate.seconds ? dateObj.endDate.seconds * 1000 : dateObj.endDate).format('MMM DD, YYYY');
    return `${start} - ${endSafe}`;
  };

  const fetchUser = async (uid) => {
    const querySnapshot = await getDocs(collection(db, 'employees'));
    const userMap = {};
    querySnapshot.forEach(doc => {
      const data = doc.data();
      const username = data.username || data.UserName || data.USERNAME || "";
      userMap[data.uid] = username;
    });
    return userMap[uid] || "";
  };

  // Overlap check for two [start, end] ranges
  const rangesOverlap = (aStart, aEnd, bStart, bEnd) => {
    if (!aStart || !aEnd || !bStart || !bEnd) return true; // if missing, don't block
    return aStart <= bEnd && bStart <= aEnd; // inclusive overlap
  };

  // Parse an announcement's date range to JS Dates
  const getItemDates = (item) => {
    const s = toJsDate(item?.date?.startDate);
    const e = toJsDate(item?.date?.endDate);
    return { s, e };
  };

  // ===== Derived list =====
  const timeFiltered = list.filter(item => classifyByDate(item.date) === timeFilter);

  const headerFiltered = timeFiltered.filter(item => {
    const titleOK = !filters.title || (item.title || '').toLowerCase().includes(filters.title.toLowerCase());
    const descOK = !filters.desc || (item.shortdesc || '').toLowerCase().includes(filters.desc.toLowerCase());
    const dateStr = formatDateTime(item.date).toLowerCase();
    const dateOK = !filters.date || dateStr.includes(filters.date.toLowerCase());

    // Live date-range filter (header calendar)
    let rangeOK = true;
    if (listDateRange?.startDate && listDateRange?.endDate) {
      const { s, e } = getItemDates(item);
      rangeOK = rangesOverlap(listDateRange.startDate, listDateRange.endDate, s, e);
    }

    return titleOK && descOK && dateOK && rangeOK;
  });

  const pinFiltered = showPinnedOnly ? headerFiltered.filter(a => !!a.isPinned) : headerFiltered;

  const sortedList = [...pinFiltered].sort((a, b) => {
    // 1) Pinned first
    const ap = a.isPinned ? 1 : 0;
    const bp = b.isPinned ? 1 : 0;
    if (ap !== bp) return bp - ap;

    // 2) Among pinned: pinnedOrder asc (lower shows higher)
    if (ap === 1 && bp === 1) {
      const ao = Number.isFinite(a.pinnedOrder) ? a.pinnedOrder : 999999;
      const bo = Number.isFinite(b.pinnedOrder) ? b.pinnedOrder : 999999;
      if (ao !== bo) return ao - bo;

      // 3) Then newest pinnedAt first
      const aPA = typeof a.pinnedAt === 'number' ? a.pinnedAt : 0;
      const bPA = typeof b.pinnedAt === 'number' ? b.pinnedAt : 0;
      if (aPA !== bPA) return bPA - aPA;
    }

    // 4) Then your chosen sort
    const dir = sortConfig.direction === 'asc' ? 1 : -1;
    switch (sortConfig.key) {
      case 'title':
        return ((a.title || '').localeCompare(b.title || '')) * dir;
      case 'description':
        return ((a.shortdesc || '').localeCompare(b.shortdesc || '')) * dir;
      case 'date': {
        const as = toJsDate(a.date?.startDate);
        const bs = toJsDate(b.date?.startDate);
        const av = as ? as.getTime() : 0;
        const bv = bs ? bs.getTime() : 0;
        return (av - bv) * dir;
      }
      default:
        return 0;
    }
  });

  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(sortedList.length / pageSize));
  const paginatedData = sortedList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const pageIds = paginatedData.map(r => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const somePageSelected = pageIds.some(id => selectedIds.has(id));

  // ===== Upload helper (multi) =====
  const uploadAllPosters = async (files) => {
    if (!files || !files.length) return [];
    const urls = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const path = `uniclub_announcements/${groupId}/${Date.now()}_${i}_${f.name}`;
      const storRef = storageRef(storage, path);
      await uploadBytes(storRef, f);
      const url = await getDownloadURL(storRef);
      urls.push(url);
    }
    return urls;
  };

  // ===== POLL PATCH (preserve votes) – scoped to group =====
  const buildPollPatchPreserveVotes = (id, dbPoll, formPoll) => {
    const updates = {};
    const base = `${'discoverannouncements'}/${id}/pollData`;
    if (!formPoll || !formPoll.question?.trim()) return updates;

    updates[`${base}/question`] = formPoll.question.trim();
    updates[`${base}/allowMulti`] = !!formPoll.allowMulti;
    updates[`${base}/allowaddoption`] = !!formPoll.allowaddoption;

    const newOpts = formPoll.options || {};
    const oldOpts = (dbPoll && dbPoll.options) || {};

    Object.entries(newOpts).forEach(([key, val]) => {
      const txt = (val?.text || '').trim();
      if (!txt) return;
      updates[`${base}/options/${key}/text`] = txt;
      if (!oldOpts[key]) {
        updates[`${base}/options/${key}/votes`] = {};
      }
    });

    Object.keys(oldOpts).forEach((key) => {
      if (!(key in newOpts)) {
        updates[`${base}/options/${key}`] = null;
      }
    });

    return updates;
  };

  // ===== Pin helpers (order) =====
  const maxPinnedOrder = () =>
    Math.max(0, ...list.filter(x => x.isPinned).map(x => Number(x.pinnedOrder) || 0));

  const togglePin = async (item, makePinned) => {
    try {
      const patch = {
        isPinned: makePinned,
        pinnedAt: makePinned ? Date.now() : null,
        pinnedOrder: makePinned ? maxPinnedOrder() + 1 : 0,
      };
      await update(dbRef(database, `${'discoverannouncements'}/${item.id}`), patch);
      toast.success(makePinned ? 'Pinned' : 'Unpinned');
    } catch (e) {
      console.error(e);
      toast.error('Could not update pin');
    }
  };

  const setPinnedOrder = async (item, value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return;
    try {
      await update(dbRef(database, `${'discoverannouncements'}/${item.id}`), {
        isPinned: true,
        pinnedOrder: n,
      });
      toast.success('Order updated');
    } catch (e) {
      console.error(e);
      toast.error('Order update failed');
    }
  };

  const nudgeOrder = async (item, delta) => {
    const n = Number(item.pinnedOrder || 0) + delta;
    if (n < 0) return;
    await setPinnedOrder(item, n);
  };

  // ===== Handlers =====
  const handleChange = (e) => {
    const { name, value, type, files, checked } = e.target;

    if (type === 'file') {
      if (name === 'postersFiles') {
        const arr = Array.from(files || []);
        setForm(prev => ({ ...prev, postersFiles: arr }));
        setFileName(arr.length ? `${arr.length} file(s) selected` : 'No file chosen');
      }
      return;
    }

    if (type === 'checkbox') {
      if (name === 'allowMulti') {
        setForm(prev => ({ ...prev, pollData: { ...prev.pollData, allowMulti: checked } }));
      } else if (name === 'allowaddoption') {
        setForm(prev => ({ ...prev, pollData: { ...prev.pollData, allowaddoption: checked } }));
      } else if (name === 'isPinned') {
        setForm(prev => ({ ...prev, isPinned: checked }));
      } else {
        setForm(prev => ({ ...prev, [name]: checked }));
      }
      return;
    }

    if (name === 'question') {
      setForm(prev => ({ ...prev, pollData: { ...prev.pollData, question: value } }));
    } else if (name === 'pinnedOrder') {
      setForm(prev => ({ ...prev, pinnedOrder: Number(value) || 0 }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (!'discoverannouncements') {
        toast.error("Missing groupId — open this page from a Uniclub row.");
        return;
      }
      if (!editingData && (!form.postersFiles?.length && !form.posterUrls?.length)) {
        toast.error("Please choose at least one image");
        setModalOpen(true);
        return;
      }

      setIsLoading(true);
      const newUrls = await uploadAllPosters(form.postersFiles || []);
      const mergedPosterUrls = [...(form.posterUrls || []), ...newUrls];

      let cleanPollData = null;
      if (form.pollData?.question?.trim()) {
        const pollOptions = {};
        Object.entries(form.pollData.options || {}).forEach(([k, v]) => {
          const text = (v?.text || '').trim();
          if (text) pollOptions[k] = { text, votes: {} };
        });
        if (Object.keys(pollOptions).length >= 2) {
          cleanPollData = {
            question: form.pollData.question.trim(),
            allowMulti: !!form.pollData.allowMulti,
            allowaddoption: !!form.pollData.allowaddoption,
            options: pollOptions,
          };
        }
      }

      const userName = await fetchUser(uid);
      const nextOrderOnCreate = form.isPinned ? maxPinnedOrder() + 1 : 0;

      const payload = {
        ...form,
        groupid: groupId,
        groupName,
        uid,
        user: userName ? userName : emp?.name,
        likes: form.likes || [],
        comments: form.comments || [],
        createdAt: serverTimestamp(),
        photoURL: user?.photoURL,
        date: {
          startDate: Timestamp.fromDate(new Date(form.date.startDate)),
          endDate: Timestamp.fromDate(new Date(form.date.endDate)),
        },
        role: emp?.role,
        pollData: cleanPollData,
        timestamp: Date.now(),
        isPinned: !!form.isPinned,
        pinnedAt: form.isPinned ? (form.pinnedAt || Date.now()) : null,
        pinnedOrder: form.isPinned ? (form.pinnedOrder || nextOrderOnCreate) : 0,
        posterUrls: mergedPosterUrls,
        type: visiblePoll ? 'poll' : 'announcement',
        createdBy: {
          uid: user?.uid || '',
          displayName: user?.displayName || user?.name || '',
          photoURL: user?.photoURL || '',
        },
      };


      if (editingData) {
        // EDIT (preserve votes)
        const refPath = `${'discoverannouncements'}/${form.id}`;
        const announcementRef = dbRef(database, refPath);
        const snapshot = await get(announcementRef);
        if (!snapshot.exists()) {
          toast.warning('Announcement does not exist! Cannot update.');
          setIsLoading(false);
          return;
        }
        const existing = snapshot.val() || {};

        const { postersFiles, id, pollData: _ignored, ...rest } = payload;
        const baseUpdates = {};
        Object.entries(rest).forEach(([k, v]) => {
          if (v === undefined) return;
          baseUpdates[`${refPath}/${k}`] = v;
        });

        const pollPatch = buildPollPatchPreserveVotes(form.id, existing.pollData, form.pollData);
        await update(dbRef(database), { ...baseUpdates, ...pollPatch });

        toast.success('Announcement updated successfully');
      } else {
        // CREATE
        const newRef = push(dbRef(database, 'discoverannouncements'));
        const { postersFiles, id, ...toPersist } = payload;
        if (!toPersist.pollData) delete toPersist.pollData;
        await set(newRef, toPersist);
        toast.success('Announcement created successfully');
      }

    } catch (error) {
      console.error("Error saving data:", error);
      toast.error('Failed to save announcement');
    } finally {
      setIsLoading(false);
      setModalOpen(false);
      setEditing(null);
      setForm(initialForm);
      setFileName('No file chosen');
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      const itemRef = dbRef(database, `${'discoverannouncements'}/${deleteData.id}`);
      await remove(itemRef);
      toast.success('Successfully deleted!');
    } catch (error) {
      console.error('Error deleting document: ', error);
      toast.error('Failed to delete');
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  const addOption = () => {
    setForm((prev) => {
      const options = prev.pollData?.options || {};
      const idx = Object.keys(options).length + 1;
      const key = `opt${idx}`;
      return {
        ...prev,
        pollData: {
          ...prev.pollData,
          options: { ...options, [key]: { text: "", votes: {} } },
        },
      };
    });
  };

  const updateOption = (key, newText) => {
    setForm(prev => ({
      ...prev,
      pollData: {
        ...prev.pollData,
        options: { ...prev.pollData.options, [key]: { ...prev.pollData.options[key], text: newText } },
      },
    }));
  };

  const removeOption = (key) => {
    setForm(prev => {
      const updated = { ...(prev.pollData?.options || {}) };
      delete updated[key];
      return { ...prev, pollData: { ...prev.pollData, options: updated } };
    });
  };

  const handleRangeChange = (item) => {
    const selected = item.selection;
    setRange([selected]);
    const bothSelected =
      selected.startDate &&
      selected.endDate &&
      selected.startDate.getTime() !== selected.endDate.getTime();
    if (bothSelected) {
      setForm((prev) => ({
        ...prev,
        date: {
          startDate: selected.startDate.toISOString(),
          endDate: selected.endDate.toISOString(),
        },
      }));
      setShowPicker(false);
    }
  };

  const formattedRange = `${format(range[0].startDate, 'MMM dd, yyyy')} - ${format(range[0].endDate, 'MMM dd, yyyy')}`;

  // ===== Render =====
  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto" style={{ paddingTop: navbarHeight || 0 }}>
      {!groupId && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <div className="font-medium mb-1">Missing group context</div>
          <div className="text-sm text-gray-700">
            Open this page from a Uniclub row, or append <code>?groupId=...&groupName=...</code> in the URL.
          </div>
          <div className="mt-3">
            <Link to="/uniclub" className="px-3 py-1.5 rounded bg-gray-200 hover:bg-gray-300 text-sm">
              ← Back to Uniclub
            </Link>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-3">
        <h1 className="text-2xl font-semibold">Announcements — {groupName}</h1>
        <button
          className="px-4 py-2 bg-black text-white rounded hover:bg-black disabled:opacity-50"
          disabled={!groupId}
          onClick={() => {
            setEditing(null);
            setForm(initialForm);
            setModalOpen(true);
          }}
        >
          + Add
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {['past', 'current', 'future'].map(key => {
          const label = key[0].toUpperCase() + key.slice(1);
          const active = timeFilter === key;
          return (
            <button
              key={key}
              onClick={() => setTimeFilter(key)}
              className={`px-3 py-1.5 rounded-full text-sm border ${active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300'}`}
            >
              {label}
            </button>
          );
        })}
        <label className="ml-2 text-sm flex items-center gap-2 border border-gray-300 rounded-full px-3 py-1 bg-white">
          <input
            type="checkbox"
            checked={showPinnedOnly}
            onChange={(e) => setShowPinnedOnly(e.target.checked)}
          />
          Show pinned only
        </label>
      </div>

      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          <button
            onClick={async () => {
              if (!window.confirm(`Delete ${selectedIds.size} announcement(s)?`)) return;
              try {
                setIsLoading(true);
                const updatesObj = {};
                selectedIds.forEach(id => { updatesObj[`${'discoverannouncements'}/${id}`] = null; });
                await update(dbRef(database), updatesObj);
                toast.success('Selected announcements deleted');
                setSelectedIds(new Set());
              } catch (err) {
                console.error(err);
                toast.error('Failed to delete selected announcements');
              } finally {
                setIsLoading(false);
              }
            }}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set(headerFiltered.map(r => r.id)))}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Select all ({headerFiltered.length})
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded shadow">
        <div>
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <FadeLoader color="#36d7b7" loading={isLoading} />
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {[
                    { key: 'title', label: 'Title' },
                    { key: 'description', label: 'Description' },
                    { key: 'date', label: 'Date' },
                    { key: 'image', label: 'Images', sortable: false },
                    { key: 'pin', label: 'Pin', sortable: false },
                    { key: 'actions', label: 'Actions', sortable: false },
                    { key: 'select', label: '', sortable: false },
                  ].map(col => (
                    <th key={col.key} className="px-6 py-3 text-left text-sm font-medium text-gray-600 select-none">
                      {col.sortable === false ? (
                        <span>{col.label}</span>
                      ) : (
                        <button
                          type="button"
                          className="flex items-center gap-1 hover:underline"
                          onClick={() => onSort(col.key)}
                          title="Sort"
                        >
                          <span>{col.label}</span>
                          {sortConfig.key === col.key && (
                            <span className="text-gray-400">
                              {sortConfig.direction === 'asc' ? '▲' : '▼'}
                            </span>
                          )}
                        </button>
                      )}
                    </th>
                  ))}
                </tr>

                <tr className="border-t border-gray-200">
                  <th className="px-6 pb-3">
                    <input
                      className="w-full border border-gray-300 p-1 rounded text-sm"
                      placeholder="Search title"
                      defaultValue={filters.title}
                      onChange={(e) => setFilterDebounced('title', e.target.value)}
                    />
                  </th>
                  <th className="px-6 pb-3">
                    <input
                      className="w-full border border-gray-300 p-1 rounded text-sm"
                      placeholder="Search description"
                      defaultValue={filters.desc}
                      onChange={(e) => setFilterDebounced('desc', e.target.value)}
                    />
                  </th>

                  {/* Date column: header calendar */}
                  <th className="px-6 pb-3 relative">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowListPicker(v => !v)}
                        className="mt-2 w-full border border-gray-300 p-1 rounded text-sm"
                        title="Filter by date range"
                      >
                        {listDateRange?.startDate && listDateRange?.endDate
                          ? `${format(listDateRange.startDate, 'MMM dd, yyyy')} – ${format(listDateRange.endDate, 'MMM dd, yyyy')}`
                          : 'Filter by date…'}
                      </button>

                      {listDateRange?.startDate && listDateRange?.endDate && (
                        <button
                          type="button"
                          onClick={() => setListDateRange(null)}
                          className="text-xs text-gray-600 underline"
                          title="Clear date filter"
                        >
                          Clear
                        </button>
                      )}
                    </div>

                    {showListPicker && (
                      <div
                        ref={listPickerRef}
                        style={{ position: 'absolute', top: '100%', zIndex: 1000, boxShadow: '0px 2px 10px rgba(0,0,0,0.2)' }}
                        className="mt-2 bg-white"
                      >
                        <DateRange
                          onChange={(item) => {
                            const sel = item.selection;
                            setListDateRange({
                              startDate: sel.startDate,
                              endDate: sel.endDate || sel.startDate,
                            });
                          }}
                          moveRangeOnFirstSelection={false}
                          ranges={[{
                            startDate: listDateRange?.startDate || new Date(),
                            endDate: listDateRange?.endDate || new Date(),
                            key: 'selection'
                          }]}
                          locale={enUS}
                        />
                        <div className="flex justify-end bg-white p-2 border border-t-0">
                          <button
                            type="button"
                            onClick={() => setShowListPicker(false)}
                            className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
                          >
                            Done
                          </button>
                        </div>
                      </div>
                    )}
                  </th>

                  <th className="px-6 pb-3" />
                  <th className="px-6 pb-3" />
                  <th className="px-6 pb-3" />
                  <th className="px-6 pb-3">
                    <input
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allPageSelected}
                      ref={el => { if (el) el.indeterminate = !allPageSelected && somePageSelected; }}
                      onChange={(e) => {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          if (e.target.checked) pageIds.forEach(id => next.add(id));
                          else pageIds.forEach(id => next.delete(id));
                          return next;
                        });
                      }}
                    />
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-200">
                {paginatedData.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                      No announcements found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((item, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <div className="flex-shrink">{item.shortdesc}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDateTime(item.date)}</td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {item.posterUrls?.[0] ? (
                          <img src={item.posterUrls[0]} alt="" width={80} height={80} className="rounded" />
                        ) : null}
                        {item.posterUrls?.length > 1 && (
                          <div className="text-xs text-gray-500 mt-1">+{item.posterUrls.length - 1} more</div>
                        )}
                      </td>

                      {/* Pin + order */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            title={item.isPinned ? 'Unpin' : 'Pin'}
                            onClick={() => togglePin(item, !item.isPinned)}
                            className={`text-lg leading-none ${item.isPinned ? 'text-yellow-500' : 'text-gray-400'} hover:opacity-80`}
                            aria-label={item.isPinned ? 'Unpin announcement' : 'Pin announcement'}
                          >
                            {item.isPinned ? '★' : '☆'}
                          </button>

                          {item.isPinned && (
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={Number(item.pinnedOrder || 0)}
                                onChange={(e) => setPinnedOrder(item, e.target.value)}
                                className="w-16 border border-gray-300 rounded px-2 py-0.5 text-sm"
                                title="Pinned order (lower = higher)"
                              />
                              <button
                                type="button"
                                onClick={() => nudgeOrder(item, -1)}
                                className="text-xs border rounded px-2 py-0.5"
                                title="Move up"
                              >
                                ↑
                              </button>
                              <button
                                type="button"
                                onClick={() => nudgeOrder(item, 1)}
                                className="text-xs border rounded px-2 py-0.5"
                                title="Move down"
                              >
                                ↓
                              </button>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing(item);
                            const startDate = item.date?.startDate?.seconds
                              ? new Date(item.date.startDate.seconds * 1000)
                              : new Date(item.date.startDate);
                            const endDate = item.date?.endDate?.seconds
                              ? new Date(item.date.endDate.seconds * 1000)
                              : new Date(item.date.endDate);

                            setForm(prev => ({
                              ...prev,
                              ...item,
                              id: item.id,
                              date: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
                              postersFiles: [],
                              posterUrls: item.posterUrls || [],
                              pollData: {
                                ...(item.pollData || { question: '', allowMulti: false, allowaddoption: false, options: { opt1: { text: '' }, opt2: { text: '' } } }),
                                options: (item.pollData?.options) || { opt1: { text: '' }, opt2: { text: '' } },
                              },
                              pinnedOrder: Number.isFinite(item.pinnedOrder) ? Number(item.pinnedOrder) : 0,
                            }));
                            setRange([{ startDate, endDate, key: 'selection' }]);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => { setDelete(item); setForm(item); setConfirmDeleteOpen(true); }}
                        >
                          Delete
                        </button>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={(e) => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(item.id); else next.delete(item.id);
                              return next;
                            });
                          }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="flex justify-between items-center mt-4">
        <p className="text-sm text-gray-600">Page {currentPage} of {totalPages}</p>
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

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4">{editingData ? 'Edit Announcement' : 'Add Announcement'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <input
                  name="title"
                  placeholder="Title"
                  value={form.title}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
                <input
                  name="shortdesc"
                  placeholder="Short Description"
                  value={form.shortdesc}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />
                <textarea
                  name="description"
                  placeholder="Description"
                  value={form.description}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                  required
                />

                {/* Pin controls in form (optional) */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="isPinned"
                      checked={!!form.isPinned}
                      onChange={handleChange}
                    />
                    <span>Pin</span>
                  </label>
                  {form.isPinned && (
                    <>
                      <span className="text-sm text-gray-500">Order</span>
                      <input
                        type="number"
                        name="pinnedOrder"
                        value={Number(form.pinnedOrder || 0)}
                        onChange={handleChange}
                        className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </>
                  )}
                </div>

                <label>Date Range</label>
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value={form.date?.startDate && form.date?.endDate
                      ? `${format(new Date(form.date.startDate), 'MMM dd, yyyy')} - ${format(new Date(form.date.endDate), 'MMM dd, yyyy')}`
                      : ''
                    }
                    onClick={() => setShowPicker(!showPicker)}
                    className="w-full border border-gray-300 p-2 rounded"
                  />
                  {showPicker && (
                    <div
                      ref={pickerRef}
                      style={{ position: 'absolute', top: 50, zIndex: 1000, boxShadow: '0px 2px 10px rgba(0,0,0,0.2)' }}
                    >
                      <DateRange
                        editableDateInputs
                        onChange={handleRangeChange}
                        moveRangeOnFirstSelection={false}
                        ranges={range}
                        minDate={new Date()}
                        locale={enUS}
                      />
                    </div>
                  )}
                </div>

                <label className="block font-medium">Posters (you can add multiple)</label>
                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      name="postersFiles"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleChange}
                    />
                    📁 Choose File(s)
                  </label>
                  <span className="text-sm text-gray-600 truncate max-w-[220px]">{fileName}</span>
                </div>

                {form.posterUrls?.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {form.posterUrls.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`Poster ${idx + 1}`} className="w-full h-20 object-cover rounded border" />
                        <button
                          type="button"
                          title="Remove image"
                          onClick={() => {
                            setForm(prev => ({
                              ...prev,
                              posterUrls: prev.posterUrls.filter((_, i) => i !== idx),
                            }));
                          }}
                          className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {form.postersFiles?.length > 0 && (
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {form.postersFiles.map((f, idx) => {
                      const blobUrl = URL.createObjectURL(f);
                      return (
                        <div key={idx} className="relative">
                          <img src={blobUrl} alt={`Selected ${idx + 1}`} className="w-full h-20 object-cover rounded border" />
                          <button
                            type="button"
                            title="Remove file"
                            onClick={() => {
                              setForm(prev => {
                                const next = [...prev.postersFiles];
                                next.splice(idx, 1);
                                return { ...prev, postersFiles: next };
                              });
                            }}
                            className="absolute -top-2 -right-2 bg-gray-700 text-white rounded-full w-6 h-6 text-xs"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <button
                  type="button"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => setVisiblePoll(v => !v)}
                >
                  {visiblePoll ? 'Hide Poll' : 'Create/Edit Poll'}
                </button>

                {visiblePoll && (
                  <div>
                    <label>Question</label>
                    <input
                      type="text"
                      name="question"
                      placeholder="Ask question"
                      value={form.pollData.question}
                      onChange={handleChange}
                      className="w-full border border-gray-300 mb-2 p-2 rounded"
                    />
                    {form.pollData?.options &&
                      Object.entries(form.pollData.options).map(([key, opt], idx) => (
                        <div key={key} className="flex items-center gap-2 mb-2">
                          <input
                            className="flex-1 border border-gray-300 p-2 rounded"
                            placeholder={`opt ${idx + 1}`}
                            value={opt.text || ''}
                            onChange={e => updateOption(key, e.target.value)}
                          />
                          <button
                            type="button"
                            onClick={() => removeOption(key)}
                            className="text-red-600 text-sm hover:underline"
                          >
                            ❌
                          </button>
                        </div>
                      ))}

                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                      onClick={addOption}
                    >
                      + Add option
                    </button>

                    <div className="flex items-center gap-4 mt-4 cursor-pointer select-none">
                      <label htmlFor="toggleMulti" className="text-sm font-medium text-gray-700">
                        Allow multiple answers
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          id="toggleMulti"
                          name="allowMulti"
                          checked={!!form.pollData.allowMulti}
                          onChange={handleChange}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-500 transition-colors duration-300"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 peer-checked:translate-x-5"></div>
                      </label>
                    </div>

                    <div className="flex items-center gap-4 mt-4 cursor-pointer select-none">
                      <label htmlFor="toggleAdd" className="text-sm font-medium text-gray-700">
                        Allow user to add option
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          id="toggleAdd"
                          name="allowaddoption"
                          checked={!!form.pollData.allowaddoption}
                          onChange={handleChange}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors duration-300"></div>
                        <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 peer-checked:translate-x-5"></div>
                      </label>
                    </div>
                  </div>
                )}

                <input
                  name="link"
                  placeholder="News Link"
                  value={form.link}
                  onChange={handleChange}
                  className="w-full border border-gray-300 p-2 rounded"
                />
              </div>

              <div className="flex justify-end mt-6 space-x-3">
                <button
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                  type="button"
                >
                  Cancel
                </button>
                <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmDeleteOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Announcement</h2>
            <p className="mb-4">
              Are you sure you want to delete <strong>{deleteData?.title}</strong>?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setConfirmDeleteOpen(false); setDelete(null); }}
                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
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
