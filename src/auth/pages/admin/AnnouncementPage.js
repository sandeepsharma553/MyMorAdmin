import React, { useState, useEffect, useRef } from "react";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { db, database, storage } from "../../../firebase";
import { ref as dbRef, onValue, set, push, update, remove, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import dayjs from 'dayjs';
import { DateRange } from 'react-date-range';
import 'react-date-range/dist/styles.css'; // main style file
import 'react-date-range/dist/theme/default.css'; // theme css file
import { enUS } from 'date-fns/locale';
import { format } from 'date-fns';

export default function AnnouncementPage(props) {
    const { navbarHeight } = props;
    const [modalOpen, setModalOpen] = useState(false)
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [list, setList] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [currentPage, setCurrentPage] = useState(1);
    const [fileName, setFileName] = useState('No file chosen');
    const [options, setOptions] = useState(['', '']);
    const uid = useSelector((state) => state.auth.user.uid)
    const user = useSelector((state) => state.auth.user)
    const [range, setRange] = useState([
        {
            startDate: new Date(),
            endDate: new Date(),
            key: 'selection'
        }
    ]);
    const [showPicker, setShowPicker] = useState(false);
    const pickerRef = useRef();
    const initialForm = {
        id: 0,
        title: '',
        shortdesc: '',
        description: '',
        date: '',
        user: '',
        role: 'Admin',
        likes: [],
        comments: [],
        bookmarked: false,
        question: '',
        options: ['', ''],
        allowMulti: false,
        link: ''
    }
    const [form, setForm] = useState(initialForm);
    const pageSize = 10;
    const mockData = list
    const totalPages = Math.ceil(mockData.length / pageSize);
    const paginatedData = mockData.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );
    useEffect(() => {
        getList()
    }, [])
    const getDayFromDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { weekday: 'long' });
    };
    const getList = async () => {
        setIsLoading(true)
        const groupRef = dbRef(database, 'announcements/');
        onValue(groupRef, async (snapshot) => {
            const data = snapshot.val();
            if (data) {
                const documents = Object.entries(data).map(([id, value]) => ({
                    id,
                    ...value,
                }));
                setList(documents)

            }
        });
        setIsLoading(false)

    }
    const handleChange = (e) => {
        const { name, value, type, files, checked } = e.target;
        if (type === 'file') {
            setForm({ ...form, [name]: files[0] });
            setFileName(files.length > 0 ? files[0].name : 'No file chosen');
        } else if (type === 'checkbox') {
            setForm({ ...form, [name]: checked });
        } else {
            setForm({ ...form, [name]: value });
        }
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        let posterUrl = '';
        try {

            if (form.id == 0) {
                if (!form.poster) {
                    toast.error("Please choose the file")
                    return;
                }
            }
            let posterUrl = form.posterUrl || '';
            const isNewImage = form.poster instanceof File;

            if (isNewImage) {
                const storRef = storageRef(storage, `announcements_posters/${form.poster.name}`);
                await uploadBytes(storRef, form.poster);
                posterUrl = await getDownloadURL(storRef);
            }
            const userName = await fetchUser(uid);
            console.log(uid)
            const annoucementData = {
                ...form,
                uid: uid,
                user: userName,
                date: Timestamp.fromDate(new Date(form.date)),
                createdAt: Timestamp.now(),
                ...(posterUrl && { posterUrl }),
            };

            delete form.poster;

            if (editingData) {
                const announcementRef = dbRef(database, `announcements/${form.id}`);
                const snapshot = await get(announcementRef);
                if (!snapshot.exists()) {
                    toast.warning('Annoucement not exist! Cannot update.');
                    return;
                }
                update(dbRef(database, `announcements/${form.id}`), {
                    ...form,
                    uid: uid,
                    user: userName,
                    date: Timestamp.fromDate(new Date(form.date)),
                    createdAt: Timestamp.now(),
                    ...(posterUrl && { posterUrl }),
                    photoURL: user.photoURL,
                    date: {
                        startDate: Timestamp.fromDate(new Date(form.date.startDate)),
                        endDate: Timestamp.fromDate(new Date(form.date.endDate))
                    }
                })
                toast.success('Annoucement updated successfully');
            }
            else {
                delete form.id;
                const newGroupRef = push(dbRef(database, 'announcements/'));
                set(newGroupRef, {
                    ...form,
                    uid: uid,
                    user: userName,
                    likes: [],
                    comments: [],
                    date: Timestamp.fromDate(new Date(form.date)),
                    createdAt: Timestamp.now(),
                    ...(posterUrl && { posterUrl }),
                    photoURL: user.photoURL,
                    date: {
                        startDate: Timestamp.fromDate(new Date(form.date.startDate)),
                        endDate: Timestamp.fromDate(new Date(form.date.endDate))
                    }
                })
                toast.success('Annoucement created successfully');
            }

        } catch (error) {
            console.error("Error saving data:", error);
        }
        getList()
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
        setFileName('No file chosen');
        const cleanOptions = form.options?.map(opt => opt.trim()).filter(Boolean) || [];

        if (form.question && cleanOptions.length >= 2) {
            form.options = cleanOptions;
        }
    };
    const handleDelete = async () => {
        if (!deleteData) return;
        try {
            const groupRef = dbRef(database, `announcements/${form.id}`); // adjust your path as needed
            remove(groupRef)
                .then(() => {

                })
                .catch((error) => {
                    console.error('Error deleting group:', error);
                });
            toast.success('Successfully deleted!');
            getList();
        } catch (error) {
            console.error('Error deleting document: ', error);
        }
        setConfirmDeleteOpen(false);
        setDelete(null);
    };

    const formatDateTime = (dateObj) => {
        if (!dateObj?.startDate || !dateObj?.endDate) return 'N/A';
        const start = dayjs(dateObj.startDate.seconds ? dateObj.startDate.seconds * 1000 : dateObj.startDate).format('MMM DD, YYYY');
        const end = dayjs(dateObj.endDate.seconds ? dateObj.endDate.seconds * 1000 : dateObj.endDate).format('MMM DD, YYYY');
        return `${start} - ${end}`;
    };
    const fetchUser = async (uid) => {
        const querySnapshot = await getDocs(collection(db, 'User'));
        const userMap = {};
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const username =
                data.username ||
                data.UserName ||
                data.USERNAME ||
                "";
            userMap[data.uid] = username;
        });

        return userMap[uid] || "";
    };
    const addOption = () => {
        setForm(prev => ({
            ...prev,
            options: [...(prev.options || []), '']
        }));
    };
    const updateOption = (txt, idx) => {
        const updated = [...form.options];
        updated[idx] = txt;
        setForm(prev => ({
            ...prev,
            options: updated
        }));
    };
    const removeOption = (index) => {
        if (form.options.length <= 2) {
            toast.warning("At least 2 options required.");
            return;
        }
        const updated = form.options.filter((_, i) => i !== index);
        setForm(prev => ({ ...prev, options: updated }));
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

    return (
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
            {/* Top bar with Add button */}
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Announcement</h1>
                <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
                    onClick={() => {
                        setEditing(null);
                        setForm(initialForm);
                        setModalOpen(true);
                    }}>
                    + Add
                </button>
            </div>
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
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Title</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Description</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Date</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Image</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {paginatedData.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="px-6 py-4 text-center text-gray-500">
                                            No matching users found.
                                        </td>
                                    </tr>
                                ) : (
                                    paginatedData.map((item,i) => (
                                        <tr key={i}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.title}</td>
                                            <td className="px-6 py-4 text-sm text-gray-700">

                                                <div className="flex-shrink">{item.description}</div></td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDateTime(item.date)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                                {item.posterUrl != "" ? (<img src={item.posterUrl} width={80} height={80} />) : null}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                                                <button className="text-blue-600 hover:underline mr-3" onClick={() => {
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
                                                        date: {
                                                            startDate: startDate.toISOString(),
                                                            endDate: endDate.toISOString(),
                                                        },

                                                        poster: null // poster cannot be pre-filled (file inputs are read-only for security)
                                                    }));
                                                    setRange([
                                                        {
                                                            startDate,
                                                            endDate,
                                                            key: 'selection',
                                                        },
                                                    ]);

                                                    setModalOpen(true);

                                                }}>Edit</button>
                                                <button className="text-red-600 hover:underline" onClick={() => {
                                                    setDelete(item);
                                                    setForm(item);
                                                    setConfirmDeleteOpen(true);
                                                }}>Delete</button>
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
                        <h2 className="text-xl font-bold mb-4">Add</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-4">
                                <input name="title" placeholder="Title" value={form.title}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                                <input name="shortdesc" placeholder="Short Description" value={form.shortdesc}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                                <textarea name="description" placeholder="Description" value={form.description} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>
                                <label>Date Range</label>
                                <div>
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
                                            style={{
                                                position: 'absolute',
                                                top: 50,
                                                zIndex: 1000,
                                                boxShadow: '0px 2px 10px rgba(0,0,0,0.2)'
                                            }}
                                        >
                                            <DateRange
                                                editableDateInputs={true}
                                                onChange={handleRangeChange}
                                                moveRangeOnFirstSelection={false}
                                                ranges={range}
                                                minDate={new Date()}
                                                locale={enUS}

                                            />
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
                                    <label className="cursor-pointer">
                                        <input type="file" name="poster" accept="image/*" className="hidden"
                                            onChange={handleChange}
                                        />
                                        📁 Choose File
                                    </label>
                                    <span className="text-sm text-gray-600 truncate max-w-[150px]">
                                        {fileName}
                                    </span>

                                </div>
                                {form.posterUrl && (
                                    <img src={form.posterUrl} alt="Poster Preview" width="150" />
                                )}
                                <label>Create Poll</label><br />
                                <label>Question</label>
                                <input
                                    type="text"
                                    name="question"
                                    placeholder="Ask question"
                                    value={form.question}
                                    onChange={handleChange}
                                    className="w-full border border-gray-300 p-2 rounded"
                                />
                                {form.options.map((opt, idx) => (
                                    <div key={idx} className="flex items-center gap-2 mb-2">
                                        <input
                                            className="flex-1 border border-gray-300 p-2 rounded"
                                            placeholder={`Option ${idx + 1}`}
                                            value={opt}
                                            onChange={e => updateOption(e.target.value, idx)}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => removeOption(idx)}
                                            className="text-red-600 text-sm hover:underline"
                                        >
                                            ❌
                                        </button>
                                    </div>
                                ))}

                                <button type="button"
                                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    onClick={addOption}>
                                    + Add option
                                </button>
                                <input name="link" placeholder="News Link" value={form.link}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" />

                                <div className="flex items-center gap-4 mt-4 cursor-pointer select-none">
                                    <label htmlFor="toggleMulti" className="text-sm font-medium text-gray-700">
                                        Allow multiple answers
                                    </label>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            id="toggleMulti"
                                            name="allowMulti"
                                            checked={form.allowMulti}
                                            onChange={handleChange}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-gray-300 rounded-full peer peer-checked:bg-green-500 transition-colors duration-300"></div>
                                        <div
                                            className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform duration-300 peer-checked:translate-x-5"
                                        ></div>
                                    </label>


                                </div>
                            </div>
                            <div className="flex justify-end mt-6 space-x-3">
                                <button
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
                        <h2 className="text-xl font-semibold mb-4 text-red-600">Delete User</h2>
                        <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
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
