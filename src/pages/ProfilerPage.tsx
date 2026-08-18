import { useState, useEffect } from "react";
import { 
  TableProperties, 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  Search, 
  AlertCircle,
  Database,
  RefreshCw,
  Info
} from "lucide-react";
import { profileApi } from "../services/api";
import type { Profile, Dataset } from "../services/api";

interface ProfilerPageProps {
  selectedDataset: Dataset | null;
  onProfileComplete: (updatedDataset: Dataset) => void;
}

export function ProfilerPage({ selectedDataset, onProfileComplete }: ProfilerPageProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedColumn, setExpandedColumn] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState("");

  const loadProfile = async (id: string) => {
    try {
      setLoading(true);
      setLoadingStep("Fetching profile...");
      const data = await profileApi.get(id);
      setProfile(data);
      setError(null);
    } catch (err: any) {
      if (err.response?.status === 404) {
        setProfile(null); // Not profiled yet
      } else {
        setError("Failed to fetch profiling data.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      loadProfile(selectedDataset.id);
    }
  }, [selectedDataset]);

  const handleGenerateProfile = async () => {
    if (!selectedDataset) return;
    setLoading(true);
    setError(null);
    
    const steps = [
      "Loading file into memory...",
      "Analyzing data shapes and boundaries...",
      "Calculating missing value ratios...",
      "Computing column statistics...",
      "Generating AI insights summary..."
    ];

    let stepIndex = 0;
    setLoadingStep(steps[0]);
    const stepInterval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setLoadingStep(steps[stepIndex]);
      }
    }, 1200);

    try {
      const data = await profileApi.generate(selectedDataset.id);
      setProfile(data);
      clearInterval(stepInterval);
      
      // Notify parent that the dataset has been profiled and stats updated
      const updatedDataset: Dataset = {
        ...selectedDataset,
        status: "profiled",
        row_count: data.row_count,
        column_count: data.column_count
      };
      onProfileComplete(updatedDataset);
    } catch (err: any) {
      clearInterval(stepInterval);
      setError(err.response?.data?.detail || "Profiling failed. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  const toggleExpand = (colName: string) => {
    if (expandedColumn === colName) {
      setExpandedColumn(null);
    } else {
      setExpandedColumn(colName);
    }
  };

  if (!selectedDataset) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="bg-accent/40 border border-border/80 p-4 rounded-full text-muted-foreground mb-4 inline-block">
          <Database className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg">No active dataset</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Please upload or select a dataset from the Dashboard to start profiling.
        </p>
      </div>
    );
  }

  // Calculate completeness score
  let completenessScore = 100;
  if (profile) {
    const totalCells = profile.row_count * profile.column_count;
    if (totalCells > 0) {
      completenessScore = 100 * (1 - profile.missing_cells / totalCells);
    }
  }

  // Create an automatic premium summary based on stats
  const getAISummary = () => {
    if (!profile) return "";
    const colTypes = profile.columns_metadata.reduce((acc: Record<string, number>, col) => {
      acc[col.type] = (acc[col.type] || 0) + 1;
      return acc;
    }, {});
    
    const parts = [
      `InsightAI has completed profiling on **${selectedDataset.name}**.`,
      `The dataset contains **${profile.row_count.toLocaleString()}** rows and **${profile.column_count}** columns, resulting in **${(profile.row_count * profile.column_count).toLocaleString()}** total data points.`,
      `We detected **${colTypes.numeric || 0}** numeric columns, **${colTypes.categorical || 0}** categorical columns, **${colTypes.boolean || 0}** boolean columns, and **${colTypes.datetime || 0}** datetime variables.`
    ];

    if (profile.duplicate_rows > 0) {
      parts.push(`There are **${profile.duplicate_rows.toLocaleString()}** duplicate rows, which makes up **${(profile.duplicate_rows / profile.row_count * 100).toFixed(1)}%** of your dataset. We recommend removing duplicate rows to prevent bias.`);
    } else {
      parts.push("No duplicate rows were found, indicating solid data uniqueness.");
    }

    if (profile.missing_cells > 0) {
      const missingPct = (100 - completenessScore).toFixed(2);
      parts.push(`A total of **${profile.missing_cells.toLocaleString()}** cells are missing (**${missingPct}%** of total cells). Columns like **${profile.columns_metadata.filter(c => c.missing_count > 0).slice(0, 3).map(c => c.name).join(", ")}** contain null values.`);
      parts.push("Ensure you handle missing entries before model training.");
    } else {
      parts.push("The dataset has 100% completeness with zero missing fields.");
    }

    return parts.join(" ");
  };

  const filteredColumns = profile
    ? profile.columns_metadata.filter((col) =>
        col.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <TableProperties className="w-7 h-7 text-primary" />
            Data Profiling
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Get comprehensive dataset profiling metrics, values completeness, type inference, and statistics.
          </p>
        </div>
        
        {profile && !loading && (
          <button 
            onClick={handleGenerateProfile}
            className="bg-accent/40 hover:bg-accent border border-border text-white text-xs font-semibold py-2.5 px-4 rounded-xl flex items-center gap-2 transition-all"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Re-run Profiling
          </button>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/25 rounded-full blur-xl scale-125"></div>
            <div className="relative border border-primary/40 p-4 rounded-full text-primary bg-primary/10">
              <RefreshCw className="w-8 h-8 animate-spin" />
            </div>
          </div>
          <h4 className="text-white font-semibold text-lg mb-1">Profiling Dataset</h4>
          <p className="text-primary text-xs font-medium animate-pulse mb-2">{loadingStep}</p>
          <p className="text-muted-foreground text-xs max-w-sm">
            This might take a moment depending on the file complexity.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300">Profiling Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Empty State / Not profiled yet */}
      {!profile && !loading && !error && (
        <div className="glass-card p-16 text-center max-w-2xl mx-auto flex flex-col items-center">
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-full text-primary mb-5">
            <TableProperties className="w-8 h-8" />
          </div>
          <h3 className="text-white font-bold text-lg mb-2">Dataset not profiled yet</h3>
          <p className="text-muted-foreground text-sm max-w-md mb-8">
            Profiling scans your dataset to compute duplicate rows, data completeness, types distributions, and summary statistics.
          </p>
          <button 
            onClick={handleGenerateProfile}
            className="bg-primary hover:bg-primary/95 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Generate Data Profile
          </button>
        </div>
      )}

      {/* Profile Dashboard Display */}
      {profile && !loading && (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="glass-card p-5 border border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Dataset Shape</span>
              <span className="text-2xl font-bold text-white block">
                {profile.row_count.toLocaleString()} x {profile.column_count}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">Rows by Columns</span>
            </div>

            <div className="glass-card p-5 border border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Duplicate Rows</span>
              <span className={`text-2xl font-bold block ${profile.duplicate_rows > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {profile.duplicate_rows.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">
                {profile.duplicate_rows > 0 
                  ? `${(profile.duplicate_rows / profile.row_count * 100).toFixed(1)}% duplication rate` 
                  : "0% duplication rate"}
              </span>
            </div>

            <div className="glass-card p-5 border border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Missing Cells</span>
              <span className={`text-2xl font-bold block ${profile.missing_cells > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {profile.missing_cells.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">Null cells in dataset</span>
            </div>

            <div className="glass-card p-5 border border-border">
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">Memory Size</span>
              <span className="text-2xl font-bold text-white block">
                {formatBytes(profile.memory_usage_bytes)}
              </span>
              <span className="text-xs text-muted-foreground block mt-1">RAM memory size</span>
            </div>
          </div>

          {/* Completeness Section & AI Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Completeness Gauge */}
            <div className="glass-card p-6 border border-border flex flex-col justify-between">
              <div>
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">Data Completeness</h4>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Fill Rate</span>
                  <span className="text-lg font-bold text-emerald-400">{completenessScore.toFixed(2)}%</span>
                </div>
                <div className="w-full bg-accent/40 rounded-full h-3 overflow-hidden border border-border/60">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      completenessScore > 95 
                        ? "bg-emerald-400" 
                        : completenessScore > 80 
                        ? "bg-amber-400" 
                        : "bg-red-400"
                    }`}
                    style={{ width: `${completenessScore}%` }}
                  ></div>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-4">
                {completenessScore === 100 
                  ? "Your data has no null values. Ready for standard pipelines." 
                  : "Some fields are missing. Use the Data Cleaning module to impute or drop empty variables."}
              </p>
            </div>

            {/* AI Summary */}
            <div className="glass-card p-6 border border-border md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-primary/20 p-1.5 rounded border border-primary/30 text-primary">
                  <Sparkles className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-semibold text-white uppercase tracking-wider">AI Dataset Executive Summary</h4>
              </div>
              <p className="text-sm text-foreground leading-relaxed font-normal text-muted-foreground">
                {getAISummary()}
              </p>
            </div>
          </div>

          {/* Columns Detailed Metadata Table */}
          <div className="glass-card border border-border overflow-hidden">
            <div className="px-6 py-5 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="font-bold text-lg text-white">Variables Metadata</h3>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search columns..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-lg glass border border-border/80 focus:border-primary/50 text-white placeholder-muted-foreground focus:outline-none"
                />
              </div>
            </div>

            {filteredColumns.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground text-xs">
                No variables found matching "{searchQuery}"
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {filteredColumns.map((col) => {
                  const isExpanded = expandedColumn === col.name;
                  const typeColors = {
                    numeric: "bg-blue-500/10 text-blue-400 border-blue-500/20",
                    categorical: "bg-purple-500/10 text-purple-400 border-purple-500/20",
                    boolean: "bg-teal-500/10 text-teal-400 border-teal-500/20",
                    datetime: "bg-orange-500/10 text-orange-400 border-orange-500/20"
                  };
                  return (
                    <div 
                      key={col.name} 
                      className={`hover:bg-accent/10 transition-colors ${
                        isExpanded ? "bg-accent/15" : ""
                      }`}
                    >
                      {/* Row Header Info */}
                      <div 
                        onClick={() => toggleExpand(col.name)}
                        className="px-6 py-4 flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-6 flex-1">
                          {/* Col Name */}
                          <span className="font-semibold text-white text-sm w-48 truncate">{col.name}</span>
                          
                          {/* Type badge */}
                          <span className={`text-[10px] px-2 py-0.5 rounded border uppercase font-mono font-bold ${
                            typeColors[col.type] || "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
                          }`}>
                            {col.type}
                          </span>

                          {/* Cardinality */}
                          <span className="hidden sm:inline text-xs text-muted-foreground w-28">
                            Unique: <strong className="text-foreground">{col.cardinality}</strong>
                          </span>

                          {/* Missing Progress */}
                          <div className="hidden md:flex items-center gap-2 w-48">
                            <span className="text-xs text-muted-foreground w-16 shrink-0">Missing:</span>
                            <div className="flex-1 bg-accent/40 rounded-full h-1.5 overflow-hidden border border-border/40">
                              <div 
                                className={`h-full rounded-full ${
                                  col.missing_pct > 15 
                                    ? "bg-red-400" 
                                    : col.missing_pct > 5 
                                    ? "bg-amber-400" 
                                    : "bg-emerald-400"
                                }`}
                                style={{ width: `${col.missing_pct}%` }}
                              ></div>
                            </div>
                            <span className={`text-xs w-10 text-right ${col.missing_pct > 0 ? "text-amber-400 font-bold" : "text-muted-foreground"}`}>
                              {col.missing_pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {/* Expand Trigger */}
                        <div>
                          {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                        </div>
                      </div>

                      {/* Expandable Details Container */}
                      {isExpanded && (
                        <div className="px-8 pb-6 pt-2 border-t border-border/20 bg-accent/5">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* Left Side Details */}
                            <div>
                              <h5 className="text-xs font-semibold text-white uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                <Info className="w-3.5 h-3.5 text-primary" />
                                Statistics
                              </h5>
                              
                              {col.type === "numeric" ? (
                                <div className="grid grid-cols-2 gap-4 text-xs">
                                  <div className="p-2.5 rounded-lg bg-card/45 border border-border/40">
                                    <span className="text-muted-foreground">Mean</span>
                                    <strong className="block text-white mt-0.5">{col.stats.mean !== null ? col.stats.mean.toLocaleString() : "N/A"}</strong>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-card/45 border border-border/40">
                                    <span className="text-muted-foreground">Std Dev</span>
                                    <strong className="block text-white mt-0.5">{col.stats.std !== null ? col.stats.std.toLocaleString() : "N/A"}</strong>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-card/45 border border-border/40">
                                    <span className="text-muted-foreground">Min / Max</span>
                                    <strong className="block text-white mt-0.5">
                                      {col.stats.min !== null ? col.stats.min.toLocaleString() : "N/A"} / {col.stats.max !== null ? col.stats.max.toLocaleString() : "N/A"}
                                    </strong>
                                  </div>
                                  <div className="p-2.5 rounded-lg bg-card/45 border border-border/40">
                                    <span className="text-muted-foreground">Quartiles (25% / 50% / 75%)</span>
                                    <strong className="block text-white mt-0.5">
                                      {col.stats["25%"] !== null ? col.stats["25%"].toLocaleString() : "N/A"} / {col.stats.median !== null ? col.stats.median.toLocaleString() : "N/A"} / {col.stats["75%"] !== null ? col.stats["75%"].toLocaleString() : "N/A"}
                                    </strong>
                                  </div>
                                </div>
                              ) : col.type === "datetime" ? (
                                <div className="space-y-2 text-xs">
                                  <div className="p-3 rounded-lg bg-card/45 border border-border/40 flex justify-between">
                                    <span className="text-muted-foreground">Earliest Date:</span>
                                    <strong className="text-white">{col.stats.min || "N/A"}</strong>
                                  </div>
                                  <div className="p-3 rounded-lg bg-card/45 border border-border/40 flex justify-between">
                                    <span className="text-muted-foreground">Latest Date:</span>
                                    <strong className="text-white">{col.stats.max || "N/A"}</strong>
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-1.5 text-xs text-muted-foreground">
                                  <p>Variable type is **{col.type}**.</p>
                                  <p>Total Nulls: <strong className="text-white">{col.missing_count}</strong></p>
                                  <p>Filling rate: <strong className="text-white">{(100 - col.missing_pct).toFixed(1)}%</strong></p>
                                </div>
                              )}
                            </div>

                            {/* Right Side Distribution / Values */}
                            <div>
                              <h5 className="text-xs font-semibold text-white uppercase tracking-wider mb-3">
                                {col.type === "numeric" ? "Value Distribution Summary" : "Top Value Frequencies"}
                              </h5>
                              
                              {col.stats.top_values ? (
                                <div className="space-y-2.5 text-xs">
                                  {col.stats.top_values.map(([val, freq]: [any, number], idx: number) => {
                                    const maxFreq = col.stats.top_values[0][1];
                                    const ratio = maxFreq > 0 ? (freq / maxFreq * 100) : 0;
                                    return (
                                      <div key={idx} className="space-y-1">
                                        <div className="flex justify-between font-mono">
                                          <span className="text-white truncate max-w-[200px]" title={String(val)}>
                                            {val === null || val === "" ? <span className="italic text-muted-foreground">null/empty</span> : String(val)}
                                          </span>
                                          <span className="text-muted-foreground">{freq.toLocaleString()}</span>
                                        </div>
                                        <div className="w-full bg-accent/30 rounded-full h-1 overflow-hidden">
                                          <div 
                                            className="bg-primary h-full rounded-full" 
                                            style={{ width: `${ratio}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : col.type === "numeric" ? (
                                <div className="text-xs text-muted-foreground leading-relaxed">
                                  This is a continuous numeric variable with a range from **{col.stats.min?.toLocaleString()}** to **{col.stats.max?.toLocaleString()}**. 
                                  The average value is **{col.stats.mean?.toLocaleString()}** with a standard deviation of **{col.stats.std?.toLocaleString()}**.
                                </div>
                              ) : (
                                <div className="text-xs text-muted-foreground">
                                  No distribution statistics available for this column format.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
export default ProfilerPage;
