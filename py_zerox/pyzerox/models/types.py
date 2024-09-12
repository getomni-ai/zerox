from dataclasses import dataclass


@dataclass
class CompletionResponse:
    """
    A class representing the response of a completion.
    """

    content: str
    input_tokens: int
    output_tokens: int
