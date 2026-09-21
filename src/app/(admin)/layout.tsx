import Sidebar from "@/components/Sidebar";
import TransferenciaAlarm from "@/components/TransferenciaAlarm";
import Header from "@/components/Header";
import { AppProvider } from "@/store/AppContext";
import AdminAuthWrapper from "@/components/AdminAuthWrapper";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthWrapper>
      <AppProvider>
        <div className="flex h-screen overflow-hidden bg-slate-100">
          <Sidebar />
          <div className="flex-1 flex flex-col ml-64 min-w-0 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-8">
              {children}
            </main>
          </div>
        </div>
        <TransferenciaAlarm />
      </AppProvider>
    </AdminAuthWrapper>
  );
}
