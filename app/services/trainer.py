import os
import pickle
import uuid
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, List

# Scikit-learn imports
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression, LogisticRegression
from sklearn.tree import DecisionTreeRegressor, DecisionTreeClassifier
from sklearn.ensemble import RandomForestRegressor, RandomForestClassifier
from sklearn import metrics as sklearn_metrics

from app.core.config import settings

class TrainerService:
    def train_model(
        self, 
        filepath: str, 
        file_type: str, 
        target_col: str, 
        feature_cols: List[str], 
        algorithm: str
    ) -> Dict[str, Any]:
        """
        Loads dataset, preprocesses features/target, trains selected algorithm,
        computes evaluation diagnostics, serializes model artifact to disk, 
        and returns details ready for DB storage.
        """
        # Load dataset
        try:
            if file_type == "csv":
                df = pd.read_csv(filepath)
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(filepath)
            elif file_type == "json":
                df = pd.read_json(filepath)
            else:
                raise ValueError("Unsupported file type")
        except Exception as e:
            raise ValueError(f"Failed to read dataset file: {str(e)}")

        # Check columns existence
        all_cols = feature_cols + [target_col]
        for col in all_cols:
            if col not in df.columns:
                raise ValueError(f"Column '{col}' not found in dataset.")

        # Drop rows with nulls in features or target
        cleaned_df = df[all_cols].dropna()
        if cleaned_df.empty:
            raise ValueError("No valid records remain after dropping null values in selected target/features.")

        X = cleaned_df[feature_cols]
        y = cleaned_df[target_col]

        # Audit features are numeric (LogisticRegression/RandomForest requires numeric features)
        for col in feature_cols:
            if not pd.api.types.is_numeric_dtype(X[col]):
                raise ValueError(f"Feature column '{col}' is non-numeric. Please encode it in the Clean Data workspace first.")

        # Determine task type
        # Classification if target is non-numeric or low cardinality (<= 10 values)
        is_numeric_target = pd.api.types.is_numeric_dtype(y)
        cardinality = y.nunique()
        
        if not is_numeric_target or cardinality <= 10:
            task_type = "classification"
            # Ensure classification targets are encoded as strings/ints
            y = y.astype(str)
        else:
            task_type = "regression"
            y = y.astype(float)

        # Train-Test Split (80/20 split)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Instantiate model based on algorithm and task
        model_name = ""
        if task_type == "regression":
            if algorithm == "linear_regression":
                model = LinearRegression()
                model_name = "Linear Regression"
            elif algorithm == "decision_tree":
                model = DecisionTreeRegressor(max_depth=5, random_state=42)
                model_name = "Decision Tree Regressor"
            elif algorithm == "random_forest":
                model = RandomForestRegressor(n_estimators=50, random_state=42)
                model_name = "Random Forest Regressor"
            else:
                raise ValueError(f"Unsupported regression algorithm: {algorithm}")
        else: # classification
            if algorithm == "logistic_regression":
                model = LogisticRegression(max_iter=1000, random_state=42)
                model_name = "Logistic Regression"
            elif algorithm == "decision_tree":
                model = DecisionTreeClassifier(max_depth=5, random_state=42)
                model_name = "Decision Tree Classifier"
            elif algorithm == "random_forest":
                model = RandomForestClassifier(n_estimators=50, random_state=42)
                model_name = "Random Forest Classifier"
            else:
                raise ValueError(f"Unsupported classification algorithm: {algorithm}")

        # Fit model
        try:
            model.fit(X_train, y_train)
        except Exception as e:
            raise ValueError(f"Model fitting failed: {str(e)}")

        # Run predictions
        y_pred = model.predict(X_test)

        # Evaluate performance metrics
        eval_metrics = {}
        if task_type == "regression":
            r2 = float(sklearn_metrics.r2_score(y_test, y_pred))
            mae = float(sklearn_metrics.mean_absolute_error(y_test, y_pred))
            rmse = float(np.sqrt(sklearn_metrics.mean_squared_error(y_test, y_pred)))
            eval_metrics = {
                "r2": r2 if not np.isnan(r2) else 0.0,
                "mae": mae,
                "rmse": rmse
            }
        else: # classification
            # Compute classification scores
            acc = float(sklearn_metrics.accuracy_score(y_test, y_pred))
            # Handle precision, recall, f1 with macro average
            prec = float(sklearn_metrics.precision_score(y_test, y_pred, average="macro", zero_division=0))
            rec = float(sklearn_metrics.recall_score(y_test, y_pred, average="macro", zero_division=0))
            f1 = float(sklearn_metrics.f1_score(y_test, y_pred, average="macro", zero_division=0))
            eval_metrics = {
                "accuracy": acc,
                "precision": prec,
                "recall": rec,
                "f1_score": f1
            }

        # Calculate Feature Importances (weights normalized to 1.0)
        importances_dict = {}
        try:
            if hasattr(model, "feature_importances_"):
                importances = model.feature_importances_
            elif hasattr(model, "coef_"):
                # Use absolute value of coefficients
                if task_type == "classification" and len(model.coef_) > 1:
                    # Multi-class coefficients: take mean absolute coefficients across classes
                    importances = np.mean(np.abs(model.coef_), axis=0)
                else:
                    importances = np.abs(model.coef_.flatten())
            else:
                importances = np.ones(len(feature_cols)) / len(feature_cols)

            # Normalize weights
            sum_imp = np.sum(importances)
            if sum_imp > 0:
                importances = importances / sum_imp
            
            for col, imp in zip(feature_cols, importances):
                importances_dict[col] = float(imp)
        except Exception:
            # Fallback uniform weights
            for col in feature_cols:
                importances_dict[col] = 1.0 / len(feature_cols)

        # Generate predictions vs actual coordinates for evaluation plotting (max first 150 test rows)
        plot_limit = min(150, len(y_test))
        test_predictions = []
        
        # Helper: convert target type to float for plotting if regression, or keep as categories
        y_test_array = y_test.values
        for i in range(plot_limit):
            actual_val = y_test_array[i]
            pred_val = y_pred[i]
            
            # Serialize cleanly
            test_predictions.append({
                "actual": float(actual_val) if task_type == "regression" else str(actual_val),
                "prediction": float(pred_val) if task_type == "regression" else str(pred_val)
            })

        # Save model pickle artifact
        model_dir = os.path.join(settings.UPLOAD_DIR, "models")
        os.makedirs(model_dir, exist_ok=True)
        
        unique_model_id = uuid.uuid4().hex
        filename = f"{unique_model_id}.pkl"
        model_filepath = os.path.join(model_dir, filename)

        try:
            with open(model_filepath, "wb") as f:
                pickle.dump(model, f)
        except Exception as e:
            raise ValueError(f"Failed to serialize model artifact: {str(e)}")

        return {
            "name": model_name,
            "task_type": task_type,
            "features": json.dumps(feature_cols),
            "metrics": json.dumps(eval_metrics),
            "feature_importances": json.dumps(importances_dict),
            "file_path": model_filepath,
            "test_predictions": json.dumps(test_predictions)
        }

trainer_service = TrainerService()
