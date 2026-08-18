import { useState, useEffect } from "react";
import { 
  BarChart3, 
  Database, 
  LineChart as LineIcon, 
  HelpCircle, 
  Sparkles, 
  Grid,
  Activity,
  AlertCircle
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  ScatterChart, 
  Scatter,
  LineChart,
  Line,
  Cell
} from "recharts";
import { datasetApi, profileApi } from "../services/api";
import type { Dataset, ColumnMetadata, CorrelationData, DescribeColumnData } from "../services/api";

interface EdaPageProps {
  selectedDataset: Dataset | null;
  setCurrentTab: (tab: string) => void;
}

export function EdaPage({ selectedDataset, setCurrentTab }: EdaPageProps) {
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notProfiled, setNotProfiled] = useState(false);

  // Configuration States
  const [chartType, setChartType] = useState<"distribution" | "scatter" | "bar" | "line" | "correlation">("correlation");
  const [xCol, setXCol] = useState("");
  const [yCol, setYCol] = useState("");

  // Fetched Chart Data States
  const [describeData, setDescribeData] = useState<DescribeColumnData | null>(null);
  const [correlationData, setCorrelationData] = useState<CorrelationData | null>(null);
  const [chartPoints, setChartPoints] = useState<any[]>([]);

  const loadProfile = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const profile = await profileApi.get(id);
      setColumns(profile.columns_metadata);
      setNotProfiled(false);

      if (profile.columns_metadata.length > 0) {
        setXCol(profile.columns_metadata[0].name);
        const numeric = profile.columns_metadata.filter(c => c.type === "numeric");
        if (numeric.length > 1) {
          setYCol(numeric[1].name);
        } else {
          setYCol(profile.columns_metadata[0].name);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setNotProfiled(true);
      } else {
        setError("Failed to load dataset metadata.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      loadProfile(selectedDataset.id);
      // Auto-fetch correlation first
      fetchCorrelation();
    }
  }, [selectedDataset]);

  const fetchCorrelation = async () => {
    if (!selectedDataset) return;
    try {
      setLoading(true);
      const data = await datasetApi.getCorrelation(selectedDataset.id);
      setCorrelationData(data);
      setChartType("correlation");
    } catch (err: any) {
      setError("Failed to calculate correlation matrix.");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedDataset) return;
    setLoading(true);
    setError(null);
    setDescribeData(null);
    setChartPoints([]);

    try {
      if (chartType === "correlation") {
        await fetchCorrelation();
      } else if (chartType === "distribution" || chartType === "bar") {
        const desc = await datasetApi.describeColumn(selectedDataset.id, xCol);
        setDescribeData(desc);
      } else if (chartType === "scatter" || chartType === "line") {
        const rawPoints = await datasetApi.getColumnsData(selectedDataset.id, `${xCol},${yCol}`);
        // Map keys xCol -> "x", yCol -> "y" for easy Recharts mapping
        const mapped = rawPoints.map((pt, idx) => ({
          index: idx,
          x: pt[xCol],
          y: pt[yCol]
        }));
        setChartPoints(mapped);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to generate visualization.");
    } finally {
      setLoading(false);
    }
  };

  const getHeatmapColor = (val: number) => {
    // Pearson correlation ranges from -1 to 1.
    // -1 (Strong negative): Red HSL (0, 75%, 45%)
    // 0 (No correlation): Dark gray HSL (220, 10%, 20%)
    // 1 (Strong positive): Blue HSL (220, 85%, 55%)
    if (val === 0) return "rgba(30, 41, 59, 0.4)";
    if (val > 0) {
      return `rgba(99, 102, 241, ${val})`; // Blue gradient mapping
    } else {
      return `rgba(239, 68, 68, ${Math.abs(val)})`; // Red gradient mapping
    }
  };

  // Heuristic Insight Generator
  const renderInsights = () => {
    if (chartType === "correlation" && correlationData && correlationData.columns.length > 0) {
      const strongPairs: { col1: string; col2: string; r: number }[] = [];
      const cols = correlationData.columns;
      const matrix = correlationData.matrix;
      
      for (let i = 0; i < cols.length; i++) {
        for (let j = i + 1; j < cols.length; j++) {
          const r = matrix[i][j];
          if (Math.abs(r) >= 0.4) {
            strongPairs.push({ col1: cols[i], col2: cols[j], r });
          }
        }
      }

      return (
        <div className="space-y-3">
          <p className="text-sm text-white font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Analyst Heuristic Interpretation
          </p>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              Calculated Pearson correlation matrix across {cols.length} numerical columns.
            </p>
            {strongPairs.length > 0 ? (
              <div className="space-y-1.5">
                <p className="font-semibold text-white">Key Relationships Detected:</p>
                <ul className="list-disc pl-4 space-y-1">
                  {strongPairs.slice(0, 5).map((p, idx) => (
                    <li key={idx}>
                      <strong>{p.col1}</strong> & <strong>{p.col2}</strong> show a{" "}
                      <span className={p.r > 0 ? "text-indigo-400" : "text-red-400"}>
                        {p.r > 0 ? "positive" : "negative"}{" "}
                        {Math.abs(p.r) > 0.7 ? "strong" : "moderate"} correlation (r = {p.r.toFixed(2)})
                      </span>.
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p>No variables show moderate or strong correlations (absolute r &gt; 0.4). The features appear largely linearly independent.</p>
            )}
            <p className="text-[11px] bg-accent/20 p-2.5 rounded-lg border border-border/80">
              <strong>Recommendation:</strong> Strongly correlated variables should be audited for collinearity before training regression or classification ML models. Consider keeping only one or applying dimensionality reduction.
            </p>
          </div>
        </div>
      );
    }

    if (chartType === "distribution" && describeData) {
      const isNormal = describeData.is_normal;
      const skew = describeData.skew || 0.0;
      
      return (
        <div className="space-y-3">
          <p className="text-sm text-white font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Analyst Heuristic Interpretation
          </p>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              Analyzed distribution histogram for numeric variable <strong>{xCol}</strong>.
            </p>
            <p>
              The distribution shows a skewness of <strong>{skew.toFixed(2)}</strong>.{" "}
              {isNormal ? (
                <span>The variable is reasonably symmetric and normal, resembling a bell curve. Standard parametric statistical models (like Z-score scaling or Linear Regression) can be applied safely.</span>
              ) : skew > 0 ? (
                <span>The distribution is <strong>right-skewed (positively skewed)</strong>, indicating a long tail extending towards higher values. Typical for variables like income, charges, or distances.</span>
              ) : (
                <span>The distribution is <strong>left-skewed (negatively skewed)</strong>, indicating a tail extending towards lower values.</span>
              )}
            </p>
            {!isNormal && (
              <p className="text-[11px] bg-accent/20 p-2.5 rounded-lg border border-border/80">
                <strong>Recommendation:</strong> If training linear algorithms, consider applying a logarithmic or Box-Cox transformation to normalise skewness, or impute outliers which might be driving the skew.
              </p>
            )}
          </div>
        </div>
      );
    }

    if (chartType === "bar" && describeData) {
      const topCat = describeData.frequencies && describeData.frequencies[0];
      return (
        <div className="space-y-3">
          <p className="text-sm text-white font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Analyst Heuristic Interpretation
          </p>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              Visualized class frequencies for categorical variable <strong>{xCol}</strong>.
            </p>
            {topCat ? (
              <p>
                The dominant category is <strong>"{topCat[0]}"</strong> with a frequency count of <strong>{topCat[1]}</strong>.
              </p>
            ) : (
              <p>Categorical frequencies parsed successfully.</p>
            )}
            <p className="text-[11px] bg-accent/20 p-2.5 rounded-lg border border-border/80">
              <strong>Recommendation:</strong> Categorical variables must be converted to numerical representations using encoding steps (e.g. One-Hot or Label Encoding) in the Data Cleaning panel before training ML models.
            </p>
          </div>
        </div>
      );
    }

    if (chartType === "scatter" && chartPoints.length > 0) {
      return (
        <div className="space-y-3">
          <p className="text-sm text-white font-semibold flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" />
            AI Analyst Heuristic Interpretation
          </p>
          <div className="text-xs text-muted-foreground space-y-2 leading-relaxed">
            <p>
              Plotted scatter distribution relating <strong>{xCol}</strong> (X-axis) and <strong>{yCol}</strong> (Y-axis) with downsampled {chartPoints.length} points.
            </p>
            <p>
              Hover over individual points to inspect coordinate coordinates. Look for directional clustering or shapes (linear trends, curves, heteroscedasticity).
            </p>
            <p className="text-[11px] bg-accent/20 p-2.5 rounded-lg border border-border/80">
              <strong>Recommendation:</strong> Scatter plots are excellent for identifying nonlinear shapes or high-density clusters that linear regression might fail to represent. Consider non-linear models (e.g., decision trees, random forests) if relationships are curved.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="text-center py-4 text-muted-foreground text-xs">
        Configure variables and click "Generate Chart" to display insights.
      </div>
    );
  };

  if (!selectedDataset) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="bg-accent/40 border border-border/80 p-4 rounded-full text-muted-foreground mb-4 inline-block">
          <Database className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg">No active dataset</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Please upload or select a dataset from the Dashboard to start EDA.
        </p>
      </div>
    );
  }

  if (notProfiled && !loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-full text-primary mb-5 inline-block">
          <BarChart3 className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">Profiling Required</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8 leading-relaxed">
          The dataset **"{selectedDataset.name}"** must be profiled first before you can run Exploratory Data Analysis. This populates columns metadata and variable types.
        </p>
        <button 
          onClick={() => setCurrentTab("profiling")}
          className="bg-primary hover:bg-primary/95 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center gap-2 mx-auto"
        >
          <Sparkles className="w-4 h-4" />
          Go to Data Profiling
        </button>
      </div>
    );
  }

  const numericColumns = columns.filter(c => c.type === "numeric");

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <BarChart3 className="w-7 h-7 text-primary" />
          EDA & Interactive Charts
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Inspect statistical structures, plot correlations, distributions, and scatter trends.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Configuration */}
        <div className="glass-card p-6 border border-border space-y-5 h-fit">
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <Activity className="w-4.5 h-4.5 text-primary" />
            <h3 className="text-white font-bold text-sm">Plot Configurator</h3>
          </div>

          {/* Plot Type */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground font-semibold">Visualization Type</label>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as any)}
              className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
            >
              <option value="correlation">Correlation Heatmap</option>
              <option value="distribution">Histogram (Distribution)</option>
              <option value="bar">Frequency Bar Chart</option>
              <option value="scatter">Scatter Plot</option>
              <option value="line">Line Plot</option>
            </select>
          </div>

          {/* X Axis */}
          {chartType !== "correlation" && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-semibold">
                {chartType === "distribution" || chartType === "bar" ? "Column" : "X-Axis Column"}
              </label>
              <select
                value={xCol}
                onChange={(e) => setXCol(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
              >
                {columns.map(c => (
                  <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                ))}
              </select>
            </div>
          )}

          {/* Y Axis (for scatter / line) */}
          {(chartType === "scatter" || chartType === "line") && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground font-semibold">Y-Axis Column (Numeric)</label>
              <select
                value={yCol}
                onChange={(e) => setYCol(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
              >
                {numericColumns.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/95 text-white font-semibold py-2.5 rounded-xl text-xs transition-all duration-200 border border-primary/40 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Generate Chart
          </button>
        </div>

        {/* Right Columns: Chart Display & AI Insights */}
        <div className="lg:col-span-3 space-y-6">
          {/* Visual Container */}
          <div className="glass-card p-6 border border-border min-h-[450px] flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h4 className="text-white font-bold text-base capitalize flex items-center gap-1.5">
                  {chartType === "correlation" ? (
                    <Grid className="w-5 h-5 text-primary" />
                  ) : (
                    <LineIcon className="w-5 h-5 text-primary" />
                  )}
                  {chartType === "correlation" ? "Correlation Matrix Heatmap" : `${xCol} Visualizer`}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Interactive representation for {selectedDataset.name}
                </p>
              </div>
            </div>

            {/* Rendering Area */}
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              {loading ? (
                <div className="flex flex-col items-center gap-2">
                  <Activity className="w-8 h-8 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">Calculating statistics...</span>
                </div>
              ) : (
                <>
                  {/* CORRELATION MATRIX */}
                  {chartType === "correlation" && correlationData && (
                    <div className="w-full overflow-x-auto py-2">
                      <div className="min-w-[500px] flex flex-col items-center">
                        {correlationData.columns.length === 0 ? (
                          <div className="text-muted-foreground text-xs">No numeric columns found for correlation matrix.</div>
                        ) : (
                          <div className="space-y-1">
                            {/* Columns Header */}
                            <div className="flex pl-32">
                              {correlationData.columns.map(col => (
                                <div key={col} className="w-20 text-[10px] font-semibold text-muted-foreground text-center truncate px-0.5">
                                  {col}
                                </div>
                              ))}
                            </div>
                            
                            {/* Matrix Rows */}
                            {correlationData.columns.map((rowCol, rIdx) => (
                              <div key={rowCol} className="flex items-center">
                                {/* Row Header */}
                                <div className="w-32 text-[10px] font-semibold text-white truncate text-right pr-3">
                                  {rowCol}
                                </div>
                                {/* Cells */}
                                {correlationData.matrix[rIdx].map((val, cIdx) => (
                                  <div
                                    key={cIdx}
                                    style={{ backgroundColor: getHeatmapColor(val) }}
                                    className="w-20 h-10 border border-border/20 flex items-center justify-center text-[11px] font-bold text-white transition-all hover:scale-105 cursor-pointer rounded"
                                    title={`${rowCol} vs ${correlationData.columns[cIdx]}: ${val.toFixed(3)}`}
                                  >
                                    {val.toFixed(2)}
                                  </div>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* DISTRIBUTION HISTOGRAM */}
                  {chartType === "distribution" && describeData && describeData.bins.length > 0 && (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={describeData.bins} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis 
                          dataKey="bin_start" 
                          stroke="#94a3b8" 
                          tickFormatter={(v) => Number(v).toFixed(1)}
                          style={{ fontSize: 10 }}
                        />
                        <YAxis stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <Tooltip
                          contentStyle={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(99, 102, 241, 0.4)", borderRadius: 12 }}
                          labelFormatter={(v) => `Bin threshold: ${Number(v).toFixed(2)}`}
                        />
                        <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} opacity={0.85}>
                          {describeData.bins.map((_, idx) => (
                            <Cell key={`cell-${idx}`} fill={idx % 2 === 0 ? "#6366f1" : "#4f46e5"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {/* CATEGORICAL FREQUENCY BAR */}
                  {chartType === "bar" && describeData && describeData.frequencies.length > 0 && (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={describeData.frequencies.map(f => ({ category: f[0], count: f[1] }))} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis dataKey="category" stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <YAxis stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(99, 102, 241, 0.4)", borderRadius: 12 }} />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} opacity={0.85} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}

                  {/* SCATTER PLOT */}
                  {chartType === "scatter" && chartPoints.length > 0 && (
                    <ResponsiveContainer width="100%" height={320}>
                      <ScatterChart margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis type="number" dataKey="x" name={xCol} stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <YAxis type="number" dataKey="y" name={yCol} stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <Tooltip 
                          cursor={{ strokeDasharray: '3 3' }}
                          contentStyle={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(99, 102, 241, 0.4)", borderRadius: 12 }}
                        />
                        <Scatter name={`${xCol} vs ${yCol}`} data={chartPoints} fill="#3b82f6" opacity={0.7} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  )}

                  {/* LINE PLOT */}
                  {chartType === "line" && chartPoints.length > 0 && (
                    <ResponsiveContainer width="100%" height={320}>
                      <LineChart data={chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis dataKey="index" stroke="#94a3b8" style={{ fontSize: 9 }} />
                        <YAxis stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(99, 102, 241, 0.4)", borderRadius: 12 }} />
                        <Line type="monotone" dataKey="y" name={yCol} stroke="#10b981" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}

                  {/* Empty state */}
                  {!loading && !correlationData && !describeData && chartPoints.length === 0 && (
                    <div className="text-center text-muted-foreground text-xs space-y-2 py-16">
                      <HelpCircle className="w-10 h-10 mx-auto text-border/70 animate-pulse" />
                      <p>Workspace is idle.</p>
                      <p className="max-w-[240px] mx-auto text-[11px] leading-relaxed">
                        Select configurations in the left sidebar and click "Generate Chart" to begin.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* AI Insights Card */}
          <div className="glass-card p-6 border border-border bg-gradient-to-r from-accent/5 via-accent/15 to-transparent">
            {renderInsights()}
          </div>
        </div>
      </div>
    </div>
  );
}
export default EdaPage;
