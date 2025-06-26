import React, { useState, useEffect } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db, storage } from "../../src/firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
export default function ResourcesPage(props) {
    const { navbarHeight } = props;
    const [resources, setResources] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [list, setList] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [fileName, setFileName] = useState('No file chosen');
    const initialForm = {
        id: 0,
        services: [''],
        dutyDate: '',
        dutyContact: '',
        nonemergency: '',
        nonemergency1: '',
        account: ''

    }
    const [form, setForm] = useState(initialForm);
    const pageSize = 10;
    const mockData = list
    const filteredData = mockData.filter(
        (item) =>
            item.dutyDate.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const totalPages = Math.ceil(filteredData.length / pageSize);
    const paginatedData = filteredData.slice(
        (currentPage - 1) * pageSize,
        currentPage * pageSize
    );
    useEffect(() => {
        getList()
    }, [])
    const getList = async () => {
        setIsLoading(true)
        const querySnapshot = await getDocs(collection(db, 'resources'));
        const documents = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        setList(documents)
        setIsLoading(false)
    }
    const handleChange = (e) => {
        const { name, value, type } = e.target;
        setForm({ ...form, [name]: value });
    };
    const handleChange1 = (index, value) => {
        setForm(prev => {
            const next = [...prev.services];
            next[index] = value;
            return { ...prev, services: next };
        });
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const resourceData = {
                ...form,
            };
            delete resourceData.id;
            if (editingData) {
                const docRef = doc(db, 'resources', form.id);
                const docSnap = await getDoc(docRef);

                if (!docSnap.exists()) {
                    toast.warning('Resources does not exist! Cannot update.');
                    return;
                }
                const resourcesRef = doc(db, 'resources', form.id);
                await updateDoc(resourcesRef, resourceData);
                toast.success('Resources updated successfully');
            }
            else {
                await addDoc(collection(db, 'resources'), resourceData);
                toast.success('Resources created successfully');
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
            await deleteDoc(doc(db, 'resources', form.id));
            toast.success('Successfully deleted!');
            getList()
        } catch (error) {
            console.error('Error deleting document: ', error);
        }
        setConfirmDeleteOpen(false);
        setDelete(null);
    };
    const addItem = () => {
        setForm(prev => ({
            ...prev,
            services: [...prev.services, '']
        }));
    };

    const removeItem = (index) => {
        setForm(prev => ({
            ...prev,
            services: prev.services.filter((_, i) => i !== index)
        }));
    };
    return (
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
            {/* Top bar with Add button */}
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Resources</h1>
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
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <FadeLoader color="#36d7b7" loading={isLoading} />
                    </div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">UWA Student Service</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Duty Ra</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Non-Emergency Services</th>
                                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Accommodation</th>
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
                                paginatedData.map((item) => (
                                    <tr key={item.id}>
                                        {item.services.map((c, index) => (
                                            <tr key={index} className="border-b">

                                                <td className="p-2 border">
                                                    <ul className="list-disc list-inside space-y-1">
                                                        <li key={index}>{c}</li>
                                                    </ul>
                                                </td>
                                            </tr>
                                        ))}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                            <ul className="list-disc list-inside space-y-1">
                                                <li> {item.dutyDate}</li>
                                                <li> {item.dutyContact}</li>
                                            </ul>

                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                            <ul className="list-disc list-inside space-y-1">
                                                <li> {item.nonemergency}</li>
                                                <li> {item.nonemergency1}</li>
                                            </ul>
                                        </td>

                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.account}</td>

                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button className="text-blue-600 hover:underline mr-3" onClick={() => {
                                                setEditing(item);
                                                setForm(prev => ({
                                                    ...prev,
                                                    ...item,
                                                    id: item.id,
                                                }));
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

            {/* Pagination controls */}
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
                        <h2 className="text-xl font-bold mb-4">Create Resources</h2>
                        <form onSubmit={handleSubmit} className="space-y-4" >
                            <div className="space-y-4">
                                <label>UWA Student Service</label>
                                <div className="border border-gray-200 p-4 rounded mb-4">
                                    {form.services.map((item, index) => (

                                        <div key={index} className="flex items-center gap-2">
                                            <input
                                                type="text"
                                                className="flex-1 border border-gray-300 p-2 rounded"
                                                placeholder={`Item ${index + 1}`}
                                                value={item}
                                                onChange={e => handleChange1(index, e.target.value)}
                                                required
                                            />

                                            <button
                                                type="button"
                                                onClick={() => removeItem(index)}
                                                className="text-red-500 hover:text-red-700"
                                                title="Delete item"
                                            >
                                                ❌
                                            </button>
                                        </div>


                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => addItem()}
                                        className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Add Item
                                    </button>
                                </div>
                                <label>Duty Ra</label>

                                <input name="dutyDate" placeholder="Duty Ra" value={form.dutyDate}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                                <input name="dutyContact" type="number" min={0} placeholder="Contact" value={form.dutyContact}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                                <label>Non-Emergency Service</label>
                                <input name="nonemergency" type="number" min={0} placeholder="Contact Number" value={form.nonemergency}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                                <input name="nonemergency1" type="number" min={0} placeholder="Contact Number" value={form.nonemergency1}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
                                <label>Accommodation</label>
                                <input name="account" placeholder="Account" value={form.account}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />
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
                        <form onSubmit={handleSubmit} className="p-4 max-w-2xl mx-auto">
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
