import React, { useState, useEffect, useMemo } from "react";
import { collection, addDoc, getDocs, updateDoc, doc, deleteDoc, query, where, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";

// Reusable pager
const Pager = ({ page, setPage, pageSize, setPageSize, total }) => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const canPrev = page > 1;
    const canNext = page < totalPages;

    return (
        <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Rows per page</span>
                <select
                    className="border rounded px-2 py-1 text-sm"
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                >
                    {[5, 10, 20, 50, 100].map((n) => (
                        <option key={n} value={n}>{n}</option>
                    ))}
                </select>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-sm text-gray-600">
                    Page {page} of {totalPages}
                </span>
                <div className="flex items-center gap-2">
                    <button
                        className={`px-3 py-1 rounded border ${canPrev ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                        onClick={() => canPrev && setPage((p) => p - 1)}
                        disabled={!canPrev}
                    >
                        Prev
                    </button>
                    <button
                        className={`px-3 py-1 rounded border ${canNext ? "bg-white hover:bg-gray-50" : "bg-gray-100 text-gray-400 cursor-not-allowed"}`}
                        onClick={() => canNext && setPage((p) => p + 1)}
                        disabled={!canNext}
                    >
                        Next
                    </button>
                </div>
            </div>
        </div>
    );
};

const EventSettingPage = (props) => {
    const [paymentModalOpen, setPaymentModalOpen] = useState(false);
    const [editingData, setEditing] = useState(null);
    const [deleteData, setDelete] = useState(null);
    const [paymentyDeletModelOpen, setPaymentDeleteModelOpen] = useState(false);
    const [paymentlist, setPaymentList] = useState([]);
    const [isLoading, setIsLoading] = useState(false);


    const [paymentPage, setPaymentPage] = useState(1);
    const [paymentPageSize, setPaymentPageSize] = useState(5);

    const uid = useSelector((state) => state.auth.user.uid);
    const emp = useSelector((state) => state.auth.employee);
    const initialForm = { id: 0, name: "" };
    const [form, setForm] = useState(initialForm);

    useEffect(() => {
        getpaymentList();
    }, []);

    useEffect(() => setPaymentPage(1), [paymentlist.length]);

    // Derived, paginated slices
    const problemSlice = useMemo(() => {
        const start = (paymentPage - 1) * paymentPageSize;
        return paymentlist.slice(start, start + paymentPageSize);
    }, [paymentlist, paymentPage, paymentPageSize]);



    const getpaymentList = async () => {
        setIsLoading(true);
        const maintenanceCategoryQuery = query(
            collection(db, "eventpaymenttype"),
            where("hostelid", "==", emp.hostelid)
        );

        const querySnapshot = await getDocs(maintenanceCategoryQuery);
        const documents = querySnapshot.docs.map((docu) => ({ id: docu.id, ...docu.data() }));
        setPaymentList(documents);
        setIsLoading(false);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm({ ...form, [name]: value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (!form.name) return;
            if (editingData) {
                const docRef = doc(db, "eventpaymenttype", form.id);
                const docSnap = await getDoc(docRef);
                if (!docSnap.exists()) {
                    toast.warning("data does not exist! Cannot update.");
                    return;
                }
                await updateDoc(doc(db, "eventpaymenttype", form.id), {
                    uid,
                    name: form.name,
                    hostelid: emp.hostelid,
                    updatedBy: uid,
                    updatedDate: new Date(),
                });
                toast.success("Successfully updated");
                getpaymentList();
            } else {
                const q = query(collection(db, "eventpaymenttype"), where("name", "==", form.name),
                    where("hostelid", "==", emp.hostelid));
                const querySnapshot = await getDocs(q);
                if (!querySnapshot.empty) {
                    toast.warn("Duplicate found! Not adding.");
                    return;
                }
                await addDoc(collection(db, "eventpaymenttype"), {
                    uid,
                    name: form.name,
                    hostelid: emp.hostelid,
                    createdBy: uid,
                    createdDate: new Date(),
                });
                toast.success("Successfully saved");
                getpaymentList();
            }
        } catch (error) {
            console.error("Error saving data:", error);
        }
        // Reset
        setPaymentModalOpen(false);
        setEditing(null);
        setForm(initialForm);
    };

    const handleDelete = async () => {
        if (!deleteData) return;
        try {
            await deleteDoc(doc(db, "eventpaymenttype", form.id));
            toast.success("Successfully deleted!");
            getpaymentList();
        } catch (error) {
            console.error("Error deleting document: ", error);
        }
        setPaymentDeleteModelOpen(false);
        setDelete(null);
    };



    return (
        <main className="flex-1 p-6 bg-gray-100 overflow-auto">
            {/* Top bar with Add buttons */}
            <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
                <h1 className="text-2xl font-semibold">Event Setting</h1>
                <div className="flex gap-2">
                    <button
                        className="px-4 py-2 bg-black text-white rounded hover:bg-black"
                        onClick={() => {
                            setEditing(null);
                            setForm(initialForm);
                            setPaymentModalOpen(true);
                        }}
                    >
                        + Add Payment Type
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto bg-white rounded shadow">
                {isLoading ? (
                    <div className="flex justify-center items-center h-64">
                        <FadeLoader color="#36d7b7" loading={isLoading} />
                    </div>
                ) : (
                    <>
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Payment Type</th>
                                    <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {problemSlice.map((item, i) => (
                                    <tr key={item.id ?? i}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{item.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button
                                                className="text-blue-600 hover:underline mr-3"
                                                onClick={() => {
                                                    setEditing(item);
                                                    setForm(item);
                                                    setPaymentModalOpen(true);
                                                }}
                                            >
                                                Edit
                                            </button>
                                            <button
                                                className="text-red-600 hover:underline"
                                                onClick={() => {
                                                    setDelete(item);
                                                    setForm(item);
                                                    setPaymentDeleteModelOpen(true);
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {problemSlice.length === 0 && (
                                    <tr>
                                        <td className="px-6 py-10 text-center text-sm text-gray-500" colSpan={2}>No records</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        <Pager
                            page={paymentPage}
                            setPage={setPaymentPage}
                            pageSize={paymentPageSize}
                            setPageSize={setPaymentPageSize}
                            total={paymentlist.length}
                        />
                    </>
                )}
            </div>

            {/* Problem Category Modal */}
            {paymentModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-96 shadow-lg">
                        <h2 className="text-xl font-bold mb-4">Add Payment Type</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <input
                                name="name"
                                placeholder="Payment Type"
                                value={form.name}
                                onChange={handleChange}
                                className="w-full border border-gray-300 p-2 rounded"
                                required
                            />
                            <div className="flex justify-end mt-6 space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setPaymentModalOpen(false)}
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
            {paymentyDeletModelOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg w-80 shadow-lg">
                        <h2 className="text-xl font-semibold mb-4 text-red-600">Delete Payment Type</h2>
                        <p className="mb-4">Are you sure you want to delete <strong>{deleteData?.name}</strong>?</p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => {
                                    setPaymentDeleteModelOpen(false);
                                    setDelete(null);
                                }}
                                className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
                            >
                                Cancel
                            </button>
                            <button onClick={handleDelete} className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                        </div>
                    </div>
                </div>
            )}
            <ToastContainer />
        </main>
    );
};

export default EventSettingPage;
