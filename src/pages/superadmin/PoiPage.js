import React, { useState, useEffect, useRef } from "react";
import {
    collection,
    addDoc,
    getDocs,
    updateDoc,
    doc,
    deleteDoc,
    getDoc,
    query,
    where,
    writeBatch,
} from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import * as XLSX from "xlsx";
import poiFile from "../../assets/excel/Poi.xlsx";

export default function PoiPage(props) {
    const { navbarHeight } = props;

    const [modalOpen, setModalOpen] = useState(false);
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

    const [list, setList] = useState([]);
    const [fileName, setFileName] = useState("No file chosen");
    const [data, setData] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const uid = useSelector((state) => state.auth.user?.uid);
    const emp = useSelector((state) => state.auth.employee);

    const [filters, setFilters] = useState({
        campus: "",
        name: "",
        description: "",
        buildingCode: "",
        categories: "",
    });

    const [sortConfig, setSortConfig] = useState({
        key: "name",
        direction: "asc",
    });

    const debounceRef = useRef(null);
    const setFilterDebounced = (field, value) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(
            () =>
                setFilters((prev) => ({
                    ...prev,
                    [field]: value,
                })),
            250
        );
    };

    const onSort = (key) => {
        setSortConfig((prev) =>
            prev.key === key
                ? {
                    key,
                    direction: prev.direction === "asc" ? "desc" : "asc",
                }
                : { key, direction: "asc" }
        );
    };

    // Pagination + selection
    const [currentPage, setCurrentPage] = useState(1);
    const pageSize = 10;
    const [selectedIds, setSelectedIds] = useState(new Set());
    const headerCheckboxRef = useRef(null);

    const initialForm = {
        id: "",
        campus: "",
        name: "",
        description: "",
        buildingCode: "",
        latitude: "",
        longitude: "",
        categories: "",
        source: "",
    };

    const [form, setForm] = useState(initialForm);

    // =========================
    // Fetch POIs
    // =========================
    const getList = async () => {
        // if (!emp?.uid) return;
        setIsLoading(true);
        try {
            const qy = query(
                collection(db, "poi"),
                where("uid", "==", emp.uid)
            );
            const qs = await getDocs(qy);
            const documents = qs.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));
            setList(documents);
            setSelectedIds(new Set());
            setCurrentPage(1);
        } catch (err) {
            console.error(err);
            toast.error("Failed to load POIs");
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        getList();
    }, [emp?.uid]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filters, sortConfig]);

    const handleAdd = async (e) => {
        e.preventDefault();

        if (!form.name || !form.campus) {
            toast.warning("Campus and Name are required");
            return;
        }

        try {
            if (editingData) {
                const docRef = doc(db, "poi", form.id);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    toast.warning("POI does not exist! Cannot update.");
                    return;
                }

                await updateDoc(docRef, {
                    campus: form.campus,
                    name: form.name,
                    description: form.description,
                    buildingCode: form.buildingCode,
                    latitude:
                        form.latitude === "" ? "" : Number(form.latitude),
                    longitude:
                        form.longitude === "" ? "" : Number(form.longitude),
                    categories: form.categories,
                    source: form.source,
                    uid: emp.uid,
                    updatedBy: uid || null,
                    updatedDate: new Date(),
                });

                toast.success("POI updated");
            } else {
                await addDoc(collection(db, "poi"), {
                    campus: form.campus,
                    name: form.name,
                    description: form.description,
                    buildingCode: form.buildingCode,
                    latitude:
                        form.latitude === "" ? "" : Number(form.latitude),
                    longitude:
                        form.longitude === "" ? "" : Number(form.longitude),
                    categories: form.categories,
                    source: form.source,
                    uid: emp.uid,
                    createdBy: uid || null,
                    createdDate: new Date(),
                });

                toast.success("POI saved");
            }

            await getList();
        } catch (error) {
            console.error("Error saving POI:", error);
            toast.error("Error saving POI");
        }

        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
    };
    const handleDelete = async () => {
        if (!deleteData) return;
        try {
            await deleteDoc(doc(db, "poi", deleteData.id));
            toast.success("Deleted");
            await getList();
        } catch (error) {
            console.error("Error deleting document: ", error);
            toast.error("Error deleting");
        }
        setConfirmDeleteOpen(false);
        setDelete(null);
    };
    const readExcel = (file) => {
        setIsLoading(true);

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target.result;
                const workbook = XLSX.read(bstr, { type: "binary" });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                const cleanedData = jsonData.map((row) => ({
                    campus: row["Campus"] || "",
                    name: row["Name"] || "",
                    description: row["Description"] || "",
                    buildingCode:
                        row["Building Code"] !== undefined
                            ? String(row["Building Code"])
                            : "",
                    latitude:
                        row["Latitude"] === undefined ||
                            row["Latitude"] === ""
                            ? ""
                            : Number(row["Latitude"]),
                    longitude:
                        row["Longitude"] === undefined ||
                            row["Longitude"] === ""
                            ? ""
                            : Number(row["Longitude"]),
                    categories: row["Categories"] || "",
                    source: row["Source"] || "",
                    uid: emp.uid
                }));
                setData(cleanedData);
            } catch (e) {
                console.error(e);
                toast.error("Failed to read Excel file");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const saveToFirebase = async () => {
        if (!data.length) return;
        setIsLoading(true);

        try {
            for (const entry of data) {
                if (!entry.name || !entry.campus) continue;
                const qy = query(
                    collection(db, "poi"),
                    where("campus", "==", entry.campus),
                    where("name", "==", entry.name),
                    where(
                        "buildingCode",
                        "==",
                        entry.buildingCode || ""
                    )
                );
                const qs = await getDocs(qy);
                if (!qs.empty) {
                    toast.warn(
                        `Duplicate skipped: ${entry.campus} - ${entry.name}`
                    );
                    continue;
                }

                await addDoc(collection(db, "poi"), {
                    ...entry,
                    createdBy: uid || null,
                    createdDate: new Date(),
                });
            }

            toast.success("POIs uploaded (duplicates skipped)");
            setFileName("No file chosen");
            setData([]);
            await getList();
        } catch (error) {
            console.error("Error saving data: ", error);
            toast.error("Error during upload");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDownload = async () => {
        const response = await fetch(poiFile);
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "Poi.xlsx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };
    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (
            !window.confirm(
                `Delete ${selectedIds.size} POI record(s)?`
            )
        )
            return;

        setIsLoading(true);
        try {
            const ids = Array.from(selectedIds);
            const chunkSize = 450;

            for (let i = 0; i < ids.length; i += chunkSize) {
                const chunk = ids.slice(i, i + chunkSize);
                const batch = writeBatch(db);
                chunk.forEach((id) =>
                    batch.delete(doc(db, "poi", id))
                );
                await batch.commit();
            }

            toast.success("Selected POIs deleted");
            setSelectedIds(new Set());
            await getList();
        } catch (err) {
            console.error(err);
            toast.error("Bulk delete failed");
        } finally {
            setIsLoading(false);
        }
    };
    const filtered = list.filter((item) => {
        const campus = (item.campus || "").toLowerCase();
        const name = (item.name || "").toLowerCase();
        const description = (item.description || "").toLowerCase();
        const buildingCode = (item.buildingCode || "")
            .toString()
            .toLowerCase();
        const categories = (item.categories || "").toLowerCase();

        return (
            campus.includes(filters.campus.toLowerCase()) &&
            name.includes(filters.name.toLowerCase()) &&
            description.includes(
                filters.description.toLowerCase()
            ) &&
            buildingCode.includes(
                filters.buildingCode.toLowerCase()
            ) &&
            categories.includes(
                filters.categories.toLowerCase()
            )
        );
    });

    const sortedData = [...filtered].sort((a, b) => {
        const dir = sortConfig.direction === "asc" ? 1 : -1;
        const key = sortConfig.key;

        if (key === "latitude" || key === "longitude") {
            const va =
                a[key] === "" || a[key] === undefined
                    ? 0
                    : Number(a[key]);
            const vb =
                b[key] === "" || b[key] === undefined
                    ? 0
                    : Number(b[key]);
            return (va - vb) * dir;
        }

        const va = (a[key] || "")
            .toString()
            .toLowerCase();
        const vb = (b[key] || "")
            .toString()
            .toLowerCase();
        return va.localeCompare(vb) * dir;
    });

    const totalPages = Math.max(
        1,
        Math.ceil(sortedData.length / pageSize)
    );
    const paginatedData = sortedData.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );

    const pageIds = paginatedData.map((r) => r.id);
    const allPageSelected =
        pageIds.length > 0 &&
        pageIds.every((id) => selectedIds.has(id));
    const somePageSelected =
        pageIds.some((id) => selectedIds.has(id)) &&
        !allPageSelected;

    useEffect(() => {
        if (headerCheckboxRef.current) {
            headerCheckboxRef.current.indeterminate =
                somePageSelected;
        }
    }, [somePageSelected, allPageSelected]);

    // =========================
    // UI
    // =========================
    return (
        <main
            className="flex-1 p-6 bg-gray-100 overflow-auto"
            style={{ paddingTop: navbarHeight || 0 }}
        >
            <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
                <div>
                    <h1 className="text-2xl font-semibold">
                        Points of Interest
                    </h1>
                    {/* <p className="text-sm text-gray-600">
                        Manage campus POIs from Excel or add them
                        manually.
                    </p> */}
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    <button
                        className="bg-black text-white px-6 py-2 rounded-xl hover:bg-gray-800 transition"
                        onClick={handleDownload}
                    >
                        Download Excel Template
                    </button>

                    <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                        <label className="cursor-pointer">
                            <input
                                type="file"
                                accept=".xlsx, .xls"
                                className="hidden"
                                onChange={(e) => {
                                    if (
                                        e.target.files
                                            .length > 0
                                    )
                                        setFileName(
                                            e.target
                                                .files[0].name
                                        );
                                    else
                                        setFileName(
                                            "No file chosen"
                                        );
                                    const file =
                                        e.target.files[0];
                                    if (file)
                                        readExcel(file);
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
                        className="px-4 py-2 bg-black text-white rounded hover:bg-gray-900"
                        onClick={() => {
                            setEditing(null);
                            setForm(initialForm);
                            setModalOpen(true);
                        }}
                    >
                        + Add POI
                    </button>
                </div>
            </div>

            {/* Bulk actions */}
            {selectedIds.size > 0 && (
                <div className="mb-2 flex items-center gap-3">
                    <span className="text-sm text-gray-700">
                        {selectedIds.size} selected
                    </span>
                    <button
                        onClick={handleBulkDelete}
                        className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                    >
                        Delete selected
                    </button>
                    <button
                        onClick={() =>
                            setSelectedIds(
                                new Set(
                                    sortedData.map(
                                        (r) => r.id
                                    )
                                )
                            )
                        }
                        className="px-3 py-1.5 bg-gray-200 rounded text-sm"
                    >
                        Select all (
                        {sortedData.length})
                    </button>
                    <button
                        onClick={() =>
                            setSelectedIds(new Set())
                        }
                        className="px-3 py-1.5 bg-gray-200 rounded text-sm"
                    >
                        Clear selection
                    </button>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto bg-white rounded shadow">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <FadeLoader
                            color="#36d7b7"
                            loading={isLoading}
                        />
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            {/* Row 1: sortable headers */}
                            <tr>
                                {[
                                    {
                                        key: "campus",
                                        label: "Campus",
                                    },
                                    {
                                        key: "name",
                                        label: "Name",
                                    },
                                    {
                                        key: "description",
                                        label: "Description",
                                    },
                                    {
                                        key: "buildingCode",
                                        label: "Building Code",
                                    },
                                    {
                                        key: "latitude",
                                        label: "Lat",
                                    },
                                    {
                                        key: "longitude",
                                        label: "Lng",
                                    },
                                    {
                                        key: "categories",
                                        label: "Categories",
                                    },
                                    {
                                        key: "source",
                                        label: "Source",
                                    },
                                    {
                                        key: "actions",
                                        label: "Actions",
                                        sortable: false,
                                    },
                                    {
                                        key: "select",
                                        label: "",
                                        sortable: false,
                                    },
                                ].map((col) => (
                                    <th
                                        key={col.key}
                                        className="px-4 py-3 text-left text-xs font-medium text-gray-600 select-none"
                                    >
                                        {col.sortable ===
                                            false ? (
                                            <span>
                                                {
                                                    col.label
                                                }
                                            </span>
                                        ) : (
                                            <button
                                                type="button"
                                                className="flex items-center gap-1 hover:underline"
                                                onClick={() =>
                                                    onSort(
                                                        col.key
                                                    )
                                                }
                                                title="Sort"
                                            >
                                                <span>
                                                    {
                                                        col.label
                                                    }
                                                </span>
                                                {sortConfig.key ===
                                                    col.key && (
                                                        <span className="text-gray-400">
                                                            {sortConfig.direction ===
                                                                "asc"
                                                                ? "▲"
                                                                : "▼"}
                                                        </span>
                                                    )}
                                            </button>
                                        )}
                                    </th>
                                ))}
                            </tr>

                            {/* Row 2: filters */}
                            <tr className="border-t border-gray-200 text-xs">
                                <th className="px-4 pb-3">
                                    <input
                                        className="w-full border border-gray-300 p-1 rounded"
                                        placeholder="Filter campus"
                                        defaultValue={
                                            filters.campus
                                        }
                                        onChange={(e) =>
                                            setFilterDebounced(
                                                "campus",
                                                e.target
                                                    .value
                                            )
                                        }
                                    />
                                </th>
                                <th className="px-4 pb-3">
                                    <input
                                        className="w-full border border-gray-300 p-1 rounded"
                                        placeholder="Filter name"
                                        defaultValue={
                                            filters.name
                                        }
                                        onChange={(e) =>
                                            setFilterDebounced(
                                                "name",
                                                e.target
                                                    .value
                                            )
                                        }
                                    />
                                </th>
                                <th className="px-4 pb-3">
                                    <input
                                        className="w-full border border-gray-300 p-1 rounded"
                                        placeholder="Filter description"
                                        defaultValue={
                                            filters.description
                                        }
                                        onChange={(e) =>
                                            setFilterDebounced(
                                                "description",
                                                e.target
                                                    .value
                                            )
                                        }
                                    />
                                </th>
                                <th className="px-4 pb-3">
                                    <input
                                        className="w-full border border-gray-300 p-1 rounded"
                                        placeholder="Filter code"
                                        defaultValue={
                                            filters.buildingCode
                                        }
                                        onChange={(e) =>
                                            setFilterDebounced(
                                                "buildingCode",
                                                e.target
                                                    .value
                                            )
                                        }
                                    />
                                </th>
                                <th className="px-4 pb-3">
                                    {/* Lat filter (optional, text) */}
                                </th>
                                <th className="px-4 pb-3">
                                    {/* Lng filter (optional) */}
                                </th>
                                <th className="px-4 pb-3">
                                    <input
                                        className="w-full border border-gray-300 p-1 rounded"
                                        placeholder="Filter categories"
                                        defaultValue={
                                            filters.categories
                                        }
                                        onChange={(e) =>
                                            setFilterDebounced(
                                                "categories",
                                                e.target
                                                    .value
                                            )
                                        }
                                    />
                                </th>
                                <th className="px-4 pb-3" />
                                <th className="px-4 pb-3" />
                                <th className="px-4 pb-3">
                                    <input
                                        ref={
                                            headerCheckboxRef
                                        }
                                        type="checkbox"
                                        aria-label="Select all on page"
                                        checked={
                                            allPageSelected
                                        }
                                        onChange={(e) => {
                                            setSelectedIds(
                                                (prev) => {
                                                    const next =
                                                        new Set(
                                                            prev
                                                        );
                                                    if (
                                                        e
                                                            .target
                                                            .checked
                                                    )
                                                        pageIds.forEach(
                                                            (
                                                                id
                                                            ) =>
                                                                next.add(
                                                                    id
                                                                )
                                                        );
                                                    else
                                                        pageIds.forEach(
                                                            (
                                                                id
                                                            ) =>
                                                                next.delete(
                                                                    id
                                                                )
                                                        );
                                                    return next;
                                                }
                                            );
                                        }}
                                    />
                                </th>
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-200 text-sm">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan="10"
                                        className="px-6 py-4 text-center text-gray-500"
                                    >
                                        No POIs found.
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((item) => (
                                    <tr key={item.id}>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {item.campus}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {item.name}
                                        </td>
                                        <td className="px-4 py-3 max-w-xs break-words">
                                            {item.description}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {item.buildingCode}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {item.latitude !==
                                                "" &&
                                                item.latitude !==
                                                undefined
                                                ? item.latitude
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {item.longitude !==
                                                "" &&
                                                item.longitude !==
                                                undefined
                                                ? item.longitude
                                                : "—"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {item.categories ||
                                                "—"}
                                        </td>
                                        <td className="px-4 py-3 max-w-xs break-words">
                                            {item.source ||
                                                "—"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <button
                                                className="text-blue-600 hover:underline mr-3"
                                                onClick={() => {
                                                    setEditing(
                                                        item
                                                    );
                                                    setForm({
                                                        id: item.id,
                                                        campus:
                                                            item.campus ||
                                                            "",
                                                        name:
                                                            item.name ||
                                                            "",
                                                        description:
                                                            item.description ||
                                                            "",
                                                        buildingCode:
                                                            item.buildingCode ||
                                                            "",
                                                        latitude:
                                                            item.latitude ===
                                                                "" ||
                                                                item.latitude ===
                                                                undefined
                                                                ? ""
                                                                : item.latitude,
                                                        longitude:
                                                            item.longitude ===
                                                                "" ||
                                                                item.longitude ===
                                                                undefined
                                                                ? ""
                                                                : item.longitude,
                                                        categories:
                                                            item.categories ||
                                                            "",
                                                        source:
                                                            item.source ||
                                                            "",
                                                    });
                                                    setModalOpen(
                                                        true
                                                    );
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="text-red-600 hover:underline"
                                                onClick={() => {
                                                    setDelete(
                                                        item
                                                    );
                                                    setConfirmDeleteOpen(
                                                        true
                                                    );
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.has(
                                                    item.id
                                                )}
                                                onChange={(
                                                    e
                                                ) => {
                                                    setSelectedIds(
                                                        (
                                                            prev
                                                        ) => {
                                                            const next =
                                                                new Set(
                                                                    prev
                                                                );
                                                            if (
                                                                e
                                                                    .target
                                                                    .checked
                                                            )
                                                                next.add(
                                                                    item.id
                                                                );
                                                            else
                                                                next.delete(
                                                                    item.id
                                                                );
                                                            return next;
                                                        }
                                                    );
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

            {/* Pagination */}
            <div className="flex justify-between items-center mt-4">
                <p className="text-sm text-gray-600">
                    Page {currentPage} of {totalPages}
                </p>
                <div className="space-x-2">
                    <button
                        onClick={() =>
                            setCurrentPage((p) =>
                                Math.max(p - 1, 1)
                            )
                        }
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <button
                        onClick={() =>
                            setCurrentPage((p) =>
                                Math.min(
                                    p + 1,
                                    totalPages
                                )
                            )
                        }
                        disabled={
                            currentPage ===
                            totalPages
                        }
                        className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            </div>

            {/* Add/Edit modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-20">
                    <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">
                            {editingData
                                ? "Edit POI"
                                : "Add POI"}
                        </h2>
                        <form
                            onSubmit={handleAdd}
                            className="space-y-4"
                        >
                            <div className="space-y-2">
                                <label className="block font-medium mb-1">
                                    Campus
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    value={
                                        form.campus
                                    }
                                    onChange={(e) =>
                                        setForm(
                                            (
                                                prev
                                            ) => ({
                                                ...prev,
                                                campus:
                                                    e
                                                        .target
                                                        .value,
                                            })
                                        )
                                    }
                                    required
                                />

                                <label className="block font-medium mb-1">
                                    Name
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    value={
                                        form.name
                                    }
                                    onChange={(e) =>
                                        setForm(
                                            (
                                                prev
                                            ) => ({
                                                ...prev,
                                                name: e
                                                    .target
                                                    .value,
                                            })
                                        )
                                    }
                                    required
                                />

                                <label className="block font-medium mb-1">
                                    Description
                                </label>
                                <textarea
                                    className="w-full border border-gray-300 p-2 rounded"
                                    rows={3}
                                    value={
                                        form.description
                                    }
                                    onChange={(e) =>
                                        setForm(
                                            (
                                                prev
                                            ) => ({
                                                ...prev,
                                                description:
                                                    e
                                                        .target
                                                        .value,
                                            })
                                        )
                                    }
                                />

                                <label className="block font-medium mb-1">
                                    Building Code
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    value={
                                        form.buildingCode
                                    }
                                    onChange={(e) =>
                                        setForm(
                                            (
                                                prev
                                            ) => ({
                                                ...prev,
                                                buildingCode:
                                                    e
                                                        .target
                                                        .value,
                                            })
                                        )
                                    }
                                />

                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block font-medium mb-1">
                                            Latitude
                                        </label>
                                        <input
                                            type="number"
                                            step="any"
                                            className="w-full border border-gray-300 p-2 rounded"
                                            value={
                                                form.latitude
                                            }
                                            onChange={(
                                                e
                                            ) =>
                                                setForm(
                                                    (
                                                        prev
                                                    ) => ({
                                                        ...prev,
                                                        latitude:
                                                            e
                                                                .target
                                                                .value,
                                                    })
                                                )
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block font-medium mb-1">
                                            Longitude
                                        </label>
                                        <input
                                            type="number"
                                            step="any"
                                            className="w-full border border-gray-300 p-2 rounded"
                                            value={
                                                form.longitude
                                            }
                                            onChange={(
                                                e
                                            ) =>
                                                setForm(
                                                    (
                                                        prev
                                                    ) => ({
                                                        ...prev,
                                                        longitude:
                                                            e
                                                                .target
                                                                .value,
                                                    })
                                                )
                                            }
                                        />
                                    </div>
                                </div>

                                <label className="block font-medium mb-1">
                                    Categories
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    placeholder="e.g. Academic & Teaching; Sports & Recreation"
                                    value={
                                        form.categories
                                    }
                                    onChange={(e) =>
                                        setForm(
                                            (
                                                prev
                                            ) => ({
                                                ...prev,
                                                categories:
                                                    e
                                                        .target
                                                        .value,
                                            })
                                        )
                                    }
                                />

                                <label className="block font-medium mb-1">
                                    Source
                                </label>
                                <input
                                    type="text"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    placeholder="Optional link or note"
                                    value={
                                        form.source
                                    }
                                    onChange={(e) =>
                                        setForm(
                                            (
                                                prev
                                            ) => ({
                                                ...prev,
                                                source:
                                                    e
                                                        .target
                                                        .value,
                                            })
                                        )
                                    }
                                />
                            </div>

                            <div className="flex justify-end mt-6 space-x-3">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setModalOpen(
                                            false
                                        );
                                        setEditing(
                                            null
                                        );
                                        setForm(
                                            initialForm
                                        );
                                    }}
                                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
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

            {/* Delete confirm */}
            {confirmDeleteOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 text-red-600">
                            Delete POI
                        </h2>
                        <p className="mb-4">
                            Are you sure you want to delete{" "}
                            <strong>
                                {deleteData?.campus} -{" "}
                                {deleteData?.name}
                            </strong>
                            ?
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setConfirmDeleteOpen(
                                        false
                                    );
                                    setDelete(
                                        null
                                    );
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
