"""
config.py — Application settings loaded from .env
"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Gemini
    gemini_api_key: str = ""

    # MySQL
    mysql_host: str = "127.0.0.1"
    mysql_port: int = 3306
    mysql_root_password: str = "localdev_secure_pass_123"
    mysql_database: str = "interviewos"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # Frontend URLs (used for CORS)
    next_public_api_url: str = "http://localhost:3000"

    @property
    def async_db_url(self) -> str:
        return (
            f"mysql+aiomysql://root:{self.mysql_root_password}"
            f"@{self.mysql_host}:{self.mysql_port}/{self.mysql_database}"
            "?charset=utf8mb4"
        )


settings = Settings()
