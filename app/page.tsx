"use client";

export default function Hero() {
  return (
    <section className="flex flex-col items-center justify-center text-center py-20 bg-black text-white">
      <h1 className="text-5xl font-bold mb-4">
        Stream, Upload, and Share Your World
      </h1>
      <p className="text-lg text-gray-400 max-w-xl mb-8">
        Experience seamless video streaming powered by fast uploads, smooth
        playback, and real-time updates — all in one place.
      </p>
      <div className="flex gap-4">
        <button className="px-6 py-3 rounded-full bg-white text-black font-semibold hover:bg-gray-200">
          Get Start
        </button>
        <button className="px-6 py-3 rounded-full border border-white hover:bg-white hover:text-black">
          Explore
        </button>
      </div>
    </section>
  );
}
