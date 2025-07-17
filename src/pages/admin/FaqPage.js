import React, { useState, useEffect, useRef } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc, Timestamp } from "firebase/firestore";
import { db, storage } from "../../firebase";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useSelector } from "react-redux";

export default function FaqPage(props) {
    const { navbarHeight } = props;
    const [modalOpen, setModalOpen] = useState(false)
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
    const [list, setList] = useState([])
    const [isLoading, setIsLoading] = useState(false)
    const [currentPage, setCurrentPage] = useState(1);
    const uid = useSelector((state) => state.auth.user.uid)
    const user = useSelector((state) => state.auth.user)
    const emp = useSelector((state) => state.auth.employee)
    const initialForm = {
        id: 0,
        question: '',
        answer: '',
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
    const getList = async () => {
        setIsLoading(true)
        const q = query(
            collection(db, 'faqquestions'),
            where("hostelid", "==", emp.hostelid)
        );

        const querySnapshot = await getDocs(q);
        const documents = querySnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        setList(documents)
        setIsLoading(false)
    }
    const handleChange = (e) => {
        const { name, value, } = e.target;
        setForm({ ...form, [name]: value });
    };
    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const faqData = {
                ...form,
                hostelid: emp.hostelid,
                uid: uid
            };
            delete faqData.id;
            if (editingData) {
                const docRef = doc(db, 'faqquestions', form.id);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    toast.warning('FAQ does not exist! Cannot update.');
                    return;
                }
                const dealRef = doc(db, 'faqquestions', form.id);
                await updateDoc(dealRef, faqData);
                toast.success('FAQ updated successfully');
            }
            else {
                await addDoc(collection(db, 'faqquestions'), faqData);
                toast.success('FAQ created successfully');
            }
        } catch (error) {
            console.error("Error saving data:", error);
        }
        getList()
        setModalOpen(false);
        setEditing(null);
        setForm(initialForm);
    };
    const handleDelete = async () => {
        if (!deleteData) return;
        try {
            await deleteDoc(doc(db, 'faqquestions', form.id));
            toast.success('Successfully deleted!');
            getList()
        } catch (error) {
            console.error('Error deleting document: ', error);
        }
        setConfirmDeleteOpen(false);
        setDelete(null);
    };


    return (
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
            {/* Top bar with Add button */}
            <div className="flex justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">FAQ</h1>
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
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Question</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Answer</th>
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
                                    paginatedData.map((item, i) => (
                                        <tr key={i}>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.question}</td>
                                            <td className="px-6 py-4 text-sm text-gray-700">

                                                <div className="flex-shrink">{item.answer}</div></td>

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
                        <h2 className="text-xl font-bold mb-4">Add FAQ</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-4">
                                <input name="question" placeholder="Question" value={form.question}
                                    onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required />

                                <textarea name="answer" placeholder="Answer" value={form.answer} onChange={handleChange} className="w-full border border-gray-300 p-2 rounded" required></textarea>

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
                        <h2 className="text-xl font-semibold mb-4 text-red-600">Delete FAQ</h2>
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
