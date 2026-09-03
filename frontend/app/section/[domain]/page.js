// Section page — redirects to home with domain pre-selected via localStorage
"use client";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function SectionPage() {
  const { domain } = useParams();
  const router = useRouter();

  useEffect(() => {
    // Set domain preference then redirect home
    try {
      sessionStorage.setItem("dhara_domain_filter", domain || "All");
    } catch {}
    router.replace(`/?domain=${domain || ""}`);
  }, [domain, router]);

  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center",
      minHeight:"100vh", fontFamily:"system-ui", color:"#94a3b8" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontFamily:"'Georgia',serif", fontSize:22, fontWeight:700, color:"#1e3a5f", marginBottom:8 }}>धारा</div>
        <div>Loading {domain || "section"}…</div>
      </div>
    </div>
  );
}
