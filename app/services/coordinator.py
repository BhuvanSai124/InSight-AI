import json
import time
from datetime import datetime
from typing import List, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.models.dataset import Dataset
from app.models.profile import Profile
from app.models.document import Document
from app.services.trainer import trainer_service
from app.services.rag_engine import rag_engine_service

class CoordinatorService:
    def execute_workflow(
        self,
        dataset: Dataset,
        target_column: str,
        feature_columns: List[str],
        algorithm: str,
        doc_id: str | None,
        db: Session
    ) -> Tuple[List[Dict[str, str]], str]:
        """
        Runs a sequential coordination of Auditor, Transformation, AutoML,
        Knowledge, and Executive Writer agents. Returns list of execution logs
        and a consolidated Markdown master report.
        """
        logs = []
        
        def log_step(agent: str, status: str, message: str):
            logs.append({
                "agent": agent,
                "status": status,
                "message": message,
                "timestamp": datetime.now().strftime("%H:%M:%S")
            })

        # ----------------------------------------------------
        # 1. DATA AUDITOR AGENT
        # ----------------------------------------------------
        agent_auditor = "Data Auditor Agent"
        log_step(agent_auditor, "running", f"Initiating structural audit on dataset: '{dataset.name}'")
        
        # Get or generate profile stats
        profile = db.query(Profile).filter(Profile.dataset_id == dataset.id).first()
        if not profile:
            from app.services.profiler import profiler_service
            try:
                stats = profiler_service.profile_dataset(dataset.file_path, dataset.file_type)
                profile = Profile(
                    dataset_id=dataset.id,
                    row_count=stats["row_count"],
                    column_count=stats["column_count"],
                    duplicate_rows=stats["duplicate_rows"],
                    missing_cells=stats["missing_cells"],
                    memory_usage_bytes=stats["memory_usage_bytes"],
                    columns_metadata=stats["columns_metadata"]
                )
                db.add(profile)
                db.commit()
                db.refresh(profile)
            except Exception as e:
                log_step(agent_auditor, "error", f"Audit failed during profiling: {str(e)}")
                return logs, f"Workflow failed during profiling: {str(e)}"

        log_step(agent_auditor, "info", f"Dataset profiled successfully. Rows: {profile.row_count}, Columns: {profile.column_count}")
        
        # Audit duplications & null cells
        quality_warnings = []
        if profile.duplicate_rows > 0:
            quality_warnings.append(f"Detected {profile.duplicate_rows} duplicate records.")
        if profile.missing_cells > 0:
            quality_warnings.append(f"Detected {profile.missing_cells} missing cells.")
        
        for warn in quality_warnings:
            log_step(agent_auditor, "warning", warn)
        
        log_step(agent_auditor, "done", "Structural data audit completed.")

        # ----------------------------------------------------
        # 2. TRANSFORMATION AGENT
        # ----------------------------------------------------
        agent_cleaner = "Transformation Agent"
        log_step(agent_cleaner, "running", "Evaluating dataset quality warnings for cleaning recipes...")
        
        recipes = []
        if profile.duplicate_rows > 0:
            recipes.append(f"Drop duplicate rows (count: {profile.duplicate_rows}) to avoid modeling bias.")
        
        cols_meta = json.loads(profile.columns_metadata)
        for col in cols_meta:
            name = col["name"]
            missing_count = col["missing_count"]
            col_type = col["type"]
            
            if missing_count > 0:
                sub_strategy = "median/mean" if col_type == "numeric" else "mode"
                recipes.append(f"Impute missing values in '{name}' ({missing_count} nulls) using {sub_strategy} strategy.")
                
            if col_type == "categorical":
                recipes.append(f"Apply label encoding or one-hot vectorization on string column '{name}'.")

        for recipe in recipes[:3]: # Log top 3 suggestions
            log_step(agent_cleaner, "info", f"Recommended: {recipe}")
            
        log_step(agent_cleaner, "done", "Data cleaning recipes formulated successfully.")

        # ----------------------------------------------------
        # 3. AUTO ML ENGINEER AGENT
        # ----------------------------------------------------
        agent_ml = "AutoML Engineer Agent"
        log_step(agent_ml, "running", f"Spawning trainer job for target '{target_column}' using algorithm '{algorithm}'")
        
        try:
            res = trainer_service.train_model(
                dataset.file_path,
                dataset.file_type,
                target_column,
                feature_columns,
                algorithm
            )
            
            # Save trained model to DB
            from app.models.ml_model import MlModel
            db_model = MlModel(
                dataset_id=dataset.id,
                name=res["name"],
                task_type=res["task_type"],
                target_column=target_column,
                features=res["features"],
                algorithm=algorithm,
                metrics=res["metrics"],
                feature_importances=res["feature_importances"],
                file_path=res["file_path"],
                test_predictions=res["test_predictions"]
            )
            db.add(db_model)
            db.commit()
            db.refresh(db_model)
            
            metrics = json.loads(res["metrics"])
            importances = json.loads(res["feature_importances"])
            
            log_step(agent_ml, "info", f"Model trained successfully. Algorithm: '{res['name']}', Task: '{res['task_type']}'")
            if res["task_type"] == "regression":
                log_step(agent_ml, "info", f"Validation Performance: R2 Score: {metrics.get('r2', 0.0):.3f}, RMSE: {metrics.get('rmse', 0.0):.2f}")
            else:
                log_step(agent_ml, "info", f"Validation Performance: Accuracy: {metrics.get('accuracy', 0.0) * 100:.1f}%, F1: {metrics.get('f1_score', 0.0):.3f}")
                
            top_feature = max(importances, key=importances.get) if importances else "None"
            if top_feature != "None":
                log_step(agent_ml, "info", f"Top feature weight: '{top_feature}' (Importance: {importances[top_feature] * 100:.1f}%)")
                
            log_step(agent_ml, "done", "Model training diagnostics captured.")
        except Exception as e:
            log_step(agent_ml, "error", f"Model training failed: {str(e)}")
            return logs, f"Workflow failed during model training: {str(e)}"

        # ----------------------------------------------------
        # 4. KNOWLEDGE RETRIEVAL AGENT
        # ----------------------------------------------------
        agent_rag = "Knowledge Retrieval Agent"
        rag_passages = []
        doc_name = "None"
        
        if doc_id:
            doc = db.query(Document).filter(Document.id == doc_id).first()
            if not doc:
                log_step(agent_rag, "warning", f"Reference document with ID '{doc_id}' not found. Skipping RAG search.")
            else:
                doc_name = doc.name
                log_step(agent_rag, "running", f"Scanning reference doc '{doc.name}' for ML algorithm constraints...")
                chunks = json.loads(doc.chunks)
                
                # Retrieve chunks matching the algorithm name (e.g. "Random Forest", "Linear Regression")
                matched = rag_engine_service.retrieve_chunks(algorithm.replace("_", " "), chunks, top_k=1)
                if matched and matched[0]["score"] > 0.0:
                    rag_passages.append(matched[0]["text"])
                    log_step(agent_rag, "info", f"Found matching passage with score {matched[0]['score'] * 100:.0f}%: '{matched[0]['text'][:80]}...'")
                else:
                    log_step(agent_rag, "info", "No exact matching algorithm definitions found. Scanning general parameters...")
                    matched_fallback = rag_engine_service.retrieve_chunks("data parameters modeling", chunks, top_k=1)
                    if matched_fallback:
                        rag_passages.append(matched_fallback[0]["text"])
                log_step(agent_rag, "done", "Knowledge base scan complete.")
        else:
            log_step(agent_rag, "info", "No document selected. Skipping knowledge base references search.")

        # ----------------------------------------------------
        # 5. EXECUTIVE SUMMARIZER AGENT
        # ----------------------------------------------------
        agent_writer = "Executive Summarizer"
        log_step(agent_writer, "running", "Coordinating agents outcomes and formatting consolidated report...")
        
        # Compile final Markdown report
        metrics_block = ""
        if res["task_type"] == "regression":
            metrics_block = (
                f"- **Model Algorithm**: `{res['name']}`\n"
                f"- **Primary Fit ($R^2$ Score)**: `{metrics.get('r2', 0.0):.4f}`\n"
                f"- **RMSE Error**: `{metrics.get('rmse', 0.0):.2f}`\n"
                f"- **MAE Error**: `{metrics.get('mae', 0.0):.2f}`"
            )
        else:
            metrics_block = (
                f"- **Model Algorithm**: `{res['name']}`\n"
                f"- **Classification Accuracy**: `{metrics.get('accuracy', 0.0) * 100:.1f}%`\n"
                f"- **Macro F1 Score**: `{metrics.get('f1_score', 0.0):.3f}`\n"
                f"- **Precision / Recall**: `{metrics.get('precision', 0.0):.3f} / {metrics.get('recall', 0.0):.3f}`"
            )

        importances_list = ""
        for feat, weight in sorted(importances.items(), key=lambda x: x[1], reverse=True)[:3]:
            importances_list += f"- **{feat}**: `{weight * 100:.1f}%` relative weight\n"

        rag_block = "No reference citations compiled."
        if rag_passages:
            rag_block = f"Excerpts retrieved from reference document **\"{doc_name}\"**:\n\n> {rag_passages[0]}"

        master_report = (
            f"# InsightAI Collaborative Analyst Report\n\n"
            f"**Execution Date**: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | **Target Column**: `{target_column}`\n\n"
            f"---\n\n"
            f"## 1. Structural Data Audit (Auditor Agent)\n\n"
            f"- **Dataset name**: `{dataset.name}`\n"
            f"- **Dimensions**: `{profile.row_count:,}` Rows x `{profile.column_count}` Columns\n"
            f"- **Fill Completeness Rate**: `{(1 - profile.missing_cells / (profile.row_count * profile.column_count)) * 100:.2f}%`\n"
            f"- **Duplicate Rows**: `{profile.duplicate_rows:,}`\n\n"
            f"### Quality Warnings:\n"
            + ("\n".join([f"- ⚠️ {w}" for w in quality_warnings]) if quality_warnings else "- ✅ Passed all data cleanliness audits.") + "\n\n"
            f"## 2. Recommended Cleaning Recipes (Transformation Agent)\n\n"
            + "\n".join([f"- `[x]` {rec}" for rec in recipes[:3]]) + "\n\n"
            f"## 3. AutoML Model Diagnostics (AutoML Agent)\n\n"
            f"{metrics_block}\n\n"
            f"### Top Feature Importances:\n"
            f"{importances_list}\n"
            f"## 4. Documentation References (Knowledge Agent)\n\n"
            f"{rag_block}\n\n"
            f"---\n"
            f"*Compiled automatically by the InsightAI Multi-Agent Coordinator.*"
        )
        
        log_step(agent_writer, "done", "Master report successfully written.")
        return logs, master_report

coordinator_service = CoordinatorService()
