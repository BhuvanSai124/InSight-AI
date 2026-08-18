import { 
  LayoutDashboard, 
  UploadCloud, 
  TableProperties, 
  BarChart3, 
  FileText, 
  Settings,
  Cpu,
  MessageSquare,
  BookOpen,
  Database,
  TrendingUp
} from "lucide-react";

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "upload", label: "Upload Dataset", icon: UploadCloud },
    { id: "profiling", label: "Data Profiling", icon: TableProperties },
    { id: "cleaning", label: "Clean Data", icon: Settings },
    { id: "eda", label: "EDA & Charts", icon: BarChart3 },
    { id: "models", label: "AutoML & Models", icon: Cpu },
    { id: "chat", label: "Chat Analyst", icon: MessageSquare },
    { id: "rag", label: "Document RAG", icon: BookOpen },
    { id: "reports", label: "Reports", icon: FileText },
  ];

  return (
    <aside className="w-64 glass border-r border-border h-screen flex flex-col justify-between p-4 shrink-0">
      <div>
        {/* Logo Section */}
        <div className="flex items-center gap-3 px-3 py-4 mb-6">
          <div className="bg-primary/20 p-2 rounded-lg border border-primary/30">
            <Database className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-none tracking-wide text-foreground">InsightAI</h1>
            <span className="text-xs text-muted-foreground">Smart Data Agent</span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary text-white shadow-lg shadow-primary/25 border border-primary/50"
                    : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? "text-white" : "text-muted-foreground group-hover:text-foreground"}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-muted/30 border border-border/40 rounded-xl">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-semibold text-foreground">SaaS V1.0 Active</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Unlock the power of automated analytics.
        </p>
      </div>
    </aside>
  );
};
export default Sidebar;
