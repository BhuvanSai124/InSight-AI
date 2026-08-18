import { 
  Database, 
  Trash2, 
  BarChart, 
  Sparkles,
  FileSpreadsheet
} from "lucide-react";
import type { Dataset } from "../services/api";

interface DashboardProps {
  datasets: Dataset[];
  onSelectDataset: (dataset: Dataset) => void;
  onDeleteDataset: (id: string) => void;
  selectedDataset: Dataset | null;
  setCurrentTab: (tab: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  datasets,
  onSelectDataset,
  onDeleteDataset,
  selectedDataset,
  setCurrentTab,
}) => {

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Calculate statistics
  const totalDatasets = datasets.length;
  const totalRows = datasets.reduce((sum, d) => sum + (d.row_count || 0), 0);
  const totalSize = datasets.reduce((sum, d) => sum + d.file_size, 0);

  return (
    <div className="space-y-8 max-w-7xl mx-auto py-8 px-4">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Welcome to InsightAI</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Automate your data analytics pipeline: profile, clean, visualize, and train models in minutes.
          </p>
        </div>
        <button 
          onClick={() => setCurrentTab("upload")}
          className="bg-primary hover:bg-primary/95 text-white font-semibold py-2.5 px-5 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center gap-2"
        >
          <Database className="w-4 h-4" />
          Upload New Dataset
        </button>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card p-6 border border-border">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Datasets</span>
            <div className="bg-primary/20 text-primary p-2 rounded-lg border border-primary/30">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white">{totalDatasets}</h3>
          <p className="text-xs text-muted-foreground mt-2">Active sandbox datasets</p>
        </div>

        <div className="glass-card p-6 border border-border">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Rows Loaded</span>
            <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-lg border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white">{totalRows.toLocaleString()}</h3>
          <p className="text-xs text-muted-foreground mt-2">Rows parsed successfully</p>
        </div>

        <div className="glass-card p-6 border border-border">
          <div className="flex justify-between items-start mb-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Storage Consumed</span>
            <div className="bg-amber-500/20 text-amber-400 p-2 rounded-lg border border-amber-500/30">
              <BarChart className="w-5 h-5" />
            </div>
          </div>
          <h3 className="text-3xl font-bold text-white">{formatBytes(totalSize)}</h3>
          <p className="text-xs text-muted-foreground mt-2">Sandbox space usage</p>
        </div>
      </div>

      {/* Datasets Table / Grid */}
      <div className="glass-card border border-border overflow-hidden">
        <div className="px-6 py-5 border-b border-border/60 flex justify-between items-center">
          <h3 className="font-bold text-lg text-white">Dataset Inventory</h3>
          <span className="text-xs px-2.5 py-1 rounded-full bg-accent/40 text-muted-foreground border border-border font-medium">
            {datasets.length} Saved
          </span>
        </div>

        {datasets.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-center">
            <div className="bg-accent/40 border border-border/80 p-4 rounded-full text-muted-foreground mb-4">
              <Database className="w-8 h-8" />
            </div>
            <h4 className="text-white font-semibold text-base mb-1">No datasets uploaded yet</h4>
            <p className="text-muted-foreground text-xs max-w-sm mb-6">
              To test the platform, upload a CSV or Excel spreadsheet containing your data.
            </p>
            <button 
              onClick={() => setCurrentTab("upload")}
              className="bg-accent/50 hover:bg-accent text-white font-semibold py-2 px-4 rounded-lg text-xs transition-colors border border-border"
            >
              Go to Upload
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border/40 text-xs font-semibold text-muted-foreground bg-accent/20">
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Format</th>
                  <th className="px-6 py-4">Dimensions</th>
                  <th className="px-6 py-4">File Size</th>
                  <th className="px-6 py-4">Created</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-sm text-foreground">
                {datasets.map((dataset) => {
                  const isSelected = selectedDataset?.id === dataset.id;
                  return (
                    <tr 
                      key={dataset.id}
                      onClick={() => onSelectDataset(dataset)}
                      className={`hover:bg-accent/25 transition-colors cursor-pointer ${
                        isSelected ? "bg-primary/5 border-l-2 border-l-primary" : ""
                      }`}
                    >
                      <td className="px-6 py-4 font-medium text-white max-w-[240px] truncate">
                        {dataset.name}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                          dataset.file_type === "csv" 
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : dataset.file_type === "json"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}>
                          {dataset.file_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-mono text-muted-foreground">
                        {dataset.row_count ? `${dataset.row_count} R x ${dataset.column_count} C` : "Calculating..."}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {formatBytes(dataset.file_size)}
                      </td>
                      <td className="px-6 py-4 text-xs text-muted-foreground">
                        {new Date(dataset.created_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit"
                        })}
                      </td>
                      <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              onSelectDataset(dataset);
                              setCurrentTab("profiling");
                            }}
                            className="p-1.5 rounded-lg bg-accent/40 border border-border/80 text-muted-foreground hover:text-white transition-colors"
                            title="Profile Data"
                          >
                            <Sparkles className="w-4 h-4 text-primary" />
                          </button>
                          <button
                            onClick={() => {
                              onSelectDataset(dataset);
                              setCurrentTab("eda");
                            }}
                            className="p-1.5 rounded-lg bg-accent/40 border border-border/80 text-muted-foreground hover:text-white transition-colors"
                            title="EDA Charts"
                          >
                            <BarChart className="w-4 h-4 text-emerald-400" />
                          </button>
                          <button
                            onClick={() => onDeleteDataset(dataset.id)}
                            className="p-1.5 rounded-lg bg-accent/40 border border-border/80 text-muted-foreground hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default Dashboard;
