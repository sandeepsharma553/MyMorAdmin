import React, { useState, useEffect, useRef } from "react";
import {
    collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc
} from "firebase/firestore";
import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";

export default function ResourcesPage(props) {
    const { navbarHeight } = props;

    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [list, setList] = useState([]);
    const [isLoading, setIsLoading] = useState(false);

    const uid = useSelector((state) => state.auth.user.uid);
    const emp = useSelector((state) => state.auth.employee);

    const initialForm = {
        title: "",
        emails: [{ email: "", rename: "" }],
        contacts: [{ contact: "", rename: "" }],
        links: [{ url: "", rename: "" }],
        images: [],
        hostelid: emp.hostelid,
        uid: uid,
    };

    const [form, setForm] = useState([initialForm]);
    const pageSize = 10;

    // ---- Multi-image helpers ----
    const imageInputsRef = useRef({});

    const handleAddImages = (rowIdx, pickedFiles) => {
        if (!pickedFiles?.length) {
            console.log('no files picked', pickedFiles);
            return;
        }
        setForm(prev => {
            const next = prev.map((row, i) => {
                if (i !== rowIdx) return row;
                return { ...row, images: [...(row.images || []), ...pickedFiles] };
            });
            console.log('form (next)', next);
            return next;
        });
    };

    const handleRemoveImage = (rowIdx, imgIdx) => {
        setForm(prev => {
            const rows = [...prev];
            rows[rowIdx].images = rows[rowIdx].images.filter((_, i) => i !== imgIdx);
            return rows;
        });
    };

    const getDisplayName = (f) => {
        if (typeof f === "string") {
            try {
                const u = new URL(f);
                const pathname = u.pathname || "";
                return decodeURIComponent(pathname.split("/").pop() || "image");
            } catch {
                return "image";
            }
        }
        return f?.name || "image";
    };
    // -----------------------------

    const resources = list.flatMap(doc =>
        (doc.resources || []).map((r, idx) => ({
            ...r,
            docId: doc.id,
            rowId: `${doc.id}-${idx}`,
        }))
    );

    const normalizedTerm = searchTerm.trim().toLowerCase();

    const filtered = normalizedTerm
        ? resources.filter(r => (r.title || '').toLowerCase().includes(normalizedTerm))
        : resources;

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const safePage = Math.min(Math.max(currentPage, 1), totalPages);
    const paginatedData = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

    useEffect(() => {
        getList();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const getList = async () => {
        setIsLoading(true);
        try {
            const resourcesQuery = query(collection(db, 'resources'));
            const querySnapshot = await getDocs(resourcesQuery);
            const documents = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
            }));
            const filteredDocs = documents
                .map(group => {
                    const filteredResources = (group.resources || []).filter(resource => resource.hostelid === emp.hostelid);
                    return { ...group, resources: filteredResources };
                })
                .filter(group => (group.resources || []).length > 0);

            setList(filteredDocs);
        } catch (e) {
            console.error(e);
            toast.error("Failed to load resources.");
        } finally {
            setIsLoading(false);
        }
    };

    const addRow = () => {
        setForm(prev => [...prev, { ...initialForm }]);
    };

    const removeRow = (i) => {
        setForm(prev => prev.filter((_, idx) => idx !== i));
    };

    const handleTitleChange = (rowIdx, value) => {
        setForm(prev => {
            const rows = [...prev];
            rows[rowIdx].title = value;
            return rows;
        });
    };

    const handleArrayChange = (rowIdx, key, itemIdx, field, value) => {
        setForm(prev => {
            const rows = [...prev];
            if (typeof rows[rowIdx][key][itemIdx] === "object") {
                rows[rowIdx][key][itemIdx][field] = value;
            } else {
                rows[rowIdx][key][itemIdx] = value;
            }
            return rows;
        });
    };

    const addFieldItem = (rowIdx, key) => {
        setForm(prev => {
            const rows = [...prev];
            if (key === "emails") rows[rowIdx][key].push({ email: "", rename: "" });
            else if (key === "contacts") rows[rowIdx][key].push({ contact: "", rename: "" });
            else if (key === "links") rows[rowIdx][key].push({ url: "", rename: "" });
            else rows[rowIdx][key].push("");
            return rows;
        });
    };

    const removeFieldItem = (rowIdx, key, itemIdx) => {
        setForm(prev => {
            const rows = [...prev];
            rows[rowIdx][key] = rows[rowIdx][key].filter((_, i) => i !== itemIdx);
            return rows;
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const cleanedRows = await Promise.all(
                form.map(async (row) => {
                    const images = await Promise.all(
                        (row.images || []).map(async (img) => {
                            if (typeof img === 'string') return img; // keep existing URLs on edit
                            const imgRef = ref(storage, `resource_images/${Date.now()}-${img.name}`);
                            await uploadBytes(imgRef, img);
                            return await getDownloadURL(imgRef);
                        })
                    );
                    const hostelid = emp.hostelid;
                    return { ...row, images, hostelid };
                })
            );

            if (editingData) {
                const { docId, index } = editingData;
                const docRef = doc(db, 'resources', docId);
                const snap = await getDoc(docRef);
                if (!snap.exists()) throw new Error('Document missing');

                const current = snap.data().resources || [];
                current[index] = cleanedRows[0];
                await updateDoc(docRef, { resources: current });

                toast.success('Resource updated successfully');
            } else {
                await addDoc(collection(db, 'resources'), {
                    resources: cleanedRows,
                });
                toast.success('Resource added successfully');
            }

            setModalOpen(false);
            setEditing(null);
            setForm([initialForm]);
            getList();
        } catch (err) {
            console.error('Error saving:', err);
            toast.error('Something went wrong.');
        }
    };

    const handleDelete = async () => {
        if (!deleteData) return;

        try {
            const docRef = doc(db, 'resources', deleteData.docId);
            const snap = await getDoc(docRef);
            if (!snap.exists()) {
                toast.error('Document not found');
                return;
            }

            const current = snap.data().resources || [];
            const updated = current.filter((_, idx) =>
                `${deleteData.docId}-${idx}` !== deleteData.rowId
            );
            if (updated.length > 0) {
                await updateDoc(docRef, { resources: updated });
            } else {
                await deleteDoc(docRef);
            }

            toast.success('Resource deleted successfully');
            getList();
        } catch (err) {
            console.error('Error deleting row:', err);
            toast.error('Something went wrong.');
        }
        setConfirmDeleteOpen(false);
        setDelete(null);
    };
    const isStringUrl = (v) => typeof v === "string";

    const isImageLike = (v) =>
        isStringUrl(v)
            ? /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(v)
            : (v?.type || "").startsWith("image/");

    const getFileName = (v) => {
        if (isStringUrl(v)) {
            try {
                const u = new URL(v);
                return decodeURIComponent(u.pathname.split("/").pop() || "file");
            } catch {
                return "file";
            }
        }
        return v?.name || "file";
    };

    // cute, lightweight "icons" without adding a lib
    const fileTypeBadge = (nameOrType = "") => {
        const s = (nameOrType || "").toLowerCase();
        if (s.includes("pdf") || s.endsWith(".pdf")) return "📄 PDF";
        if (s.includes("presentation") || s.endsWith(".ppt") || s.endsWith(".pptx")) return "📽 PPT";
        if (s.includes("spreadsheet") || s.endsWith(".xls") || s.endsWith(".xlsx") || s.includes("excel")) return "📊 XLS";
        if (s.includes("word") || s.endsWith(".doc") || s.endsWith(".docx")) return "📝 DOC";
        if (s.endsWith(".csv")) return "🧾 CSV";
        if (s.endsWith(".txt") || s.includes("text/plain")) return "🧾 TXT";
        return "📎 FILE";
    };
    return (
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">

            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Resources</h1>
                <button
                    className="px-4 py-2 bg-black text-white rounded hover:bg-black"
                    onClick={() => {
                        setEditing(null);
                        setForm([initialForm]);
                        setModalOpen(true);
                    }}
                >
                    + Add
                </button>
            </div>

            <div className="overflow-x-auto bg-white rounded shadow">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <FadeLoader color="#36d7b7" loading={isLoading} />
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Title</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Contact</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Link</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Documents</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                                        {normalizedTerm ? 'No matching resources' : 'No data yet'}
                                    </td>
                                </tr>
                            ) : (
                                paginatedData.map((x) => (
                                    <tr key={x.rowId}>
                                        <td className="px-4 py-3 align-top">{x.title || '—'}</td>

                                        <td className="px-4 py-3 align-top">
                                            {Array.isArray(x.emails) && x.emails.length > 0 ? (
                                                <ul className="list-disc list-inside space-y-1">
                                                    {x.emails.map((emailObj, idx) => (
                                                        <li key={idx}>
                                                            {emailObj.rename ? (
                                                                <span title={emailObj.email}>{emailObj.rename}</span>
                                                            ) : (
                                                                emailObj.email
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : "—"}
                                        </td>

                                        <td className="px-4 py-3 align-top">
                                            {Array.isArray(x.contacts) && x.contacts.length > 0 ? (
                                                <ul className="list-disc list-inside space-y-1">
                                                    {x.contacts.map((contactObj, idx) => (
                                                        <li key={idx}>
                                                            {contactObj.rename ? (
                                                                <span title={contactObj.contact}>{contactObj.rename}</span>
                                                            ) : (
                                                                contactObj.contact
                                                            )}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : "—"}
                                        </td>

                                        <td className="px-4 py-3 align-top space-y-1">
                                            {Array.isArray(x.links) && x.links.length > 0 ? (
                                                <ul className="list-disc list-inside space-y-1">
                                                    {x.links.map((linkObj, idx) => (
                                                        <li key={idx}>
                                                            <a
                                                                href={linkObj.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 hover:underline break-all"
                                                                title={linkObj.url}
                                                            >
                                                                {linkObj.rename || linkObj.url}
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : "—"}
                                        </td>

                                        <td className="px-4 py-3 align-top">
                                            {x.images?.length ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {x.images.slice(0, 3).map((url, i) => (
                                                        <img
                                                            key={i}
                                                            src={url}
                                                            alt="img"
                                                            className="w-10 h-10 object-cover rounded"
                                                        />
                                                    ))}
                                                    {x.images.length > 3 && (
                                                        <span className="text-xs text-gray-500 ml-1">
                                                            +{x.images.length - 3}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : '—'}
                                        </td>

                                        <td className="px-4 py-3 align-top whitespace-nowrap text-sm">
                                            <button
                                                className="text-blue-600 hover:underline mr-3"
                                                onClick={() => {
                                                    const index = Number(x.rowId.split('-').pop());
                                                    setEditing({ docId: x.docId, index });
                                                    setForm([{
                                                        ...x,
                                                        images: x.images || [],
                                                    }]);
                                                    setModalOpen(true);
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="text-red-600 hover:underline"
                                                onClick={() => {
                                                    setDelete(x);
                                                    setConfirmDeleteOpen(true);
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                )}
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
                        <h2 className="text-xl font-bold mb-4">
                            {editingData ? "Edit Resource" : "Create Resource"}
                        </h2>

                        <form onSubmit={handleSubmit} className="space-y-6 p-4">
                            {form.map((row, rowIdx) => (
                                <div key={rowIdx} className="border rounded-lg p-4 space-y-4 bg-gray-50">
                                    <div className="flex items-center justify-between">
                                        {form.length > 1 && !editingData && (
                                            <button type="button" onClick={() => removeRow(rowIdx)} className="text-red-500">
                                                ✕ Remove Row
                                            </button>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block font-medium">Title:</label>
                                        <input
                                            type="text"
                                            className="border px-3 py-1 w-full rounded"
                                            value={row.title}
                                            onChange={(e) => handleTitleChange(rowIdx, e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className="block font-medium">Emails:</label>
                                        {row.emails.map((emailObj, i) => (
                                            <div key={i} className="flex gap-2 mb-1">
                                                <input
                                                    type="email"
                                                    placeholder="Email"
                                                    className="border px-3 py-1 flex-1 rounded"
                                                    value={emailObj.email}
                                                    onChange={(e) =>
                                                        handleArrayChange(rowIdx, "emails", i, "email", e.target.value)
                                                    }
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Email Rename"
                                                    className="border px-3 py-1 flex-1 rounded"
                                                    value={emailObj.rename}
                                                    onChange={(e) =>
                                                        handleArrayChange(rowIdx, "emails", i, "rename", e.target.value)
                                                    }
                                                />
                                                {row.emails.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFieldItem(rowIdx, "emails", i)}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="text-blue-600 text-sm"
                                            onClick={() => addFieldItem(rowIdx, "emails")}
                                        >
                                            + Add Email
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block font-medium">Contacts:</label>
                                        {row.contacts.map((contactObj, i) => (
                                            <div key={i} className="flex gap-2 mb-1">
                                                <input
                                                    type="text"
                                                    placeholder="Contact"
                                                    className="border px-3 py-1 flex-1 rounded"
                                                    value={contactObj.contact}
                                                    onChange={(e) =>
                                                        handleArrayChange(rowIdx, "contacts", i, "contact", e.target.value)
                                                    }
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Contact Rename"
                                                    className="border px-3 py-1 flex-1 rounded"
                                                    value={contactObj.rename}
                                                    onChange={(e) =>
                                                        handleArrayChange(rowIdx, "contacts", i, "rename", e.target.value)
                                                    }
                                                />
                                                {row.contacts.length > 1 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFieldItem(rowIdx, "contacts", i)}
                                                    >
                                                        ✕
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="text-blue-600 text-sm"
                                            onClick={() => addFieldItem(rowIdx, "contacts")}
                                        >
                                            + Add Contact
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block font-medium">Links:</label>
                                        {row.links.map((linkObj, i) => (
                                            <div key={i} className="flex gap-2 mb-1">
                                                <input
                                                    type="url"
                                                    placeholder="URL"
                                                    className="border px-3 py-1 flex-1 rounded"
                                                    value={linkObj.url}
                                                    onChange={(e) =>
                                                        handleArrayChange(rowIdx, "links", i, "url", e.target.value)
                                                    }
                                                />
                                                <input
                                                    type="text"
                                                    placeholder="Link Rename"
                                                    className="border px-3 py-1 flex-1 rounded"
                                                    value={linkObj.rename}
                                                    onChange={(e) =>
                                                        handleArrayChange(rowIdx, "links", i, "rename", e.target.value)
                                                    }
                                                />
                                                {row.links.length > 1 && (
                                                    <button type="button" onClick={() => removeFieldItem(rowIdx, "links", i)}>✕</button>
                                                )}
                                            </div>
                                        ))}
                                        <button
                                            type="button"
                                            className="text-blue-600 text-sm"
                                            onClick={() => addFieldItem(rowIdx, "links")}
                                        >
                                            + Add Link
                                        </button>
                                    </div>

                                    {/* Documents (multi-image) */}
                                    <div>
                                        <label className="block font-medium">Documents:</label>

                                        {/* Hidden input per row */}
                                        <input
                                            type="file"
                                            accept={[
                                                "image/*",
                                                "application/pdf",
                                                "text/plain",
                                                "text/csv",
                                                "application/msword",
                                                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                                                "application/vnd.ms-excel",
                                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                                                "application/vnd.ms-powerpoint",
                                                "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                                            ].join(",")}
                                            multiple
                                            className="hidden"
                                            ref={(el) => { imageInputsRef.current[rowIdx] = el; }}
                                            onChange={(e) => {
                                                const picked = Array.from(e.target.files || []); // <- copy immediately
                                                console.log('picked files length', picked.length);
                                                handleAddImages(rowIdx, picked);                 // pass a plain array
                                                if (imageInputsRef.current[rowIdx]) {
                                                    imageInputsRef.current[rowIdx].value = "";     // reset AFTER
                                                }
                                            }}
                                        />

                                        <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                                            <button
                                                type="button"
                                                className="px-3 py-1 rounded bg-black text-white hover:opacity-90"
                                                onClick={() => imageInputsRef.current[rowIdx]?.click()}
                                            >
                                                + Add file(s)
                                            </button>
                                            {row.images?.length > 0 && (
                                                <span className="text-sm text-gray-600">
                                                    {row.images.length} selected
                                                </span>
                                            )}
                                        </div>

                                        {Array.isArray(row.images) && row.images.length > 0 && (
                                            <ul className="mt-2 text-sm text-gray-700 space-y-1">
                                                {row.images.map((item, i) => {
                                                    const name = getFileName(item);
                                                    const isImg = isImageLike(item);
                                                    const href = isStringUrl(item) ? item : URL.createObjectURL(item);
                                                    return (
                                                        <li key={i} className="flex items-start gap-2">
                                                            {isImg ? (
                                                                <img
                                                                    src={href}
                                                                    alt={name}
                                                                    className="w-12 h-12 object-cover rounded border"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 flex items-center justify-center rounded border text-xs">
                                                                    {fileTypeBadge(isStringUrl(item) ? name : item?.type)}
                                                                </div>
                                                            )}
                                                            <div className="min-w-0 flex-1">
                                                                <a
                                                                    href={href}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-blue-600 hover:underline break-all"
                                                                    title={name}
                                                                >
                                                                    {name}
                                                                </a>
                                                                <div className="text-xs text-gray-500">
                                                                    {!isStringUrl(item) && item?.size ? `${(item.size / 1024).toFixed(1)} KB` : null}
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                className="text-red-600 text-xs hover:underline"
                                                                onClick={() => handleRemoveImage(rowIdx, i)}
                                                            >
                                                                Remove
                                                            </button>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        )}
                                        {/* Thumbnails - works for File or URL */}
                                        {/* {Array.isArray(row.images) && row.images.length > 0 && (
                                            <div className="mt-2 flex flex-wrap gap-2">
                                                {row.images.map((img, i) => (
                                                    <div key={i} className="relative">
                                                        <img
                                                            src={typeof img === 'string' ? img : URL.createObjectURL(img)}
                                                            alt="preview"
                                                            className="w-16 h-16 object-cover rounded border"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="absolute -top-2 -right-2 bg-white border rounded-full w-6 h-6 text-xs"
                                                            onClick={() => handleRemoveImage(rowIdx, i)}
                                                            title="Remove"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )} */}
                                    </div>

                                </div>
                            ))}

                            {!editingData && (
                                <button
                                    type="button"
                                    onClick={addRow}
                                    className="text-blue-600 text-sm"
                                >
                                    + Add Another Resource
                                </button>
                            )}

                            <div className="flex justify-end mt-6 space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setModalOpen(false)}
                                    className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                                >
                                    Cancel
                                </button>
                                <button
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
                        <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Resource</h2>
                        <p className="mb-4">
                            Are you sure you want to delete <strong>{deleteData?.title || "this resource"}</strong>?
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
