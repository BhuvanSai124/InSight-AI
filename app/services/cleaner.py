import pandas as pd
import numpy as np
from app.schemas.dataset import CleanRequest

class CleanerService:
    def clean_dataset(self, src_filepath: str, file_type: str, dest_filepath: str, operations: CleanRequest) -> tuple[int, int]:
        """
        Loads the dataset, applies sequenced cleaning operations, 
        and saves the output to dest_filepath.
        Returns (row_count, column_count) of the cleaned dataset.
        """
        try:
            if file_type == "csv":
                df = pd.read_csv(src_filepath)
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(src_filepath)
            elif file_type == "json":
                df = pd.read_json(src_filepath)
            else:
                raise ValueError(f"Unsupported file format: {file_type}")
        except Exception as e:
            raise ValueError(f"Failed to read file for cleaning: {str(e)}")

        # 1. Remove Duplicates
        if operations.remove_duplicates:
            df = df.drop_duplicates()

        # 2. Impute Missing Values
        for op in operations.impute_missing:
            col = op.column
            strategy = op.strategy
            if col not in df.columns:
                continue

            if strategy == "drop":
                df = df.dropna(subset=[col])
            else:
                if df[col].isnull().sum() == 0:
                    continue
                
                # Numeric strategies
                if strategy == "mean" and pd.api.types.is_numeric_dtype(df[col]):
                    fill_val = df[col].mean()
                    df[col] = df[col].fillna(fill_val)
                elif strategy == "median" and pd.api.types.is_numeric_dtype(df[col]):
                    fill_val = df[col].median()
                    df[col] = df[col].fillna(fill_val)
                elif strategy == "mode":
                    mode_series = df[col].mode()
                    if not mode_series.empty:
                        fill_val = mode_series[0]
                        df[col] = df[col].fillna(fill_val)

        # 3. Handle Outliers (IQR Method)
        for op in operations.handle_outliers:
            col = op.column
            if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
                continue
            
            q1 = df[col].quantile(0.25)
            q3 = df[col].quantile(0.75)
            iqr = q3 - q1
            lower_bound = q1 - 1.5 * iqr
            upper_bound = q3 + 1.5 * iqr
            
            df = df[(df[col] >= lower_bound) & (df[col] <= upper_bound)]

        # 4. Feature Scaling
        for op in operations.scaling:
            col = op.column
            method = op.method
            if col not in df.columns or not pd.api.types.is_numeric_dtype(df[col]):
                continue

            col_min = df[col].min()
            col_max = df[col].max()
            col_mean = df[col].mean()
            col_std = df[col].std()

            if method == "minmax":
                diff = col_max - col_min
                if diff > 0:
                    df[col] = (df[col] - col_min) / diff
                else:
                    df[col] = 0.0
            elif method == "standard":
                if col_std > 0:
                    df[col] = (df[col] - col_mean) / col_std
                else:
                    df[col] = 0.0

        # 5. Categorical Encoding
        for op in operations.encoding:
            col = op.column
            method = op.method
            if col not in df.columns:
                continue

            if method == "onehot":
                # pd.get_dummies converts column to multiple columns
                # We force integer datatype (0 or 1) for the dummy columns
                df = pd.get_dummies(df, columns=[col], prefix=[col], dtype=int)
            elif method == "label":
                # factorize encodes values as integers starting from 0
                df[col] = pd.factorize(df[col])[0]

        # Save result to dest_filepath
        try:
            if file_type == "csv":
                df.to_csv(dest_filepath, index=False)
            elif file_type in ["xlsx", "xls"]:
                df.to_excel(dest_filepath, index=False)
            elif file_type == "json":
                df.to_json(dest_filepath, orient="records", date_format="iso")
        except Exception as e:
            raise ValueError(f"Failed to save cleaned file: {str(e)}")

        return int(df.shape[0]), int(df.shape[1])

cleaner_service = CleanerService()
