import os
import shutil
import uuid
import pandas as pd
from fastapi import UploadFile
from app.core.config import settings

class StorageService:
    def __init__(self, upload_dir: str = settings.UPLOAD_DIR):
        self.upload_dir = upload_dir
        os.makedirs(self.upload_dir, exist_ok=True)

    def save_file(self, file: UploadFile) -> tuple[str, str, int, str]:
        """
        Saves the uploaded file to disk and returns (filename, filepath, filesize, extension)
        """
        original_name = file.filename
        extension = os.path.splitext(original_name)[1].lower().replace(".", "")
        if extension not in ["csv", "xlsx", "xls", "json"]:
            raise ValueError("Unsupported file format. Only CSV, Excel, and JSON are supported.")

        unique_id = uuid.uuid4().hex
        filename = f"{unique_id}_{original_name}"
        filepath = os.path.join(self.upload_dir, filename)

        # Save to disk
        with open(filepath, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        filesize = os.path.getsize(filepath)
        return original_name, filepath, filesize, extension

    def delete_file(self, filepath: str) -> bool:
        """
        Deletes the file from disk if it exists.
        """
        if os.path.exists(filepath):
            try:
                os.remove(filepath)
                return True
            except OSError:
                return False
        return False

    def get_dataset_dimensions(self, filepath: str, file_type: str) -> tuple[int, int]:
        """
        Parses the dataset to return (row_count, column_count) using Pandas.
        """
        try:
            if file_type == "csv":
                df = pd.read_csv(filepath)
            elif file_type in ["xlsx", "xls"]:
                df = pd.read_excel(filepath)
            elif file_type == "json":
                df = pd.read_json(filepath)
            else:
                return 0, 0
            
            return int(df.shape[0]), int(df.shape[1])
        except Exception as e:
            # Fallback or log error
            print(f"Error calculating dimensions: {e}")
            return 0, 0

storage_service = StorageService()
