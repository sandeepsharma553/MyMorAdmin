import React, { useState } from "react";
import {
  getAuth, reauthenticateWithCredential, EmailAuthProvider, updatePassword
} from "firebase/auth";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import { ToastContainer, toast } from "react-toastify";
import { useDispatch } from "react-redux";
import { logoutAdmin } from "../../../app/features/AuthSlice";
import { useSelector } from "react-redux";
export default function ChangePasswordPage() {
  // const user = useSelector((state) => state);
  const auth = getAuth();
  const user = auth.currentUser;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const dispatch = useDispatch();
  const handleLogout = () => {
    dispatch(logoutAdmin());
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!user) {
      toast.error("You must be logged in to change your password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match.");
      return;
    }

    if (newPassword.length < 6) {
      toast.error("Password should be at least 6 characters long.");
      return;
    }

    setLoading(true);
    try {

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
     
      const docRef = doc(db, "employees", user.uid);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) {
       // toast.warning("Employee record does not exist – cannot update.");
        return;
      }
      const employeeData = {
        password: currentPassword
      }
      await updateDoc(docRef, employeeData);
      toast.success("Password updated successfully ✨");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(()=>{
        handleLogout()
      },1000) 
      

    } catch (err) {
      console.error(err);
      switch (err.code) {
        case "auth/wrong-password":
          toast.error("Current password is incorrect.");
          break;
        case "auth/weak-password":
          toast.error("New password is too weak.");
          break;
        case "auth/too-many-requests":
          toast.error("Too many attempts – please try again later.");
          break;
        case "auth/invalid-credential":
          toast.error("The current password you entered is incorrect. Please double‑check and try again.");
          break;
        default:
          toast.error(err.message || "Failed to update password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex items-center justify-center bg-gray-100 p-4">

      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="mb-6 text-center text-2xl font-semibold">
          Change Password
        </h1>

        <label className="mb-2 block text-sm font-medium">Current Password</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
          className="mb-4 w-full rounded border border-gray-300 p-2 focus:border-indigo-500 focus:outline-none"
        />

        <label className="mb-2 block text-sm font-medium">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          className="mb-4 w-full rounded border border-gray-300 p-2 focus:border-indigo-500 focus:outline-none"
        />

        <label className="mb-2 block text-sm font-medium">Confirm New Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="mb-6 w-full rounded border border-gray-300 p-2 focus:border-indigo-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-black py-2 text-white transition hover:bg-gray-900 disabled:opacity-70"
        >
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
      <ToastContainer />
    </main>
  );
}
