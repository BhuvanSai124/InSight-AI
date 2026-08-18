import { useState, useEffect } from "react";
import { 
  Sparkles, 
  Trash2, 
  Database,
  Settings,
  HelpCircle,
  Plus,
  Play,
  RotateCcw,
  Info,
  TableProperties
} from "lucide-react";
import { datasetApi, profileApi } from "../services/api";
import type { Dataset, ColumnMetadata } from "../services/api";

interface CleaningPageProps {
  selectedDataset: Dataset | null;
  onCleanSuccess: (newDataset: Dataset) => void;
  setCurrentTab: (tab: string) => void;
}

interface ImputeTask {
  column: str;
  strategy: str;
}

interface OutlierTask {
  column: str;
  method: str;
}

interface ScaleTask {
  column: str;
  method: str;
}

interface EncodeTask {
  column: str;
  method: str;
}

type str = string;

export function CleaningPage({ selectedDataset, onCleanSuccess, setCurrentTab }: CleaningPageProps) {
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notProfiled, setNotProfiled] = useState(false);

  // Operations States
  const [removeDuplicates, setRemoveDuplicates] = useState(false);
  const [imputeTasks, setImputeTasks] = useState<ImputeTask[]>([]);
  const [outlierTasks, setOutlierTasks] = useState<OutlierTask[]>([]);
  const [scaleTasks, setScaleTasks] = useState<ScaleTask[]>([]);
  const [encodeTasks, setEncodeTasks] = useState<EncodeTask[]>([]);

  // Selection form states
  const [selectedImputeCol, setSelectedImputeCol] = useState("");
  const [selectedImputeStrategy, setSelectedImputeStrategy] = useState("mean");
  
  const [selectedOutlierCol, setSelectedOutlierCol] = useState("");
  
  const [selectedScaleCol, setSelectedScaleCol] = useState("");
  const [selectedScaleMethod, setSelectedScaleMethod] = useState("minmax");
  
  const [selectedEncodeCol, setSelectedEncodeCol] = useState("");
  const [selectedEncodeMethod, setSelectedEncodeMethod] = useState("onehot");

  const loadColumnsFromProfile = async (id: string) => {
    try {
      setLoading(true);
      const profile = await profileApi.get(id);
      setColumns(profile.columns_metadata);
      setNotProfiled(false);
      
      // Pre-select columns in forms
      if (profile.columns_metadata.length > 0) {
        const numeric = profile.columns_metadata.filter(c => c.type === "numeric");
        const categorical = profile.columns_metadata.filter(c => c.type === "categorical");
        
        setSelectedImputeCol(profile.columns_metadata[0].name);
        if (numeric.length > 0) {
          setSelectedOutlierCol(numeric[0].name);
          setSelectedScaleCol(numeric[0].name);
        }
        if (categorical.length > 0) {
          setSelectedEncodeCol(categorical[0].name);
        } else {
          setSelectedEncodeCol(profile.columns_metadata[0].name);
        }
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setNotProfiled(true);
      } else {
        setError("Failed to load dataset columns.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      loadColumnsFromProfile(selectedDataset.id);
    }
  }, [selectedDataset]);

  const triggerProfilingFirst = () => {
    setCurrentTab("profiling");
  };

  // Add tasks handlers
  const handleAddImpute = () => {
    if (!selectedImputeCol) return;
    if (imputeTasks.some(t => t.column === selectedImputeCol)) {
      alert("Imputation task already exists for this column!");
      return;
    }
    setImputeTasks([...imputeTasks, { column: selectedImputeCol, strategy: selectedImputeStrategy }]);
  };

  const handleAddOutlier = () => {
    if (!selectedOutlierCol) return;
    if (outlierTasks.some(t => t.column === selectedOutlierCol)) {
      alert("Outlier filter already exists for this column!");
      return;
    }
    setOutlierTasks([...outlierTasks, { column: selectedOutlierCol, method: "iqr" }]);
  };

  const handleAddScale = () => {
    if (!selectedScaleCol) return;
    if (scaleTasks.some(t => t.column === selectedScaleCol)) {
      alert("Scaling task already exists for this column!");
      return;
    }
    setScaleTasks([...scaleTasks, { column: selectedScaleCol, method: selectedScaleMethod }]);
  };

  const handleAddEncode = () => {
    if (!selectedEncodeCol) return;
    if (encodeTasks.some(t => t.column === selectedEncodeCol)) {
      alert("Encoding task already exists for this column!");
      return;
    }
    setEncodeTasks([...encodeTasks, { column: selectedEncodeCol, method: selectedEncodeMethod }]);
  };

  // Reset/Clear Pipeline
  const handleClearPipeline = () => {
    setRemoveDuplicates(false);
    setImputeTasks([]);
    setOutlierTasks([]);
    setScaleTasks([]);
    setEncodeTasks([]);
  };

  // Apply cleaning route
  const handleApplyCleaning = async () => {
    if (!selectedDataset) return;
    
    // Check if pipeline has any steps
    const hasSteps = removeDuplicates || imputeTasks.length > 0 || outlierTasks.length > 0 || scaleTasks.length > 0 || encodeTasks.length > 0;
    if (!hasSteps) {
      alert("Pipeline is empty. Please configure at least one cleaning task!");
      return;
    }

    setLoading(true);
    setError(null);
    
    const steps = [
      "Connecting pipeline filters...",
      "Removing duplicate entries...",
      "Imputing missing entries...",
      "Filtering numerical outliers...",
      "Normalizing scaling properties...",
      "Encoding categorical factors...",
      "Saving clean dataset version..."
    ];

    let stepIndex = 0;
    setLoadingStep(steps[0]);
    const stepInterval = setInterval(() => {
      if (stepIndex < steps.length - 1) {
        stepIndex++;
        setLoadingStep(steps[stepIndex]);
      }
    }, 1000);

    try {
      const payload = {
        remove_duplicates: removeDuplicates,
        impute_missing: imputeTasks,
        handle_outliers: outlierTasks,
        scaling: scaleTasks,
        encoding: encodeTasks
      };
      
      const newDataset = await datasetApi.clean(selectedDataset.id, payload);
      clearInterval(stepInterval);
      
      onCleanSuccess(newDataset);
    } catch (err: any) {
      clearInterval(stepInterval);
      setError(err.response?.data?.detail || "Cleaning pipeline failed. Check backend connection.");
    } finally {
      setLoading(false);
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
          Please upload or select a dataset from the Dashboard to start cleaning.
        </p>
      </div>
    );
  }

  if (notProfiled && !loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-full text-primary mb-5 inline-block">
          <TableProperties className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">Profiling Required</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8 leading-relaxed">
          The dataset **"{selectedDataset.name}"** must be profiled first before you can clean it. This allows the cleaner to identify column names and data types.
        </p>
        <button 
          onClick={triggerProfilingFirst}
          className="bg-primary hover:bg-primary/95 text-white font-semibold py-3 px-6 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center gap-2 mx-auto"
        >
          <Sparkles className="w-4 h-4" />
          Go to Data Profiling
        </button>
      </div>
    );
  }

  const numericColumns = columns.filter(c => c.type === "numeric");
  const categoricalColumns = columns.filter(c => c.type === "categorical" || c.type === "boolean");

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Settings className="w-7 h-7 text-primary" />
          Data Cleaning Module
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Build a sequencing data transformations pipeline to drop duplicates, fill missing cells, remove outliers, scale variables, and encode categories.
        </p>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-primary/25 rounded-full blur-xl scale-125"></div>
            <div className="relative border border-primary/40 p-4 rounded-full text-primary bg-primary/10">
              <RotateCcw className="w-8 h-8 animate-spin" />
            </div>
          </div>
          <h4 className="text-white font-semibold text-lg mb-1">Applying Cleaning pipeline</h4>
          <p className="text-primary text-xs font-medium animate-pulse mb-2">{loadingStep}</p>
          <p className="text-muted-foreground text-xs max-w-sm">
            We are applying operations sequentially. A new versioned copy of the dataset will be created.
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-sm">
          <RotateCcw className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300">Cleaning Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Interactive Forms and Preview Grid */}
      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Columns: Operations configuration forms */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* 1. Duplicates & General */}
            <div className="glass-card p-6 border border-border">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-4">1. General Operations</h4>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={removeDuplicates}
                  onChange={(e) => setRemoveDuplicates(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary w-4.5 h-4.5 accent-primary bg-accent/40"
                />
                <div>
                  <span className="text-white text-sm font-semibold">Remove Duplicate Rows</span>
                  <p className="text-xs text-muted-foreground">Drops exact duplicate rows from the dataset.</p>
                </div>
              </label>
            </div>

            {/* 2. Handle Missing Values */}
            <div className="glass-card p-6 border border-border space-y-4">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-1">2. Impute Missing Values</h4>
              <p className="text-xs text-muted-foreground">Select column and choose imputation method to handle null cells.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Select Column</label>
                  <select 
                    value={selectedImputeCol}
                    onChange={(e) => setSelectedImputeCol(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    {columns.map(c => (
                      <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                    ))}
                  </select>
                </div>

                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Strategy</label>
                  <select 
                    value={selectedImputeStrategy}
                    onChange={(e) => setSelectedImputeStrategy(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    <option value="mean">Mean (Numeric columns only)</option>
                    <option value="median">Median (Numeric columns only)</option>
                    <option value="mode">Mode (Most frequent element)</option>
                    <option value="drop">Drop Rows (Drop rows containing null)</option>
                  </select>
                </div>

                <button 
                  onClick={handleAddImpute}
                  className="bg-primary hover:bg-primary/90 text-white py-2 px-3 rounded-lg border border-primary/45 transition-colors text-xs font-semibold flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  Add Step
                </button>
              </div>
            </div>

            {/* 3. Outlier Filter */}
            <div className="glass-card p-6 border border-border space-y-4">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-1">3. Handle Outliers</h4>
              <p className="text-xs text-muted-foreground">Remove rows containing outliers in continuous numeric variables.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Numeric Column</label>
                  <select 
                    value={selectedOutlierCol}
                    onChange={(e) => setSelectedOutlierCol(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    {numericColumns.length === 0 ? (
                      <option value="">No numeric variables found</option>
                    ) : (
                      numericColumns.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Method</label>
                  <select 
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50 bg-card/45"
                    disabled
                  >
                    <option value="iqr">IQR (1.5x Interquartile range bounds)</option>
                  </select>
                </div>

                <button 
                  onClick={handleAddOutlier}
                  disabled={numericColumns.length === 0}
                  className="bg-primary hover:bg-primary/90 text-white py-2 px-3 rounded-lg border border-primary/45 transition-colors text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Step
                </button>
              </div>
            </div>

            {/* 4. Feature Scaling */}
            <div className="glass-card p-6 border border-border space-y-4">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-1">4. Feature Scaling</h4>
              <p className="text-xs text-muted-foreground">Normalize variables to [0,1] bounds or standardize variables to mean=0, std=1.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Numeric Column</label>
                  <select 
                    value={selectedScaleCol}
                    onChange={(e) => setSelectedScaleCol(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    {numericColumns.length === 0 ? (
                      <option value="">No numeric variables found</option>
                    ) : (
                      numericColumns.map(c => (
                        <option key={c.name} value={c.name}>{c.name}</option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Scaling Method</label>
                  <select 
                    value={selectedScaleMethod}
                    onChange={(e) => setSelectedScaleMethod(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    <option value="minmax">Min-Max Scaling (Transforms to [0,1])</option>
                    <option value="standard">Standard Standardization (Mean=0, Std=1)</option>
                  </select>
                </div>

                <button 
                  onClick={handleAddScale}
                  disabled={numericColumns.length === 0}
                  className="bg-primary hover:bg-primary/90 text-white py-2 px-3 rounded-lg border border-primary/45 transition-colors text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Step
                </button>
              </div>
            </div>

            {/* 5. Categorical Encoding */}
            <div className="glass-card p-6 border border-border space-y-4">
              <h4 className="font-bold text-white text-sm uppercase tracking-wider mb-1">5. Categorical Encoding</h4>
              <p className="text-xs text-muted-foreground">Convert string classes variables into numeric formats for model algorithms.</p>
              
              <div className="flex flex-col sm:flex-row gap-4 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Category Column</label>
                  <select 
                    value={selectedEncodeCol}
                    onChange={(e) => setSelectedEncodeCol(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    {categoricalColumns.length === 0 ? (
                      <option value="">No categorical columns found</option>
                    ) : (
                      categoricalColumns.map(c => (
                        <option key={c.name} value={c.name}>{c.name} ({c.type})</option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground font-semibold">Encoding Method</label>
                  <select 
                    value={selectedEncodeMethod}
                    onChange={(e) => setSelectedEncodeMethod(e.target.value)}
                    className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                  >
                    <option value="onehot">One-Hot Encoding (Creates multiple boolean cols)</option>
                    <option value="label">Label Encoding (Encodes categories as 0, 1, 2, ...)</option>
                  </select>
                </div>

                <button 
                  onClick={handleAddEncode}
                  disabled={categoricalColumns.length === 0}
                  className="bg-primary hover:bg-primary/90 text-white py-2 px-3 rounded-lg border border-primary/45 transition-colors text-xs font-semibold flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" />
                  Add Step
                </button>
              </div>
            </div>

          </div>

          {/* Right Column: Pipeline Preview Panel */}
          <div>
            <div className="glass-card border border-border flex flex-col justify-between sticky top-6 h-[calc(100vh-140px)] min-h-[500px]">
              
              {/* Top part: Steps Preview */}
              <div>
                <div className="px-6 py-5 border-b border-border/60 flex justify-between items-center bg-accent/20">
                  <div className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    <h3 className="font-bold text-white text-sm">Pipeline Preview</h3>
                  </div>
                  
                  {(removeDuplicates || imputeTasks.length > 0 || outlierTasks.length > 0 || scaleTasks.length > 0 || encodeTasks.length > 0) && (
                    <button 
                      onClick={handleClearPipeline}
                      className="text-muted-foreground hover:text-red-400 transition-colors text-xs font-semibold flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  )}
                </div>

                {/* Steps List */}
                <div className="p-6 space-y-4 overflow-y-auto max-h-[calc(100vh-320px)]">
                  
                  {/* Empty state */}
                  {!removeDuplicates && imputeTasks.length === 0 && outlierTasks.length === 0 && scaleTasks.length === 0 && encodeTasks.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground text-xs space-y-2">
                      <HelpCircle className="w-8 h-8 mx-auto text-border/70" />
                      <p>Pipeline is currently empty.</p>
                      <p className="max-w-[200px] mx-auto text-[11px] leading-relaxed">
                        Configure cleaning filters from the left panel to append tasks.
                      </p>
                    </div>
                  )}

                  {/* Duplicate removal indicator */}
                  {removeDuplicates && (
                    <div className="flex justify-between items-center p-3 rounded-lg bg-primary/10 border border-primary/30 text-xs text-white">
                      <div>
                        <strong className="block font-semibold">1. Drop Duplicates</strong>
                        <span className="text-[10px] text-muted-foreground">Remove duplicate rows.</span>
                      </div>
                      <button 
                        onClick={() => setRemoveDuplicates(false)}
                        className="text-muted-foreground hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  {/* Imputation tasks list */}
                  {imputeTasks.map((task, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-white">
                      <div>
                        <strong className="block font-semibold">Impute: {task.column}</strong>
                        <span className="text-[10px] text-muted-foreground">Fill nulls using strategy: {task.strategy}.</span>
                      </div>
                      <button 
                        onClick={() => setImputeTasks(imputeTasks.filter(t => t.column !== task.column))}
                        className="text-muted-foreground hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Outlier filtering list */}
                  {outlierTasks.map((task, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-white">
                      <div>
                        <strong className="block font-semibold">Outlier Filter: {task.column}</strong>
                        <span className="text-[10px] text-muted-foreground">Bound values to Q1/Q3 bounds.</span>
                      </div>
                      <button 
                        onClick={() => setOutlierTasks(outlierTasks.filter(t => t.column !== task.column))}
                        className="text-muted-foreground hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Scaling list */}
                  {scaleTasks.map((task, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-white">
                      <div>
                        <strong className="block font-semibold">Scale: {task.column}</strong>
                        <span className="text-[10px] text-muted-foreground">Apply: {task.method}.</span>
                      </div>
                      <button 
                        onClick={() => setScaleTasks(scaleTasks.filter(t => t.column !== task.column))}
                        className="text-muted-foreground hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {/* Encoding list */}
                  {encodeTasks.map((task, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 rounded-lg bg-purple-500/10 border border-purple-500/30 text-xs text-white">
                      <div>
                        <strong className="block font-semibold">Encode: {task.column}</strong>
                        <span className="text-[10px] text-muted-foreground">Type: {task.method}.</span>
                      </div>
                      <button 
                        onClick={() => setEncodeTasks(encodeTasks.filter(t => t.column !== task.column))}
                        className="text-muted-foreground hover:text-red-400 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                </div>
              </div>

              {/* Bottom part: Run Button */}
              <div className="p-6 border-t border-border/60 bg-accent/10">
                <button
                  onClick={handleApplyCleaning}
                  disabled={!removeDuplicates && imputeTasks.length === 0 && outlierTasks.length === 0 && scaleTasks.length === 0 && encodeTasks.length === 0}
                  className="w-full bg-primary hover:bg-primary/95 text-white font-semibold py-3 px-5 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Apply Cleaning Pipeline
                </button>
                <div className="flex items-center gap-1.5 justify-center mt-3 text-[10px] text-muted-foreground text-center">
                  <Info className="w-3.5 h-3.5" />
                  Creates a new versioned copy of the active dataset
                </div>
              </div>

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
export default CleaningPage;
