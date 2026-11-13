import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, ClipboardList, Clock3,
  FileHeart, Heart, LayoutDashboard, LocateFixed, LogOut, MapPin, Menu, MessageCircle, Plus, Search,
  Send, Settings2, ShieldCheck, Sparkles, Stethoscope, UserRound, Users, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "./api.js";

const initialAppointments = [
  { id: 1, doctor: "Dr. Amelia Chen", specialty: "Cardiologist", date: "Today, 2:30 PM", status: "Confirmed", initials: "AC", color: "bg-sky-100 text-sky-700" },
  { id: 2, doctor: "Dr. Marcus Reed", specialty: "Dermatologist", date: "Tomorrow · 10:00 AM", status: "Pending", initials: "MR", color: "bg-violet-100 text-violet-700" },
];
const records = [
  { name: "Annual health checkup", category: "Lab results", date: "Oct 28, 2025", icon: Activity, color: "bg-emerald-50 text-emerald-600" },
  { name: "Prescription — Vitamin D", category: "Prescription", date: "Oct 12, 2025", icon: ClipboardList, color: "bg-blue-50 text-blue-600" },
  { name: "Blood pressure reading", category: "Vitals", date: "Sep 30, 2025", icon: Heart, color: "bg-rose-50 text-rose-500" },
];
const chartData = [
  { day: "Mon", value: 42 }, { day: "Tue", value: 58 }, { day: "Wed", value: 49 },
  { day: "Thu", value: 70 }, { day: "Fri", value: 61 }, { day: "Sat", value: 82 },
  { day: "Sun", value: 68 },
];
const navGroups = [
  { label: "MENU", items: [{ id: "Overview", icon: LayoutDashboard }, { id: "Appointments", icon: CalendarDays }, { id: "Health records", icon: FileHeart }, { id: "AI health assistant", icon: MessageCircle }, { id: "Chat history", icon: ClipboardList }] },
  { label: "PERSONAL", items: [{ id: "My doctors", icon: Stethoscope }, { id: "Nearby care", icon: MapPin }, { id: "My profile", icon: UserRound }] },
];

function Avatar({ initials, className = "" }) {
  return <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-bold ${className}`}>{initials}</div>;
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const styles = variant === "primary" ? "bg-brand text-white hover:bg-blue-600 shadow-sm shadow-blue-200" : variant === "outline" ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50" : "text-slate-500 hover:bg-slate-100";
  return <button className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${styles} ${className}`} {...props}>{children}</button>;
}

function MetricCard({ title, value, delta, icon: Icon, tone, rising = true }) {
  return <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card">
    <div className="flex items-start justify-between"><div className={`grid h-11 w-11 place-items-center rounded-xl ${tone}`}><Icon size={20} /></div><button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50" aria-label={`${title} options`}><Settings2 size={16} /></button></div>
    <p className="mt-4 text-sm font-medium text-slate-500">{title}</p>
    <div className="mt-1 flex items-end justify-between"><span className="display-font text-3xl font-extrabold tracking-tight text-ink">{value}</span><span className={`mb-1 inline-flex items-center gap-1 text-xs font-semibold ${rising ? "text-emerald-600" : "text-amber-600"}`}>{rising ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{delta}</span></div>
  </div>;
}

function Modal({ title, onClose, children }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div className="fade-in w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl sm:p-8">
      <div className="mb-6 flex items-center justify-between"><h2 className="display-font text-xl font-extrabold text-ink">{title}</h2><button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100" aria-label="Close"><X size={19} /></button></div>
      {children}
    </div>
  </div>;
}

function App() {
  const [active, setActive] = useState("Overview");
  const [appointments, setAppointments] = useState(initialAppointments);
  const [doctors, setDoctors] = useState([]);
  const [token, setToken] = useState(() => localStorage.getItem("careflow-token") || "");
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("careflow-user") || "null"); } catch { return null; }
  });
  const [modal, setModal] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [chatText, setChatText] = useState("");
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [messages, setMessages] = useState([{ role: "assistant", content: "Hi Olivia! I’m your Careflow health assistant. I can share general health information and help you think through next steps. What’s on your mind today?" }]);
  const [recordsState, setRecordsState] = useState(records);
  const [search, setSearch] = useState("");
  const [adminSummary, setAdminSummary] = useState(null);
  const [adminUsers, setAdminUsers] = useState([]);
  const [activity, setActivity] = useState(null);
  const [availability, setAvailability] = useState([]);
  const [nearbyServices, setNearbyServices] = useState([]);
  const [serviceSearchDone, setServiceSearchDone] = useState(false);
  const [locating, setLocating] = useState(false);
  const [serviceError, setServiceError] = useState("");

  useEffect(() => {
    if (!token) return;
    let mounted = true;
    async function loadAccount() {
    try {
      const me = await api("/auth/me/", { token });
      const [appointmentsData, doctorsData, recordsData, chatData] = await Promise.all([
        api("/appointments/", { token }),
        api("/doctors/", { token }),
        api("/health-records/", { token }),
        me.role === "patient" ? api("/chat/", { token }) : Promise.resolve([]),
      ]);
      if (!mounted) return;
      setUser(me);
      localStorage.setItem("careflow-user", JSON.stringify(me));
      setAppointments(appointmentsData.results || appointmentsData);
      setDoctors(doctorsData.results || doctorsData);
      setRecordsState(recordsData.results || recordsData);
      const latestConversation = chatData[0];
      setConversations(chatData);
      if (latestConversation?.messages?.length) {
        setConversationId(latestConversation.id);
        setMessages(latestConversation.messages.map(({ role, content, emergency }) => ({ role, content, urgent: emergency })));
      }
    } catch (e) {
      if (mounted) setError(`Could not load your account data: ${e.message}`);
    }
    }
    loadAccount();
    return () => { mounted = false; };
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    if (active === "Admin console" && user.role === "admin") {
    Promise.all([api("/dashboard/", { token }), api("/admin/users/?role=patient", { token }), api("/admin/activity/", { token })])
      .then(([summary, patients, recent]) => { setAdminSummary(summary); setAdminUsers(patients.results || patients); setActivity(recent); })
      .catch((e) => setError(`Could not load administrator data: ${e.message}`));
    }
    if (active === "Doctor schedule" && user.role === "doctor") {
    api("/availability/", { token }).then((data) => setAvailability(data.results || data))
      .catch((e) => setError(`Could not load availability: ${e.message}`));
    }
  }, [active, token, user?.role]);

  useEffect(() => {
    if (user?.role === "admin" && active === "Overview") setActive("Admin console");
  }, [active, user?.role]);

  useEffect(() => {
    if (active === "Chat history") {
      setActive("AI health assistant");
      setModal("conversations");
    }
  }, [active]);

  useEffect(() => {
    if (active === "Nearby care") {
      setActive("My doctors");
      setServiceSearchDone(false);
      setNearbyServices([]);
      setServiceError("");
      setModal("services");
    }
  }, [active]);

  const roleNavGroups = user?.role === "admin"
    ? [{ label: "ADMINISTRATION", items: [{ id: "Admin console", icon: LayoutDashboard }, { id: "Appointments", icon: CalendarDays }, { id: "My profile", icon: UserRound }] }]
    : user?.role === "doctor"
    ? [{ label: "DOCTOR PORTAL", items: [{ id: "Overview", icon: LayoutDashboard }, { id: "Appointments", icon: CalendarDays }, { id: "Doctor schedule", icon: Clock3 }, { id: "My profile", icon: UserRound }] }]
    : navGroups;

  const firstName = user?.first_name || "Olivia";
  const filteredRecords = useMemo(() => recordsState.filter((r) => `${r.name || r.title || ""} ${r.category || r.record_type || ""}`.toLowerCase().includes(search.toLowerCase())), [recordsState, search]);
  const upcomingCount = appointments.filter((appointment) => {
    const status = String(appointment.status || "").toLowerCase();
    return !["completed", "cancelled", "rejected"].includes(status)
      && (!appointment.scheduled_for || new Date(appointment.scheduled_for) > new Date());
  }).length;
  const completedCount = appointments.filter((appointment) => String(appointment.status || "").toLowerCase() === "completed").length;
  const recordCategoryCount = new Set(recordsState.map((record) => record.record_type || record.category).filter(Boolean)).size;
  const latestRecord = recordsState[0];
  const latestRecordDate = latestRecord?.created_at || latestRecord?.date;
  const dismiss = () => { setError(""); setNotice(""); };

  async function submitAppointment(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const doctorName = form.get("doctor");
    const date = form.get("date");
    if (!date) return setError("Choose a date and time for your appointment.");
    setBusy(true); dismiss();
    try {
      if (token) {
        const created = await api("/appointments/", { token, method: "POST", body: JSON.stringify({ doctor: form.get("doctorId"), scheduled_for: new Date(date).toISOString(), reason: form.get("reason") }) });
        setAppointments((items) => [created, ...items]);
      } else {
        setAppointments((items) => [{ id: Date.now(), doctor: doctorName || "Dr. Amelia Chen", specialty: "General Practice", date: new Date(date).toLocaleString(), status: "Pending", initials: "AC", color: "bg-sky-100 text-sky-700" }, ...items]);
      }
      setModal(""); setNotice("Appointment request submitted.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function submitRecord(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); dismiss();
    try {
      if (token) {
        const created = await api("/health-records/", { token, method: "POST", body: JSON.stringify({ title: form.get("title"), record_type: form.get("type"), notes: form.get("notes") }) });
        setRecordsState((items) => [created, ...items]);
      } else {
        setRecordsState((items) => [{ id: Date.now(), name: form.get("title"), category: form.get("type"), date: new Date().toLocaleDateString(), icon: ClipboardList, color: "bg-blue-50 text-blue-600" }, ...items]);
      }
      setModal(""); setNotice("Health record added.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function submitProfile(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); dismiss();
    try {
      const updated = await api("/profile/", {
        token,
        method: "PATCH",
        body: JSON.stringify({
          first_name: form.get("first_name"),
          last_name: form.get("last_name"),
          email: form.get("email"),
          phone: form.get("phone"),
          ...(user?.role === "doctor" || user?.role === "admin" ? { specialty: form.get("specialty"), bio: form.get("bio") } : {}),
        }),
      });
      setUser(updated);
      localStorage.setItem("careflow-user", JSON.stringify(updated));
      setModal("");
      setNotice("Your profile has been updated.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function changeAppointmentStatus(id, status) {
    if (!token) return;
    dismiss();
    try {
      const updated = await api(`/appointments/${id}/`, { token, method: "PATCH", body: JSON.stringify({ status }) });
      setAppointments((items) => items.map((item) => item.id === id ? updated : item));
      setNotice(`Appointment ${status}.`);
    } catch (e) { setError(e.message); }
  }

  async function createAvailability(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); dismiss();
    try {
      const created = await api("/availability/", { token, method: "POST", body: JSON.stringify({ starts_at: new Date(form.get("starts_at")).toISOString(), ends_at: new Date(form.get("ends_at")).toISOString(), is_available: true }) });
      setAvailability((items) => [...items, created].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)));
      event.currentTarget.reset(); setNotice("Availability saved.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function removeAvailability(id) {
    try {
      await api(`/availability/${id}/`, { token, method: "DELETE" });
      setAvailability((items) => items.filter((item) => item.id !== id));
      setNotice("Availability removed.");
    } catch (e) { setError(e.message); }
  }

  function findNearbyServices() {
    setServiceError("");
    setServiceSearchDone(false);
    setNearbyServices([]);
    if (!token) {
      setServiceError("Sign in to search the connected care directory.");
      return;
    }
    if (!navigator.geolocation) {
      setServiceError("Location search is not supported by this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const params = new URLSearchParams({ lat: String(coords.latitude), lng: String(coords.longitude), radius_km: "25" });
        const result = await api(`/services/?${params}`, { token });
        setNearbyServices(result);
        setServiceSearchDone(true);
      } catch (e) {
        setServiceError(`Could not search nearby services: ${e.message}`);
      } finally {
        setLocating(false);
      }
    }, (locationError) => {
      setServiceError(locationError.code === locationError.PERMISSION_DENIED
        ? "Location access was declined. Allow location access in your browser and try again."
        : "Your location could not be determined. Please try again.");
      setLocating(false);
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
  }

  async function sendChat(event) {
    event.preventDefault();
    const text = chatText.trim();
    if (!text || busy) return;
    setMessages((items) => [...items, { role: "user", content: text }]); setChatText(""); setBusy(true); dismiss();
    try {
      if (token) {
        const result = await api("/chat/", { token, method: "POST", body: JSON.stringify({ message: text, ...(conversationId ? { conversation_id: conversationId } : {}) }) });
        setConversationId(result.conversation_id);
        setMessages((items) => [...items, { role: "assistant", content: result.response, urgent: result.emergency }]);
        setConversations((items) => {
          const previous = items.find((item) => item.id === result.conversation_id);
          const updated = {
            id: result.conversation_id,
            title: previous?.title || text.slice(0, 120),
            created_at: previous?.created_at || new Date().toISOString(),
            messages: [...(previous?.messages || []), { role: "user", content: text }, result.message],
          };
          return [updated, ...items.filter((item) => item.id !== result.conversation_id)];
        });
      } else {
        const urgent = /chest pain|can't breathe|cannot breathe|difficulty breathing|shortness of breath|unconscious|stroke|face droop|severe bleeding|suicid(?:al|e)|overdose|anaphylaxis/i.test(text);
        setMessages((items) => [...items, { role: "assistant", content: urgent ? "Your message mentions a possible emergency warning sign. Please call your local emergency number or seek emergency care now. I can’t assess or diagnose this here." : "This preview doesn’t connect to the AI service yet. Sign in to your connected Careflow API for general health information. If symptoms are concerning or worsening, please contact a healthcare professional.", urgent }]);
      }
    } catch (e) { setError(e.message); setMessages((items) => [...items, { role: "assistant", content: "I couldn’t reach the health assistant. Please try again or contact a healthcare professional if you need timely help." }]); }
    finally { setBusy(false); }
  }

  async function signIn(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); dismiss();
    try {
      const data = await api("/auth/login/", { method: "POST", body: JSON.stringify({ username: form.get("username"), password: form.get("password") }) });
      localStorage.setItem("careflow-token", data.token); setToken(data.token); setUser(data.user); localStorage.setItem("careflow-user", JSON.stringify(data.user)); setModal(""); setNotice("You’re signed in.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function register(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); dismiss();
    try {
      const data = await api("/auth/register/", { method: "POST", body: JSON.stringify({ username: form.get("username"), email: form.get("email"), password: form.get("password"), first_name: form.get("first_name"), last_name: form.get("last_name") }) });
      localStorage.setItem("careflow-token", data.token); setToken(data.token); setUser(data.user); localStorage.setItem("careflow-user", JSON.stringify(data.user)); setModal(""); setNotice("Your patient account is ready.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function signOut() {
    localStorage.removeItem("careflow-token"); localStorage.removeItem("careflow-user"); setToken(""); setUser(null);
    setActive("Overview"); setAppointments(initialAppointments); setRecordsState(records); setDoctors([]); setNotice("You’ve signed out. You’re viewing preview data.");
    setConversationId(null); setConversations([]); setChatText(""); setMessages([{ role: "assistant", content: "Hi! I’m your Careflow health assistant. I can share general health information and help you think through next steps. What’s on your mind today?" }]);
  }

  function startNewConversation() {
    setConversationId(null);
    setMessages([{ role: "assistant", content: `Hi${firstName ? ` ${firstName}` : ""}! What general health question can I help with today?` }]);
    setModal("");
  }

  function openConversation(conversation) {
    setConversationId(conversation.id);
    setMessages(conversation.messages.map(({ role, content, emergency }) => ({ role, content, urgent: emergency })));
    setModal("");
  }

  const nav = <><div className="flex items-center gap-3 px-7 py-7"><div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand text-white shadow-lg shadow-blue-200"><Heart size={21} fill="currentColor" /></div><div><div className="display-font text-lg font-extrabold leading-tight text-ink">careflow</div><div className="text-[10px] font-semibold tracking-[.17em] text-slate-400">HEALTH, IN HARMONY</div></div></div>
    <div className="mt-6 space-y-8 px-4">{roleNavGroups.map((group) => <div key={group.label}><p className="mb-3 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map(({ id, icon: Icon }) => <button key={id} onClick={() => { setActive(id); setMobileNav(false); }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${active === id ? "bg-blue-50 text-brand" : "text-slate-500 hover:bg-slate-50 hover:text-ink"}`}><Icon size={18} strokeWidth={active === id ? 2.4 : 1.8} />{id}{id === "AI health assistant" && <span className="ml-auto rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-600">AI</span>}</button>)}</div></div>)}</div>
    <div className="mt-auto p-4"><div className="rounded-2xl bg-gradient-to-br from-blue-50 to-emerald-50 p-4"><div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-white text-brand shadow-sm"><ShieldCheck size={18} /></div><p className="text-sm font-bold text-ink">Your health, protected</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Your health details are private and secure.</p><button className="mt-3 text-xs font-bold text-brand hover:underline" onClick={() => setNotice("Careflow is designed to keep your health information private.")}>Learn about privacy <ArrowRight className="ml-1 inline" size={13} /></button></div><div className="mt-4 flex items-center justify-between px-2"><button onClick={() => token ? signOut() : setModal("signin")} className="flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-ink">{token ? <><LogOut size={15} /> Sign out</> : <><UserRound size={15} /> Sign in to sync</>}</button></div></div></>;

  return <div className="min-h-screen bg-canvas">
    {mobileNav && <div className="fixed inset-0 z-40 bg-slate-950/30 md:hidden" onClick={() => setMobileNav(false)} />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col overflow-y-auto border-r border-slate-100 bg-white transition-transform md:translate-x-0 ${mobileNav ? "translate-x-0" : "-translate-x-full"}`}>{nav}</aside>
    <div className="md:pl-[248px]">
      <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-100 bg-white/90 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center gap-3"><button onClick={() => setMobileNav(true)} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Open menu"><Menu size={20} /></button><div className="hidden items-center gap-2 text-sm text-slate-400 sm:flex">Pages <ChevronRight size={14} /></div><h1 className="display-font text-sm font-bold text-ink sm:text-base">{active}</h1></div>
        <div className="flex items-center gap-3 sm:gap-5"><label className="hidden h-10 items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 sm:flex"><Search size={16} className="text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search anything..." className="w-36 bg-transparent text-xs outline-none placeholder:text-slate-400" /></label><button onClick={() => setNotice("You’re all caught up on notifications.")} className="relative rounded-xl p-2 text-slate-500 hover:bg-slate-50" aria-label="Notifications"><Bell size={19} /><span className="absolute right-2 top-2 h-2 w-2 rounded-full border-2 border-white bg-rose-400" /></button><div className="flex items-center gap-2.5 border-l border-slate-100 pl-3 sm:pl-5"><Avatar initials={firstName.slice(0, 1) + (user?.last_name?.slice(0, 1) || "M")} className="h-9 w-9 bg-amber-100 text-amber-700" /><div className="hidden sm:block"><p className="text-xs font-bold text-ink">{user?.first_name ? `${user.first_name} ${user.last_name || ""}` : "Olivia Mitchell"}</p><p className="text-[10px] text-slate-400">{user?.role || "Patient"}</p></div><ChevronDown size={14} className="hidden text-slate-400 sm:block" /></div></div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10">
        {error && <div role="alert" className="mb-5 flex items-center justify-between rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button onClick={dismiss} aria-label="Dismiss error"><X size={17} /></button></div>}
        {notice && <div role="status" className="mb-5 flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"><span>{notice}</span><button onClick={dismiss} aria-label="Dismiss notification"><X size={17} /></button></div>}
        {!token && <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-xs text-blue-800"><span><strong>Preview mode.</strong> Sample content is shown. Sign in to connect your account and sync your information.</span><button className="shrink-0 font-bold underline" onClick={() => setModal("signin")}>Sign in</button></div>}
        {active === "Overview" && <section className="fade-in">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-sm text-slate-500">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })} <span className="mx-1 text-slate-300">•</span> Have a lovely day</p><h2 className="display-font text-2xl font-extrabold tracking-tight text-ink sm:text-[30px]">Good morning, {firstName} <span>✦</span></h2><p className="mt-1 text-sm text-slate-500">Here’s a little overview of your health journey.</p></div><Button onClick={() => setModal("appointment")}><Plus size={17} /> Book an appointment</Button></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Total appointments" value={token ? appointments.length : appointments.length + 12} delta={token ? "In your account" : "+12.5%"} icon={CalendarDays} tone="bg-blue-50 text-brand" />
            <MetricCard title="Upcoming visits" value={upcomingCount} delta={token ? "Scheduled" : "Next: today"} icon={Clock3} tone="bg-emerald-50 text-emerald-600" />
            <MetricCard title="Health records" value={token ? recordsState.length : recordsState.length + 8} delta={token ? "In your library" : "+2 this month"} icon={FileHeart} tone="bg-violet-50 text-violet-600" />
            <MetricCard title="Completed consultations" value={completedCount} delta="All time" icon={Check} tone="bg-rose-50 text-rose-500" />
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card sm:p-6"><div className="mb-4 flex items-center justify-between"><div><h3 className="display-font font-extrabold text-ink">Your wellness overview</h3><p className="mt-1 text-xs text-slate-400">A snapshot of your weekly activity</p></div><button className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-xs font-semibold text-slate-500">This week <ChevronDown size={14} /></button></div><div className="h-[210px] w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}><defs><linearGradient id="wellnessFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#377dff" stopOpacity={0.17} /><stop offset="95%" stopColor="#377dff" stopOpacity={0} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eef2f7" strokeDasharray="3 5" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#98a4b7", fontSize: 11 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#98a4b7", fontSize: 10 }} /><Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eef2f7", boxShadow: "0 8px 24px #172b4d12" }} /><Area type="monotone" dataKey="value" stroke="#377dff" strokeWidth={2.5} fill="url(#wellnessFill)" /></AreaChart></ResponsiveContainer></div><div className="mt-2 flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 rounded-full bg-brand" /> Activity score</div></div>
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#286be8] to-[#4797f4] p-6 text-white shadow-lg shadow-blue-200/50"><div className="soft-grid absolute inset-0 opacity-20" /><div className="relative"><div className="mb-5 flex items-center justify-between"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white/15"><Sparkles size={20} /></div><span className="rounded-full bg-white/15 px-3 py-1 text-[10px] font-bold tracking-wider">YOUR AI COMPANION</span></div><h3 className="display-font max-w-[260px] text-xl font-extrabold leading-snug">A little guidance goes a long way.</h3><p className="mt-2 max-w-[280px] text-sm leading-relaxed text-blue-100">Ask a health question and get thoughtful, general information in a few moments.</p><Button variant="outline" className="mt-5 border-0 bg-white text-brand hover:bg-blue-50" onClick={() => setActive("AI health assistant")}>Chat with assistant <ArrowRight size={15} /></Button><div className="absolute -bottom-5 -right-2 opacity-15"><Heart size={120} fill="white" /></div></div></div>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.55fr_1fr]">
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="display-font font-extrabold text-ink">Upcoming appointments</h3><p className="mt-1 text-xs text-slate-400">Your next steps to feeling your best</p></div><button onClick={() => setActive("Appointments")} className="text-xs font-bold text-brand hover:underline">View all</button></div><div className="space-y-3">{appointments.slice(0, 3).map((a) => <AppointmentRow key={a.id || a.doctor} appointment={a} />)}{appointments.length === 0 && <p className="py-5 text-center text-sm text-slate-400">No appointments yet. Book your first visit.</p>}</div></div>
            <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="display-font font-extrabold text-ink">Recent health records</h3><p className="mt-1 text-xs text-slate-400">Your health information, organized</p></div><button onClick={() => setActive("Health records")} className="text-xs font-bold text-brand hover:underline">View all</button></div><div className="space-y-4">{recordsState.slice(0, 3).map((record, i) => <RecordRow key={record.id || record.name || i} record={record} />)}</div><button onClick={() => setModal("record")} className="mt-5 flex w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-200 py-2.5 text-xs font-bold text-slate-500 hover:border-brand hover:text-brand"><Plus size={14} /> Add health record</button></div>
          </div>
          <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-100 bg-amber-50/70 p-4 text-xs leading-relaxed text-amber-800"><CircleHelp className="mt-0.5 shrink-0" size={17} /><p><strong>A gentle reminder:</strong> Careflow offers general health information and isn’t a substitute for professional medical advice, diagnosis, or treatment. If you think you may have a medical emergency, call your local emergency number.</p></div>
        </section>}
        {active === "Appointments" && <section className="fade-in"><PageHeading title={user?.role === "doctor" ? "Appointment requests" : user?.role === "admin" ? "All appointments" : "Your appointments"} subtitle={user?.role === "doctor" ? "Review and respond to patient appointment requests." : "Keep track of your visits and requests."} action={(!user || user.role === "patient") && <Button onClick={() => setModal("appointment")}><Plus size={17} /> Book appointment</Button>} /><div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card sm:p-7"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-bold text-ink">All appointments <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-brand">{appointments.length}</span></p><span className="text-xs text-slate-400">{user?.role === "doctor" ? "Assigned to you" : "Private to your account"}</span></div><div className="space-y-3">{appointments.map((a) => <div key={a.id || a.doctor}><AppointmentRow appointment={user?.role === "doctor" ? { ...a, doctor_name: a.patient_name, specialty: "Patient visit" } : a} /><div className="flex justify-end gap-2 pt-2">{user?.role === "doctor" && a.status === "pending" && <><Button variant="outline" className="px-3 py-1.5 text-xs" onClick={() => changeAppointmentStatus(a.id, "rejected")}>Decline</Button><Button className="px-3 py-1.5 text-xs" onClick={() => changeAppointmentStatus(a.id, "accepted")}><Check size={14} /> Accept</Button></>}</div></div>)}</div>{appointments.length === 0 && <EmptyState text="No appointments to show." />}</div></section>}
        {active === "Health records" && <section className="fade-in"><PageHeading title="Health records" subtitle="Your health information, all in one place." action={<Button onClick={() => setModal("record")}><Plus size={17} /> Add record</Button>} /><div className="mb-5 grid gap-4 sm:grid-cols-3"><MetricCard title="Total records" value={recordsState.length} delta="In your library" icon={FileHeart} tone="bg-blue-50 text-brand" /><MetricCard title="Last added" value={latestRecordDate ? new Date(latestRecordDate).toLocaleDateString() : "—"} delta={latestRecord?.record_type || latestRecord?.category || "No records yet"} icon={Clock3} tone="bg-emerald-50 text-emerald-600" /><MetricCard title="Record categories" value={recordCategoryCount} delta="In your library" icon={ClipboardList} tone="bg-violet-50 text-violet-600" /></div><div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-card sm:p-7"><div className="mb-5 flex items-center justify-between"><h3 className="display-font font-extrabold text-ink">All records</h3><label className="flex items-center gap-2 rounded-xl border border-slate-100 px-3 py-2"><Search size={15} className="text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="w-28 text-xs outline-none" placeholder="Search records" /></label></div><div className="space-y-2">{filteredRecords.map((record, i) => <RecordRow key={record.id || record.name || i} record={record} />)}</div>{filteredRecords.length === 0 && <EmptyState text="No matching records." />}</div></section>}
        {active === "AI health assistant" && <section className="fade-in mx-auto max-w-3xl"><PageHeading title="AI health assistant" subtitle="A helpful place to start with everyday health questions." /><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-card"><div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50/70 to-emerald-50/50 p-5"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand text-white"><Sparkles size={21} /></div><div><p className="font-bold text-ink">Careflow assistant</p><p className="flex items-center gap-1.5 text-xs text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Here to help with general information</p></div></div><div className="flex min-h-[360px] max-h-[55vh] flex-col gap-4 overflow-y-auto p-5 sm:p-7">{messages.map((m, i) => <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${m.role === "user" ? "rounded-br-md bg-brand text-white" : m.urgent ? "rounded-bl-md border border-rose-200 bg-rose-50 text-rose-800" : "rounded-bl-md bg-slate-50 text-slate-700"}`}>{m.content}</div></div>)}{busy && <div className="flex items-center gap-2 text-xs text-slate-400"><span className="h-2 w-2 animate-pulse rounded-full bg-brand" /> Thinking...</div>}</div><form onSubmit={sendChat} className="border-t border-slate-100 p-4 sm:p-5"><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-brand focus-within:ring-4 focus-within:ring-blue-50"><input value={chatText} onChange={(e) => setChatText(e.target.value)} aria-label="Your health question" placeholder="Ask a general health question..." className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-slate-400" /><button disabled={!chatText.trim() || busy} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-40" aria-label="Send message"><Send size={17} /></button></div><p className="mt-3 text-center text-[10px] leading-relaxed text-slate-400">For general information only—not a diagnosis or treatment. If this may be an emergency, contact emergency services.</p></form></div></section>}
        {active === "My doctors" && <section className="fade-in"><PageHeading title="Your care team" subtitle="The healthcare professionals supporting your wellbeing." action={<Button onClick={() => setActive("Appointments")}><CalendarDays size={16} /> Book a visit</Button>} /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(doctors.length ? doctors : [{ id: 1, name: "Dr. Amelia Chen", specialty: "Cardiology", initials: "AC" }, { id: 2, name: "Dr. Marcus Reed", specialty: "Dermatology", initials: "MR" }, { id: 3, name: "Dr. Sophia Patel", specialty: "Primary care", initials: "SP" }]).map((d, i) => <div key={d.id} className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card"><div className="flex items-center gap-3"><Avatar initials={d.initials || d.name?.split(" ").slice(-1)[0]?.slice(0, 1) || "DR"} className={["bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700"][i % 3]} /><div><p className="font-bold text-ink">{d.name || `${d.first_name || ""} ${d.last_name || ""}`}</p><p className="text-xs text-slate-400">{d.specialty}</p></div></div><Button variant="outline" className="mt-5 w-full" onClick={() => setModal("appointment")}>Request appointment <ArrowRight size={14} /></Button></div>)}</div></section>}
        {active === "My profile" && <section className="fade-in"><PageHeading title="My profile" subtitle="Manage your personal information and preferences." /><div className="max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-card sm:p-8"><div className="flex items-center gap-4 border-b border-slate-100 pb-6"><Avatar initials={firstName.slice(0, 1) + "M"} className="h-16 w-16 bg-amber-100 text-lg text-amber-700" /><div><h3 className="display-font text-lg font-extrabold text-ink">{user?.first_name ? `${user.first_name} ${user.last_name || ""}` : "Olivia Mitchell"}</h3><p className="text-sm text-slate-400">{user?.email || "olivia.mitchell@email.com"}</p></div></div><div className="grid gap-5 py-6 sm:grid-cols-2"><ProfileField label="First name" value={user?.first_name || "Olivia"} /><ProfileField label="Last name" value={user?.last_name || "Mitchell"} /><ProfileField label="Email address" value={user?.email || "olivia.mitchell@email.com"} /><ProfileField label="Account type" value={user?.role || "Patient"} />{user?.phone && <ProfileField label="Phone" value={user.phone} />}{user?.specialty && <ProfileField label="Specialty" value={user.specialty} />}</div>{token ? <Button onClick={() => setModal("profile")}>Edit profile</Button> : <div className="flex flex-wrap gap-2"><Button onClick={() => setModal("signin")}>Sign in to manage profile</Button><Button variant="outline" onClick={() => setModal("register")}>Create a patient account</Button></div>}</div></section>}
        {active === "Doctor schedule" && <section className="fade-in"><PageHeading title="Manage availability" subtitle="Add the time windows when patients can request appointments." /><div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><form onSubmit={createAvailability} className="h-fit rounded-2xl border border-slate-100 bg-white p-6 shadow-card"><h3 className="display-font mb-4 font-extrabold text-ink">Add availability</h3><label className="mb-4 block text-xs font-semibold text-slate-600">Starts at<input name="starts_at" type="datetime-local" min={localDateTimeMin()} required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="mb-5 block text-xs font-semibold text-slate-600">Ends at<input name="ends_at" type="datetime-local" min={localDateTimeMin()} required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><Button disabled={busy} className="w-full"><Plus size={16} /> {busy ? "Saving..." : "Add time window"}</Button></form><div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card"><h3 className="display-font mb-4 font-extrabold text-ink">Your availability</h3>{availability.length ? <div className="space-y-3">{availability.map((slot) => <div key={slot.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-4"><div><p className="text-sm font-semibold text-ink">{new Date(slot.starts_at).toLocaleString()}</p><p className="mt-1 text-xs text-slate-400">until {new Date(slot.ends_at).toLocaleString()}</p></div><button onClick={() => removeAvailability(slot.id)} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Remove availability"><X size={16} /></button></div>)}</div> : <EmptyState text="No availability windows yet." />}</div></div></section>}
        {active === "Admin console" && <section className="fade-in"><PageHeading title="Admin console" subtitle="Monitor activity and manage the Careflow platform." /><div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><MetricCard title="Patients" value={adminSummary?.patients ?? "—"} delta="Registered" icon={Users} tone="bg-blue-50 text-brand" /><MetricCard title="Doctors" value={adminSummary?.doctors ?? "—"} delta="Active accounts" icon={Stethoscope} tone="bg-emerald-50 text-emerald-600" /><MetricCard title="Appointments" value={adminSummary?.appointments ?? "—"} delta="All time" icon={CalendarDays} tone="bg-violet-50 text-violet-600" /><MetricCard title="Pending requests" value={adminSummary?.pending_appointments ?? "—"} delta="Needs review" icon={Clock3} tone="bg-amber-50 text-amber-600" rising={false} /></div><div className="grid gap-5 xl:grid-cols-2"><div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card"><h3 className="display-font mb-4 font-extrabold text-ink">Recent patients</h3>{adminUsers.length ? <div className="space-y-3">{adminUsers.slice(0, 10).map((patient) => <div key={patient.id} className="flex items-center justify-between border-b border-slate-50 pb-3"><div className="flex items-center gap-3"><Avatar initials={`${patient.first_name?.[0] || ""}${patient.last_name?.[0] || ""}`} className="bg-blue-50 text-brand" /><div><p className="text-sm font-semibold text-ink">{patient.first_name} {patient.last_name}</p><p className="text-xs text-slate-400">{patient.email}</p></div></div><span className="text-xs text-slate-400">{patient.role}</span></div>)}</div> : <EmptyState text="No patient accounts found." />}</div><div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-card"><h3 className="display-font mb-4 font-extrabold text-ink">Appointment activity</h3>{activity?.appointments_by_status?.length ? <div className="space-y-3">{activity.appointments_by_status.map((item) => <div key={item.status} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"><span className="capitalize text-slate-600">{item.status}</span><span className="font-bold text-ink">{item.count}</span></div>)}</div> : <EmptyState text="No appointment activity yet." />}<p className="mt-5 text-xs text-slate-400">For account administration and feedback management, use the protected Django admin workspace.</p></div></div></section>}
      </main>
      <footer className="px-8 pb-6 text-center text-[10px] text-slate-400">© {new Date().getFullYear()} Careflow Health <span className="mx-2">·</span> Your care, connected <span className="mx-2">·</span> General information only</footer>
    </div>

    {modal === "appointment" && <Modal title="Book an appointment" onClose={() => setModal("")}><p className="mb-5 text-sm text-slate-500">Choose a provider and a time that works for you.</p><form onSubmit={submitAppointment} className="space-y-4"><label className="block text-xs font-semibold text-slate-600">Healthcare professional<select name="doctorId" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal text-ink outline-none focus:border-brand">{doctors.length ? doctors.map((d) => <option key={d.id} value={d.id}>{d.name || `Dr. ${d.first_name} ${d.last_name}`} — {d.specialty}</option>) : <option value="">Dr. Amelia Chen — General Practice (preview)</option>}</select><input name="doctor" type="hidden" value={doctors[0]?.name || "Dr. Amelia Chen"} /></label><label className="block text-xs font-semibold text-slate-600">Preferred date and time<input name="date" type="datetime-local" min={localDateTimeMin()} required className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Reason for visit<textarea name="reason" rows="3" placeholder="Share a brief note for your care team (optional)" className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setModal("")}>Cancel</Button><Button disabled={busy}>{busy ? "Submitting..." : "Request appointment"}</Button></div></form></Modal>}
    {modal === "record" && <Modal title="Add a health record" onClose={() => setModal("")}><p className="mb-5 text-sm text-slate-500">Keep useful health information organized in one place.</p><form onSubmit={submitRecord} className="space-y-4"><label className="block text-xs font-semibold text-slate-600">Record title<input name="title" required maxLength="160" placeholder="e.g. Blood test results" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Record type<select name="type" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-normal outline-none focus:border-brand"><option>Lab results</option><option>Prescription</option><option>Vitals</option><option>Visit summary</option><option>Other</option></select></label><label className="block text-xs font-semibold text-slate-600">Notes<textarea name="notes" rows="3" maxLength="2000" placeholder="Optional details" className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => setModal("")}>Cancel</Button><Button disabled={busy}>{busy ? "Saving..." : "Save record"}</Button></div></form></Modal>}
    {modal === "profile" && <Modal title="Edit your profile" onClose={() => setModal("")}><form onSubmit={submitProfile} className="space-y-4"><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-600">First name<input name="first_name" required defaultValue={user?.first_name} maxLength="150" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Last name<input name="last_name" required defaultValue={user?.last_name} maxLength="150" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label></div><label className="block text-xs font-semibold text-slate-600">Email<input name="email" type="email" required defaultValue={user?.email} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Phone<input name="phone" defaultValue={user?.phone || ""} maxLength="32" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label>{(user?.role === "doctor" || user?.role === "admin") && <><label className="block text-xs font-semibold text-slate-600">Professional specialty<input name="specialty" defaultValue={user?.specialty || ""} maxLength="100" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Professional bio<textarea name="bio" defaultValue={user?.bio || ""} maxLength="2000" rows="3" className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label></>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setModal("")}>Cancel</Button><Button disabled={busy}>{busy ? "Saving..." : "Save changes"}</Button></div></form></Modal>}
    {modal === "signin" && <Modal title={token ? "Account" : "Welcome back"} onClose={() => setModal("")}>{token ? <div><p className="mb-5 text-sm text-slate-500">Signed in as {user?.email || user?.username}.</p><Button variant="outline" onClick={() => { signOut(); setModal(""); }}>Sign out</Button></div> : <><p className="mb-5 text-sm text-slate-500">Sign in to securely sync with your Careflow account.</p><form onSubmit={signIn} className="space-y-4"><label className="block text-xs font-semibold text-slate-600">Username<input name="username" required autoComplete="username" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Password<input name="password" type="password" required autoComplete="current-password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><Button disabled={busy} className="w-full">{busy ? "Signing in..." : "Sign in"}</Button><p className="text-center text-xs text-slate-400">New to Careflow? <button type="button" onClick={() => setModal("register")} className="font-bold text-brand hover:underline">Create a patient account</button></p></form></>}</Modal>}
    {modal === "register" && <Modal title="Create your account" onClose={() => setModal("")}><p className="mb-5 text-sm text-slate-500">Create a private patient account to manage your care.</p><form onSubmit={register} className="space-y-3"><div className="grid grid-cols-2 gap-3"><label className="block text-xs font-semibold text-slate-600">First name<input name="first_name" required maxLength="150" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Last name<input name="last_name" required maxLength="150" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label></div><label className="block text-xs font-semibold text-slate-600">Username<input name="username" required autoComplete="username" maxLength="150" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Email<input name="email" type="email" required autoComplete="email" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><label className="block text-xs font-semibold text-slate-600">Password <span className="font-normal text-slate-400">(at least 10 characters)</span><input name="password" type="password" required minLength="10" autoComplete="new-password" className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-normal outline-none focus:border-brand" /></label><Button disabled={busy} className="mt-2 w-full">{busy ? "Creating account..." : "Create patient account"}</Button><p className="text-center text-xs text-slate-400">Doctor and administrator accounts are created by an administrator.</p></form></Modal>}
    {modal === "conversations" && <Modal title="Previous conversations" onClose={() => setModal("")}><div className="mb-4 flex justify-end"><Button onClick={() => { startNewConversation(); setActive("AI health assistant"); }}><Plus size={15} /> New conversation</Button></div><div className="max-h-[55vh] space-y-2 overflow-y-auto">{conversations.map((conversation) => <button key={conversation.id} onClick={() => openConversation(conversation)} className="w-full rounded-xl border border-slate-100 p-4 text-left transition hover:border-blue-200 hover:bg-blue-50/40"><p className="truncate text-sm font-semibold text-ink">{conversation.title || "Health conversation"}</p><p className="mt-1 text-xs text-slate-400">{new Date(conversation.created_at).toLocaleString()} · {conversation.messages.length} messages</p></button>)}{conversations.length === 0 && <EmptyState text="No saved conversations yet." />}</div></Modal>}
    {modal === "services" && <Modal title="Nearby healthcare services" onClose={() => setModal("")}><p className="mb-4 text-sm leading-relaxed text-slate-500">Find care options near you. Your location is requested only when you search and is not saved to your health profile.</p><Button disabled={locating} onClick={findNearbyServices} className="mb-5 w-full"><LocateFixed size={16} /> {locating ? "Finding your location..." : "Use my location"}</Button>{serviceError && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-xs leading-relaxed text-rose-700">{serviceError}</p>}{serviceSearchDone && (nearbyServices.length ? <div className="max-h-[45vh] space-y-3 overflow-y-auto">{nearbyServices.map((service) => <div key={service.id} className="rounded-xl border border-slate-100 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-ink">{service.name}</p><p className="mt-1 text-xs text-slate-400">{service.service_type}</p></div><span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{service.distance_km.toFixed(1)} km</span></div><p className="mt-3 flex items-start gap-2 text-sm text-slate-600"><MapPin size={15} className="mt-0.5 shrink-0 text-brand" />{service.address}</p>{service.phone && <p className="mt-2 text-xs text-slate-500">{service.phone}</p>}<a className="mt-3 inline-block text-xs font-bold text-brand hover:underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(service.address)}`}>Directions <ArrowRight className="ml-1 inline" size={13} /></a></div>)}</div> : <EmptyState text="No services found within 25 km. Please contact your local health authority for other options." />)}</Modal>}
  </div>;
}

function PageHeading({ title, subtitle, action }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><h2 className="display-font text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>{action}</div>;
}
function AppointmentRow({ appointment: a }) {
  const status = a.status || "Pending";
  const confirmed = status.toLowerCase() === "confirmed" || status.toLowerCase() === "accepted";
  return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 p-3.5 transition hover:border-blue-100"><div className="flex items-center gap-3"><Avatar initials={a.initials || "DR"} className={a.color || "bg-sky-100 text-sky-700"} /><div><p className="text-sm font-bold text-ink">{a.doctor_name || (typeof a.doctor === "string" ? a.doctor : "") || a.doctor || "Healthcare professional"}</p><p className="mt-0.5 text-xs text-slate-400">{a.specialty || "General practice"} <span className="mx-1">·</span> {a.date || (a.scheduled_for ? new Date(a.scheduled_for).toLocaleString() : "")}</p></div></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${confirmed ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`}>{status}</span></div>;
}
function RecordRow({ record: r }) {
  const Icon = r.icon || FileHeart;
  return <div className="flex items-center gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${r.color || "bg-blue-50 text-blue-600"}`}><Icon size={18} /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-ink">{r.name || r.title}</p><p className="mt-0.5 text-[11px] text-slate-400">{r.category || r.record_type} <span className="mx-1">·</span> {r.date || (r.created_at ? new Date(r.created_at).toLocaleDateString() : "")}</p></div><button className="rounded-lg p-2 text-slate-400 hover:bg-slate-50" title="Record details"><ChevronRight size={16} /></button></div>;
}
function ProfileField({ label, value }) {
  return <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p><p className="text-sm font-medium text-ink">{value}</p></div>;
}
function EmptyState({ text }) {
  return <div className="grid justify-items-center py-12 text-center"><div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-50 text-slate-400"><FileHeart size={22} /></div><p className="text-sm text-slate-500">{text}</p></div>;
}
function localDateTimeMin() {
  const localTime = new Date(Date.now() + 60_000 - new Date().getTimezoneOffset() * 60_000);
  return localTime.toISOString().slice(0, 16);
}

export default App;
