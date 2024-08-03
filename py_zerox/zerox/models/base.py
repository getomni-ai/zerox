from abc import ABC, abstractmethod
from typing import Dict, Optional, Type, TypeVar, TYPE_CHECKING

if TYPE_CHECKING:
    from ..models import CompletionResponse

T = TypeVar("T", bound="BaseModel")


class BaseModel(ABC):
    """
    Base class for all models.
    """

    _instances: Dict[str, "BaseModel"] = {}

    def __new__(
        cls: Type[T],
        api_key: Optional[str] = None,
        **kwargs,
    ) -> T:
        api_key = cls.get_api_key(api_key)

        if api_key not in cls._instances:
            instance = super().__new__(cls)  # type: ignore
            instance.__init__(api_key, **kwargs)
            cls._instances[api_key] = instance

        return cls._instances[api_key]  # type: ignore

    @abstractmethod
    async def completion(
        self,
    ) -> "CompletionResponse":
        raise NotImplementedError

    @staticmethod
    def get_api_key(
        api_key: Optional[str] = None,
    ) -> str:
        raise NotImplementedError("Subclasses must implement get_api_key method")

    def __init__(
        self,
        api_key: Optional[str] = None,
    ):
        self.api_key = api_key
