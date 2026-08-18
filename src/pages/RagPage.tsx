import React, { useState, useEffect, useRef } from "react";
import { 
  BookOpen, 
  UploadCloud, 
  Trash2, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  FileText,
  HelpCircle,
  Clock,
  Layers
} from "lucide-react";
import { documentApi } from "../services/api";
import type { DocumentResponse, SourceExcerpt } from "../services/api";

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  sources?: SourceExcerpt[];
}

// Simple local Markdown formatter to support headers, bolding, bullet points, and inline code blocks
function MarkdownText({ text }: { text: string }) {
  const parseLine = (line: string, idx: number) => {
    let cleanLine = line;

    // Header 3
    if (cleanLine.startsWith("### ")) {
      return <h4 key={idx} className="text-foreground font-bold text-sm mt-3 mb-1.5">{cleanLine.substring(4)}</h4>;
    }
    // Header 2
    if (cleanLine.startsWith("## ")) {
      return <h3 key={idx} className="text-foreground font-bold text-base mt-4 mb-2">{cleanLine.substring(3)}</h3>;
    }
    // Header 1
    if (cleanLine.startsWith("# ")) {
      return <h2 key={idx} className="text-foreground font-extrabold text-lg mt-5 mb-3">{cleanLine.substring(2)}</h2>;
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
        parts.push(<strong key={keyCounter++} className="font-bold text-foreground">{part.slice(2, -2)}</strong>);
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

export function RagPage() {
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [selectedDocId, setSelectedDocId] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [queryInput, setQueryInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [expandedSources, setExpandedSources] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  const loadDocuments = async () => {
    try {
      const data = await documentApi.list();
      setDocuments(data);
      if (data.length > 0 && !selectedDocId) {
        setSelectedDocId(data[0].id);
      }
    } catch (err) {
      setError("Failed to fetch documents from database inventory.");
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, loading]);

  // Handle Drag-and-Drop file uploads
  const processUploadedFile = async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "txt" && ext !== "md" && ext !== "json") {
      alert("Unsupported file format! Please upload only .txt, .md, or .json files.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const newDoc = await documentApi.upload(file);
      setDocuments(prev => [newDoc, ...prev]);
      setSelectedDocId(newDoc.id);
      
      // Auto welcome query setup
      setChatHistory([
        {
          id: "welcome",
          sender: "ai",
          text: `📚 **Document Reference Loaded**\n\nI have successfully segment-indexed **${newDoc.name}** into **${newDoc.chunks.length} overlapping paragraphs**.\n\nYou can query this document using semantic TF-IDF text matching. Ask me anything about its contents!`
        }
      ]);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to parse text document.");
    } finally {
      setUploading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processUploadedFile(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      processUploadedFile(file);
    }
  };

  // Run Semantic Search Query
  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDocId || !queryInput.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      sender: "user",
      text: queryInput
    };

    setChatHistory(prev => [...prev, userMsg]);
    const currentQuery = queryInput;
    setQueryInput("");
    setLoading(true);

    try {
      const response = await documentApi.query(selectedDocId, currentQuery);
      const aiMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "ai",
        text: response.answer,
        sources: response.sources
      };
      setChatHistory(prev => [...prev, aiMsg]);
    } catch (err) {
      const errMsg: ChatMessage = {
        id: Math.random().toString(),
        sender: "ai",
        text: "⚠️ Failed to run semantic search. Verify document status."
      };
      setChatHistory(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  // Delete Document
  const handleDeleteDoc = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document reference from database?")) return;
    try {
      await documentApi.delete(id);
      const filtered = documents.filter(d => d.id !== id);
      setDocuments(filtered);
      if (selectedDocId === id) {
        setSelectedDocId(filtered.length > 0 ? filtered[0].id : "");
        setChatHistory([]);
      }
    } catch (err) {
      alert("Failed to delete document.");
    }
  };

  const toggleSources = (msgId: string) => {
    setExpandedSources(prev => ({
      ...prev,
      [msgId]: !prev[msgId]
    }));
  };

  const activeDoc = documents.find(d => d.id === selectedDocId);

  return (
    <div className="max-w-7xl mx-auto py-8 px-6 space-y-8 h-[calc(100vh-100px)] flex flex-col justify-between">
      
      {/* Header */}
      <div className="shrink-0 border-b border-border/60 pb-3 flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold text-foreground tracking-tight flex items-center gap-2.5">
            <BookOpen className="w-7 h-7 text-primary" />
            Document RAG Workspace
          </h2>
          <p className="text-muted-foreground text-sm mt-1">
            Segment reference documents, search semantic cosine matchings, and explore cited passages.
          </p>
        </div>
      </div>

      {/* Split manager vs chat layout */}
      <div className="flex-1 flex gap-8 overflow-hidden min-h-0">
        
        {/* Left Side: Document Manager & Uploader */}
        <div className="w-96 shrink-0 flex flex-col gap-6 overflow-y-auto">
          
          {/* File Uploader */}
          <div className="glass-card p-6 border border-border space-y-4">
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
              <UploadCloud className="w-4.5 h-4.5 text-primary" />
              Upload Reference Document
            </h3>
            
            <label 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed transition-all rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer bg-accent/5 ${
                dragActive ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50"
              }`}
            >
              <input 
                type="file" 
                accept=".txt,.md,.json" 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <UploadCloud className={`w-8 h-8 mb-3 transition-transform ${dragActive ? "text-primary scale-110" : "text-muted-foreground animate-pulse"}`} />
              <span className="text-xs font-semibold text-foreground">Select File</span>
              <span className="text-[10px] text-muted-foreground mt-1">or drag & drop text file here</span>
            </label>
            
            {uploading && (
              <div className="text-[10px] text-primary flex items-center gap-1.5 justify-center font-semibold">
                <Clock className="w-3.5 h-3.5 animate-spin" />
                Parsing text chunks...
              </div>
            )}
            {error && (
              <div className="text-[10px] text-red-400 text-center font-medium bg-red-950/20 border border-red-500/20 p-2 rounded-lg">
                {error}
              </div>
            )}
          </div>

          {/* Inventory list */}
          <div className="glass-card border border-border flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-border/60 bg-accent/20 flex justify-between items-center">
              <span className="text-[10px] font-bold text-foreground uppercase tracking-wider">
                Document Repository ({documents.length})
              </span>
            </div>
            
            {documents.length === 0 ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center text-muted-foreground text-xs p-6 gap-2">
                <FileText className="w-8 h-8 opacity-45" />
                <p>No document references uploaded yet.</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-border/60">
                {documents.map((doc) => (
                  <div 
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      setChatHistory([]);
                    }}
                    className={`p-3.5 flex justify-between items-start cursor-pointer transition-colors ${
                      selectedDocId === doc.id ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/5"
                    }`}
                  >
                    <div className="text-xs space-y-1 truncate max-w-[210px]">
                      <div className="font-semibold text-foreground truncate">{doc.name}</div>
                      <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                        <span>{(doc.file_size / 1024).toFixed(1)} KB</span>
                        <span>•</span>
                        <span>{doc.chunks.length} chunks</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteDoc(doc.id);
                      }}
                      className="text-muted-foreground hover:text-red-400 p-1 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* Right Side: Chat Workspace */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden glass-card border border-border rounded-xl p-4">
          
          {/* Active doc details banner */}
          <div className="shrink-0 bg-accent/20 border-b border-border/40 pb-3 mb-4 flex justify-between items-center text-xs">
            <div className="flex items-center gap-2">
              <Layers className="w-4.5 h-4.5 text-primary" />
              <span>Query Context: <strong className="text-foreground">{activeDoc?.name || "No document active"}</strong></span>
            </div>
            {activeDoc && (
              <span className="text-[10px] text-muted-foreground">{activeDoc.chunks.length} Excerpt Paragraphs</span>
            )}
          </div>

          {/* Chat scroll box */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {chatHistory.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground text-xs space-y-2">
                <HelpCircle className="w-10 h-10 mx-auto text-border/70 animate-pulse" />
                <p>Ready to query active document contents.</p>
                <p className="max-w-[250px] mx-auto text-[11px] leading-relaxed">
                  Type questions in the search input below to extract TF-IDF matched context fragments.
                </p>
              </div>
            ) : (
              chatHistory.map((msg) => (
                <div 
                  key={msg.id}
                  className="space-y-2.5"
                >
                  <div className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}>
                    <div 
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs shadow-md ${
                        msg.sender === "user" 
                          ? "bg-primary text-white rounded-tr-none" 
                          : "bg-accent/40 border border-border/60 text-slate-100 rounded-tl-none leading-relaxed"
                      }`}
                    >
                      <MarkdownText text={msg.text} />
                    </div>
                  </div>

                  {/* Cited references accordion (only for AI answers!) */}
                  {msg.sender === "ai" && msg.sources && msg.sources.length > 0 && (
                    <div className="ml-2 pl-2 border-l border-border/40 max-w-[83%] text-xs">
                      <button
                        onClick={() => toggleSources(msg.id)}
                        className="flex items-center gap-1 text-[10.5px] text-primary hover:underline font-semibold"
                      >
                        {expandedSources[msg.id] ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        Citations & Citations Sources ({msg.sources.length} matching passages)
                      </button>

                      {expandedSources[msg.id] && (
                        <div className="mt-2 space-y-2 max-h-[220px] overflow-y-auto">
                          {msg.sources.map((source, idx) => (
                            <div 
                              key={idx}
                              className="p-3 rounded-lg bg-accent/15 border border-border/40 text-[11px] leading-relaxed text-slate-300"
                            >
                              <div className="flex justify-between items-center text-[9.5px] text-muted-foreground uppercase font-bold tracking-wider mb-1.5 border-b border-border/40 pb-1">
                                <span>Cited Segment #{source.chunk_index + 1}</span>
                                <span>Similarity Score: {(source.score * 100).toFixed(0)}%</span>
                              </div>
                              <p className="font-mono text-[10px]">{source.text}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                </div>
              ))
            )}

            {/* Loading animator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-accent/40 border border-border/60 rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2 text-muted-foreground">
                  <Clock className="w-4 h-4 text-primary animate-spin" />
                  <span>Retrieving matching contexts...</span>
                </div>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Form input bar */}
          <form 
            onSubmit={handleQuery}
            className="flex gap-3 shrink-0 mt-4 border-t border-border/40 pt-4"
          >
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              disabled={!selectedDocId || loading}
              placeholder={selectedDocId ? "Type queries about this document..." : "Upload document reference to search..."}
              className="flex-1 bg-accent/20 border border-border/80 hover:border-border text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 transition-colors disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!selectedDocId || !queryInput.trim() || loading}
              className="bg-primary hover:bg-primary/95 text-white p-3 rounded-xl transition-all duration-200 border border-primary/45 flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>

        </div>

      </div>

    </div>
  );
}
export default RagPage;
