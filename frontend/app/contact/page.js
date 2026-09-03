"use client";
import { useState } from "react";
import { useThemeValues } from "../../lib/useThemeValues";

const GOOGLE_SHEET_URL = process.env.NEXT_PUBLIC_GOOGLE_SHEET_URL || "";
const SUBJECTS = ["Editorial query / story correction","Report fake news we missed","Source suggestion","Partnership / collaboration","Bug report","Pro upgrade help","Institution licensing","Other"];

export default function ContactPage() {
  const t = useThemeValues();
  const [form, setForm] = useState({ name:"", email:"", subject:SUBJECTS[0], message:"" });
  const [status, setStatus] = useState("idle");
  const [err, setErr] = useState("");
  const inp = { width:"100%", padding:"10px 14px", borderRadius:8, border:`1.5px solid ${t.border}`, background:t.bg, color:t.text1, fontSize:14, outline:"none", fontFamily:"inherit", boxSizing:"border-box" };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name||!form.email||!form.message){setErr("Name, email and message required.");return;}
    setStatus("sending"); setErr("");
    try {
      if (GOOGLE_SHEET_URL) {
        const fd = new FormData();
        Object.entries({...form, timestamp:new Date().toISOString()}).forEach(([k,v])=>fd.append(k,v));
        await fetch(GOOGLE_SHEET_URL, {method:"POST", body:fd, mode:"no-cors"});
      } else {
        // Fallback: mailto
        window.location.href=`mailto:editorial@dhara.news?subject=${encodeURIComponent(form.subject)}&body=${encodeURIComponent(form.message)}`;
      }
      setStatus("sent"); setForm({name:"",email:"",subject:SUBJECTS[0],message:""});
    } catch { setStatus("error"); setErr("Send failed. Email editorial@dhara.news directly."); }
  };

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:t.bg,minHeight:"100vh",color:t.text1}}>
      <div style={{background:t.bg2,borderBottom:`1px solid ${t.border}`,padding:"0 1rem"}}>
        <div style={{maxWidth:680,margin:"0 auto",display:"flex",alignItems:"center",height:52,gap:12}}>
          <a href="/" style={{textDecoration:"none",fontFamily:"'Georgia',serif",fontSize:20,fontWeight:700,color:t.accent}}>धारा</a>
          <span style={{color:t.text3}}>›</span>
          <span style={{fontSize:14,fontWeight:600,color:t.text2}}>Contact</span>
        </div>
      </div>
      <div style={{maxWidth:680,margin:"0 auto",padding:"3rem 1rem 4rem"}}>
        <h1 style={{fontFamily:"'Georgia',serif",fontSize:28,fontWeight:700,color:t.text1,margin:"0 0 8px"}}>Get in touch</h1>
        <p style={{fontSize:15,color:t.text2,margin:"0 0 2rem",lineHeight:1.6}}>Editorial corrections, source suggestions, partnership inquiries. We read every message.</p>

        <div className="contact-cards-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"1.5rem"}}>
          {[["✏️","Editorial","editorial@dhara.news"],["🔍","Verify / Fake news","verify@dhara.news"],["🤝","Partnerships","partners@dhara.news"],["🏢","Institution licensing","enterprise@dhara.news"]].map(([ic,lb,em])=>(
            <a key={em} href={`mailto:${em}`} style={{padding:"12px 14px",background:t.bg2,border:`1px solid ${t.border}`,borderRadius:10,textDecoration:"none",display:"flex",alignItems:"center",gap:10}}>
              <span style={{fontSize:20}}>{ic}</span>
              <div><div style={{fontSize:12,fontWeight:600,color:t.text1}}>{lb}</div><div style={{fontSize:11,color:t.text3,marginTop:1}}>{em}</div></div>
            </a>
          ))}
        </div>

        <div style={{background:t.bg2,border:`1px solid ${t.border}`,borderRadius:14,padding:"2rem"}}>
          <h2 style={{fontFamily:"'Georgia',serif",fontSize:20,fontWeight:700,color:t.text1,margin:"0 0 1.5rem"}}>Send a message</h2>
          {status==="sent"?(
            <div style={{textAlign:"center",padding:"2rem"}}>
              <div style={{fontSize:48,marginBottom:12}}>✅</div>
              <h3 style={{color:t.text1,margin:"0 0 8px"}}>Sent!</h3>
              <p style={{color:t.text2,fontSize:14}}>We respond within 48 hours.</p>
              <button onClick={()=>setStatus("idle")} style={{marginTop:16,padding:"9px 20px",background:t.accent,color:"#fff",border:"none",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer"}}>Send another</button>
            </div>
          ):(
            <form onSubmit={submit} style={{display:"flex",flexDirection:"column",gap:14}}>
              <div className="contact-form-grid" style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={{fontSize:12,fontWeight:600,color:t.text2,display:"block",marginBottom:4}}>Name *</label><input style={inp} placeholder="Your name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} /></div>
                <div><label style={{fontSize:12,fontWeight:600,color:t.text2,display:"block",marginBottom:4}}>Email *</label><input style={inp} type="email" placeholder="you@email.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} /></div>
              </div>
              <div><label style={{fontSize:12,fontWeight:600,color:t.text2,display:"block",marginBottom:4}}>Subject</label>
                <select style={{...inp,cursor:"pointer"}} value={form.subject} onChange={e=>setForm(f=>({...f,subject:e.target.value}))}>{SUBJECTS.map(s=><option key={s} value={s}>{s}</option>)}</select>
              </div>
              <div><label style={{fontSize:12,fontWeight:600,color:t.text2,display:"block",marginBottom:4}}>Message *</label>
                <textarea style={{...inp,minHeight:130,resize:"vertical",lineHeight:1.6}} placeholder="Include article URL for corrections…" value={form.message} onChange={e=>setForm(f=>({...f,message:e.target.value}))} />
              </div>
              {err&&<div style={{fontSize:13,color:"#dc2626",padding:"8px 12px",background:"#fee2e2",borderRadius:6}}>{err}</div>}
              <button type="submit" disabled={status==="sending"} style={{padding:"12px 28px",background:t.accent,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",alignSelf:"flex-start",opacity:status==="sending"?0.7:1}}>
                {status==="sending"?"Sending…":"Send message →"}
              </button>
              {!GOOGLE_SHEET_URL&&<p style={{fontSize:11,color:t.text3,margin:0}}>Set NEXT_PUBLIC_GOOGLE_SHEET_URL in .env to enable Google Sheets logging. Currently opens your mail client.</p>}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
