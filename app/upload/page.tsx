"use client";

import { useState } from "react";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleUpload() {
    if (!file) return;
    setLoading(true);

    const formData = new FormData();
    formData.append("video", file);

    try {
      // const token = localStorage.getItem("token");
      // if (!token) {
      //   setMessage("You must be logged in!");
      //   setLoading(false);
      //   return;
      // }

      const res = await fetch("/api/v1/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      setMessage(
        data.success
          ? `Uploaded! ID: ${data.id}`
          : data.error || "Failed upload"
      );
    } catch (err) {
      console.error(err);
      setMessage("Upload failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center mt-10">
      <h1 className="text-3xl font-bold mb-4">🎬 Upload a Video</h1>
      <input
        type="file"
        accept="video/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />
      <button
        onClick={handleUpload}
        className="mt-4 bg-blue-600 px-4 py-2 text-white rounded hover:bg-blue-700"
        disabled={loading}
      >
        {loading ? "Uploading..." : "Upload"}
      </button>
      {message && <p className="mt-3 text-green-400">{message}</p>}
    </div>
  );
}
