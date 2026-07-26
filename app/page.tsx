"use client";

import dynamic from "next/dynamic";

const SlugWayMap = dynamic(() => import("@/components/SlugWayMap"), {
  ssr: false,
});

export default function Home() {
  return <SlugWayMap />;
}
