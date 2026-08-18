import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Sidebar from "./components/common/Sidebar";
import Header from "./components/common/Header";
import Dashboard from "./pages/Dashboard";
import UploadPage from "./pages/UploadPage";
import { ProfilerPage } from "./pages/ProfilerPage";
import { CleaningPage } from "./pages/CleaningPage";
import { EdaPage } from "./pages/EdaPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ModelsPage } from "./pages/ModelsPage";
import { ChatPage } from "./pages/ChatPage";
import { RagPage } from "./pages/RagPage";
import { CollaborationPage } from "./pages/CollaborationPage";
import { datasetApi } from "./services/api";
import type { Dataset } from "./services/api";

const queryClient = new QueryClient();

function MainLayout() {
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [loading, setLoading] = useState<boolean>(true);

  // Load datasets on startup
  const loadDatasets = async () => {
    try {
      setLoading(true);
      const data = await datasetApi.list();
      setDatasets(data);
      if (data.length > 0 && !selectedDataset) {
        setSelectedDataset(data[0]); // Default to first uploaded
      }
    } catch (err) {
      console.error("Failed to load datasets:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatasets();
  }, []);

  const handleUploadSuccess = (newDataset: Dataset) => {
    setDatasets((prev) => [newDataset, ...prev]);
    setSelectedDataset(newDataset);
    setCurrentTab("dashboard");
  };

  const handleDeleteDataset = async (id: string) => {
    if (confirm("Are you sure you want to delete this dataset?")) {
      try {
        await datasetApi.delete(id);
        setDatasets((prev) => prev.filter((d) => d.id !== id));
        if (selectedDataset?.id === id) {
          setSelectedDataset(null);
        }
      } catch (err) {
        alert("Failed to delete dataset");
      }
    }
  };

  const toggleTheme = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    setTheme(newTheme);
    const body = document.body;
    if (newTheme === "light") {
      body.classList.add("light");
    } else {
      body.classList.remove("light");
    }
  };

  const renderContent = () => {
    switch (currentTab) {
      case "dashboard":
        return (
          <Dashboard
            datasets={datasets}
            selectedDataset={selectedDataset}
            onSelectDataset={setSelectedDataset}
            onDeleteDataset={handleDeleteDataset}
            setCurrentTab={setCurrentTab}
          />
        );
      case "upload":
        return <UploadPage onUploadSuccess={handleUploadSuccess} />;
      case "profiling":
        return (
          <ProfilerPage
            selectedDataset={selectedDataset}
            onProfileComplete={(updatedDataset) => {
              setSelectedDataset(updatedDataset);
              setDatasets((prev) =>
                prev.map((d) => (d.id === updatedDataset.id ? updatedDataset : d))
              );
            }}
          />
        );
      case "cleaning":
        return (
          <CleaningPage
            selectedDataset={selectedDataset}
            onCleanSuccess={(newDataset) => {
              setDatasets((prev) => [newDataset, ...prev]);
              setSelectedDataset(newDataset);
              setCurrentTab("dashboard");
            }}
            setCurrentTab={setCurrentTab}
          />
        );
      case "eda":
        return (
          <EdaPage
            selectedDataset={selectedDataset}
            setCurrentTab={setCurrentTab}
          />
        );
      case "models":
        return (
          <ModelsPage
            selectedDataset={selectedDataset}
            setCurrentTab={setCurrentTab}
          />
        );
      case "reports":
        return (
          <ReportsPage
            selectedDataset={selectedDataset}
          />
        );
      case "chat":
        return (
          <ChatPage
            selectedDataset={selectedDataset}
          />
        );
      case "rag":
        return (
          <RagPage />
        );
      case "collaboration":
        return (
          <CollaborationPage
            selectedDataset={selectedDataset}
            setCurrentTab={setCurrentTab}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header 
          selectedDataset={selectedDataset} 
          theme={theme} 
          toggleTheme={toggleTheme} 
        />

        {/* Content Wrapper */}
        <main className="flex-1 overflow-y-auto bg-background/25">
          {loading && currentTab === "dashboard" ? (
            <div className="h-full flex items-center justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-primary"></div>
            </div>
          ) : (
            renderContent()
          )}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MainLayout />
    </QueryClientProvider>
  );
}
