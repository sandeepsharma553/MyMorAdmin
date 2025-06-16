import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { db, database, storage } from "../../src/firebase";
import { ref as dbRef, onValue, set, push, update, remove, get } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import dayjs from 'dayjs';
export default function AnnouncementPage(props) {
    const { navbarHeight } = props;
    const [modalOpen, setModalOpen] = useState(false)
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [list, setList] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [fileName, setFileName] = useState('No file chosen');
    const uid = useSelector((state) => state.auth.user)
    const initialForm = {
        id: 0,
        title: '',
        description: '',
        date: '',
        user: '',
        role: 'Admin',
        likes: [],
        comments: [],
        bookmarked: false,

    }
    const [form, setForm] = useState(initialForm);
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
        const { name, value, type, files } = e.target;
        if (type === 'file') {
            setForm({ ...form, [name]: files[0] });
            if (files.length > 0) {
                setFileName(files[0].name);
            } else {
                setFileName('No file chosen');
            }
        }
        else {
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
            const annoucementData = {
                ...form,
                uid: uid,
                user: userName,
                date: Timestamp.fromDate(new Date(form.date)),
                createdAt: Timestamp.now(),
                ...(posterUrl && { posterUrl }),
            };

            delete form.poster;
            console.log(form)
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
                    likes: [],
                    comments: [],
                    date: Timestamp.fromDate(new Date(form.date)),
                    createdAt: Timestamp.now(),
                    ...(posterUrl && { posterUrl }),
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
    };
    const handleDelete = async () => {
        if (!deleteData) return;
        try {
            const groupRef = dbRef(database, `announcements/${form.id}`); // adjust your path as needed
            remove(groupRef)
                .then(() => {
                    console.log('deleted successfully!');
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

    const formatDateTime = (isoString) => {
        const date = dayjs(isoString.seconds * 1000).format('YYYY-MM-DD');
        return date;
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
                                {list.map((item, i) => (
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
                                                setForm(prev => ({
                                                    ...prev,
                                                    ...item,
                                                    id: item.id,
                                                    date: formatDateTime(item.date),
                                                    //  date: item.date?.toDate().toISOString().split('T')[0] || '',
                                                    poster: null // poster cannot be pre-filled (file inputs are read-only for security)
                                                }));
                                                setModalOpen(true);
                                                console.log(form, 'form')
                                                console.log(editingData, 'd')
                                            }}>Edit</button>
                                            <button className="text-red-600 hover:underline" onClick={() => {
                                                setDelete(item);
                                                setForm(item);
                                                setConfirmDeleteOpen(true);
                                            }}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>


            </div>
            {modalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
                        <h2 className="text-xl font-bold mb-4">Add</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-4">
                                <input name="title" placeholder="Title" value={form.title}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                                <textarea name="description" placeholder="Description" value={form.description} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>
                                <label>Date</label>
                                <input type="date" name="date" value={form.date} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
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
