import React, { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, getDocs, updateDoc, doc, setDoc, deleteDoc,
  query, where, getDoc, Timestamp, writeBatch
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import * as XLSX from "xlsx";
import { MenuItem, Select, Checkbox, ListItemText } from '@mui/material';
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import diningMenuFile from "../../assets/excel/dining_menu.xlsx";

export default function DiningMenuPage(props) {
  const { navbarHeight } = props;

  // UI + data state
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteData, setDelete] = useState(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editingData, setEditing] = useState(null);

  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [data, setData] = useState([]);

  // Anchor date (controls which week we consider “current”)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  // Week mode: past = previous week, current = week of anchor date, future = next week
  const [weekMode, setWeekMode] = useState('current'); // 'past' | 'current' | 'future'

  const [fileName, setFileName] = useState('No file chosen');
  const [currentPage, setCurrentPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const headerCheckboxRef = useRef(null);

  const uid = useSelector((state) => state.auth.user.uid);
  const emp = useSelector((state) => state.auth.employee);

  const [form, setForm] = useState({
    date: '',
    day: '',
    meals: {
      breakfast: { time: '', items: [{ name: '', tags: [] }] },
      lunch: { time: '', items: [{ name: '', tags: [] }] },
      dinner: { time: '', items: [{ name: '', tags: [] }] }
    },
    uid: uid,
    hostelid: emp?.hostelid
  });

  // ================= Helpers: week range =================
  const addDays = (d, days) => {
    const nd = new Date(d);
    nd.setDate(nd.getDate() + days);
    return nd;
    };
  const fmt = (x) => x.toISOString().split("T")[0];

  const getWeekRange = (dateStr, mode = 'current') => {
    const base = new Date(dateStr);
    const offsetDays = mode === 'past' ? -7 : mode === 'future' ? 7 : 0;
    const anchor = addDays(base, offsetDays);
    const day = anchor.getDay(); // 0=Sun
    const diffToMonday = anchor.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(anchor.setDate(diffToMonday));
    const sunday = addDays(monday, 6);
    return { start: fmt(monday), end: fmt(sunday), label: `${fmt(monday)} → ${fmt(sunday)}` };
  };

  // ================= Load menus for selected week =================
  const getList = async (dateStr, mode) => {
    setIsLoading(true);
    try {
      const { start, end } = getWeekRange(dateStr, mode);
      const qy = query(
        collection(db, 'menus'),
        where("hostelid", "==", emp.hostelid),
        where("date", ">=", start),
        where("date", "<=", end),
      );
      const querySnapshot = await getDocs(qy);
      const weekMenus = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // sort by date ASC for consistent display
      weekMenus.sort((a,b) => a.date.localeCompare(b.date));
      setList(weekMenus);
      setSelectedIds(new Set()); // clear selection on refresh
      setCurrentPage(1);         // reset pagination when week changes
    } catch (e) {
      console.error(e);
      toast.error("Failed to load menus");
    } finally {
      setIsLoading(false);
    }
  };

  // initial load (current week)
  useEffect(() => {
    getList(date, 'current');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when weekMode changes
  useEffect(() => {
    getList(date, weekMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekMode]);

  // Reload when anchor date changes (stay on current week of the new date)
  useEffect(() => {
    setWeekMode('current');
    getList(date, 'current');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  // ================= CRUD =================
  const getDayFromDate = (dateString) => {
    const d = new Date(dateString);
    return d.toLocaleDateString('en-US', { weekday: 'long' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.date) {
      toast.warning("Please select a date.");
      return;
    }
    try {
      const menusRef = collection(db, 'menus');
      if (editingData) {
        const docId = `${editingData.date}_${editingData.hostelid}`;
        await updateDoc(doc(menusRef, docId), form);
        toast.success("Menu updated successfully!");
      } else {
        // prevent duplicate (date + hostel)
        const qy = query(
          menusRef,
          where("date", "==", form.date),
          where("hostelid", "==", emp.hostelid)
        );
        const qs = await getDocs(qy);
        if (!qs.empty) {
          toast.warn("Menu for this date and hostel already exists!");
          return;
        }
        const docId = `${form.date}_${emp.hostelid}`;
        await setDoc(doc(menusRef, docId), form);
        toast.success("Menu created successfully!");
      }

      setModalOpen(false);
      getList(date, weekMode);
      setForm({
        date: '',
        day: '',
        meals: {
          breakfast: { time: '', items: [{ name: '', tags: [] }] },
          lunch: { time: '', items: [{ name: '', tags: [] }] },
          dinner: { time: '', items: [{ name: '', tags: [] }] }
        },
        uid: uid,
        hostelid: emp.hostelid
      });
    } catch (error) {
      console.error("Error saving data:", error);
      toast.error("Save failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteData?.id) return;
    try {
      await deleteDoc(doc(db, 'menus', deleteData.id));
      toast.success('Successfully deleted!');
      getList(date, weekMode);
    } catch (error) {
      console.error('Error deleting document: ', error);
      toast.error("Delete failed");
    }
    setConfirmDeleteOpen(false);
    setDelete(null);
  };

  // ================= Excel ingest =================
  const readExcel = (file) => {
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const workbook = XLSX.read(bstr, { type: "binary" });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const nestedData = [];
      const groupedByDate = {};

      jsonData.forEach(({ Date, Day, Meal, Time, Menu_Items, Tags }) => {
        let formattedDate;
        if (typeof Date === 'number') {
          formattedDate = XLSX.SSF.format("yyyy-mm-dd", Date);
        } else if (Date instanceof Date) {
          formattedDate = Date.toISOString().split('T')[0];
        } else {
          formattedDate = new Date(Date).toISOString().split('T')[0];
        }

        const key = formattedDate + "|" + Day;
        const mealKey = (Meal || '').toLowerCase();

        if (!groupedByDate[key]) {
          groupedByDate[key] = {
            date: formattedDate,
            day: Day,
            meals: {},
            uid: uid,
            hostelid: emp.hostelid
          };
        }

        if (!groupedByDate[key].meals[mealKey]) {
          groupedByDate[key].meals[mealKey] = { time: Time || '', items: [] };
        }

        const tagsArray = typeof Tags === 'string'
          ? Tags.split(',').map(tag => tag.trim()).filter(Boolean)
          : [];

        groupedByDate[key].meals[mealKey].items.push({
          name: Menu_Items,
          tags: tagsArray
        });
      });

      for (const k in groupedByDate) nestedData.push(groupedByDate[k]);

      setData(nestedData);
      setIsLoading(false);
    };
    reader.readAsBinaryString(file);
  };

  const saveToFirebase = async () => {
    setIsLoading(true);
    try {
      const menusRef = collection(db, "menus");
      for (const entry of data) {
        const qy = query(
          menusRef,
          where("date", "==", entry.date),
          where("hostelid", "==", entry.hostelid)
        );
        const qs = await getDocs(qy);
        if (!qs.empty) {
          toast.warn(`Menu for ${entry.date} already exists. Skipping...`);
          continue;
        }
        const docId = `${entry.date}_${entry.hostelid}`;
        await setDoc(doc(menusRef, docId), entry);
      }
      toast.success("Data saved!");
      getList(date, weekMode);
      setFileName('No file chosen');
    } catch (error) {
      console.error("Error saving data: ", error);
      toast.error("Upload failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    const response = await fetch(diningMenuFile);
    const blob = await response.blob();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "dining_menu.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ================= Dietary tags =================
  const dietaryTags = [
    { id: 'V', name: 'Vegetarian' }, { id: 'VG', name: 'Vegan' }, { id: 'VGO', name: 'Vegan Option' },
    { id: 'GF', name: 'Gluten-Free' }, { id: 'DF', name: 'Dairy-Free' }, { id: 'DFO', name: 'Dairy-Free Option' },
    { id: 'NF', name: 'Nut-Free' }, {id:'CN',name:'Contains Nuts'},{ id: 'SF', name: 'Shellfish-Free' }, { id: 'SF-C', name: 'Contains Shellfish' },
    { id: 'CSF', name: 'Contains Seafood' }, { id: 'EF', name: 'Egg-Free' }, { id: 'HF', name: 'Halal-Friendly' },
    { id: 'KF', name: 'Kosher-Friendly' }, { id: 'SOYF', name: 'Soy-Free' }, { id: 'P', name: 'Contains Pork' },
    { id: 'NV', name: 'Non-Vegetarian' }, { id: 'PS', name: 'Pescatarian' },
  ];

  // ================= Pagination (on loaded week) =================
  const pageSize = 10;
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = list.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  // ================= Selection logic =================
  const pageIds = paginatedData.map(r => r.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedIds.has(id));
  const somePageSelected = pageIds.some(id => selectedIds.has(id)) && !allPageSelected;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = somePageSelected;
    }
  }, [somePageSelected, allPageSelected]);

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Delete ${selectedIds.size} menu(s)?`)) return;

    setIsLoading(true);
    try {
      const ids = Array.from(selectedIds);
      const chunkSize = 450;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.delete(doc(db, "menus", id)));
        await batch.commit();
      }
      toast.success("Selected menus deleted");
      setSelectedIds(new Set());
      getList(date, weekMode);
    } catch (err) {
      console.error(err);
      toast.error("Bulk delete failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ================= UI =================
  const { label: weekLabel } = getWeekRange(date, weekMode);

  return (
    <main className="flex-1 p-6 bg-gray-100 overflow-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-semibold">Dining Menu</h1>
          <div className="text-xs text-gray-500 mt-1">Week: {weekLabel}</div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="date"
            value={date}
            className="border px-3 py-2 rounded-lg"
            onChange={(e) => setDate(e.target.value)}
          />

          <div className="flex items-center gap-2">
            {['past','current','future'].map(k => {
              const active = weekMode === k;
              return (
                <button
                  key={k}
                  onClick={() => setWeekMode(k)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    active ? 'bg-black text-white border-black' : 'bg-white text-gray-700 border-gray-300'
                  }`}
                >
                  {k[0].toUpperCase() + k.slice(1)}
                </button>
              );
            })}
          </div>

          <button
            className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
            onClick={handleDownload}
          >
            Download Excel File
          </button>

          <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files.length > 0) setFileName(e.target.files[0].name);
                  else setFileName('No file chosen');
                  const file = e.target.files[0];
                  if (file) readExcel(file);
                }}
              />
              📁 Choose File
            </label>
            <span className="text-sm text-gray-600 truncate max-w-[150px]">
              {fileName}
            </span>
          </div>

          <button
            className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
            disabled={!data.length || isLoading}
            onClick={saveToFirebase}
          >
            Upload Excel
          </button>

          <button
            className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
            onClick={() => {
              setModalOpen(true);
              setEditing(null);
            }}
          >
            + Add
          </button>
        </div>
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="mb-2 flex items-center gap-3">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
          >
            Delete selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set(list.map(r => r.id)))}
            className="px-3 py-1.5 bg-gray-200 rounded text-sm"
          >
            Select all ({list.length})
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
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-100">
                <tr>
                  
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Day</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Breakfast</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Lunch</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Dinner</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Actions</th>
                  <th className="px-4 py-3">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      aria-label="Select all on page"
                      checked={allPageSelected}
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
                      No menus found.
                    </td>
                  </tr>
                ) : (
                  paginatedData.map((menu) => (
                    <tr key={menu.id}>
                    
                      <td className="px-4 py-3 whitespace-nowrap text-gray-800 font-medium">{menu.date}</td>
                      <td className="px-4 py-3 text-gray-700">{menu.day}</td>

                      {['breakfast', 'lunch', 'dinner'].map((meal) => (
                        <td key={meal} className="px-4 py-3 align-top w-1/4">
                          <ul className="space-y-2">
                            {menu.meals?.[meal]?.items?.map((item, i) => (
                              <li key={i}>
                                <div className="font-semibold text-gray-900">{item.name}</div>
                                {item.tags?.length > 0 && (
                                  <div className="text-xs text-gray-500">
                                    {item.tags.map((tag, index) => (
                                      <span
                                        key={index}
                                        className="inline-block bg-gray-100 border border-gray-300 text-gray-600 text-xs px-1.5 py-0.5 mr-1 rounded"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </li>
                            ))}
                          </ul>
                        </td>
                      ))}

                      <td className="px-4 py-3 text-sm">
                        <button
                          className="text-blue-600 hover:underline mr-3"
                          onClick={() => {
                            setEditing(menu);
                            setForm(menu);
                            setModalOpen(true);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          className="text-red-600 hover:underline"
                          onClick={() => {
                            setConfirmDeleteOpen(true);
                            setDelete(menu);
                          }}
                        >
                          Delete
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(menu.id)}
                          onChange={(e) => {
                            setSelectedIds(prev => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(menu.id);
                              else next.delete(menu.id);
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

      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4">
              {editingData ? 'Edit Dining Menu' : 'Add Dining Menu'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block font-medium mb-1">Date:</label>
                <input
                  type="date"
                  value={form.date}
                  disabled={editingData !== null}
                  className="w-full border border-gray-300 p-2 rounded"
                  onChange={(e) => {
                    const selectedDate = e.target.value;
                    const day = getDayFromDate(selectedDate);
                    setForm(prev => ({ ...prev, date: selectedDate, day }));
                  }}
                  required
                />
              </div>

              <div>
                <label className="block font-medium mb-1">Day:</label>
                <input
                  type="text"
                  value={form.day}
                  disabled
                  className="w-full border border-gray-300 p-2 rounded"
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                  required
                />
              </div>

              {['breakfast', 'lunch', 'dinner'].map((meal) => (
                <div key={meal} className="border border-gray-200 p-4 rounded mb-4">
                  <h3 className="text-lg font-semibold capitalize mb-2">{meal}</h3>

                  <label className="block font-medium mb-1">Time:</label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 p-2 rounded mb-3"
                    value={form.meals[meal]?.time}
                    onChange={(e) => {
                      setForm({
                        ...form,
                        meals: {
                          ...form.meals,
                          [meal]: { ...form.meals[meal], time: e.target.value }
                        }
                      });
                    }}
                    required
                  />

                  {form.meals[meal]?.items.map((item, index) => (
                    <div key={index} className="mb-2 space-y-4">
                      <input
                        type="text"
                        className="w-full border border-gray-300 p-2 rounded"
                        placeholder={`Item ${index + 1}`}
                        value={item.name}
                        onChange={(e) => {
                          const updatedItems = [...form.meals[meal]?.items];
                          updatedItems[index].name = e.target.value;
                          setForm({
                            ...form,
                            meals: {
                              ...form.meals,
                              [meal]: {
                                ...form.meals[meal],
                                items: updatedItems
                              }
                            }
                          });
                        }}
                        required
                      />

                      <Select
                        className="w-full"
                        multiple
                        displayEmpty
                        value={item.tags}
                        onChange={(e) => {
                          const selected = e.target.value;
                          const updatedItems = [...form.meals[meal]?.items];
                          updatedItems[index].tags = selected;
                          setForm({
                            ...form,
                            meals: {
                              ...form.meals,
                              [meal]: {
                                ...form.meals[meal],
                                items: updatedItems,
                              },
                            },
                          });
                        }}
                        renderValue={(selected) =>
                          selected.length
                            ? selected
                                .map((id) => {
                                  const tag = dietaryTags.find((t) => t.id === id);
                                  return tag?.name || id;
                                })
                                .join(", ")
                            : "Select Tags"
                        }
                      >
                        {dietaryTags.map(({ id, name }) => (
                          <MenuItem key={id} value={id}>
                            <Checkbox checked={item.tags.includes(id)} />
                            <ListItemText primary={name} />
                          </MenuItem>
                        ))}
                      </Select>

                      <div>
                        <button
                          type="button"
                          onClick={() => {
                            const updated = form.meals[meal].items.filter((_, i) => i !== index);
                            setForm({
                              ...form,
                              meals: {
                                ...form.meals,
                                [meal]: { ...form.meals[meal], items: updated }
                              }
                            });
                          }}
                          className="text-red-500 hover:text-red-700"
                          title="Delete item"
                        >
                          ❌ Remove Item
                        </button>
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({
                        ...prev,
                        meals: {
                          ...prev.meals,
                          [meal]: {
                            ...prev.meals[meal],
                            items: [...(prev.meals[meal]?.items || []), { name: "", tags: [] }]
                          }
                        }
                      }));
                    }}
                    className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Add Item
                  </button>
                </div>
              ))}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
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
            <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Dining Menu</h2>
            <p className="mb-4">
              Are you sure you want to delete{" "}
              <strong>{deleteData?.date} — {deleteData?.day}</strong>?
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
