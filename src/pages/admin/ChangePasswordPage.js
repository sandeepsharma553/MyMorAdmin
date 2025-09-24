import React, { useMemo, useState } from "react";
import {
  getAuth,
  reauthenticateWithCredential,
  EmailAuthProvider,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { ToastContainer, toast } from "react-toastify";
import { useDispatch } from "react-redux";
import { logoutAdmin } from "../../app/features/AuthSlice";

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const dispatch = useDispatch();
  const auth = useMemo(() => getAuth(), []);
  const handleLogout = () => dispatch(logoutAdmin());

  const handleSubmit = async (e) => {
    e.preventDefault();

    const user = auth.currentUser;
    if (!user) {
      toast.error("You must be logged in to change your password.");
      return;
    }

    if (!user.email) {
      toast.error("This account has no email/password sign-in. Use your provider to update the password.");
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
      // 1) Reauthenticate FIRST
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // 2) Then update password
      await updatePassword(user, newPassword);

      // 3) Optional: update employee metadata (DO NOT store password)
      const docRef = doc(db, "employees", user.uid);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        await updateDoc(docRef, {
          lastPasswordChangeAt: serverTimestamp(),
          password: newPassword
        });
      }

      toast.success("Password updated successfully ✨");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // 4) (Optional) force re-login for security
      setTimeout(() => {
        handleLogout();
      }, 800);
    } catch (err) {
      console.error(err);
      const code = err?.code || "";
      switch (code) {
        case "auth/wrong-password":
        case "auth/invalid-credential":
          toast.error("Current password is incorrect.");
          break;
        case "auth/weak-password":
          toast.error("New password is too weak.");
          break;
        case "auth/too-many-requests":
          toast.error("Too many attempts – please try again later.");
          break;
        case "auth/requires-recent-login":
          toast.error("Please reauthenticate and try again.");
          break;
        default:
          toast.error(err.message || "Failed to update password.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
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
          autoComplete="current-password"
          className="mb-4 w-full rounded border border-gray-300 p-2 focus:border-indigo-500 focus:outline-none"
        />

        <label className="mb-2 block text-sm font-medium">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
          autoComplete="new-password"
          className="mb-4 w-full rounded border border-gray-300 p-2 focus:border-indigo-500 focus:outline-none"
        />

        <label className="mb-2 block text-sm font-medium">Confirm New Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
          className="mb-6 w-full rounded border border-gray-300 p-2 focus:border-indigo-500 focus:outline-none"
        />

        <button
          type="submit"
          disabled={
            loading ||
            !currentPassword ||
            !newPassword ||
            newPassword !== confirmPassword
          }
          className="w-full rounded bg-black py-2 text-white transition hover:bg-gray-900 disabled:opacity-70"
        >
          {loading ? "Updating…" : "Update Password"}
        </button>
      </form>
      <ToastContainer />
    </main>
  );
}
