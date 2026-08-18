import { Sun, Moon, HelpCircle } from "lucide-react";

interface HeaderProps {
  selectedDataset: { name: string } | null;
  theme: "dark" | "light";
  toggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({ selectedDataset, theme, toggleTheme }) => {
  return (
    <header className="h-16 glass border-b border-border flex items-center justify-between px-8 shrink-0">
      {/* Left side: Active Context */}
      <div className="flex items-center gap-3">
        {selectedDataset ? (
          <div className="flex items-center gap-2">
            <span className="text-xs px-2.5 py-1 rounded-full bg-primary/20 text-primary border border-primary/30 font-medium">
              Active Dataset
            </span>
            <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">
              {selectedDataset.name}
            </span>
          </div>
        ) : (
          <span className="text-sm text-muted-foreground font-medium">
            Select or upload a dataset to get started
          </span>
        )}
      </div>

      {/* Right side: Actions & Profile */}
      <div className="flex items-center gap-4">
        {/* Help / Guide */}
        <button className="text-muted-foreground hover:text-foreground transition-colors">
          <HelpCircle className="w-5 h-5" />
        </button>

        {/* Theme Toggle */}
        <button 
          onClick={toggleTheme}
          className="p-2 rounded-lg bg-accent/40 border border-border text-muted-foreground hover:text-foreground transition-all duration-200"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Divider */}
        <div className="h-5 w-[1px] bg-border/60"></div>

        {/* User profile */}
        <div className="flex items-center gap-2.5">
          <div className="bg-primary/30 border border-primary/40 text-primary w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shadow">
            JD
          </div>
          <div className="hidden md:block text-left">
            <p className="text-xs font-semibold text-foreground leading-none">John Doe</p>
            <span className="text-[10px] text-muted-foreground">Lead Analyst</span>
          </div>
        </div>
      </div>
    </header>
  );
};
export default Header;
