import Link from "next/link";
import React from "react";

const page = () => {
  return (
    <div className="bg-[#000000] h-screen w-full flex flex-row">
      {/**This is right div */}
      <div className="w-full flex justify-center items-center flex-col ">
        <div className="text-4xl font-bold transform-3d">
          Stream, Upload, and Share Your World!
        </div>
        <div className="text-left mx-11 opacity-50">
          Experience seamless video streaming powered by fast uploads, smooth
          playback, and real-time updates — all in one place.
        </div>
        {/**button */}
        <div className="flex w-full justify-left mt-5 ml-16">
          <Link
            href="/signin"
            className="px-8 py-2 rounded-full bg-[#EDEDED] text-black mx-2 hover:opacity-50 transition-all duration-300"
          >
            Get Start
          </Link>
          <Link
            href="/explore"
            className="px-8 py-2 rounded-full border-b border-b-[#EDEDED] text-white mx-2  hover:opacity-50 transition-all duration-300"
          >
            Explore
          </Link>
        </div>
      </div>
      {/**this is the left div */}
      <div className="w-full flex justify-center items-center flex-col relative">
        <div className="  absolute top-30 left-80 ">
          <video
            src="/sample.mp4"
            loop
            autoPlay
            muted
            playsInline
            width={400}
            className="blur-xs hover:blur-none transition-all duration-300 "
          />
        </div>
        <div className="absolute top-120 left-20">
          <video
            src="/sample2.mp4"
            loop
            autoPlay
            muted
            playsInline
            width={400}
            className="blur-xs hover:blur-none transition-all duration-300 "
          />
        </div>
        <div className="absolute top-70 right-50 ">
          <div className="relative w-[400px]">
            <video
              src="/sample3.mp4"
              loop
              autoPlay
              muted
              playsInline
              width={400}
              className="rounded-xl"
            />

            {/* Time Overlay */}
            {/* <div className="absolute top-0 left-0 bg-[rgba(0,0,0,0.5)]  text-white  px-2 py-1 rounded text-xl w-full">
              🔴 Valorant Live
            </div> */}
          </div>
        </div>
      </div>
    </div>
  );
};

export default page;
