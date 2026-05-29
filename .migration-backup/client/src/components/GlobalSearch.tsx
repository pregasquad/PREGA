import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Search, X, User, Users, Calendar } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

interface Client { id: number; name: string; phone?: string; }
interface StaffMember { id: number; name: string; }
interface Appt { id: number; clientName: string; staffName?: string; startTime: string; date: string; }

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [, setLocation] = useLocation();
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";

  const { data: clients = [] } = useQuery<Client[]>({ queryKey: ["/api/clients"] });
  const { data: staff = [] } = useQuery<StaffMember[]>({ queryKey: ["/api/staff"] });
  const { data: appointments = [] } = useQuery<Appt[]>({ queryKey: ["/api/appointments"] });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const q = query.trim().toLowerCase();

  const filteredClients = q.length >= 2
    ? clients.filter(c => c.name?.toLowerCase().includes(q) || c.phone?.includes(q)).slice(0, 5)
    : [];

  const filteredStaff = q.length >= 2
    ? staff.filter(s => s.name?.toLowerCase().includes(q)).slice(0, 3)
    : [];

  const filteredAppointments = q.length >= 2
    ? appointments.filter(a =>
        a.clientName?.toLowerCase().includes(q) ||
        a.staffName?.toLowerCase().includes(q)
      ).slice(0, 4)
    : [];

  const hasResults = filteredClients.length > 0 || filteredStaff.length > 0 || filteredAppointments.length > 0;

  const navigate = (path: string) => {
    setLocation(path);
    setOpen(false);
    setQuery("");
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        data-testid="button-global-search"
        title={isRtl ? "بحث (Ctrl+K)" : "Search (Ctrl+K)"}
      >
        <Search className="w-4 h-4" />
      </Button>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setQuery(""); }}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden" dir={isRtl ? "rtl" : "ltr"}>
          <div className="flex items-center border-b px-3 gap-2">
            <Search className="w-4 h-4 text-muted-foreground shrink-0" />
            <Input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={isRtl ? "ابحث عن عميل أو موظف أو حجز…" : "Search clients, staff, appointments…"}
              className="border-0 shadow-none focus-visible:ring-0 h-12 text-sm bg-transparent"
              data-testid="input-global-search"
            />
            {query && (
              <button onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground p-1 shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {q.length < 2 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {isRtl ? "اكتب حرفين على الأقل للبحث" : "Type at least 2 characters to search"}
                </p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {isRtl ? "اضغط Ctrl+K في أي وقت" : "Press Ctrl+K anytime"}
                </p>
              </div>
            ) : !hasResults ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm text-muted-foreground">
                  {isRtl ? "لا توجد نتائج" : "No results found"}
                </p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredClients.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                      {isRtl ? "العملاء" : "Clients"}
                    </p>
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => navigate("/clients")}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted text-start transition-colors"
                        data-testid={`search-result-client-${c.id}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium leading-none truncate">{c.name}</p>
                          {c.phone && <p className="text-xs text-muted-foreground mt-0.5">{c.phone}</p>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {filteredStaff.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                      {isRtl ? "الموظفون" : "Staff"}
                    </p>
                    {filteredStaff.map(s => (
                      <button
                        key={s.id}
                        onClick={() => navigate("/staff")}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted text-start transition-colors"
                        data-testid={`search-result-staff-${s.id}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0">
                          <Users className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-sm font-medium truncate">{s.name}</p>
                      </button>
                    ))}
                  </div>
                )}

                {filteredAppointments.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1">
                      {isRtl ? "الحجوزات" : "Appointments"}
                    </p>
                    {filteredAppointments.map(a => (
                      <button
                        key={a.id}
                        onClick={() => navigate("/planning")}
                        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted text-start transition-colors"
                        data-testid={`search-result-appt-${a.id}`}
                      >
                        <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0">
                          <Calendar className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{a.clientName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {a.date} {a.startTime}{a.staffName ? ` · ${a.staffName}` : ""}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
