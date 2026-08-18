import { useState, useEffect } from "react";
import { 
  Cpu, 
  Database,
  Sparkles,
  BarChart3,
  Trash2,
  LineChart as LineIcon,
  Play,
  CheckCircle,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Activity,
  ListFilter
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
  Scatter
} from "recharts";
import { mlApi, profileApi } from "../services/api";
import type { Dataset, ColumnMetadata, MlModel } from "../services/api";

interface ModelsPageProps {
  selectedDataset: Dataset | null;
  setCurrentTab: (tab: string) => void;
}

export function ModelsPage({ selectedDataset, setCurrentTab }: ModelsPageProps) {
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [notProfiled, setNotProfiled] = useState(false);

  // Active workspace states
  const [activeSubTab, setActiveSubTab] = useState<"train" | "leaderboard" | "diagnostics">("train");
  const [models, setModels] = useState<MlModel[]>([]);
  const [selectedModel, setSelectedModel] = useState<MlModel | null>(null);

  // Train form states
  const [targetCol, setTargetCol] = useState("");
  const [featureCols, setFeatureCols] = useState<string[]>([]);
  const [algorithm, setAlgorithm] = useState("random_forest");

  // Load dataset features and columns
  const loadColumns = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      const profile = await profileApi.get(id);
      setColumns(profile.columns_metadata);
      setNotProfiled(false);

      if (profile.columns_metadata.length > 0) {
        // Find default target: last column
        const defaultTarget = profile.columns_metadata[profile.columns_metadata.length - 1].name;
        setTargetCol(defaultTarget);

        // Select all other numeric/boolean columns as features by default
        const defaultFeatures = profile.columns_metadata
          .filter(c => c.name !== defaultTarget && (c.type === "numeric" || c.type === "boolean"))
          .map(c => c.name);
        setFeatureCols(defaultFeatures);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setNotProfiled(true);
      } else {
        setError("Failed to load columns for model training.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Load models history
  const loadModels = async (id: string) => {
    try {
      const data = await mlApi.listForDataset(id);
      setModels(data);
      if (data.length > 0) {
        setSelectedModel(data[0]);
      }
    } catch (err) {
      // Ignored non-critical model history fetch failure
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      loadColumns(selectedDataset.id);
      loadModels(selectedDataset.id);
    }
  }, [selectedDataset]);

  // Guess task type based on target selection
  const getEstimatedTaskType = () => {
    const targetMeta = columns.find(c => c.name === targetCol);
    if (!targetMeta) return "regression";
    if (targetMeta.type === "categorical" || targetMeta.type === "boolean" || targetMeta.cardinality <= 10) {
      return "classification";
    }
    return "regression";
  };

  // Dynamically set default algorithm when task type changes
  useEffect(() => {
    const task = getEstimatedTaskType();
    if (task === "regression") {
      setAlgorithm("random_forest");
    } else {
      setAlgorithm("random_forest");
    }
  }, [targetCol]);

  // Handle feature checkbox toggles
  const handleFeatureToggle = (colName: string) => {
    if (featureCols.includes(colName)) {
      setFeatureCols(featureCols.filter(f => f !== colName));
    } else {
      setFeatureCols([...featureCols, colName]);
    }
  };

  // Handle Model Training
  const handleTrainModel = async () => {
    if (!selectedDataset) return;
    if (!targetCol) {
      alert("Please select a target column!");
      return;
    }
    if (featureCols.length === 0) {
      alert("Please select at least one feature column for training!");
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        dataset_id: selectedDataset.id,
        target_column: targetCol,
        feature_columns: featureCols,
        algorithm: algorithm
      };
      
      const newModel = await mlApi.train(payload);
      setSuccess(`Model "${newModel.name}" trained successfully in backend!`);
      setModels([newModel, ...models]);
      setSelectedModel(newModel);
      setActiveSubTab("diagnostics");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Model training failed. Audit feature dtypes.");
    } finally {
      setLoading(false);
    }
  };

  // Delete model
  const handleDeleteModel = async (id: string) => {
    if (!confirm("Are you sure you want to delete this trained model?")) return;
    try {
      await mlApi.delete(id);
      const filtered = models.filter(m => m.id !== id);
      setModels(filtered);
      if (selectedModel?.id === id) {
        setSelectedModel(filtered.length > 0 ? filtered[0] : null);
      }
    } catch (err) {
      alert("Failed to delete model.");
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
          Please upload or select a dataset from the Dashboard to start model training.
        </p>
      </div>
    );
  }

  if (notProfiled && !loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-full text-primary mb-5 inline-block">
          <Cpu className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">Profiling Required</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8 leading-relaxed">
          The dataset **"{selectedDataset.name}"** must be profiled first before you can train models. This maps columns types and targets.
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

  const estimatedTaskType = getEstimatedTaskType();

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Cpu className="w-7 h-7 text-primary" />
          AutoML & Model Training
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Fit scikit-learn models, analyze diagnostic test curves, and interpret feature importances.
        </p>
      </div>

      {/* Sub Tabs Selection */}
      <div className="flex border-b border-border/60">
        <button
          onClick={() => setActiveSubTab("train")}
          className={`py-3 px-6 text-xs font-semibold tracking-wide border-b-2 transition-all uppercase ${
            activeSubTab === "train" 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-white"
          }`}
        >
          1. Train Model Config
        </button>
        <button
          onClick={() => setActiveSubTab("leaderboard")}
          className={`py-3 px-6 text-xs font-semibold tracking-wide border-b-2 transition-all uppercase ${
            activeSubTab === "leaderboard" 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-white"
          }`}
        >
          2. Comparative Leaderboard ({models.length})
        </button>
        <button
          onClick={() => setActiveSubTab("diagnostics")}
          className={`py-3 px-6 text-xs font-semibold tracking-wide border-b-2 transition-all uppercase ${
            activeSubTab === "diagnostics" 
              ? "border-primary text-primary" 
              : "border-transparent text-muted-foreground hover:text-white"
          }`}
          disabled={!selectedModel}
        >
          3. Diagnostics & Explainability
        </button>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="glass-card p-16 flex flex-col items-center justify-center text-center">
          <Activity className="w-8 h-8 text-primary animate-spin mb-4" />
          <h4 className="text-white font-semibold text-lg mb-1">Fitting AutoML Pipeline</h4>
          <p className="text-muted-foreground text-xs max-w-sm">
            Splitting data, training estimators, and calculating importances...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300">Training Failed</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Success alert */}
      {success && !loading && (
        <div className="flex items-center gap-2 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-sm">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          {success}
        </div>
      )}

      {!loading && (
        <div>
          {/* TAB 1: TRAIN FORM */}
          {activeSubTab === "train" && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Form Configurator */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* Configuration Panel */}
                <div className="glass-card p-6 border border-border space-y-6">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ListFilter className="w-4.5 h-4.5 text-primary" />
                    Target & Target Details
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Target Selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold">Select Target Column (y)</label>
                      <select
                        value={targetCol}
                        onChange={(e) => setTargetCol(e.target.value)}
                        className="w-full py-2.5 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                      >
                        {columns.map(c => (
                          <option key={c.name} value={c.name}>{c.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Algorithm Selector */}
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground font-semibold">Training Algorithm</label>
                      <select
                        value={algorithm}
                        onChange={(e) => setAlgorithm(e.target.value)}
                        className="w-full py-2.5 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50"
                      >
                        {estimatedTaskType === "regression" ? (
                          <>
                            <option value="random_forest">Random Forest Regressor (Ensemble)</option>
                            <option value="linear_regression">Linear Regression (OLS)</option>
                            <option value="decision_tree">Decision Tree Regressor</option>
                          </>
                        ) : (
                          <>
                            <option value="random_forest">Random Forest Classifier (Ensemble)</option>
                            <option value="logistic_regression">Logistic Regression (Linear)</option>
                            <option value="decision_tree">Decision Tree Classifier</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>

                  {/* Task Type Preview */}
                  <div className="p-4 rounded-xl bg-accent/20 border border-border/80 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-muted-foreground">Inferred ML Task:</span>
                      <strong className="text-white ml-1.5 capitalize">{estimatedTaskType}</strong>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                      estimatedTaskType === "regression" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                    }`}>
                      {estimatedTaskType === "regression" ? "Predict Continuous Values" : "Predict Classes"}
                    </span>
                  </div>

                </div>

                {/* Features list selection */}
                <div className="glass-card p-6 border border-border space-y-4">
                  <h3 className="font-bold text-white text-sm uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Database className="w-4.5 h-4.5 text-primary" />
                    Select Feature Columns (X)
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Select the independent variables to train your model. Columns with high missing values or categorical strings must be cleaned/encoded first.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {columns
                      .filter(c => c.name !== targetCol)
                      .map(col => {
                        const isNumericOrBool = col.type === "numeric" || col.type === "boolean";
                        return (
                          <label 
                            key={col.name} 
                            className={`flex items-start gap-2.5 p-3 rounded-lg border transition-all cursor-pointer ${
                              featureCols.includes(col.name) 
                                ? "bg-primary/10 border-primary/40 text-white" 
                                : "bg-accent/15 border-border/60 text-muted-foreground hover:text-white"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={featureCols.includes(col.name)}
                              disabled={!isNumericOrBool}
                              onChange={() => handleFeatureToggle(col.name)}
                              className="mt-0.5 rounded border-border text-primary focus:ring-primary w-4 h-4 accent-primary bg-accent/40 disabled:opacity-50"
                            />
                            <div className="text-xs">
                              <span className="font-semibold block truncate max-w-[130px]">{col.name}</span>
                              <span className={`text-[10px] ${isNumericOrBool ? "text-primary/70" : "text-amber-400 font-semibold"}`}>
                                {isNumericOrBool ? col.type : "Needs Encoding"}
                              </span>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>

              </div>

              {/* Sidebar trigger summary */}
              <div>
                <div className="glass-card p-6 border border-border flex flex-col justify-between sticky top-6 h-fit min-h-[300px]">
                  <div className="space-y-4">
                    <h4 className="font-bold text-white text-sm uppercase tracking-wider border-b border-border/60 pb-3 flex items-center gap-1.5">
                      <Cpu className="w-4.5 h-4.5 text-primary" />
                      Training Job Summary
                    </h4>
                    
                    <div className="text-xs space-y-3.5">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Target Column (y):</span>
                        <strong className="text-white font-mono">{targetCol || "None"}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Task:</span>
                        <strong className="text-white capitalize">{estimatedTaskType}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Algorithm:</span>
                        <strong className="text-white font-mono">{algorithm}</strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Features Count (X):</span>
                        <strong className="text-white">{featureCols.length}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 pt-4 border-t border-border/60">
                    <button
                      onClick={handleTrainModel}
                      disabled={featureCols.length === 0}
                      className="w-full bg-primary hover:bg-primary/95 text-white font-semibold py-3 px-5 rounded-xl text-sm transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/40 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      Train Model Pipeline
                    </button>
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* TAB 2: LEADERBOARD */}
          {activeSubTab === "leaderboard" && (
            <div className="glass-card border border-border overflow-hidden">
              <div className="px-6 py-4 border-b border-border/60 bg-accent/20">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Trained Models Leaderboard ({models.length} Estimators)
                </h3>
              </div>
              
              {models.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground text-xs space-y-2">
                  <HelpCircle className="w-10 h-10 mx-auto text-border/70 animate-pulse" />
                  <p>No models trained yet.</p>
                  <p className="max-w-[200px] mx-auto text-[11px] leading-relaxed">
                    Go to the training configurator tab to fit your first estimator.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border/60 bg-accent/5 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        <th className="px-6 py-3">Algorithm</th>
                        <th className="px-6 py-3">Target</th>
                        <th className="px-6 py-3">Task</th>
                        <th className="px-6 py-3">Primary Evaluation Metrics</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {models.map((model) => (
                        <tr 
                          key={model.id} 
                          className={`hover:bg-accent/5 transition-colors cursor-pointer ${
                            selectedModel?.id === model.id ? "bg-primary/5" : ""
                          }`}
                          onClick={() => setSelectedModel(model)}
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-white">{model.name}</div>
                            <div className="text-[10px] text-muted-foreground mt-0.5">Features: {model.features.length} selected</div>
                          </td>
                          <td className="px-6 py-4 font-mono text-muted-foreground">{model.target_column}</td>
                          <td className="px-6 py-4 capitalize text-muted-foreground">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              model.task_type === "regression" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
                            }`}>
                              {model.task_type}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono">
                            {model.task_type === "regression" ? (
                              <div className="space-y-0.5">
                                <div>R² score: <strong className="text-white">{Number(model.metrics.r2).toFixed(3)}</strong></div>
                                <div className="text-[10px] text-muted-foreground">RMSE error: {Number(model.metrics.rmse).toFixed(2)}</div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <div>Accuracy: <strong className="text-white">{(Number(model.metrics.accuracy) * 100).toFixed(1)}%</strong></div>
                                <div className="text-[10px] text-muted-foreground">F1-score: {Number(model.metrics.f1_score).toFixed(3)}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-3">
                              <button
                                onClick={() => {
                                  setSelectedModel(model);
                                  setActiveSubTab("diagnostics");
                                }}
                                className="text-primary hover:underline font-semibold"
                              >
                                View Diagnostics
                              </button>
                              <button
                                onClick={() => handleDeleteModel(model.id)}
                                className="text-muted-foreground hover:text-red-400 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS & EXPLAINABILITY */}
          {activeSubTab === "diagnostics" && selectedModel && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Model Summary card */}
              <div className="space-y-6">
                <div className="glass-card p-6 border border-border space-y-4">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider border-b border-border/60 pb-3 flex items-center gap-1.5">
                    <Activity className="w-4.5 h-4.5 text-primary" />
                    Model Details Summary
                  </h4>

                  <div className="text-xs space-y-3 font-medium">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Name:</span>
                      <span className="text-white">{selectedModel.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Target Col:</span>
                      <span className="text-white font-mono">{selectedModel.target_column}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Algorithm:</span>
                      <span className="text-white font-mono">{selectedModel.algorithm}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Trained:</span>
                      <span className="text-white">{new Date(selectedModel.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6 border border-border space-y-4">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider border-b border-border/60 pb-3 flex items-center gap-1.5">
                    <TrendingUp className="w-4.5 h-4.5 text-primary" />
                    Model Diagnostics Metrics
                  </h4>
                  
                  <div className="space-y-3 text-xs">
                    {selectedModel.task_type === "regression" ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">R² score (Fit):</span>
                          <strong className="text-white">{Number(selectedModel.metrics.r2).toFixed(3)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">RMSE (Error):</span>
                          <strong className="text-white">{Number(selectedModel.metrics.rmse).toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">MAE (Error):</span>
                          <strong className="text-white">{Number(selectedModel.metrics.mae).toFixed(2)}</strong>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Accuracy:</span>
                          <strong className="text-white">{(Number(selectedModel.metrics.accuracy) * 100).toFixed(1)}%</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">F1 Score (Macro):</span>
                          <strong className="text-white">{Number(selectedModel.metrics.f1_score).toFixed(3)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Precision:</span>
                          <strong className="text-white">{Number(selectedModel.metrics.precision).toFixed(3)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Recall:</span>
                          <strong className="text-white">{Number(selectedModel.metrics.recall).toFixed(3)}</strong>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Diagnostic Charts */}
              <div className="lg:col-span-2 space-y-6">
                
                {/* 1. Feature Importance Chart */}
                <div className="glass-card p-6 border border-border">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <BarChart3 className="w-4.5 h-4.5 text-primary" />
                    Feature Importances Weights
                  </h4>
                  
                  {Object.keys(selectedModel.feature_importances).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">No importances computed.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart 
                        data={Object.entries(selectedModel.feature_importances).map(([col, imp]) => ({
                          feature: col,
                          importance: imp
                        })).sort((a, b) => b.importance - a.importance)}
                        layout="vertical"
                        margin={{ top: 5, right: 10, left: 30, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis type="number" stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <YAxis dataKey="feature" type="category" stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(99, 102, 241, 0.4)", borderRadius: 12 }} />
                        <Bar dataKey="importance" fill="#6366f1" radius={[0, 4, 4, 0]} opacity={0.8} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>

                {/* 2. Predictions vs Actual Chart */}
                <div className="glass-card p-6 border border-border">
                  <h4 className="font-bold text-white text-xs uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <LineIcon className="w-4.5 h-4.5 text-primary" />
                    Validation test predictions fit
                  </h4>
                  
                  {selectedModel.test_predictions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-xs">No test predictions captured.</div>
                  ) : selectedModel.task_type === "regression" ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <ScatterChart margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                        <XAxis type="number" dataKey="actual" name="Actual y" stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <YAxis type="number" dataKey="prediction" name="Predicted y" stroke="#94a3b8" style={{ fontSize: 10 }} />
                        <Tooltip cursor={{ strokeDasharray: "3 3" }} contentStyle={{ background: "rgba(15, 23, 42, 0.9)", borderColor: "rgba(99, 102, 241, 0.4)", borderRadius: 12 }} />
                        <Scatter name="Test Fit" data={selectedModel.test_predictions} fill="#10b981" opacity={0.65} />
                      </ScatterChart>
                    </ResponsiveContainer>
                  ) : (
                    // Classification: Display prediction matches list
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Auditing a downsampled slice of predictions on classification test set:
                      </p>
                      
                      <div className="max-h-[220px] overflow-y-auto border border-border/60 rounded-lg divide-y divide-border/60 text-xs">
                        {selectedModel.test_predictions.slice(0, 10).map((pt, idx) => {
                          const isMatch = pt.actual === pt.prediction;
                          return (
                            <div key={idx} className="flex justify-between items-center p-2.5">
                              <span className="text-muted-foreground">Row {idx + 1}: Target Variable</span>
                              <div className="flex gap-4 items-center">
                                <span>Actual: <strong className="text-white">{String(pt.actual)}</strong></span>
                                <span>Pred: <strong className="text-white">{String(pt.prediction)}</strong></span>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  isMatch ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                                }`}>
                                  {isMatch ? "Match" : "Mismatch"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default ModelsPage;
