// src/pages/StudentPage.jsx
import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { FadeLoader } from "react-spinners";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

import { db } from "../../firebase";
import {
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  doc,
  serverTimestamp,
} from "firebase/firestore";

import * as XLSX from "xlsx";
import studentFile from "../../assets/excel/student_verification.xlsx";

export default function StudentPage(props) {
  const { navbarHeight } = props;

  // Redux state
  const emp = useSelector((state) => state.auth.employee);

  // UI State
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Excel state
  const [fileName, setFileName] = useState("No file chosen");
  const [data, setData] = useState([]); // parsed rows from Excel

  // Derived
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = list.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const authUser = useSelector((state) => state.auth.user);
  const myUid = authUser?.uid;
  const PROTECTED_EMAILS = new Set(["chiggy14@gmail.com"]);
  const isProtected = (u) => {
  const emailLc = String(u?.email || "").trim().toLowerCase();
  return u?.id === myUid || PROTECTED_EMAILS.has(emailLc);
};
  useEffect(() => {
    getList();
  }, []);

  const getList = async () => {
    if (!emp?.hostelid) {
      toast.error("Missing hostel context.");
      return;
    }
    try {
      setIsLoading(true);
      const usersQuery = query(
        collection(db, "users"),
        where("hostelid", "==", emp.hostelid)
      );
      const snap = await getDocs(usersQuery);
      const docs = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => !isProtected(u));
      setList(docs);
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch users.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(studentFile);
      const blob = await response.blob();
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "student_verification.xlsx";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error(e);
      toast.error("Could not download template.");
    }
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

        const cleaned = jsonData.map((row) => ({
          studentid: row["Student ID"] || row["ID"] || row["sid"] || "",
          studentname: row["Student Name"] || row["Name"] || "",
          email: row["Student Email"] || row["Email"] || "",
        }));
        setData(cleaned);
      } catch (e) {
        console.error(e);
        toast.error("Failed to parse Excel.");
      } finally {
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const normalize = (s = "") => String(s || "").trim().toLowerCase();

  const handleUploadExcel = async () => {
    if (!emp?.hostelid) {
      toast.error("Missing hostel context.");
      return;
    }
    if (!data.length) {
      toast.error("Please choose an Excel file first.");
      return;
    }
    try {
      setIsLoading(true);

      // Build lookups from Excel
      const excelEmails = new Set(
        data.map((r) => normalize(r.email)).filter(Boolean)
      );
      const excelIds = new Set(
        data.map((r) => normalize(r.studentid)).filter(Boolean)
      );

      // Fetch users (fresh) in this hostel
      const usersQuery = query(
        collection(db, "users"),
        where("hostelid", "==", emp.hostelid)
      );
      const snap = await getDocs(usersQuery);
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Decide who to disable vs enable (Auth + Firestore via CF HTTP endpoint)
      const toDisable = [];
      const toEnable = [];

      for (const u of users) {
        if (isProtected(u)) continue;
        const emailKey = normalize(u.email);
        const idKey = normalize(u.studentid || u.studentID || u.sid);

        const isMatch =
          (emailKey && excelEmails.has(emailKey)) ||
          (idKey && excelIds.has(idKey));

        if (isMatch) toEnable.push(u.id); // uid == doc id
        else toDisable.push(u.id);
      }

      // Call HTTP endpoint (matches functions.bulkSetUsersStatus)
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/bulkSetUsersStatus",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toDisable, toEnable }),
        }
      );
      const res = await response.json();

      if (!response.ok) {
        throw new Error(res?.error || "Bulk update failed");
      }

      const { enabledCount = 0, disabledCount = 0 } = res || {};
      toast.success(
        `Verification complete. Enabled: ${enabledCount}, Disabled: ${disabledCount}, Total checked: ${users.length}`
      );

      await getList();
      setCurrentPage(1);
    } catch (err) {
      console.error(err);
      toast.error(err.message || "Upload failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Manual single-user enable (Auth CF + local Firestore mirror just in case)
  const handleEnableUser = async (uid) => {
    try {
      // 1) Enable in Auth (your CF also mirrors Firestore if you patched it)
      const response = await fetch(
        "https://us-central1-mymor-one.cloudfunctions.net/enableUserByUid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uid }),
        }
      );
      const res = await response.json();
      if (!response.ok) throw new Error(res.error || "Failed to enable user");

      // 2) Ensure Firestore reflects status (safe no-op if CF already did)
      await updateDoc(doc(db, "users", uid), {
        accountStatus: "active",
        verified: true,
        verifiedAt: serverTimestamp(),
        disabledReason: null,
        disabledAt: null,
      });

      // Optimistic UI
      setList((prev) =>
        prev.map((u) =>
          u.id === uid
            ? {
                ...u,
                accountStatus: "active",
                verified: true,
              }
            : u
        )
      );

      toast.success("Account enabled successfully");
    } catch (err) {
      console.error(err);
      toast.error("Enable failed");
    }
  };
// ADD THIS inside component (replace your handleEnableUser if you want one function)
const handleToggleUser = async (uid, currentStatus) => {
    const isDisabling = currentStatus !== "disabled"; // if active/null → disable, if disabled → enable
    const endpoint = isDisabling
      ? "https://us-central1-mymor-one.cloudfunctions.net/disableUserByUid"
      : "https://us-central1-mymor-one.cloudfunctions.net/enableUserByUid";
  
    try {
      // Optional confirm on disabling
      if (isDisabling) {
        const ok = window.confirm("Are you sure you want to disable this account?");
        if (!ok) return;
      }
  
      // 1) Call your HTTP CF to flip Auth (and ideally CF also mirrors Firestore as we patched)
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      const res = await response.json();
      if (!response.ok) throw new Error(res.error || "Operation failed");
  
      // 2) Ensure Firestore reflects status (safe no-op if CF already did)
      if (isDisabling) {
        await updateDoc(doc(db, "users", uid), {
          accountStatus: "disabled",
          verified: false,
          disabledReason: "Disabled by admin",
          disabledAt: serverTimestamp(),
        });
      } else {
        await updateDoc(doc(db, "users", uid), {
          accountStatus: "active",
          verified: true,
          verifiedAt: serverTimestamp(),
          disabledReason: null,
          disabledAt: null,
        });
      }
  
      // 3) Optimistic UI
      setList((prev) =>
        prev.map((u) =>
          u.id === uid
            ? {
                ...u,
                accountStatus: isDisabling ? "disabled" : "active",
                verified: !isDisabling,
              }
            : u
        )
      );
  
      toast.success(isDisabling ? "Account disabled" : "Account enabled");
    } catch (err) {
      console.error(err);
      toast.error("Action failed");
    }
  };
  
  return (
    <main
      className="flex-1 p-6 bg-gray-100 overflow-auto"
      style={{ paddingTop: navbarHeight ? `${navbarHeight}px` : undefined }}
    >
      {/* Top bar */}
      <div className="flex flex-wrap gap-3 justify-between items-center mb-4">
        <h1 className="text-2xl font-semibold">Student</h1>

        <div className="flex items-center gap-3">
          <button
            className="bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition"
            onClick={handleDownload}
          >
            Download Excel File
          </button>

          <div className="flex items-center gap-3 bg-gray-100 border border-gray-300 px-4 py-2 rounded-xl">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx, .xls"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setFileName(file.name);
                    readExcel(file);
                  } else {
                    setFileName("No file chosen");
                    setData([]);
                  }
                }}
              />
              📁 Choose File
            </label>
            <span className="text-sm text-gray-600 truncate max-w-[200px]">
              {fileName}
            </span>
          </div>

          <button
            className="bg-black text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition disabled:opacity-60"
            disabled={!data.length || isLoading}
            onClick={handleUploadExcel}
          >
            {isLoading ? "Processing..." : "Upload Excel"}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto bg-white rounded shadow">
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <FadeLoader />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Address</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Image</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Status</th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800">
                      {item.username || item.name || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap pr-16">
                      {item.email || "—"}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 whitespace-nowrap">
                      {item.address || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {item.photoURL ? (
                        <img
                          src={item.photoURL}
                          alt="avatar"
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-300 flex items-center justify-center text-sm text-white">
                          {(item.username || item.name || "U").toString().charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          (item.accountStatus || "active") === "disabled"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {item.accountStatus || "active"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
  {item.accountStatus === "disabled" ? (
    <button
      onClick={() => handleToggleUser(item.id, item.accountStatus)}
      className="px-2 py-1 bg-green-600 text-white rounded text-xs"
    >
      Enable
    </button>
  ) : (
    <button
      onClick={() => handleToggleUser(item.id, item.accountStatus)}
      className="px-2 py-1 bg-red-600 text-white rounded text-xs"
    >
      Disable
    </button>
  )}
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

      <ToastContainer />
    </main>
  );
}
