// "use client";

// import React, { useEffect, useRef, useState } from "react";

// export default function WatchPageBlob() {
//   const videoRef = useRef<HTMLVideoElement | null>(null);
//   const [chunks, setChunks] = useState<Uint8Array[]>([]);

//   useEffect(() => {
//     const videoId = new URLSearchParams(window.location.search).get("id");
//     if (!videoId) return;

//     const eventSource = new EventSource(`/api/v1/segement?id=${videoId}`);

//     eventSource.onmessage = (event) => {
//       const chunk = Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0));
//       setChunks((prev) => [...prev, chunk]);
//     };

//     eventSource.onerror = () => {
//       console.log("Stream ended");
//       eventSource.close();

//       if (videoRef.current) {
//         const blob = new Blob(chunks, { type: "video/mp4" });
//         videoRef.current.src = URL.createObjectURL(blob);
//         videoRef.current.play();
//       }
//     };

//     return () => eventSource.close();
//   }, [chunks]);

//   return (
//     <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
//       <h1 className="text-2xl mb-4">Streaming Video (Blob)</h1>
//       <video ref={videoRef} controls className="w-[80%] max-w-3xl rounded-lg" />
//     </div>
//   );
// }
"use client";

import React, { useEffect, useRef } from "react";

export default function WatchPageMediaSource() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoId = new URLSearchParams(window.location.search).get("id");
    if (!videoId || !videoRef.current) return;

    const mediaSource = new MediaSource();
    videoRef.current.src = URL.createObjectURL(mediaSource);

    mediaSource.addEventListener("sourceopen", () => {
      const sourceBuffer = mediaSource.addSourceBuffer(
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
      );

      const eventSource = new EventSource(`/api/v1/segement?id=${videoId}`);

      eventSource.onmessage = (event) => {
        const chunk = Uint8Array.from(atob(event.data), (c) => c.charCodeAt(0));
        if (!sourceBuffer.updating) sourceBuffer.appendBuffer(chunk);
      };

      eventSource.onerror = () => {
        console.log("Stream ended");
        eventSource.close();
      };
    });
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-2xl mb-4">Streaming Video (MediaSource)</h1>
      <video ref={videoRef} controls className="w-[80%] max-w-3xl rounded-lg" />
    </div>
  );
}
