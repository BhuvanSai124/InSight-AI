import React, { useState, useRef, useEffect } from "react";
import { 
  MessageSquare, 
  Send, 
  Trash2, 
  Sparkles, 
  Database,
  BrainCircuit,
  Terminal
} from "lucide-react";
import { datasetApi } from "../services/api";
import type { Dataset } from "../services/api";

interface ChatPageProps {
  selectedDataset: Dataset | null;
}

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  suggestedPrompts?: string[];
}

// Simple local Markdown formatter to support headers, bolding, bullet points, and inline code blocks
function MarkdownText({ text }: { text: string }) {
  const parseLine = (line: string, idx: number) => {
    let cleanLine = line;

    // Header 3: ### Header
    if (cleanLine.startsWith("### ")) {
      return <h4 key={idx} className="text-white font-bold text-sm mt-3 mb-1.5">{cleanLine.substring(4)}</h4>;
    }
    // Header 2: ## Header
    if (cleanLine.startsWith("## ")) {
      return <h3 key={idx} className="text-white font-bold text-base mt-4 mb-2">{cleanLine.substring(3)}</h3>;
    }
    // Header 1: # Header
    if (cleanLine.startsWith("# ")) {
      return <h2 key={idx} className="text-white font-extrabold text-lg mt-5 mb-3">{cleanLine.substring(2)}</h2>;
    }

    // Bullet list: - Item or * Item
    const isBullet = cleanLine.startsWith("- ") || cleanLine.startsWith("* ");
    if (isBullet) {
      cleanLine = cleanLine.substring(2);
    }

    // Parse bold (**text**) and inline code (`code`)
    const parts: React.ReactNode[] = [];
    let currentText = cleanLine;
    let keyCounter = 0;

    // Regex to split by bold or code block
    const tokenRegex = /(\*\*.*?\*\*|`.*?`)/g;
    const splitParts = currentText.split(tokenRegex);

    for (let part of splitParts) {
      if (part.startsWith("**") && part.endsWith("**")) {
        parts.push(<strong key={keyCounter++} className="font-bold text-white">{part.slice(2, -2)}</strong>);
      } else if (part.startsWith("`") && part.endsWith("`")) {
        parts.push(
          <code key={keyCounter++} className="font-mono bg-accent/40 text-primary border border-border/40 px-1 py-0.5 rounded text-[10.5px]">
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

export function ChatPage({ selectedDataset }: ChatPageProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize welcome message when dataset changes
  useEffect(() => {
    if (selectedDataset) {
      setMessages([
        {
          id: "welcome",
          sender: "ai",
          text: `👋 **Hello! I am your Conversational Data Analyst.**\n\nI can help you explore and predict using **${selectedDataset.name}**. Ask me questions like:\n\n- \`What is the dataset shape?\`\n- \`Show missing values\`\n- \`Show top correlations\`\n- \`What is the average of [column_name]?\`\n\nIf you have trained models in **AutoML**, you can also query predictions: \`predict [target] for [feature_1=val_1, feature_2=val_2]\`.`,
          suggestedPrompts: [
            "What is the dataset shape?",
            "Show missing values",
            "Show top correlations"
          ]
        }
      ]);
    } else {
      setMessages([]);
    }
  }, [selectedDataset]);

  // Scroll to bottom helper
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const handleSendMessage = async (textToSend: string) => {
    if (!selectedDataset || !textToSend.trim() || loading) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue("");
    setLoading(true);

    try {
      const data = await datasetApi.chatWithDataset(selectedDataset.id, textToSend);
      const aiMessage: Message = {
        id: Math.random().toString(),
        sender: "ai",
        text: data.response,
        suggestedPrompts: data.suggested_prompts
      };
      setMessages(prev => [...prev, aiMessage]);
    } catch (err) {
      const errorMessage: Message = {
        id: Math.random().toString(),
        sender: "ai",
        text: "⚠️ Failed to execute query. Verify dataset state and try again."
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleClearChat = () => {
    if (!selectedDataset) return;
    setMessages([
      {
        id: "welcome",
        sender: "ai",
        text: `👋 Chat history cleared. Ready to analyze **${selectedDataset.name}**! Ask me anything.`,
        suggestedPrompts: [
          "What is the dataset shape?",
          "Show missing values",
          "Show top correlations"
        ]
      }
    ]);
  };

  if (!selectedDataset) {
    return (
      <div className="max-w-4xl mx-auto py-16 px-4 text-center">
        <div className="bg-accent/40 border border-border/80 p-4 rounded-full text-muted-foreground mb-4 inline-block">
          <Database className="w-8 h-8" />
        </div>
        <h3 className="text-white font-bold text-lg">No active dataset</h3>
        <p className="text-muted-foreground text-sm mt-1">
          Please upload or select a dataset from the Dashboard to start conversational querying.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-6 px-6 h-[calc(100vh-100px)] flex flex-col justify-between gap-4">
      {/* Header controls */}
      <div className="flex justify-between items-center shrink-0 border-b border-border/60 pb-3">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
            <MessageSquare className="w-5.5 h-5.5 text-primary" />
            Chat Analyst
          </h2>
          <p className="text-muted-foreground text-xs mt-0.5">
            Conversation queries computed instantly on active dataset **{selectedDataset.name}**
          </p>
        </div>
        <button 
          onClick={handleClearChat}
          className="p-2 text-muted-foreground hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
          title="Clear Conversation"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>
      </div>

      {/* Main chat window split with info panel */}
      <div className="flex-1 flex gap-6 overflow-hidden min-h-0">
        
        {/* Messages display */}
        <div className="flex-1 flex flex-col justify-between overflow-hidden glass-card border border-border rounded-xl p-4">
          
          <div className="flex-1 overflow-y-auto space-y-4 pr-1">
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender === "user" ? "justify-end" : "justify-start"}`}
              >
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
            ))}
            
            {/* Loading animator */}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-accent/40 border border-border/60 rounded-2xl rounded-tl-none px-4 py-3 text-xs flex items-center gap-2 text-muted-foreground">
                  <BrainCircuit className="w-4.5 h-4.5 text-primary animate-pulse" />
                  <span>Analyzing dataset...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompts footer */}
          {messages.length > 0 && messages[messages.length - 1].suggestedPrompts && (
            <div className="mt-4 pt-3 border-t border-border/40 shrink-0">
              <div className="flex flex-wrap gap-2">
                {messages[messages.length - 1].suggestedPrompts?.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSendMessage(prompt)}
                    className="bg-accent/20 hover:bg-accent/40 border border-border/80 text-muted-foreground hover:text-white transition-colors text-[10.5px] px-3 py-1.5 rounded-full flex items-center gap-1 font-semibold"
                  >
                    <Sparkles className="w-3 h-3 text-primary shrink-0" />
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Info panel sidebar (Hidden on small screens) */}
        <div className="w-72 shrink-0 hidden md:block space-y-4 overflow-y-auto">
          
          <div className="glass-card p-4 border border-border space-y-3">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-border/60 pb-2">
              <Terminal className="w-4 h-4 text-primary" />
              Supported Queries
            </h4>
            <div className="text-[11px] text-muted-foreground space-y-3.5 leading-relaxed">
              <div>
                <span className="font-semibold text-white block mb-0.5">Descriptive Statistics</span>
                "What is the average of age?", "Show max of fare", "median of income"
              </div>
              <div>
                <span className="font-semibold text-white block mb-0.5">Dataset Shape</span>
                "Show rows count", "What is the dataset shape?"
              </div>
              <div>
                <span className="font-semibold text-white block mb-0.5">Missingness Audits</span>
                "Show missing values", "null counts"
              </div>
              <div>
                <span className="font-semibold text-white block mb-0.5">Numerical Pearson Correlations</span>
                "Show top correlations", "correlate numerical variables"
              </div>
            </div>
          </div>

          <div className="glass-card p-4 border border-border space-y-2.5">
            <h4 className="font-bold text-white text-xs uppercase tracking-wider flex items-center gap-1.5 border-b border-border/60 pb-2">
              <BrainCircuit className="w-4 h-4 text-primary" />
              AutoML Predictions
            </h4>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              If you have trained models in AutoML (e.g. predicting classification target `survived`), write:
            </p>
            <div className="bg-accent/30 border border-border/60 p-2.5 rounded-lg font-mono text-[10px] text-primary/95 leading-normal break-all">
              predict target for class=1, age=30, fare=50
            </div>
          </div>

        </div>

      </div>

      {/* Input container */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage(inputValue);
        }}
        className="flex gap-3 shrink-0"
      >
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={`Type queries about "${selectedDataset.name}" or prediction attributes...`}
          className="flex-1 bg-accent/20 border border-border/80 hover:border-border text-white text-xs rounded-xl px-4 py-3 focus:outline-none focus:border-primary/50 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputValue.trim() || loading}
          className="bg-primary hover:bg-primary/95 text-white p-3 rounded-xl transition-all duration-200 border border-primary/45 flex items-center justify-center shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4 fill-current" />
        </button>
      </form>
    </div>
  );
}
export default ChatPage;
