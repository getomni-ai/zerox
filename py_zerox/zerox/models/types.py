from dataclasses import dataclass


@dataclass
class CompletionResponse:
    """
    A class representing the response of a completion.
    """

    content: str
    input_tokens: int
    output_tokens: int


@dataclass
class LLMParams:
    """
    A class representing the parameters for language model requests.
    """
    max_tokens: int = 1000
    temperature: float = 0.0
    top_p: float = 1.0
    frequency_penalty: float = 0.0
    presence_penalty: float = 0.0
