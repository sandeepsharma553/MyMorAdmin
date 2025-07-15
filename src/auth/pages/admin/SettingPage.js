import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { useSelector } from "react-redux";
import { ClipLoader, FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

const SettingPage = (props) => {
    const [eventModalOpen, setEventModalOpen] = useState(false);
    const [academicModalOpen, setAcademicModalOpen] = useState(false);
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [eveDeleteModelOpen, setEveDeleteModelOpen] = useState(false);
    const [academicDeletModelOpen, setAcademicDeleteModelOpen] = useState(false);
    const [eventCatlist, setEventCatList] = useState([])
    const [academicCatlist, setAcademicCatList] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const uid = useSelector((state) => state.auth.user.uid);
    const emp = useSelector((state) => state.auth.employee);
    const initialForm = {
        id: 0,
        name: ''
    }
    const [form, setForm] = useState(initialForm);
    useEffect(() => {
        getEventCatList()
        getAcademicCatList()
    }, [])
    const getEventCatList = async () => {
        setIsLoading(true)
        const eventCategoryQuery = query(
            collection(db, 'eventcategory'),
            where('hostelid', '==', emp.hostelid)
        );

        const querySnapshot = await getDocs(eventCategoryQuery);
        const documents = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));

        setEventCatList(documents)
        setIsLoading(false)
    }
    const getAcademicCatList = async () => {
        setIsLoading(true)
        const academicCategoryQuery = query(
            collection(db, 'academiccategory'),
            where('hostelid', '==', emp.hostelid)
        );

        const querySnapshot = await getDocs(academicCategoryQuery);
        const documents = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        setAcademicCatList(documents)
        setIsLoading(false)
    }
    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });

    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!form.name) return;
            if (editingData) {

                const docRef = doc(db, 'eventcategory', form.id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    toast.warning('data does not exist! Cannot update.');
                    return;
                }
                await updateDoc(doc(db, 'eventcategory', form.id), {
                    uid: uid,
                    name: form.name,
                    hostelid: emp.hostelid,
                    updatedBy: uid,
                    updatedDate: new Date(),
                });
                toast.success('Successfully updated');
                getEventCatList()


            } else {
                const q = query(collection(db, 'eventcategory'), where('name', '==', form.name));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    toast.warn('Duplicate found! Not adding.');
                    return;
                }
                await addDoc(collection(db, "eventcategory"), {
                    uid: uid,
                    name: form.name,
                    hostelid: emp.hostelid,
                    createdBy: uid,
                    createdDate: new Date(),
                });
                toast.success("Successfully saved");
                getEventCatList()

            }

        } catch (error) {
            alert('ca')
            console.error("Error saving data:", error);
        }
        // Reset
        setEventModalOpen(false);
        setEditing(null);
        setForm(initialForm);
    };
    const handleDelete = async () => {
        if (!deleteData) return;
        try {
            await deleteDoc(doc(db, 'eventcategory', form.id));
            toast.success('Successfully deleted!');
            getEventCatList()
        } catch (error) {
            console.error('Error deleting document: ', error);
        }
        setEveDeleteModelOpen(false);
        setDelete(null);
    };
    const handleAcademicSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!form.name) return;
            if (editingData) {

                const docRef = doc(db, 'academiccategory', form.id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    toast.warning('data does not exist! Cannot update.');
                    return;
                }
                await updateDoc(doc(db, 'academiccategory', form.id), {
                    uid: uid,
                    name: form.name,
                    hostelid: emp.hostelid,
                    updatedBy: uid,
                    updatedDate: new Date(),
                });
                toast.success('Successfully updated');
                getAcademicCatList()


            } else {
                const q = query(collection(db, 'academiccategory'), where('name', '==', form.name));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    toast.warn('Duplicate found! Not adding.');
                    return;
                }
                await addDoc(collection(db, "academiccategory"), {
                    uid: uid,
                    name: form.name,
                    hostelid: emp.hostelid,
                    createdBy: uid,
                    createdDate: new Date(),
                });
                toast.success("Successfully saved");
                getAcademicCatList()

            }

        } catch (error) {
            alert('ca')
            console.error("Error saving data:", error);
        }
        // Reset
        setAcademicModalOpen(false);
        setEditing(null);
        setForm(initialForm);
    };
    const handleAcademicDelete = async () => {
        if (!deleteData) return;
        try {
            await deleteDoc(doc(db, 'academiccategory', form.id));
            toast.success('Successfully deleted!');
            getAcademicCatList()
        } catch (error) {
            console.error('Error deleting document: ', error);
        }
        setAcademicDeleteModelOpen(false);
        setDelete(null);
    };

    return (
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
            {/* Top bar with Add button */}
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Setting</h1>
                <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
                    onClick={() => {
                        setEditing(null);
                        setForm(initialForm);
                        setEventModalOpen(true);
                    }}>
                    + Add Event Category
                </button>
                <button className="px-4 py-2 bg-black text-white rounded hover:bg-black"
                    onClick={() => {
                        setEditing(null);
                        setForm(initialForm);
                        setAcademicModalOpen(true);
                    }}>
                    + Add Academic Category
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
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Event Category</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {eventCatlist.map((item, i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                                                setEditing(item);
                                                setForm(item);
                                                setEventModalOpen(true);
                                            }}>Edit</button>
                                            <button className="text-red-600 hover:underline" onClick={() => {
                                                setDelete(item);
                                                setForm(item);
                                                setEveDeleteModelOpen(true);
                                            }}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            {eventModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
                        <h2 className="text-xl font-bold mb-4">Add Event Category</h2>
                        <form onSubmit={handleSubmit} className="space-y-4" >
                            <div className="space-y-4">
                                {/* <input
                                    type="text"
                                    placeholder="Category"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                /> */}
                                <input name="name" placeholder="Category" value={form.name}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                            </div>
                            <div className="flex justify-end mt-6 space-x-3">
                                <button
                                    onClick={() => setEventModalOpen(false)}
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
            {eveDeleteModelOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 text-red-600">Delete User</h2>
                        <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setEveDeleteModelOpen(false);
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
            <br></br>
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
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Academic Category</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {academicCatlist.map((item, i) => (
                                    <tr key={i}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                                                setEditing(item);
                                                setForm(item);
                                                setAcademicModalOpen(true);
                                            }}>Edit</button>
                                            <button className="text-red-600 hover:underline" onClick={() => {
                                                setDelete(item);
                                                setForm(item);
                                                setAcademicDeleteModelOpen(true);
                                            }}>Delete</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            {academicModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
                        <h2 className="text-xl font-bold mb-4">Add Academic Category</h2>
                        <form onSubmit={handleAcademicSubmit} className="space-y-4" >
                            <div className="space-y-4">
                                {/* <input
                                    type="text"
                                    placeholder="Category"
                                    className="w-full border border-gray-300 p-2 rounded"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    required
                                /> */}
                                <input name="name" placeholder="Category" value={form.name}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                            </div>
                            <div className="flex justify-end mt-6 space-x-3">
                                <button
                                    onClick={() => setEventModalOpen(false)}
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
            {academicDeletModelOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 text-red-600">Delete User</h2>
                        <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setAcademicDeleteModelOpen(false);
                                    setDelete(null);
                                }}
                                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAcademicDelete}
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
};

export default SettingPage;
