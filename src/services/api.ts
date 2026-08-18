import axios from "axios";

const API_BASE_URL = import.meta.env.VITE_API_URL || (
  typeof window !== "undefined" && window.location.port !== "5173"
    ? "/api/v1"
    : "http://127.0.0.1:8000/api/v1"
);

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface Dataset {
  id: string;
  name: string;
  file_size: number;
  file_type: string;
  row_count: number | null;
  column_count: number | null;
  status: "uploaded" | "processing" | "profiled" | "failed";
  created_at: string;
  updated_at: string;
}

export const datasetApi = {
  list: async (): Promise<Dataset[]> => {
    const response = await api.get<Dataset[]>("/datasets/");
    return response.data;
  },
  
  upload: async (file: File, onUploadProgress?: (progressEvent: any) => void): Promise<Dataset> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<Dataset>("/datasets/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress,
    });
    return response.data;
  },
  
  delete: async (id: string): Promise<{ message: string; id: string }> => {
    const response = await api.delete<{ message: string; id: string }>(`/datasets/${id}`);
    return response.data;
  },

  clean: async (id: string, operations: any): Promise<Dataset> => {
    const response = await api.post<Dataset>(`/datasets/${id}/clean`, operations);
    return response.data;
  },

  getCorrelation: async (id: string): Promise<CorrelationData> => {
    const response = await api.get<CorrelationData>(`/datasets/${id}/eda/correlation`);
    return response.data;
  },

  describeColumn: async (id: string, column: string): Promise<DescribeColumnData> => {
    const response = await api.get<DescribeColumnData>(`/datasets/${id}/eda/describe/${column}`);
    return response.data;
  },

  getColumnsData: async (id: string, cols: string): Promise<any[]> => {
    const response = await api.get<any[]>(`/datasets/${id}/eda/columns-data?cols=${cols}`);
    return response.data;
  },

  getReport: async (id: string): Promise<ReportData> => {
    const response = await api.get<ReportData>(`/datasets/${id}/report`);
    return response.data;
  },

  chatWithDataset: async (id: string, message: string): Promise<ChatResponse> => {
    const response = await api.post<ChatResponse>(`/datasets/${id}/chat`, { message });
    return response.data;
  },

  runCollaboration: async (id: string, payload: CollaborationRequest): Promise<CollaborationResponse> => {
    const response = await api.post<CollaborationResponse>(`/datasets/${id}/collaborate`, payload);
    return response.data;
  },
};

export interface CollaborationRequest {
  target_column: string;
  feature_columns: string[];
  algorithm: string;
  doc_id?: string;
}

export interface AgentLog {
  agent: string;
  status: string;
  message: string;
  timestamp: string;
}

export interface CollaborationResponse {
  logs: AgentLog[];
  report: string;
}

export interface ChatResponse {
  response: string;
  suggested_prompts: string[];
}

export interface ReportData {
  dataset: Dataset;
  profile: Profile;
  correlations: CorrelationData;
  quality_alerts: string[];
  recommendations: string[];
}

export interface CorrelationData {
  columns: string[];
  matrix: number[][];
}

export interface BinDetail {
  bin_start: number;
  bin_end: number;
  count: number;
}

export interface DescribeColumnData {
  column: string;
  type: "numeric" | "categorical";
  skew?: number;
  kurtosis?: number;
  is_normal?: boolean;
  bins: BinDetail[];
  frequencies: [string, number][];
}

export interface ColumnMetadata {
  name: string;
  type: "numeric" | "categorical" | "datetime" | "boolean";
  cardinality: number;
  missing_count: number;
  missing_pct: number;
  stats: Record<string, any>;
}

export interface Profile {
  id: string;
  dataset_id: string;
  row_count: number;
  column_count: number;
  duplicate_rows: number;
  missing_cells: number;
  memory_usage_bytes: number;
  columns_metadata: ColumnMetadata[];
  created_at: string;
}

export const profileApi = {
  get: async (datasetId: string): Promise<Profile> => {
    const response = await api.get<Profile>(`/datasets/${datasetId}/profile`);
    return response.data;
  },
  
  generate: async (datasetId: string): Promise<Profile> => {
    const response = await api.post<Profile>(`/datasets/${datasetId}/profile`);
    return response.data;
  },
};

export interface TrainRequest {
  dataset_id: string;
  target_column: string;
  feature_columns: string[];
  algorithm: string;
}

export interface MlModel {
  id: string;
  dataset_id: string;
  name: string;
  task_type: "regression" | "classification";
  target_column: string;
  features: string[];
  algorithm: string;
  metrics: Record<string, number>;
  feature_importances: Record<string, number>;
  test_predictions: { actual: number | string; prediction: number | string }[];
  created_at: string;
}

export const mlApi = {
  train: async (payload: TrainRequest): Promise<MlModel> => {
    const response = await api.post<MlModel>("/models/train", payload);
    return response.data;
  },

  listForDataset: async (datasetId: string): Promise<MlModel[]> => {
    const response = await api.get<MlModel[]>(`/models/dataset/${datasetId}`);
    return response.data;
  },

  delete: async (id: string): Promise<{ message: string; id: string }> => {
    const response = await api.delete<{ message: string; id: string }>(`/models/${id}`);
    return response.data;
  },
};

export interface DocumentResponse {
  id: string;
  name: string;
  file_size: number;
  chunks: string[];
  created_at: string;
}

export interface SourceExcerpt {
  chunk_index: number;
  text: string;
  score: number;
}

export interface QueryResponse {
  answer: string;
  sources: SourceExcerpt[];
}

export const documentApi = {
  upload: async (file: File): Promise<DocumentResponse> => {
    const formData = new FormData();
    formData.append("file", file);
    const response = await api.post<DocumentResponse>("/documents/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    return response.data;
  },

  list: async (): Promise<DocumentResponse[]> => {
    const response = await api.get<DocumentResponse[]>("/documents");
    return response.data;
  },

  query: async (docId: string, query: string): Promise<QueryResponse> => {
    const response = await api.post<QueryResponse>(`/documents/${docId}/query`, { query });
    return response.data;
  },

  delete: async (id: string): Promise<{ message: string; id: string }> => {
    const response = await api.delete<{ message: string; id: string }>(`/documents/${id}`);
    return response.data;
  },
};
