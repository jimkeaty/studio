"use client";

import { useEffect, useState } from "react";

export default function BuildBadge() {
  const [build, setBuild] = useState("...");

  useEffect(() => {
    fetch(`/api/build-stamp?ts=${Date.now()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setBuild(d.build ?? "unknown"))
      .catch(() => setBuild("error"));
  }, []);

  return <div style={{ fontSize: 12, opacity: 0.6 }}>Build: {build}</div>;
}