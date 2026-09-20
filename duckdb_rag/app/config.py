from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Production Report QA Engine"
    DEBUG: bool = False
    
    # Ollama settings
    OLLAMA_HOST: str = "http://localhost:11434"
    OLLAMA_SQL_MODEL: str = "qwen2.5-coder:latest"
    OLLAMA_SYNTHESIS_MODEL: str = "llama3.1:latest"

    OLLAMA_EMBEDDING_MODEL: str = "nomic-embed-text:latest"
    EMBEDDING_DIMENSION: int = 768

    class Config:
        env_file = ".env"

settings = Settings()