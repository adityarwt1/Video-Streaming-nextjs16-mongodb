"use client";
import Link from "next/link";
import React from "react";
import { CgMenu, CgMoreVertical, CgProfile } from "react-icons/cg";
const Navbar = () => {
  return (
    <div className="flex  bg-[#000000] py-4 px-2 border-b-[rgb(72,72,72)] border-b  justify-between">
      <CgMenu size={30} />
      <nav className="">
        <Link
          href="/"
          className="mx-5 hover:bg-[#EDEDED] px-4 py-2 hover:text-black hover:rounded-full transition-all duration-300"
        >
          Home
        </Link>
        <Link
          href="/explore"
          className="mx-5 hover:bg-[#EDEDED] px-4 py-2 hover:text-black hover:rounded-full transition-all duration-300"
        >
          Explore
        </Link>
        <Link
          href="/about"
          className="mx-5 hover:bg-[#EDEDED] px-4 py-2 hover:text-black hover:rounded-full transition-all duration-300"
        >
          About
        </Link>
        <Link
          href="/upload"
          className="mx-5 hover:bg-[#EDEDED] px-4 py-2 hover:text-black hover:rounded-full transition-all duration-300"
        >
          Upload
        </Link>
      </nav>
      <CgProfile size={30} className="mx-2" />
    </div>
  );
};

export default Navbar;
