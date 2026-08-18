import re
import pickle
import os
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List, Tuple
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.ml_model import MlModel
from app.models.profile import Profile

class ChatEngineService:
    def process_query(self, message: str, dataset: Dataset, db: Session) -> Tuple[str, List[str]]:
        """
        Parses user questions about the active dataset, calculates descriptive statistics,
        audits completeness, or runs model predictions. Returns a tuple: (markdown_text, suggested_prompts).
        """
        msg = message.lower().strip()

        # Load dataset dataframe
        try:
            if dataset.file_type == "csv":
                df = pd.read_csv(dataset.file_path)
            elif dataset.file_type in ["xlsx", "xls"]:
                df = pd.read_excel(dataset.file_path)
            elif dataset.file_type == "json":
                df = pd.read_json(dataset.file_path)
            else:
                raise ValueError("Unsupported file type")
        except Exception as e:
            return (
                f"⚠️ Failed to read the dataset file: {str(e)}",
                ["Verify dataset status", "Show summary"]
            )

        # 1. PREDICTION / RUN MODEL
        if any(keyword in msg for keyword in ["predict", "infer", "run model", "estimate", "inference"]):
            return self._handle_prediction(msg, dataset, df, db)

        # 2. COLUMN DESCRIPTIVE STATISTICS
        # Matches: "average of fare", "mean of age", "median of income", "max of fare", "min of fare", "std of fare"
        stat_match = re.search(r"(mean|average|median|max|min|std|standard deviation)\s+(?:of|for)\s+([a-zA-Z0-9_\-\s\(\)]+)", msg)
        if stat_match:
            stat_type = stat_match.group(1)
            col_query = stat_match.group(2).strip()
            
            # Find closest matching column name in df (case-insensitive)
            matched_col = self._find_column(col_query, list(df.columns))
            if matched_col:
                return self._compute_stat(df, matched_col, stat_type)

        # 3. DIMENSIONS / DATASET SHAPE
        if any(keyword in msg for keyword in ["rows", "columns", "shape", "size", "dimension"]):
            rows, cols = df.shape
            response = (
                f"📊 **Dataset Dimensions**\n\n"
                f"- Total Rows: **{rows:,}**\n"
                f"- Total Columns: **{cols}**\n"
                f"- Data Cells: **{rows * cols:,}**"
            )
            return response, ["Show missing values list", "What is the average of age?"]

        # 4. MISSING VALUES / COMPLETENESS
        if any(keyword in msg for keyword in ["null", "missing", "incomplete", "nan", "completeness"]):
            missing = df.isnull().sum()
            missing_cols = missing[missing > 0]
            if missing_cols.empty:
                response = "✅ **Data Completeness Audit**\n\nNo missing values found! The dataset is 100% complete."
            else:
                response = "⚠️ **Missing Values Audit**\n\nHere are the columns containing missing cells:\n\n"
                for col, count in missing_cols.items():
                    pct = (count / len(df)) * 100
                    response += f"- **{col}**: {count:,} missing values ({pct:.1f}%)\n"
            return response, ["What is the dataset shape?", "Show top columns correlation"]

        # 5. CORRELATION INQUIRIES
        if any(keyword in msg for keyword in ["correlation", "correlate", "relationship"]):
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) < 2:
                return "This dataset has fewer than 2 numeric columns, so correlations cannot be calculated.", []
            corr = df[numeric_cols].corr(method="pearson").fillna(0)
            
            # Find top correlations (excluding self-correlation)
            corr_pairs = []
            for i in range(len(corr.columns)):
                for j in range(i + 1, len(corr.columns)):
                    col1 = corr.columns[i]
                    col2 = corr.columns[j]
                    val = corr.iloc[i, j]
                    corr_pairs.append((col1, col2, val))
            
            corr_pairs.sort(key=lambda x: abs(x[2]), reverse=True)
            response = "📈 **Top Numerical Relationships (Pearson r)**\n\n"
            for col1, col2, val in corr_pairs[:5]:
                sign = "Positive" if val > 0 else "Negative"
                response += f"- **{col1}** & **{col2}**: `{val:.3f}` ({sign} interaction)\n"
            return response, ["What is the dataset shape?", "List missing values"]

        # 6. DEFAULT FALLBACK / GREETING
        first_numeric = df.select_dtypes(include=[np.number]).columns[0] if len(df.select_dtypes(include=[np.number]).columns) > 0 else "column"
        response = (
            f"👋 **Hello! I am your Conversational Data Analyst.**\n\n"
            f"I can help you explore and predict using **{dataset.name}**. Here are some questions you can ask me:\n\n"
            f"1. **Descriptive Stats**: `What is the average of {first_numeric}?` or `Find max of {first_numeric}`\n"
            f"2. **Audits**: `Show missing values` or `What is the dataset shape?`\n"
            f"3. **Relationships**: `Show top correlations`\n"
            f"4. **Predictions (AutoML)**: If you've trained a model in AutoML, type:\n"
            f"   `predict target for feature_1=val_1, feature_2=val_2`"
        )
        return response, [
            f"What is the average of {first_numeric}?",
            "What is the dataset shape?",
            "Show missing values"
        ]

    def _find_column(self, query: str, columns: List[str]) -> str | None:
        """Helper to find matching column case-insensitively."""
        q = query.lower().strip()
        for col in columns:
            if col.lower() == q:
                return col
        # If not exact match, try substring match
        for col in columns:
            if col.lower() in q or q in col.lower():
                return col
        return None

    def _compute_stat(self, df: pd.DataFrame, col: str, stat_type: str) -> Tuple[str, List[str]]:
        """Computes summary stat for a column."""
        series = df[col]
        is_numeric = pd.api.types.is_numeric_dtype(series)

        if not is_numeric and stat_type not in ["count", "cardinality"]:
            return (
                f"❌ Column **{col}** is categorical. I cannot compute **{stat_type}** for string values.",
                ["Show missing values", "What is the dataset shape?"]
            )

        if stat_type in ["mean", "average"]:
            val = float(series.mean())
            response = f"📊 The **average** of **{col}** is **{val:,.2f}**."
        elif stat_type == "median":
            val = float(series.median())
            response = f"📊 The **median** of **{col}** is **{val:,.2f}**."
        elif stat_type == "max":
            val = series.max()
            response = f"📊 The **maximum** value of **{col}** is **{val:,.2f}**." if is_numeric else f"📊 The **maximum** value of **{col}** is **{val}**."
        elif stat_type == "min":
            val = series.min()
            response = f"📊 The **minimum** value of **{col}** is **{val:,.2f}**." if is_numeric else f"📊 The **minimum** value of **{col}** is **{val}**."
        elif stat_type in ["std", "standard deviation"]:
            val = float(series.std())
            response = f"📊 The **standard deviation** of **{col}** is **{val:,.2f}**."
        else:
            response = f"📊 Count of **{col}** is **{len(series):,}**."

        return response, [f"What is the average of {col}?", "Show dataset shape"]

    def _handle_prediction(self, msg: str, dataset: Dataset, df: pd.DataFrame, db: Session) -> Tuple[str, List[str]]:
        """Loads latest trained model for the dataset and runs prediction based on query attributes."""
        # Find latest model
        model = db.query(MlModel).filter(MlModel.dataset_id == dataset.id).order_by(MlModel.created_at.desc()).first()
        if not model:
            return (
                f"❌ **No trained models found for this dataset!**\n\n"
                f"Please head to the **AutoML & Models** workspace to train a model first, then you can query predictive inferences here.",
                ["Go to AutoML Configurator"]
            )

        # Parse feature columns
        feature_cols = json.loads(model.features)
        target_col = model.target_column

        # Parse key-value feature pairs from query: e.g. age=30, fare=100
        # Matches: name = number or name: number or name is number
        matches = re.findall(r"([a-zA-Z0-9_\-\s]+)\s*(?:=|\:|is)\s*([-\d\.]+)", msg)
        parsed_inputs = {}
        for key, val in matches:
            clean_key = key.strip()
            # Resolve to nearest feature column name
            matched_feature = self._find_column(clean_key, feature_cols)
            if matched_feature:
                try:
                    parsed_inputs[matched_feature] = float(val.strip())
                except ValueError:
                    pass

        # Check for missing feature inputs
        missing_features = [f for f in feature_cols if f not in parsed_inputs]
        if missing_features:
            # For missing features, let's load defaults from Profile stats or DF means
            # If we can't load defaults, warn the user
            response = (
                f"🤖 **AutoML Predictor: Inputs Required**\n\n"
                f"I detected the model **{model.name}** predicting **{target_col}**.\n"
                f"Please provide values for all features. The following parameters are missing:\n\n"
            )
            for f in missing_features:
                response += f"- `{f}`\n"
            response += f"\n**Example query format**:\n`predict {target_col} for "
            response += ", ".join([f"{f}=10" for f in feature_cols]) + "`"
            return response, []

        # Load pickled estimator
        if not os.path.exists(model.file_path):
            return (
                f"❌ Model artifact file not found on disk: `{model.file_path}`. Please retrain in AutoML.",
                []
            )

        try:
            with open(model.file_path, "rb") as f:
                estimator = pickle.load(f)
        except Exception as e:
            return f"❌ Failed to load serialized model: {str(e)}", []

        # Form feature dataframe row for inference (must follow same columns order!)
        input_data = {col: [parsed_inputs[col]] for col in feature_cols}
        input_df = pd.DataFrame(input_data)

        # Run prediction
        try:
            pred_outcome = estimator.predict(input_df)[0]
        except Exception as e:
            return f"❌ Model inference failed: {str(e)}", []

        # Format predicted output
        if model.task_type == "regression":
            response = (
                f"🎯 **ML Predictor Result**\n\n"
                f"- Model: **{model.name}**\n"
                f"- Target Variable: **{target_col}**\n"
                f"- Features input: " + ", ".join([f"`{k}`: **{v}**" for k, v in parsed_inputs.items()]) + "\n\n"
                f"🔮 Predicted Value: **{float(pred_outcome):,.4f}**"
            )
        else:
            response = (
                f"🎯 **ML Predictor Result**\n\n"
                f"- Model: **{model.name}**\n"
                f"- Target Variable: **{target_col}**\n"
                f"- Features input: " + ", ".join([f"`{k}`: **{v}**" for k, v in parsed_inputs.items()]) + "\n\n"
                f"🔮 Predicted Classification Class: **{str(pred_outcome)}**"
            )

        return response, [f"What is the average of {feature_cols[0]}?", "Show dataset shape"]

chat_engine_service = ChatEngineService()
