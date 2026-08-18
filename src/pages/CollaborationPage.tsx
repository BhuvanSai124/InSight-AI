import React, { useState, useEffect, useRef } from "react";
import { 
  Users, 
  Cpu, 
  Database, 
  Settings, 
  BookOpen, 
  FileText,
  Play,
  Terminal,
  Activity,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { datasetApi, profileApi, documentApi } from "../services/api";
import type { Dataset, ColumnMetadata, DocumentResponse, AgentLog } from "../services/api";

interface CollaborationPageProps {
  selectedDataset: Dataset | null;
  setCurrentTab: (tab: string) => void;
}

// Simple local Markdown formatter to support headers, bolding, bullet points, and inline code blocks
function MarkdownText({ text }: { text: string }) {
  const parseLine = (line: string, idx: number) => {
    let cleanLine = line;

    // Header 3
    if (cleanLine.startsWith("### ")) {
      return <h4 key={idx} className="text-white font-bold text-sm mt-3 mb-1.5">{cleanLine.substring(4)}</h4>;
    }
    // Header 2
    if (cleanLine.startsWith("## ")) {
      return <h3 key={idx} className="text-white font-bold text-base mt-4 mb-2">{cleanLine.substring(3)}</h3>;
    }
    // Header 1
    if (cleanLine.startsWith("# ")) {
      return <h2 key={idx} className="text-white font-extrabold text-lg mt-5 mb-3">{cleanLine.substring(2)}</h2>;
    }

    // Bullet list
    const isBullet = cleanLine.startsWith("- ") || cleanLine.startsWith("* ");
    if (isBullet) {
      cleanLine = cleanLine.substring(2);
    }

    const parts: React.ReactNode[] = [];
    let currentText = cleanLine;
    let keyCounter = 0;

    const tokenRegex = /(\*\*.*?\*\*|`.*?`)/g;
    const splitParts = currentText.split(tokenRegex);

    for (let part of splitParts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        parts.push(<strong key={keyCounter++} className="font-bold text-white">{part.slice(2, -2)}</strong>);
      } else if (part.startsWith("`") && part.endsWith("`")) {
        parts.push(
          <code key={keyCounter++} className="font-mono bg-accent/40 text-primary border border-border/40 px-1 py-0.5 rounded text-[10px]">
            {part.slice(1, -1)}
          </code>
        );
      } else {
        parts.push(part);
      }
    }

    if (isBullet) {
      return (
        <li key={idx} className="list-disc ml-5 my-1 text-slate-200 leading-relaxed text-xs">
          <span>{parts}</span>
        </li>
      );
    }

    return (
      <p key={idx} className="text-xs text-slate-200 leading-relaxed my-1 min-h-[1em]">
        {parts}
      </p>
    );
  };

  const lines = text.split("\n");
  return <div className="space-y-1">{lines.map((line, idx) => parseLine(line, idx))}</div>;
}

export function CollaborationPage({ selectedDataset, setCurrentTab }: CollaborationPageProps) {
  const [columns, setColumns] = useState<ColumnMetadata[]>([]);
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [notProfiled, setNotProfiled] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form selections
  const [targetCol, setTargetCol] = useState("");
  const [featureCols, setFeatureCols] = useState<string[]>([]);
  const [algorithm, setAlgorithm] = useState("random_forest");
  const [docId, setDocId] = useState("");

  // Live Agent Simulation states
  const [runningWorkflow, setRunningWorkflow] = useState(false);
  const [visibleLogs, setVisibleLogs] = useState<AgentLog[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<Record<string, "idle" | "running" | "done" | "error">>({
    "Data Auditor Agent": "idle",
    "Transformation Agent": "idle",
    "AutoML Engineer Agent": "idle",
    "Knowledge Retrieval Agent": "idle",
    "Executive Summarizer": "idle"
  });
  const [finalReport, setFinalReport] = useState<string | null>(null);
  
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Load configuration options
  const loadData = async (id: string) => {
    try {
      setLoading(true);
      setError(null);
      setNotProfiled(false);

      const profile = await profileApi.get(id);
      setColumns(profile.columns_metadata);

      if (profile.columns_metadata.length > 0) {
        const defaultTarget = profile.columns_metadata[profile.columns_metadata.length - 1].name;
        setTargetCol(defaultTarget);

        const defaultFeatures = profile.columns_metadata
          .filter(c => c.name !== defaultTarget && (c.type === "numeric" || c.type === "boolean"))
          .map(c => c.name);
        setFeatureCols(defaultFeatures);
      }

      // Load documents
      const docs = await documentApi.list();
      setDocuments(docs);
      if (docs.length > 0) {
        setDocId(docs[0].id);
      }
    } catch (err: any) {
      if (err.response?.status === 404) {
        setNotProfiled(true);
      } else {
        setError("Failed to load collaboration parameters.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDataset) {
      loadData(selectedDataset.id);
    }
  }, [selectedDataset]);

  // Auto-scroll terminal
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleLogs]);

  // Determine ML task type
  const getEstimatedTaskType = () => {
    const targetMeta = columns.find(c => c.name === targetCol);
    if (!targetMeta) return "regression";
    if (targetMeta.type === "categorical" || targetMeta.type === "boolean" || targetMeta.cardinality <= 10) {
      return "classification";
    }
    return "regression";
  };

  const handleFeatureToggle = (colName: string) => {
    if (featureCols.includes(colName)) {
      setFeatureCols(featureCols.filter(f => f !== colName));
    } else {
      setFeatureCols([...featureCols, colName]);
    }
  };

  // Run Collaborative Multi-Agent Workflow
  const handleStartCollaboration = async () => {
    if (!selectedDataset) return;
    if (!targetCol) {
      alert("Please select a target variable!");
      return;
    }
    if (featureCols.length === 0) {
      alert("Please select features!");
      return;
    }

    setRunningWorkflow(true);
    setFinalReport(null);
    setVisibleLogs([]);
    setError(null);
    
    // Reset agent statuses to idle
    const initialStatuses = {
      "Data Auditor Agent": "idle",
      "Transformation Agent": "idle",
      "AutoML Engineer Agent": "idle",
      "Knowledge Retrieval Agent": "idle",
      "Executive Summarizer": "idle"
    } as any;
    setAgentStatuses(initialStatuses);

    try {
      const payload = {
        target_column: targetCol,
        feature_columns: featureCols,
        algorithm: algorithm,
        doc_id: docId || undefined
      };

      const response = await datasetApi.runCollaboration(selectedDataset.id, payload);
      
      // Simulate live sequential execution by appending logs with delay!
      let logIndex = 0;
      const interval = setInterval(() => {
        if (logIndex < response.logs.length) {
          const log = response.logs[logIndex];
          setVisibleLogs(prev => [...prev, log]);

          // Update agent statuses
          setAgentStatuses(prev => {
            const copy = { ...prev };
            
            // Mark previous active agents as done
            Object.keys(copy).forEach(k => {
              if (copy[k] === "running") copy[k] = "done";
            });

            // Set current agent status
            if (log.status === "error") {
              copy[log.agent] = "error";
            } else if (log.status === "done") {
              copy[log.agent] = "done";
            } else {
              copy[log.agent] = "running";
            }
            return copy;
          });

          logIndex++;
        } else {
          clearInterval(interval);
          setAgentStatuses(prev => {
            const copy = { ...prev };
            Object.keys(copy).forEach(k => {
              if (copy[k] === "running") copy[k] = "done";
            });
            return copy;
          });
          setFinalReport(response.report);
          setRunningWorkflow(false);
        }
      }, 700); // 700ms log delay creates beautiful workspace feel!

    } catch (err: any) {
      setError(err.response?.data?.detail || "Collaboration workflow execution failed.");
      setRunningWorkflow(false);
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
          Please upload or select a dataset from the Dashboard to configure AI agents collaboration.
        </p>
      </div>
    );
  }

  if (notProfiled && !loading) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4 text-center">
        <div className="bg-primary/10 border border-primary/20 p-4 rounded-full text-primary mb-5 inline-block">
          <Users className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">Profiling Required</h3>
        <p className="text-muted-foreground text-sm max-w-md mx-auto mb-8 leading-relaxed">
          The dataset **"{selectedDataset.name}"** must be profiled first to coordinate agent schemas.
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

  const estimatedTask = getEstimatedTaskType();
  const agentsList = [
    { name: "Data Auditor Agent", icon: Database, desc: "Profiles schema and triggers duplication warnings" },
    { name: "Transformation Agent", icon: Settings, desc: "Formulates imputation and scaling suggestions" },
    { name: "AutoML Engineer Agent", icon: Cpu, desc: "Fits classification/regression estimators" },
    { name: "Knowledge Retrieval Agent", icon: BookOpen, desc: "Queries background document citations" },
    { name: "Executive Summarizer", icon: FileText, desc: "Consolidates reports" }
  ];

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-white tracking-tight flex items-center gap-2.5">
          <Users className="w-7 h-7 text-primary" />
          AI Collaboration Room
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Coordinate specialized AI agents sequentially to audit data quality, fit predictive models, and compile semantic reference reports.
        </p>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Side: configurations Form */}
        <div className="space-y-6 lg:col-span-1">
          
          <div className="glass-card p-5 border border-border space-y-5">
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 border-b border-border/60 pb-2">
              <Settings className="w-4 h-4 text-primary" />
              Configure Collaboration Parameters
            </h3>

            {/* Target select */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] text-muted-foreground font-semibold">Target Variable (y)</label>
              <select
                value={targetCol}
                disabled={runningWorkflow}
                onChange={(e) => setTargetCol(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              >
                {columns.map(c => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Algorithm select */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] text-muted-foreground font-semibold">AutoML Algorithm</label>
              <select
                value={algorithm}
                disabled={runningWorkflow}
                onChange={(e) => setAlgorithm(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              >
                {estimatedTask === "regression" ? (
                  <>
                    <option value="random_forest">Random Forest Regressor</option>
                    <option value="linear_regression">Linear Regression</option>
                    <option value="decision_tree">Decision Tree Regressor</option>
                  </>
                ) : (
                  <>
                    <option value="random_forest">Random Forest Classifier</option>
                    <option value="logistic_regression">Logistic Regression</option>
                    <option value="decision_tree">Decision Tree Classifier</option>
                  </>
                )}
              </select>
            </div>

            {/* Document Select */}
            <div className="space-y-1.5">
              <label className="text-[10.5px] text-muted-foreground font-semibold">RAG Reference Document</label>
              <select
                value={docId}
                disabled={runningWorkflow}
                onChange={(e) => setDocId(e.target.value)}
                className="w-full py-2 px-3 text-xs rounded-lg glass border border-border/80 text-white focus:outline-none focus:border-primary/50 disabled:opacity-50"
              >
                <option value="">-- No reference document --</option>
                {documents.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>

            {/* Feature Checkboxes */}
            <div className="space-y-2">
              <label className="text-[10.5px] text-muted-foreground font-semibold block">Select Feature Columns (X)</label>
              <div className="max-h-[200px] overflow-y-auto border border-border/60 rounded-lg p-2.5 space-y-2 bg-accent/5">
                {columns
                  .filter(c => c.name !== targetCol)
                  .map(col => {
                    const isNumericOrBool = col.type === "numeric" || col.type === "boolean";
                    return (
                      <label key={col.name} className="flex items-center gap-2 text-xs text-slate-300">
                        <input
                          type="checkbox"
                          checked={featureCols.includes(col.name)}
                          disabled={!isNumericOrBool || runningWorkflow}
                          onChange={() => handleFeatureToggle(col.name)}
                          className="rounded border-border text-primary focus:ring-primary w-3.5 h-3.5 accent-primary bg-accent/40 disabled:opacity-50"
                        />
                        <span className="truncate max-w-[150px] font-medium">{col.name}</span>
                        {!isNumericOrBool && (
                          <span className="text-[9px] text-amber-400 font-semibold uppercase">Needs Enc</span>
                        )}
                      </label>
                    );
                  })}
              </div>
            </div>

            <button
              onClick={handleStartCollaboration}
              disabled={featureCols.length === 0 || runningWorkflow}
              className="w-full bg-primary hover:bg-primary/95 text-white font-semibold py-3 px-5 rounded-xl text-xs transition-all duration-200 shadow-lg shadow-primary/25 border border-primary/45 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Collaboration
            </button>
          </div>

        </div>

        {/* Right Side: Agents Status trackers and Terminal */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Agent status tracker grid */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
            {agentsList.map((agent) => {
              const status = agentStatuses[agent.name];
              const Icon = agent.icon;
              return (
                <div 
                  key={agent.name}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between items-center text-center transition-all ${
                    status === "running" ? "bg-primary/10 border-primary/40 scale-105 shadow-md shadow-primary/10" :
                    status === "done" ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-400" :
                    status === "error" ? "bg-red-500/5 border-red-500/20 text-red-400" :
                    "glass-card border-border/80 opacity-70"
                  }`}
                >
                  <Icon className={`w-5 h-5 mb-2 ${
                    status === "running" ? "text-primary animate-pulse" :
                    status === "done" ? "text-emerald-400" :
                    status === "error" ? "text-red-400" :
                    "text-muted-foreground"
                  }`} />
                  
                  <div>
                    <span className="text-[9.5px] font-bold block truncate max-w-[100px] text-white">
                      {agent.name.replace(" Agent", "")}
                    </span>
                    <span className={`text-[8.5px] uppercase font-black mt-1 inline-block ${
                      status === "running" ? "text-primary animate-bounce" :
                      status === "done" ? "text-emerald-400" :
                      status === "error" ? "text-red-400" :
                      "text-muted-foreground"
                    }`}>
                      {status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Terminal Console log */}
          <div className="glass-card border border-border overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border/60 bg-accent/20 flex items-center justify-between">
              <span className="text-[10px] font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-4 h-4 text-primary" />
                Live Agent Collaboration Console
              </span>
              {runningWorkflow && (
                <span className="text-[9px] text-primary flex items-center gap-1 font-semibold uppercase animate-pulse">
                  <Activity className="w-3 h-3" />
                  Coordinating chain...
                </span>
              )}
            </div>

            <div className="bg-slate-950/70 p-4 font-mono text-[10.5px] text-emerald-400 space-y-1.5 h-[160px] overflow-y-auto">
              {visibleLogs.length === 0 ? (
                <div className="text-slate-500 text-center py-10">
                  Console idle. Press "Start Collaboration" to launch workflow.
                </div>
              ) : (
                visibleLogs.map((log, idx) => (
                  <div key={idx} className="flex gap-2 items-start leading-relaxed">
                    <span className="text-slate-500">[{log.timestamp}]</span>
                    <span className={`font-semibold uppercase text-[9.5px] shrink-0 ${
                      log.status === "error" ? "text-red-400" :
                      log.status === "warning" ? "text-amber-400" :
                      "text-primary"
                    }`}>
                      [{log.agent.replace(" Agent", "")}]
                    </span>
                    <span className={log.status === "error" ? "text-red-300" : log.status === "warning" ? "text-amber-200" : "text-emerald-300"}>
                      {log.message}
                    </span>
                  </div>
                ))
              )}
              <div ref={terminalEndRef} />
            </div>
          </div>

          {/* Coordinated Master Report Output */}
          {finalReport && (
            <div className="glass-card border border-border overflow-hidden">
              <div className="px-5 py-4 border-b border-border/60 bg-accent/20 flex items-center justify-between">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                  Coordinated Executive Master Report
                </h3>
              </div>
              <div className="p-6 bg-accent/5 overflow-y-auto max-h-[400px]">
                <MarkdownText text={finalReport} />
              </div>
            </div>
          )}

          {/* General error message */}
          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <span>{error}</span>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
export default CollaborationPage;
