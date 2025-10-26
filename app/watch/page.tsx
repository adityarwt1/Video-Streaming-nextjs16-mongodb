"use client";
import React, { useEffect, useState } from "react";

const page = () => {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const evensource = new EventSource(
      "/api/v1/segement?id=68fb5b9a2a9dd62d8d27e6a1"
    );
    evensource.onmessage = (evnet) => {
      setUrl(evnet.data);
    };
  }, []);
  return (
    <div>
      <video src={url}></video>
    </div>
  );
};

export default page;
