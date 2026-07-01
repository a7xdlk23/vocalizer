"""Application configuration and paths."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "AudioStem Backend"
    api_prefix: str = "/api/v1"
    debug: bool = False
    host: str = "127.0.0.1"
    port: int = 8000

    # Workspace paths
    data_dir: Path = Path.home() / ".audiostem"
    uploads_dir: Path = data_dir / "uploads"
    stems_dir: Path = data_dir / "stems"
    exports_dir: Path = data_dir / "exports"
    models_dir: Path = data_dir / "models"
    database_url: str = f"sqlite:///{data_dir / 'library.db'}"

    # Model defaults
    default_model: str = "htdemucs"


settings = Settings()


def ensure_dirs() -> None:
    """Create all required workspace directories."""
    for directory in (
        settings.data_dir,
        settings.uploads_dir,
        settings.stems_dir,
        settings.exports_dir,
        settings.models_dir,
    ):
        directory.mkdir(parents=True, exist_ok=True)
