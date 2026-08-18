import { useState, useEffect } from "react";
import { 
  FileText, 
  Database,
  Printer,
  Sparkles,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  TrendingUp
} from "lucide-react";
import { datasetApi } from "../services/api";
import type { Dataset, ReportData } from "../services/api";

interface ReportsPageProps {
  selectedDataset: Dataset | null;
}

export function ReportsPage({ selectedDataset }: ReportsPageProps) {
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await datasetApi.getReport(id);
      setReportData(data);
    } catch (err: any) {
      setError("Failed to compile dataset report. Verify database connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      fetchReport(selectedDataset.id);
    }
  }, [selectedDataset]);

  const handlePrint = () => {
    window.print();
  };

  if (!selectedDataset) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center print:hidden">
        <div className="bg-accent/40 border border-border/80 p-4 rounded-full text-muted-foreground mb-4 inline-block">
          <Database className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg">No active dataset</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Please upload or select a dataset from the Dashboard to compile reports.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center print:hidden">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <h4 className="text-white font-bold">Compiling Report</h4>
          <p className="text-muted-foreground text-xs">Aggregating database profiles, alerts, and correlation matrix...</p>
        </div>
      </div>
    );
  }

  if (error || !reportData) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center print:hidden">
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-full text-red-400 mb-4 inline-block">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg">Report Compilation Failed</h3>
        <p className="text-muted-foreground text-sm mt-1 mb-6">
          {error || "An error occurred while fetching dataset statistics."}
        </p>
        <button 
          onClick={() => fetchReport(selectedDataset.id)}
          className="bg-primary hover:bg-primary/95 text-white font-semibold py-2 px-4 rounded-xl text-xs transition-all border border-primary/45"
        >
          Retry Compilation
        </button>
      </div>
    );
  }

  const { dataset, profile, correlations, quality_alerts, recommendations } = reportData;
  const fillRate = profile.row_count > 0 
    ? ((1 - profile.missing_cells / (profile.row_count * profile.column_count)) * 100).toFixed(1) 
    : "100";

  return (
    <div className="max-w-6xl mx-auto py-8 px-6 space-y-8 print:p-0 print:m-0 print:bg-white print:text-black">
      
      {/* Header controls (Hidden during print) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <FileText className="w-7 h-7 text-primary" />
            Dataset Executive Report
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Aggregated audit summarizing completeness, data quality, and recommended transformations.
          </p>
        </div>
        <button 
          onClick={handlePrint}
          className="bg-primary hover:bg-primary/95 text-white font-semibold py-2.5 px-5 rounded-xl text-xs transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center gap-2"
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      {/* Main Printable Container */}
      <div className="space-y-8 print:space-y-6">
        
        {/* Printable Cover Header (Styled for print specifically) */}
        <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
          <h1 className="text-3xl font-black text-slate-900">InsightAI Executive Data Report</h1>
          <p className="text-xs text-slate-500 mt-1">
            Compiled on {new Date().toLocaleDateString()} | Active Dataset: {dataset.name}
          </p>
        </div>

        {/* 1. Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3 print:gap-4">
          
          <div className="glass-card p-5 border border-border print:border-slate-300 print:text-black print:bg-white print:shadow-none">
            <span className="text-[10px] text-muted-foreground print:text-slate-500 uppercase tracking-wider font-semibold">Dimensions</span>
            <div className="text-2xl font-bold text-white print:text-slate-900 mt-1">
              {profile.row_count.toLocaleString()} <span className="text-xs text-muted-foreground print:text-slate-500 font-normal">Rows</span>
            </div>
            <div className="text-2xl font-bold text-white print:text-slate-900 mt-0.5">
              {profile.column_count} <span className="text-xs text-muted-foreground print:text-slate-500 font-normal">Columns</span>
            </div>
          </div>

          <div className="glass-card p-5 border border-border print:border-slate-300 print:text-black print:bg-white print:shadow-none">
            <span className="text-[10px] text-muted-foreground print:text-slate-500 uppercase tracking-wider font-semibold">Data Completeness</span>
            <div className="text-2xl font-bold text-white print:text-slate-900 mt-1">
              {fillRate}% <span className="text-xs text-muted-foreground print:text-slate-500 font-normal">Fill Rate</span>
            </div>
            <div className="text-xs text-muted-foreground print:text-slate-500 mt-1">
              {profile.missing_cells.toLocaleString()} missing cells total
            </div>
          </div>

          <div className="glass-card p-5 border border-border print:border-slate-300 print:text-black print:bg-white print:shadow-none">
            <span className="text-[10px] text-muted-foreground print:text-slate-500 uppercase tracking-wider font-semibold">Redundancies & Size</span>
            <div className="text-2xl font-bold text-white print:text-slate-900 mt-1">
              {profile.duplicate_rows} <span className="text-xs text-muted-foreground print:text-slate-500 font-normal">Duplicates</span>
            </div>
            <div className="text-xs text-muted-foreground print:text-slate-500 mt-1.5">
              Memory: {(profile.memory_usage_bytes / 1024).toFixed(1)} KB
            </div>
          </div>

        </div>

        {/* 2. Warnings & Alerts */}
        <div className="glass-card p-6 border border-border print:border-slate-300 print:bg-white print:shadow-none">
          <h3 className="text-sm text-white print:text-slate-900 font-bold uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Data Quality Audit Warnings
          </h3>
          
          {quality_alerts.length === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-xl print:text-emerald-800 print:bg-emerald-50 print:border-emerald-200">
              <CheckCircle className="w-4.5 h-4.5" />
              Dataset passed all structural checks! No data quality issues detected.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {quality_alerts.map((alert, idx) => (
                <div key={idx} className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs rounded-xl print:text-amber-800 print:bg-amber-50 print:border-amber-200">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{alert}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Variables Table */}
        <div className="glass-card border border-border overflow-hidden print:border-slate-300 print:bg-white print:shadow-none">
          <div className="px-6 py-4 border-b border-border/60 bg-accent/20 print:bg-slate-100 print:border-slate-300">
            <h3 className="text-xs font-bold text-white print:text-slate-900 uppercase tracking-wider">
              Variables Metadata & Profiles
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs print:text-slate-900">
              <thead>
                <tr className="border-b border-border/60 bg-accent/5 print:bg-slate-50 print:border-slate-300 text-[10px] text-muted-foreground print:text-slate-500 uppercase tracking-wider font-semibold">
                  <th className="px-6 py-3">Column Name</th>
                  <th className="px-6 py-3">Type</th>
                  <th className="px-6 py-3">Missing Rate</th>
                  <th className="px-6 py-3 text-right">Summary Properties</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 print:divide-slate-300">
                {profile.columns_metadata.map((col) => (
                  <tr key={col.name} className="hover:bg-accent/5 print:hover:bg-transparent">
                    <td className="px-6 py-3.5 font-semibold text-white print:text-slate-900">{col.name}</td>
                    <td className="px-6 py-3.5 capitalize text-muted-foreground print:text-slate-600">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${
                        col.type === "numeric" ? "bg-blue-500/15 text-blue-400 print:text-blue-800 print:bg-blue-50" :
                        col.type === "categorical" ? "bg-purple-500/15 text-purple-400 print:text-purple-800 print:bg-purple-50" :
                        col.type === "boolean" ? "bg-indigo-500/15 text-indigo-400 print:text-indigo-800 print:bg-indigo-50" :
                        "bg-emerald-500/15 text-emerald-400 print:text-emerald-800 print:bg-emerald-50"
                      }`}>
                        {col.type}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-muted-foreground print:text-slate-600">
                      {col.missing_pct > 0 
                        ? `${col.missing_pct.toFixed(1)}% (${col.missing_count} rows)` 
                        : "0.0% (Clean)"
                      }
                    </td>
                    <td className="px-6 py-3.5 text-right font-mono text-[11px] text-white print:text-slate-800">
                      {col.type === "numeric" && col.stats.mean !== undefined ? (
                        <span>Mean: {Number(col.stats.mean).toFixed(2)} | Min: {Number(col.stats.min).toFixed(1)} | Max: {Number(col.stats.max).toFixed(1)}</span>
                      ) : (
                        <span>Cardinality: {col.cardinality}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Page break during print */}
        <div className="print:page-break" />

        {/* 4. Correlation Summary */}
        <div className="glass-card p-6 border border-border print:border-slate-300 print:bg-white print:shadow-none">
          <h3 className="text-sm text-white print:text-slate-900 font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <TrendingUp className="w-4.5 h-4.5 text-primary" />
            Top Correlation Key Relationships
          </h3>
          {correlations.columns.length < 2 ? (
            <p className="text-xs text-muted-foreground print:text-slate-500">Not enough numeric variables found to trace relationships.</p>
          ) : (
            <div className="text-xs text-muted-foreground print:text-slate-600 space-y-2 leading-relaxed">
              <p>
                Calculated Pearson product-moment correlation coefficients across {correlations.columns.length} numeric columns. 
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 print:grid-cols-2">
                {/* Positive correlations */}
                <div className="p-4 rounded-xl bg-indigo-950/20 border border-border/80 print:bg-slate-50 print:border-slate-300">
                  <h4 className="font-semibold text-white print:text-slate-900 mb-2">Linear Interactions Description</h4>
                  <p className="text-[11px] leading-relaxed">
                    Check the Heatmap correlations in the EDA visualizer workspace for exact variables pairs. Strongly correlated features (r &gt; 0.7) can be compressed or dropped.
                  </p>
                </div>
                
                {/* Outliers note */}
                <div className="p-4 rounded-xl bg-emerald-950/10 border border-border/80 print:bg-slate-50 print:border-slate-300">
                  <h4 className="font-semibold text-white print:text-slate-900 mb-2">Pearson Assumptions Note</h4>
                  <p className="text-[11px] leading-relaxed">
                    Pearson correlation calculations assume normal distributions and are highly sensitive to outliers. Verify distribution shapes and run duplicate/outliers cleaning first.
                  </p>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* 5. Preprocessing Recipes Checklist */}
        <div className="glass-card p-6 border border-border print:border-slate-300 print:bg-white print:shadow-none">
          <h3 className="text-sm text-white print:text-slate-900 font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            Data Preprocessing Recommendations
          </h3>
          <p className="text-xs text-muted-foreground print:text-slate-500 mb-4">
            InsightAI recommendation engine suggests applying the following data pipeline steps prior to machine learning model fitting:
          </p>
          
          {recommendations.length === 0 ? (
            <div className="text-xs text-emerald-400 print:text-emerald-800 flex items-center gap-1.5">
              <CheckCircle className="w-4.5 h-4.5" />
              All parameters optimized. No preprocessing recommendations.
            </div>
          ) : (
            <div className="space-y-2.5">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <input 
                    type="checkbox" 
                    defaultChecked 
                    className="mt-0.5 rounded border-border text-primary focus:ring-primary w-4 h-4 accent-primary bg-accent/40 print:border-slate-400" 
                  />
                  <span className="text-xs text-white print:text-slate-800 leading-relaxed font-medium">{rec}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer print note */}
        <div className="hidden print:block text-center text-[10px] text-slate-400 pt-8 border-t border-slate-200">
          Generated automatically by InsightAI Smart Data Agent. All Rights Reserved.
        </div>

      </div>
    </div>
  );
}
export default ReportsPage;
