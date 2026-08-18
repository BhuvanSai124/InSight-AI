import pandas as pd
import numpy as np
import json
from typing import Dict, Any

class ProfilerService:
    def _clean_val(self, val: Any) -> Any:
        """
        Converts numpy/pandas nan or infinite values to None for JSON serialization.
        """
        if pd.isna(val) or (isinstance(val, float) and (np.isnan(val) or np.isinf(val))):
            return None
        if isinstance(val, (np.integer, np.int64)):
            return int(val)
        if isinstance(val, (np.floating, np.float64)):
            return float(val)
        if isinstance(val, (pd.Timestamp, np.datetime64)):
            return str(val)
        return val

    def profile_dataset(self, filepath: str, file_type: str) -> Dict[str, Any]:
        """
        Loads the dataset and computes profiling statistics.
        Returns a dictionary ready for DB storage.
        """
        try:
            if file_type == "csv":
                df = pd.read_csv(filepath)
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(filepath)
            elif file_type == "json":
                df = pd.read_json(filepath)
            else:
                raise ValueError(f"Unsupported file format: {file_type}")
        except Exception as e:
            raise ValueError(f"Failed to read file: {str(e)}")

        row_count = int(df.shape[0])
        column_count = int(df.shape[1])
        duplicate_rows = int(df.duplicated().sum())
        missing_cells = int(df.isnull().sum().sum())
        
        # Calculate memory usage
        try:
            memory_usage_bytes = int(df.memory_usage(deep=True).sum())
        except Exception:
            memory_usage_bytes = int(df.memory_usage().sum())

        columns_data = []

        for col in df.columns:
            series = df[col]
            cardinality = int(series.nunique(dropna=True))
            missing_count = int(series.isnull().sum())
            missing_pct = float(missing_count / row_count * 100) if row_count > 0 else 0.0

            # Determine column data type
            col_type = "categorical"
            stats = {}

            if pd.api.types.is_numeric_dtype(series):
                unique_set = set(series.dropna().unique())
                is_binary = unique_set.issubset({0, 1, 0.0, 1.0, True, False, "True", "False"})
                if series.dtype == "bool" or (cardinality <= 2 and is_binary):
                    col_type = "boolean"
                    # Boolean frequencies
                    top_vals = series.value_counts(dropna=True).head(2)
                    stats["top_values"] = [[self._clean_val(k), int(v)] for k, v in top_vals.items()]
                else:
                    col_type = "numeric"
                    # Numeric statistics
                    stats = {
                        "mean": self._clean_val(series.mean()),
                        "std": self._clean_val(series.std()),
                        "min": self._clean_val(series.min()),
                        "max": self._clean_val(series.max()),
                        "median": self._clean_val(series.median()),
                        "25%": self._clean_val(series.quantile(0.25)),
                        "75%": self._clean_val(series.quantile(0.75)),
                    }
            elif pd.api.types.is_datetime64_any_dtype(series) or "date" in col.lower():
                # Try parsing as datetime if string representation matches date terms
                try:
                    dt_series = pd.to_datetime(series, errors="raise")
                    col_type = "datetime"
                    stats = {
                        "min": self._clean_val(dt_series.min()),
                        "max": self._clean_val(dt_series.max())
                    }
                except Exception:
                    # Fallback to categorical
                    col_type = "categorical"

            if col_type == "categorical":
                # Categorical frequencies
                top_vals = series.value_counts(dropna=True).head(5)
                stats["top_values"] = [[self._clean_val(k), int(v)] for k, v in top_vals.items()]

            columns_data.append({
                "name": str(col),
                "type": col_type,
                "cardinality": cardinality,
                "missing_count": missing_count,
                "missing_pct": missing_pct,
                "stats": stats
            })

        return {
            "row_count": row_count,
            "column_count": column_count,
            "duplicate_rows": duplicate_rows,
            "missing_cells": missing_cells,
            "memory_usage_bytes": memory_usage_bytes,
            "columns_metadata": json.dumps(columns_data)
        }

profiler_service = ProfilerService()
