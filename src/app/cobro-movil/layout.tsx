import AdminAuthWrapper from '@/components/AdminAuthWrapper';

export default function CobroMovilLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAuthWrapper>
      <div className="min-h-screen bg-slate-900 flex flex-col">
        <div className="flex-1 flex flex-col w-full">
          {children}
        </div>
      </div>
    </AdminAuthWrapper>
  );
}
