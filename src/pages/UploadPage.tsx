import { useState, useRef } from "react";
import { UploadCloud, FileSpreadsheet, FileJson, AlertCircle, CheckCircle2 } from "lucide-react";
import { datasetApi } from "../services/api";
import type { Dataset } from "../services/api";

interface UploadPageProps {
  onUploadSuccess: (dataset: Dataset) => void;
}

export const UploadPage: React.FC<UploadPageProps> = ({ onUploadSuccess }) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFile = async (file: File) => {
    // Validate extension
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!ext || !["csv", "xlsx", "xls", "json"].includes(ext)) {
      setError("Invalid file format. Please upload a CSV, Excel, or JSON file.");
      return;
    }

    setUploading(true);
    setProgress(0);
    setError(null);
    setSuccess(null);

    try {
      const dataset = await datasetApi.upload(file, (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setProgress(percentCompleted);
      });
      setSuccess(`Dataset "${file.name}" uploaded successfully!`);
      setTimeout(() => {
        onUploadSuccess(dataset);
      }, 1000);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Upload failed. Please check the backend connection.");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      {/* Header */}
      <div className="mb-8 text-center md:text-left">
        <h2 className="text-2xl font-bold text-white mb-2">Upload Dataset</h2>
        <p className="text-muted-foreground text-sm">
          Load your structured data to begin profiling, cleaning, visualizing, and running ML pipelines.
        </p>
      </div>

      {/* Main Drag & Drop Zone */}
      <div 
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        className={`glass-card p-12 flex flex-col items-center justify-center border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ${
          dragActive 
            ? "border-primary bg-primary/10 scale-[1.01]" 
            : "border-border/60 hover:border-primary/40 bg-card/25"
        }`}
        onClick={onButtonClick}
      >
        <input 
          ref={fileInputRef}
          type="file" 
          className="hidden" 
          accept=".csv,.xlsx,.xls,.json"
          onChange={handleChange}
          disabled={uploading}
        />

        {/* Upload Icon with glow */}
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl filter scale-125"></div>
          <div className="relative bg-primary/25 border border-primary/40 p-4 rounded-full text-primary">
            <UploadCloud className="w-10 h-10 animate-pulse" />
          </div>
        </div>

        <p className="text-white text-lg font-semibold mb-2">
          Drag & drop your file here, or <span className="text-primary hover:underline">browse</span>
        </p>
        
        <p className="text-muted-foreground text-xs mb-6">
          Supports CSV, XLSX, and JSON files up to 50MB
        </p>

        {/* Allowed formats indicators */}
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/40 border border-border/80 text-xs text-muted-foreground">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>CSV / Excel</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/40 border border-border/80 text-xs text-muted-foreground">
            <FileJson className="w-4 h-4 text-amber-400" />
            <span>JSON</span>
          </div>
        </div>
      </div>

      {/* Uploading Status Overlay/Bar */}
      {uploading && (
        <div className="mt-6 glass-card p-6 border border-border">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-white">Uploading dataset...</span>
            <span className="text-sm font-bold text-primary">{progress}%</span>
          </div>
          <div className="w-full bg-accent/50 rounded-full h-2 overflow-hidden border border-border/60">
            <div 
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-red-950/30 border border-red-500/30 text-red-200 text-sm">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300">Upload Error</p>
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="mt-6 flex items-start gap-3 p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-200 text-sm">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-emerald-300">Success</p>
            <p>{success}</p>
          </div>
        </div>
      )}

      {/* Data Security and Help box */}
      <div className="mt-12 p-6 glass border border-border rounded-xl">
        <h4 className="text-white font-semibold text-sm mb-2">Data Privacy & Security</h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your uploaded data is processed locally and stored in a secure sandbox. We do not sell or share your datasets. 
          For enterprise clusters, database connections can be configured with SSL encryption and end-to-end data encryption.
        </p>
      </div>
    </div>
  );
};
export default UploadPage;
