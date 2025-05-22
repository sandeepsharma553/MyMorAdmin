import React, { useState } from "react";

const AccountDeletionRequest = () => {
  const [form, setForm] = useState({ email: "", message: "" });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // You'd send this to your backend or support email
    console.log("Account deletion requested:", form);
    alert("You delete request has been submitted")
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 p-6">
      <div className="bg-white shadow-md rounded-xl p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold mb-4 text-center">Request Account Deletion</h1>
        {submitted ? (
          <p className="text-green-600 text-center">
            Your request has been submitted. We will process your account deletion soon.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium">Email Address</label>
              <input
                required
                type="email"
                name="email"
                id="email"
                className="w-full border border-gray-300 rounded-md p-2 mt-1"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="message" className="block text-sm font-medium">Reason (optional)</label>
              <textarea
                name="message"
                id="message"
                className="w-full border border-gray-300 rounded-md p-2 mt-1"
                rows="4"
                placeholder="Let us know why you're leaving..."
                value={form.message}
                onChange={handleChange}
              />
            </div>
            <button
              type="submit"
              className="w-full bg-red-600 text-white py-2 px-4 rounded-md hover:bg-red-700"
            >
              Request Deletion
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AccountDeletionRequest;
