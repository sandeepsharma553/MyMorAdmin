// src/pages/StudentPage.jsx
import React, { useState, useEffect, useMemo } from "react";
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
  writeBatch,
} from "firebase/firestore";

import * as XLSX from "xlsx";
import studentFile from "../../assets/excel/student_verification.xlsx";
import { parse, isValid } from "date-fns";

export default function StudentPage(props) {
  const { navbarHeight } = props;

  // Redux state
  const emp = useSelector((state) => state.auth.employee);
  const authUser = useSelector((state) => state.auth.user);
  const myUid = authUser?.uid;

  // UI State
  const [list, setList] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Excel state
  const [fileName, setFileName] = useState("No file chosen");
  const [data, setData] = useState([]); // parsed rows from Excel

  // Protected users
  const PROTECTED_EMAILS = useMemo(() => new Set(["chiggy14@gmail.com"]), []);
  const isProtected = (u) => {
    const emailLc = String(u?.email || "").trim().toLowerCase();
    return u?.id === myUid || PROTECTED_EMAILS.has(emailLc);
  };

  // Derived
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const paginatedData = list.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );
  const todayISO = () => new Date().toISOString().slice(0, 10);
  useEffect(() => {
    getList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getList = async () => {
    if (!emp?.hostelid) {
      toast.error("Missing hostel context.");
      return;
    }

    try {
      setIsLoading(true);

      // 1) Fetch only this hostel users
      const usersQuery = query(
        collection(db, "users"),
        where("hostelid", "==", emp.hostelid)
      );

      const snap = await getDocs(usersQuery);
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      const today = todayISO();

      // 2) Find expired users who are ONLY livingtype === "hostel"
      const expiredHostelUsers = [];
      for (const u of users) {
        if (isProtected(u)) continue;

        const living = String(u.livingtype || "").trim().toLowerCase();
        if (living !== "hostel") continue; // ✅ only hostel

        const end = String(u.studentVerifyEnd || "").trim().slice(0, 10); // expect YYYY-MM-DD
        if (end && end < today) {
          expiredHostelUsers.push(u.id);
        }
      }

      // 3) Batch update: hostel -> outside
      if (expiredHostelUsers.length) {
        let batch = writeBatch(db);
        let count = 0;

        for (const uid of expiredHostelUsers) {
          batch.update(doc(db, "users", uid), {
            livingtype: "outside",
            livingtypeUpdatedAt: serverTimestamp(),
            livingtypeReason: "student_verification_expired",
          });

          count++;
          if (count >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 4) Update UI list locally too (so table instantly shows new value)
      const updatedList = users
        .map((u) => {
          if (isProtected(u)) return null;

          const living = String(u.livingtype || "").trim().toLowerCase();
          if (living !== "hostel") return u; // ✅ do NOT touch outside/university

          const end = String(u.studentVerifyEnd || "").trim().slice(0, 10);
          if (end && end < today) {
            return { ...u, livingtype: "outside" };
          }
          return u;
        })
        .filter(Boolean);

      setList(updatedList);
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

  const normalize = (s = "") => String(s || "").trim().toLowerCase();

  // Convert Excel cell value -> ISO date string (YYYY-MM-DD) or null
  const excelDateToISO = (v) => {
    if (!v) return null;

    // If already Date
    if (v instanceof Date && !isNaN(v.getTime())) {
      return v.toISOString().slice(0, 10);
    }

    // If Excel serial number
    if (typeof v === "number") {
      // Excel epoch starts 1899-12-30 (with Excel bug), common conversion:
      const ms = Math.round((v - 25569) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }

    // If string: try yyyy-MM-dd then fallback Date()
    const s = String(v).trim();
    const p = parse(s, "yyyy-MM-dd", new Date());
    if (isValid(p)) return p.toISOString().slice(0, 10);

    const d2 = new Date(s);
    if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);

    return null;
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

        // raw: true keeps date-like values as Date/number where possible
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });

        const cleaned = jsonData.map((row) => {
          const studentid = row["Student ID"] || row["ID"] || row["sid"] || "";
          const studentname = row["Student Name"] || row["Name"] || "";
          const email = row["Student Email"] || row["Email"] || "";

          const startRaw =
            row["Start Date"] || row["Start"] || row["From"] || "";
          const endRaw = row["End Date"] || row["End"] || row["To"] || "";

          return {
            studentid,
            studentname,
            email,
            startDate: excelDateToISO(startRaw),
            endDate: excelDateToISO(endRaw),
          };
        });

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

      // Build lookup maps from Excel (email & studentid)
      const excelByEmail = new Map();
      const excelById = new Map();

      for (const r of data) {
        const e = normalize(r.email);
        const sid = normalize(r.studentid);

        // Optional: skip rows that have invalid date strings
        // (we already converted to ISO or null)
        // If you want to require both dates, uncomment:
        // if (!r.startDate || !r.endDate) continue;

        if (e) excelByEmail.set(e, r);
        if (sid) excelById.set(sid, r);
      }

      // Fetch users (fresh) in this hostel
      const usersQuery = query(
        collection(db, "users"),
        where("hostelid", "==", emp.hostelid)
      );
      const snap = await getDocs(usersQuery);
      const users = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // Decide who to disable vs enable
      const toDisable = [];
      const toEnable = [];
      const matchedRows = new Map(); // uid -> excel row

      for (const u of users) {
        if (isProtected(u)) continue;

        const emailKey = normalize(u.email);
        const idKey = normalize(u.studentid || u.studentID || u.sid);

        const row =
          (emailKey && excelByEmail.get(emailKey)) ||
          (idKey && excelById.get(idKey)) ||
          null;

        if (row) {
          toEnable.push(u.id);
          matchedRows.set(u.id, row);
        } else {
          toDisable.push(u.id);
        }
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

      // Save date range into Firestore for enabled users
      // (batch commit in chunks, safe below Firestore 500 ops limit)
      try {
        const batchLimit = 450;
        let batch = writeBatch(db);
        let count = 0;

        for (const uid of toEnable) {
          const r = matchedRows.get(uid);
          if (!r) continue;

          batch.update(doc(db, "users", uid), {
            accountStatus: "active",
            verified: true,
            verifiedAt: serverTimestamp(),
            disabledReason: null,
            disabledAt: null,
            studentVerifyStart: r.startDate || null,
            studentVerifyEnd: r.endDate || null,
          });

          count++;
          if (count >= batchLimit) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }

        if (count > 0) await batch.commit();
      } catch (e) {
        console.error(e);
        toast.error("Enabled users updated, but date range save failed.");
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

  // Toggle single user enable/disable
  const handleToggleUser = async (uid, currentStatus) => {
    const isDisabling = currentStatus !== "disabled"; // active/null -> disable, disabled -> enable
    const endpoint = isDisabling
      ? "https://us-central1-mymor-one.cloudfunctions.net/disableUserByUid"
      : "https://us-central1-mymor-one.cloudfunctions.net/enableUserByUid";

    try {
      if (isDisabling) {
        const ok = window.confirm("Are you sure you want to disable this account?");
        if (!ok) return;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid }),
      });
      const res = await response.json();
      if (!response.ok) throw new Error(res.error || "Operation failed");

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
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Address
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Image
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-sm font-medium text-gray-500">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="px-6 py-4 text-center text-gray-500"
                  >
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
                          {(item.username || item.name || "U")
                            .toString()
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs ${(item.accountStatus || "active") === "disabled"
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
                          onClick={() =>
                            handleToggleUser(item.id, item.accountStatus)
                          }
                          className="px-2 py-1 bg-green-600 text-white rounded text-xs"
                        >
                          Enable
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            handleToggleUser(item.id, item.accountStatus)
                          }
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
