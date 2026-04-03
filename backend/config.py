from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = "sqlite:///./pradnyachakshu.db"

    jwt_secret_key: str = "change-me-to-a-32-char-random-string-abc123"
    jwt_algorithm: str = "HS256"
    access_token_ttl_min: int = 60
    refresh_token_ttl_days: int = 7

    anthropic_api_key: str = ""
    llm_model: str = "claude-opus-4-5"
    llm_max_tokens: int = 2048
    llm_temperature: float = 0.2

    max_upload_mb: int = 50
    file_ttl_hours: int = 24
    upload_dir: str = "/tmp/pradnyachakshu"

    # Stored as comma-separated string in .env; use cors_origins_list property
    cors_origins_str: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.cors_origins_str.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        case_sensitive = False
        env_prefix = ""


settings = Settings()

