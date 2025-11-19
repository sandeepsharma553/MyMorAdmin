import React from "react";

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10 flex justify-center">
      <div className="w-full max-w-2xl bg-white shadow-xl rounded-2xl p-8">
        <h1 className="text-3xl font-bold mb-2">Contact MyMor</h1>

        <p className="text-gray-600 text-sm mb-6">
          Have questions about MyMor? Get in touch using the contacts below.
        </p>

        {/* Steps */}
        <ol className="list-decimal pl-5 space-y-4 text-gray-800 text-sm">
          <li>Check our help or FAQ section if available.</li>

          <li>
            Add these contacts to your email:
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a
                href="mailto:mymor@mymor.app"
                className="text-yellow-500 underline hover:text-yellow-600"
              >
                mymor@mymor.app
              </a>
              <span className="text-gray-500">and</span>
              <a
                href="mailto:chiggy14@gmail.com"
                className="text-yellow-500 underline hover:text-yellow-600"
              >
                chiggy14@gmail.com
              </a>
            </div>
          </li>
        </ol>

        {/* Buttons */}
        <div className="mt-8 flex flex-wrap gap-3">
          <a
            href="mailto:mymor@mymor.app?subject=MyMor%20Enquiry"
            className="px-5 py-2 rounded-full bg-black text-white text-sm font-medium hover:bg-gray-900"
          >
            Email MyMor
          </a>

          <a
            href="mailto:chiggy14@gmail.com?subject=Enquiry"
            className="px-5 py-2 rounded-full bg-gray-200 text-gray-900 text-sm font-medium hover:bg-gray-300"
          >
            Email Chirag
          </a>
        </div>
      </div>
    </main>
  );
}
